import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ViteDevServer } from 'vite'
import { afterEach, describe, expect, it } from 'vitest'
import { parseJSON } from '@shopify/theme-check-node'
import { startStudio, type Offense } from '../studio/server/studio.mjs'

const projectDir = fileURLToPath(new URL('..', import.meta.url))
const cleanup: (() => Promise<void> | void)[] = []

afterEach(async () => {
  for (const fn of cleanup.splice(0)) await fn()
})

function tempDir(prefix: string) {
  const dir = mkdtempSync(path.join(tmpdir(), prefix))
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}

/** A fresh Theme folder built from the Base Theme. */
function fixtureTheme() {
  const theme = tempDir('theme-')
  cpSync(path.join(projectDir, 'base-theme'), theme, { recursive: true })
  return theme
}

const catalogHero =
  '<div class="color-{{ section.settings.color_scheme }}"></div>\n' +
  '{% schema %}{"name": "Hero", "settings": [{"type": "color_scheme", "id": "color_scheme", "label": "Color scheme", "default": "scheme-1"}]}{% endschema %}\n'

/** A Section Catalog holding one section, so tests don't depend on the real catalog's contents. */
function fixtureCatalog() {
  const catalog = tempDir('catalog-')
  mkdirSync(path.join(catalog, 'sections'))
  writeFileSync(path.join(catalog, 'sections/hero.liquid'), catalogHero)
  return catalog
}

/**
 * A stand-in for the Shopify CLI: `version` prints the given version; `theme dev` records its
 * arguments and pid in run.json, prints the given output (and `later` half a second on), then runs until
 * killed or exits with exitCode.
 */
function fakeShopify({
  version = '4.8.0',
  output = '',
  later = '',
  exitCode,
}: { version?: string; output?: string; later?: string; exitCode?: number } = {}) {
  const dir = tempDir('shopify-')
  const cli = path.join(dir, 'shopify')
  writeFileSync(
    cli,
    `#!/usr/bin/env node
if (process.argv[2] === 'version') {
  console.log(${JSON.stringify(version)})
  process.exit(0)
}
require('node:fs').writeFileSync(${JSON.stringify(path.join(dir, 'run.json'))}, JSON.stringify({ args: process.argv.slice(2), pid: process.pid, storePassword: process.env.SHOPIFY_FLAG_STORE_PASSWORD }))
process.stdout.write(${JSON.stringify(output)})
setTimeout(() => process.stdout.write(${JSON.stringify(later)}), 500)
${exitCode === undefined ? 'setInterval(() => {}, 1000)' : `setTimeout(() => process.exit(${exitCode}), 600)`}
`,
    { mode: 0o755 },
  )
  return cli
}

/** The arguments and pid of the fake CLI's `theme dev` run, once it started. */
async function fakeRun(cli: string): Promise<{ args: string[]; pid: number; storePassword?: string }> {
  const file = path.join(path.dirname(cli), 'run.json')
  await expect.poll(() => existsSync(file)).toBe(true)
  return JSON.parse(readFileSync(file, 'utf8'))
}

async function openStudio(
  theme: string,
  {
    catalog = fixtureCatalog(),
    cli = fakeShopify(),
    store,
    storePassword,
  }: { catalog?: string; cli?: string; store?: string; storePassword?: string } = {},
) {
  const server: ViteDevServer = await startStudio({ theme, catalog, port: 0, cli, store, storePassword })
  cleanup.unshift(() => server.close())
  const url = server.resolvedUrls?.local[0]
  if (!url) throw new Error('Studio server has no local URL')
  return {
    close: () => server.close(),
    async readPreview() {
      const response = await fetch(new URL('api/preview', url))
      expect(response.status).toBe(200)
      return response.json()
    },
    async readTheme() {
      const response = await fetch(new URL('api/theme', url))
      expect(response.status).toBe(200)
      return response.json()
    },
    setBrand(brand: unknown) {
      return send('PUT', 'api/brand', brand)
    },
    async uploadLogo(file: Uint8Array<ArrayBuffer>, type: string) {
      const response = await fetch(new URL('api/brand/logo', url), {
        method: 'PUT',
        headers: { 'Content-Type': type },
        body: new Blob([file]),
      })
      return { status: response.status, body: await response.json() }
    },
    removeLogo() {
      return send('DELETE', 'api/brand/logo')
    },
    fetchLogo() {
      return fetch(new URL('api/brand/logo', url))
    },
    send,
    addSection(type: unknown, page = 'home') {
      return send('POST', `api/${page}/sections`, { type })
    },
    removeSection(id: string, page = 'home') {
      return send('DELETE', `api/${page}/sections/${encodeURIComponent(id)}`)
    },
    reorderSections(order: unknown, page = 'home') {
      return send('PUT', `api/${page}/order`, { order })
    },
    setColorScheme(id: string, colorScheme: unknown, page = 'home') {
      return send('PATCH', `api/${page}/sections/${encodeURIComponent(id)}`, { colorScheme })
    },
  }

  async function send(method: string, route: string, body?: unknown) {
    const response = await fetch(new URL(route, url), {
      method,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    return { status: response.status, body: await response.json() }
  }
}

const home = 'templates/index.json'

function readTemplate(theme: string, file = home) {
  return parseJSON(readFileSync(path.join(theme, file), 'utf8'))
}

/** Writes a template the way the Theme Editor would: a comment header, settings, blocks and keys the Studio doesn't own. */
function writeTemplate(theme: string, template: object, file = home) {
  writeFileSync(path.join(theme, file), '/* Written by the Theme Editor */\n' + JSON.stringify(template, null, 2))
}

function readSettingsData(theme: string) {
  return parseJSON(readFileSync(path.join(theme, 'config/settings_data.json'), 'utf8'))
}

function errors<T extends { severity: string }>(offenses: T[]) {
  return offenses.filter((offense) => offense.severity === 'error')
}

describe('Studio API: read Theme state', () => {
  it('returns the home and product sections in order, the catalog sections per page and a clean validation', async () => {
    const studio = await openStudio(fixtureTheme())
    const state = await studio.readTheme()
    expect(state.home).toEqual([{ id: 'main', type: 'hello-world' }])
    expect(state.product).toEqual([{ id: 'main', type: 'product' }])
    expect(state.catalog).toEqual({ home: ['hero'], product: ['hero'] })
    expect(state.validation.filter((o: { severity: string }) => o.severity === 'error')).toEqual([])
  })

  it('surfaces a Theme Check error for invalid Liquid in the Theme', async () => {
    const theme = fixtureTheme()
    writeFileSync(
      path.join(theme, 'sections/broken.liquid'),
      '{% if section.settings.heading %}<h2>{{ section.settings.heading }}</h2>\n{% schema %}{"name": "Broken"}{% endschema %}\n',
    )
    const state = await (await openStudio(theme)).readTheme()
    expect(state.validation).toContainEqual(
      expect.objectContaining({ file: 'sections/broken.liquid', line: 1, severity: 'error' }),
    )
  })

  it('lists the home sections in the template\'s order, not its key order', async () => {
    const theme = fixtureTheme()
    writeFileSync(
      path.join(theme, 'templates/index.json'),
      '/* Written by the Theme Editor */\n' +
        JSON.stringify({
          sections: { first: { type: 'hello-world' }, second: { type: 'custom-section' } },
          order: ['second', 'first'],
        }),
    )
    const state = await (await openStudio(theme)).readTheme()
    expect(state.home).toEqual([
      { id: 'second', type: 'custom-section' },
      { id: 'first', type: 'hello-world' },
    ])
  })
})

describe('Studio API: set Brand', () => {
  it('reads the Base Theme Brand from settings data, falling back to schema defaults', async () => {
    const state = await (await openStudio(fixtureTheme())).readTheme()
    expect(state.brand).toEqual({
      colorSchemes: {
        'scheme-1': { background: '#FFFFFF', text: '#333333', button: '#333333', button_label: '#FFFFFF' },
        'scheme-2': { background: '#333333', text: '#FFFFFF', button: '#FFFFFF', button_label: '#333333' },
      },
      colorFields: ['background', 'text', 'button', 'button_label'],
      headingFont: 'work_sans_n4',
      bodyFont: 'work_sans_n4',
      logo: null,
      logoAsset: null,
    })
  })

  it('writes color schemes, fonts and logo into settings data and returns a clean validation', async () => {
    const theme = fixtureTheme()
    const studio = await openStudio(theme)
    const { status, body } = await studio.setBrand({
      colorSchemes: { 'scheme-1': { background: '#FAF7F2', text: '#1F1A17' }, 'scheme-3': { background: '#0A3D62' } },
      headingFont: 'playfair_display_n7',
      bodyFont: 'assistant_n4',
      logo: 'shopify://shop_images/logo.png',
    })
    expect(status).toBe(200)
    const current = readSettingsData(theme).current
    expect(current.color_schemes['scheme-1'].settings).toEqual({
      background: '#FAF7F2',
      text: '#1F1A17',
      button: '#333333',
      button_label: '#FFFFFF',
    })
    // A new scheme starts from the schema's default colors.
    expect(current.color_schemes['scheme-3'].settings).toEqual({
      background: '#0A3D62',
      text: '#333333',
      button: '#333333',
      button_label: '#FFFFFF',
    })
    expect(current.type_heading_font).toBe('playfair_display_n7')
    expect(current.type_body_font).toBe('assistant_n4')
    expect(current.logo).toBe('shopify://shop_images/logo.png')
    expect(body.brand.headingFont).toBe('playfair_display_n7')
    expect(body.brand.colorSchemes['scheme-1'].background).toBe('#FAF7F2')
    expect(errors(body.validation)).toEqual([])
  })

  it('preserves settings, unknown keys and Theme Editor changes it does not own', async () => {
    const theme = fixtureTheme()
    const header = '/*\n * Written by the Theme Editor\n */\n'
    const original = {
      current: {
        max_page_width: '110rem',
        some_unknown_key: { nested: true },
        color_schemes: {
          'scheme-1': { settings: { background: '#FFFFFF', text: '#000000', background_gradient: 'linear-gradient(#fff, #eee)' } },
          'scheme-2': { settings: { background: '#000000', text: '#FFFFFF' } },
        },
        sections: { header: { type: 'header', settings: { menu: 'main-menu' } } },
      },
      presets: { Default: { max_page_width: '90rem' } },
    }
    writeFileSync(path.join(theme, 'config/settings_data.json'), header + JSON.stringify(original, null, 2))
    const { status } = await (await openStudio(theme)).setBrand({
      colorSchemes: { 'scheme-1': { text: '#222222' } },
      bodyFont: 'assistant_n4',
    })
    expect(status).toBe(200)
    const raw = readFileSync(path.join(theme, 'config/settings_data.json'), 'utf8')
    expect(raw.startsWith(header)).toBe(true)
    const data = parseJSON(raw)
    expect(data).toEqual({
      current: {
        ...original.current,
        color_schemes: {
          'scheme-1': { settings: { background: '#FFFFFF', text: '#222222', background_gradient: 'linear-gradient(#fff, #eee)' } },
          'scheme-2': { settings: { background: '#000000', text: '#FFFFFF' } },
        },
        type_body_font: 'assistant_n4',
      },
      presets: original.presets,
    })
  })

  it('clears the logo with null', async () => {
    const theme = fixtureTheme()
    const studio = await openStudio(theme)
    await studio.setBrand({ logo: 'shopify://shop_images/logo.png' })
    const { body } = await studio.setBrand({ logo: null })
    expect(readSettingsData(theme).current).not.toHaveProperty('logo')
    expect(body.brand.logo).toBe(null)
  })

  it.each([
    ['a color that is not hex', { colorSchemes: { 'scheme-1': { background: 'red' } } }],
    ['a color the scheme does not define', { colorSchemes: { 'scheme-1': { shadow: '#000000' } } }],
    ['a font that is not a font handle', { headingFont: 'Playfair Display' }],
    ['a font handle that is not in Shopify\'s font library', { bodyFont: 'comic_sans_n4' }],
    ['a logo that is not a shop image', { logo: 'https://example.com/logo.png' }],
    ['an unknown field', { tagline: 'Hi' }],
  ])('rejects %s and leaves settings data untouched', async (_, brand) => {
    const theme = fixtureTheme()
    const before = readFileSync(path.join(theme, 'config/settings_data.json'), 'utf8')
    const { status, body } = await (await openStudio(theme)).setBrand(brand)
    expect(status).toBe(400)
    expect(body.error).toEqual(expect.any(String))
    expect(readFileSync(path.join(theme, 'config/settings_data.json'), 'utf8')).toBe(before)
  })
})

describe('Studio API: logo', () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
  const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"/>')

  it('stores an uploaded logo in the Theme assets and points the logo_asset setting at it', async () => {
    const theme = fixtureTheme()
    const studio = await openStudio(theme)
    const { status, body } = await studio.uploadLogo(png, 'image/png')
    expect(status).toBe(200)
    expect(new Uint8Array(readFileSync(path.join(theme, 'assets/studio-logo.png')))).toEqual(png)
    expect(readSettingsData(theme).current.logo_asset).toBe('studio-logo.png')
    expect(body.brand.logoAsset).toBe('studio-logo.png')
    expect(errors(body.validation)).toEqual([])

    const served = await studio.fetchLogo()
    expect(served.headers.get('content-type')).toBe('image/png')
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(png)
  })

  it('replaces the previous logo file on a new upload', async () => {
    const theme = fixtureTheme()
    const studio = await openStudio(theme)
    await studio.uploadLogo(png, 'image/png')
    const { status } = await studio.uploadLogo(svg, 'image/svg+xml')
    expect(status).toBe(200)
    expect(existsSync(path.join(theme, 'assets/studio-logo.png'))).toBe(false)
    expect(readFileSync(path.join(theme, 'assets/studio-logo.svg'), 'utf8')).toContain('<svg')
    expect(readSettingsData(theme).current.logo_asset).toBe('studio-logo.svg')
  })

  it('never deletes or overwrites a logo asset the Studio did not write', async () => {
    const theme = fixtureTheme()
    writeFileSync(path.join(theme, 'assets/logo.png'), png)
    writeFileSync(
      path.join(theme, 'config/settings_data.json'),
      JSON.stringify({ current: { ...readSettingsData(theme).current, logo_asset: 'logo.png' } }),
    )
    const studio = await openStudio(theme)
    await studio.uploadLogo(svg, 'image/svg+xml')
    expect(existsSync(path.join(theme, 'assets/logo.png'))).toBe(true)
    await studio.removeLogo()
    expect(existsSync(path.join(theme, 'assets/studio-logo.svg'))).toBe(false)

    writeFileSync(
      path.join(theme, 'config/settings_data.json'),
      JSON.stringify({ current: { ...readSettingsData(theme).current, logo_asset: 'logo.png' } }),
    )
    await studio.removeLogo()
    expect(existsSync(path.join(theme, 'assets/logo.png'))).toBe(true)
    expect(readSettingsData(theme).current).not.toHaveProperty('logo_asset')
  })

  it('serves the logo so an SVG cannot run scripts on the Studio', async () => {
    const studio = await openStudio(fixtureTheme())
    await studio.uploadLogo(svg, 'image/svg+xml')
    const served = await studio.fetchLogo()
    expect(served.headers.get('content-security-policy')).toContain('sandbox')
  })

  it('removes the logo file and the setting', async () => {
    const theme = fixtureTheme()
    const studio = await openStudio(theme)
    await studio.uploadLogo(png, 'image/png')
    const { status, body } = await studio.removeLogo()
    expect(status).toBe(200)
    expect(existsSync(path.join(theme, 'assets/studio-logo.png'))).toBe(false)
    expect(readSettingsData(theme).current).not.toHaveProperty('logo_asset')
    expect(body.brand.logoAsset).toBe(null)
    expect((await studio.fetchLogo()).status).toBe(404)
  })

  it.each([
    ['a file that is not an image', new TextEncoder().encode('hello'), 'text/plain'],
    ['a file whose bytes are not the declared type', new TextEncoder().encode('hello'), 'image/png'],
    ['an image over 2 MB', Uint8Array.from({ length: 2 * 1024 * 1024 + 1 }, (_, i) => [0x89, 0x50, 0x4e, 0x47][i] ?? 0), 'image/png'],
  ])('refuses %s and writes nothing', async (_, file, type) => {
    const theme = fixtureTheme()
    const before = readFileSync(path.join(theme, 'config/settings_data.json'), 'utf8')
    const { status, body } = await (await openStudio(theme)).uploadLogo(file, type)
    expect(status).toBe(400)
    expect(body.error).toEqual(expect.any(String))
    expect(existsSync(path.join(theme, 'assets/studio-logo.png'))).toBe(false)
    expect(readFileSync(path.join(theme, 'config/settings_data.json'), 'utf8')).toBe(before)
  })
})

describe('studio command', () => {
  function studio(...args: string[]) {
    const result = spawnSync('node', [path.join(projectDir, 'studio/bin/studio.mjs'), ...args], {
      encoding: 'utf8',
      // A refused folder exits at once; a started Studio would run forever.
      timeout: 10_000,
    })
    return { code: result.status, stderr: result.stderr }
  }

  it('refuses a folder that is not a Theme', () => {
    const dir = tempDir('not-a-theme-')
    const result = studio('--theme', dir)
    expect(result.code).toBe(1)
    expect(result.stderr).toContain(`${dir} is not a Shopify theme`)
  })

  it('refuses a Theme without a home template', () => {
    const dir = tempDir('no-home-')
    mkdirSync(path.join(dir, 'layout'))
    writeFileSync(path.join(dir, 'layout/theme.liquid'), '{{ content_for_layout }}')
    const result = studio('--theme', dir)
    expect(result.code).toBe(1)
    expect(result.stderr).toContain(`${dir} is not a Shopify theme: templates/index.json is missing.`)
  })

  it('requires --theme', () => {
    const result = studio()
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('Usage: studio --theme <dir>')
  })
})

const pages = [
  { page: 'home', file: 'templates/index.json', main: 'hello-world' },
  { page: 'product', file: 'templates/product.json', main: 'product' },
]

describe.each(pages)('Studio API: compose the $page page', ({ page, file, main }) => {
  const other = pages.find((candidate) => candidate.page !== page)!.file

  it('adds a catalog section at the end of the page, copying its file into the Theme', async () => {
    const theme = fixtureTheme()
    const before = readFileSync(path.join(theme, other), 'utf8')
    const { status, body } = await (await openStudio(theme)).addSection('hero', page)
    expect(status).toBe(200)
    expect(readFileSync(path.join(theme, 'sections/hero.liquid'), 'utf8')).toBe(catalogHero)
    const template = readTemplate(theme, file)
    expect(template.order).toEqual(['main', expect.stringMatching(/^hero_/)])
    const id = template.order[1]
    expect(template.sections[id]).toEqual({ type: 'hero', settings: {} })
    expect(body[page]).toEqual([
      { id: 'main', type: main },
      { id, type: 'hero', colorScheme: 'scheme-1' },
    ])
    expect(errors(body.validation)).toEqual([])
    expect(readFileSync(path.join(theme, other), 'utf8')).toBe(before)
  })

  it('copies a catalog section once and never overwrites the Theme\'s own copy', async () => {
    const theme = fixtureTheme()
    const own = '<div>Edited by the Creator</div>\n{% schema %}{"name": "Hero"}{% endschema %}\n'
    writeFileSync(path.join(theme, 'sections/hero.liquid'), own)
    const studio = await openStudio(theme)
    await studio.addSection('hero', page)
    const { status } = await studio.addSection('hero', page)
    expect(status).toBe(200)
    expect(readFileSync(path.join(theme, 'sections/hero.liquid'), 'utf8')).toBe(own)
    const template = readTemplate(theme, file)
    expect(template.order).toHaveLength(3)
    expect(new Set(template.order).size).toBe(3)
  })

  it('adds a section the Theme has even when the catalog does not', async () => {
    const theme = fixtureTheme()
    const { status, body } = await (await openStudio(theme)).addSection('custom-section', page)
    expect(status).toBe(200)
    expect(body[page].map((section: { type: string }) => section.type)).toEqual([main, 'custom-section'])
  })

  it.each([
    ['a section neither the Theme nor the catalog has', 'slideshow', 404],
    ['a type that is not a section name', '../layout/theme', 400],
    ['a missing type', undefined, 400],
  ])('refuses to add %s and writes nothing', async (_, type, status) => {
    const theme = fixtureTheme()
    const before = readFileSync(path.join(theme, file), 'utf8')
    const response = await (await openStudio(theme)).addSection(type, page)
    expect(response.status).toBe(status)
    expect(response.body.error).toEqual(expect.any(String))
    expect(readFileSync(path.join(theme, file), 'utf8')).toBe(before)
  })

  it('refuses a 26th section, Shopify\'s limit per template', async () => {
    const theme = fixtureTheme()
    const ids = Array.from({ length: 25 }, (_, i) => `s${i}`)
    writeTemplate(
      theme,
      { sections: Object.fromEntries(ids.map((id) => [id, { type: 'hello-world' }])), order: ids },
      file,
    )
    const { status } = await (await openStudio(theme)).addSection('hero', page)
    expect(status).toBe(400)
    expect(readTemplate(theme, file).order).toHaveLength(25)
    expect(existsSync(path.join(theme, 'sections/hero.liquid'))).toBe(false)
  })

  it('refuses a section once the page has as many as its schema\'s limit', async () => {
    const theme = fixtureTheme()
    const catalog = fixtureCatalog()
    writeFileSync(
      path.join(catalog, 'sections/banner.liquid'),
      '<div></div>\n{% schema %}{"name": "Banner", "limit": 1}{% endschema %}\n',
    )
    const studio = await openStudio(theme, { catalog })
    expect((await studio.addSection('banner', page)).status).toBe(200)
    const before = readFileSync(path.join(theme, file), 'utf8')
    const { status, body } = await studio.addSection('banner', page)
    expect(status).toBe(400)
    expect(body.error).toContain('banner')
    expect(readFileSync(path.join(theme, file), 'utf8')).toBe(before)
  })

  /** A page composed in the Theme Editor: settings, blocks and keys the Studio doesn't own. */
  function composedTheme() {
    const theme = fixtureTheme()
    writeFileSync(path.join(theme, 'sections/hero.liquid'), catalogHero)
    writeTemplate(
      theme,
      {
        layout: 'theme',
        sections: {
          top: { type: 'hero', settings: { color_scheme: 'scheme-2', heading: 'Summer sale' } },
          middle: {
            type: 'custom-section',
            settings: { background_image: 'shopify://shop_images/bg.jpg' },
            blocks: { text_1: { type: 'text', settings: { text: 'Hello' } } },
            block_order: ['text_1'],
            disabled: true,
          },
          bottom: { type: 'hello-world', settings: {}, custom_key: { kept: true } },
        },
        order: ['top', 'middle', 'bottom'],
        wrapper: 'div',
      },
      file,
    )
    return theme
  }

  it('reads each section\'s color scheme, or none when its schema has no color scheme setting', async () => {
    const state = await (await openStudio(composedTheme())).readTheme()
    expect(state[page]).toEqual([
      { id: 'top', type: 'hero', colorScheme: 'scheme-2' },
      { id: 'middle', type: 'custom-section' },
      { id: 'bottom', type: 'hello-world' },
    ])
  })

  it('removes a section from the page and keeps its file in the Theme', async () => {
    const theme = composedTheme()
    const { status, body } = await (await openStudio(theme)).removeSection('top', page)
    expect(status).toBe(200)
    const template = readTemplate(theme, file)
    expect(template.order).toEqual(['middle', 'bottom'])
    expect(template.sections).not.toHaveProperty('top')
    expect(existsSync(path.join(theme, 'sections/hero.liquid'))).toBe(true)
    expect(body[page].map((section: { id: string }) => section.id)).toEqual(['middle', 'bottom'])
  })

  it('refuses to remove the last section, since Shopify needs one in a JSON template', async () => {
    const theme = fixtureTheme()
    const before = readFileSync(path.join(theme, file), 'utf8')
    const { status, body } = await (await openStudio(theme)).removeSection('main', page)
    expect(status).toBe(400)
    expect(body.error).toEqual(expect.any(String))
    expect(readFileSync(path.join(theme, file), 'utf8')).toBe(before)
  })

  it('answers a malformed section id with a JSON error', async () => {
    const { status, body } = await (await openStudio(fixtureTheme())).send('DELETE', `api/${page}/sections/%E0%A4%A`)
    expect(status).toBe(400)
    expect(body.error).toEqual(expect.any(String))
  })

  it('refuses to remove a section the page does not have', async () => {
    const theme = composedTheme()
    const before = readFileSync(path.join(theme, file), 'utf8')
    const { status } = await (await openStudio(theme)).removeSection('nope', page)
    expect(status).toBe(404)
    expect(readFileSync(path.join(theme, file), 'utf8')).toBe(before)
  })

  it('reorders the page\'s sections', async () => {
    const theme = composedTheme()
    const { status, body } = await (await openStudio(theme)).reorderSections(['bottom', 'top', 'middle'], page)
    expect(status).toBe(200)
    expect(readTemplate(theme, file).order).toEqual(['bottom', 'top', 'middle'])
    expect(body[page].map((section: { id: string }) => section.id)).toEqual(['bottom', 'top', 'middle'])
  })

  it.each([
    ['a missing section', ['bottom', 'top']],
    ['an unknown section', ['bottom', 'top', 'nope']],
    ['a repeated section', ['bottom', 'top', 'top']],
    ['something that is not a list', 'top'],
  ])('refuses an order with %s and writes nothing', async (_, order) => {
    const theme = composedTheme()
    const before = readFileSync(path.join(theme, file), 'utf8')
    const { status, body } = await (await openStudio(theme)).reorderSections(order, page)
    expect(status).toBe(400)
    expect(body.error).toEqual(expect.any(String))
    expect(readFileSync(path.join(theme, file), 'utf8')).toBe(before)
  })

  it('sets a section\'s color scheme', async () => {
    const theme = composedTheme()
    const { status, body } = await (await openStudio(theme)).setColorScheme('top', 'scheme-1', page)
    expect(status).toBe(200)
    expect(readTemplate(theme, file).sections.top.settings).toEqual({ color_scheme: 'scheme-1', heading: 'Summer sale' })
    expect(body[page][0]).toEqual({ id: 'top', type: 'hero', colorScheme: 'scheme-1' })
  })

  it.each([
    ['a color scheme the Brand does not have', 'top', 'scheme-9', 400],
    ['a color scheme that is not a string', 'top', 1, 400],
    ['a section without a color scheme setting', 'bottom', 'scheme-1', 400],
    ['a section the page does not have', 'nope', 'scheme-1', 404],
  ])('refuses %s and writes nothing', async (_, id, colorScheme, status) => {
    const theme = composedTheme()
    const before = readFileSync(path.join(theme, file), 'utf8')
    const response = await (await openStudio(theme)).setColorScheme(id, colorScheme, page)
    expect(response.status).toBe(status)
    expect(response.body.error).toEqual(expect.any(String))
    expect(readFileSync(path.join(theme, file), 'utf8')).toBe(before)
  })

  it('keeps settings, blocks, the comment header and keys it does not own through every operation', async () => {
    const theme = composedTheme()
    const original = readTemplate(theme, file)
    const studio = await openStudio(theme)
    await studio.addSection('hero', page)
    const added = readTemplate(theme, file).order[3]
    await studio.setColorScheme('top', 'scheme-1', page)
    await studio.reorderSections(['bottom', added, 'middle', 'top'], page)
    await studio.removeSection(added, page)
    const raw = readFileSync(path.join(theme, file), 'utf8')
    expect(raw.startsWith('/* Written by the Theme Editor */\n')).toBe(true)
    expect(parseJSON(raw)).toEqual({
      ...original,
      sections: {
        ...original.sections,
        top: { type: 'hero', settings: { color_scheme: 'scheme-1', heading: 'Summer sale' } },
      },
      order: ['bottom', 'middle', 'top'],
    })
  })
})

describe('Studio API: home page', () => {
  it('adds the Base Theme locale keys and settings a copied section needs to an older Theme, keeping its own', async () => {
    // A Theme made before the Base Theme had the header keys, the Layout group and the logo_asset setting,
    // whose Creator renamed the Social media group.
    const theme = fixtureTheme()
    const localeFile = path.join(theme, 'locales/en.default.json')
    const locale = parseJSON(readFileSync(localeFile, 'utf8'))
    delete locale.header
    locale.cart.title = 'Your bag'
    writeFileSync(localeFile, JSON.stringify(locale, null, 2))
    const schemaFile = path.join(theme, 'config/settings_schema.json')
    type Group = { name: string; settings?: { id?: string }[] }
    const groups: Group[] = parseJSON(readFileSync(schemaFile, 'utf8'))
    const older = groups
      .filter((group) => group.name !== 't:general.layout')
      .map((group) => ({ ...group, settings: group.settings?.filter((setting) => setting.id !== 'logo_asset') }))
      .map((group) => (group.name === 't:general.social_media' ? { ...group, name: 'Social' } : group))
    writeFileSync(schemaFile, JSON.stringify(older, null, 2))
    const catalog = fixtureCatalog()
    writeFileSync(
      path.join(catalog, 'sections/links.liquid'),
      '<nav aria-label="{{ \'header.main_menu\' | t }}"><a href="{{ settings.social_instagram }}">Instagram</a></nav>\n' +
        '{% schema %}{"name": "Links", "presets": [{"name": "Links"}]}{% endschema %}\n',
    )

    const { status, body } = await (await openStudio(theme, { catalog })).addSection('links')
    expect(status).toBe(200)
    expect(errors(body.validation)).toEqual([])
    const merged = parseJSON(readFileSync(localeFile, 'utf8'))
    expect(merged.header.main_menu).toBe('Main menu')
    expect(merged.cart.title).toBe('Your bag')
    const mergedGroups: Group[] = parseJSON(readFileSync(schemaFile, 'utf8'))
    expect(mergedGroups.map((group) => group.name)).toEqual([...older.map((group) => group.name), 't:general.layout'])
    const ids = mergedGroups.flatMap((group) => (group.settings ?? []).flatMap((setting) => setting.id ?? []))
    expect(ids).toContain('logo_asset')
    expect(ids).toContain('max_page_width')
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('leaves the Theme\'s locale and settings files untouched when they have everything', async () => {
    const theme = fixtureTheme()
    const files = ['locales/en.default.json', 'locales/en.default.schema.json', 'config/settings_schema.json']
    const before = files.map((file) => readFileSync(path.join(theme, file), 'utf8'))
    expect((await (await openStudio(theme)).addSection('hero')).status).toBe(200)
    expect(files.map((file) => readFileSync(path.join(theme, file), 'utf8'))).toEqual(before)
  })

  it('leaves out and refuses a catalog section that only goes in a section group, like an announcement bar', async () => {
    const theme = fixtureTheme()
    const catalog = fixtureCatalog()
    writeFileSync(
      path.join(catalog, 'sections/announcement-bar.liquid'),
      '<div></div>\n{% schema %}{"name": "Announcement bar", "enabled_on": {"groups": ["header"]}}{% endschema %}\n',
    )
    const before = readFileSync(path.join(theme, 'templates/index.json'), 'utf8')
    const studio = await openStudio(theme, { catalog })
    expect((await studio.readTheme()).catalog.home).toEqual(['hero'])
    const { status, body } = await studio.addSection('announcement-bar')
    expect(status).toBe(400)
    expect(body.error).toContain('announcement-bar')
    expect(readFileSync(path.join(theme, 'templates/index.json'), 'utf8')).toBe(before)
    expect(existsSync(path.join(theme, 'sections/announcement-bar.liquid'))).toBe(false)
  })

  it('offers and adds every real catalog home section with a color scheme and a clean Theme Check', async () => {
    const theme = fixtureTheme()
    const studio = await openStudio(theme, { catalog: path.join(projectDir, 'catalog') })
    const types = ['hero', 'featured-collection', 'image-with-text', 'rich-text', 'logo-list', 'testimonials', 'faq', 'newsletter']
    expect((await studio.readTheme()).catalog.home).toEqual(types.toSorted())
    let body
    for (const type of types) ({ body } = await studio.addSection(type))
    expect(body.home.slice(1)).toEqual(types.map((type) => expect.objectContaining({ type, colorScheme: 'scheme-1' })))
    expect(errors(body.validation)).toEqual([])
  })

  it('never offers the real catalog header or footer for the home page', async () => {
    const theme = fixtureTheme()
    cpSync(path.join(projectDir, 'catalog'), theme, { recursive: true })
    const studio = await openStudio(theme, { catalog: path.join(projectDir, 'catalog') })
    const { catalog } = await studio.readTheme()
    for (const page of ['home', 'product']) {
      expect(catalog[page]).toContain('hero')
      expect(catalog[page]).not.toContain('header')
      expect(catalog[page]).not.toContain('footer')
    }
    for (const type of ['header', 'footer']) expect((await studio.addSection(type)).status).toBe(400)
  })
})

describe('Studio API: product page', () => {
  it('offers a section enabled only on product templates for the product page, never the home page', async () => {
    const theme = fixtureTheme()
    const catalog = fixtureCatalog()
    writeFileSync(
      path.join(catalog, 'sections/gallery.liquid'),
      '<div></div>\n{% schema %}{"name": "Gallery", "enabled_on": {"templates": ["product"]}}{% endschema %}\n',
    )
    const studio = await openStudio(theme, { catalog })
    expect((await studio.readTheme()).catalog).toEqual({ home: ['hero'], product: ['gallery', 'hero'] })
    const before = readFileSync(path.join(theme, home), 'utf8')
    expect((await studio.addSection('gallery')).status).toBe(400)
    expect(readFileSync(path.join(theme, home), 'utf8')).toBe(before)
    expect((await studio.addSection('gallery', 'product')).status).toBe(200)
  })

  it('composes a product page from the real catalog\'s main product and related products with a clean Theme Check', async () => {
    const theme = fixtureTheme()
    const studio = await openStudio(theme, { catalog: path.join(projectDir, 'catalog') })
    const { catalog } = await studio.readTheme()
    const types = ['main-product', 'related-products']
    expect(catalog.product).toEqual(expect.arrayContaining(types))
    for (const type of types) expect(catalog.home).not.toContain(type)

    for (const type of types) expect((await studio.addSection(type, 'product')).status).toBe(200)
    const { status, body } = await studio.removeSection('main', 'product')
    expect(status).toBe(200)
    expect(body.product).toEqual(types.map((type) => expect.objectContaining({ type, colorScheme: 'scheme-1' })))
    expect(errors(body.validation)).toEqual([])
    // The main product shows once per page.
    expect((await studio.addSection('main-product', 'product')).status).toBe(400)
  })
})

describe('Studio API: external changes', () => {
  it('reflects a file another process changes in read state and validation', async () => {
    const theme = fixtureTheme()
    const studio = await openStudio(theme)
    expect(errors((await studio.readTheme()).validation)).toEqual([])

    // What an agent would do: add a section file and put it on the home page.
    writeFileSync(path.join(theme, 'sections/broken.liquid'), '{% if %}\n{% schema %}{"name": "Broken"}{% endschema %}\n')
    writeTemplate(theme, {
      sections: { main: { type: 'hello-world' }, broken: { type: 'broken' } },
      order: ['main', 'broken'],
    })

    await expect
      .poll(async () => {
        const { home, validation }: { home: { id: string }[]; validation: Offense[] } = await studio.readTheme()
        return { home: home.map((section) => section.id), errors: errors(validation).map((offense) => offense.file) }
      })
      .toEqual({ home: ['main', 'broken'], errors: expect.arrayContaining(['sections/broken.liquid']) })
  })
})

describe('Studio: live preview', () => {
  // How Shopify CLI 4.8.0 prints a running theme dev without a terminal: links become footnotes.
  const running =
    '╭─ success ────────────────────────────────────────────────────────────────────╮\n' +
    '│  Preview your theme (t)                                                      │\n' +
    '│    • [1]                                                                     │\n' +
    '│  Next steps                                                                  │\n' +
    '│    • Share your theme preview (p) [2] https://theme-builder-dev-ou5grn62.my  │\n' +
    '│      shopify.com/?preview_theme_id=207592816979                              │\n' +
    '╰──────────────────────────────────────────────────────────────────────────────╯\n' +
    '[1] http://127.0.0.1:9292\n' +
    '[2] https://theme-builder-dev-ou5grn62.myshopify.com/?preview_theme_id=207592816979\n'

  it('starts theme dev for the Theme and shows its preview URL', async () => {
    const theme = fixtureTheme()
    const cli = fakeShopify({ output: '\u001b[1mSyncing theme…\u001b[22m\n' + running })
    const studio = await openStudio(theme, { cli, store: 'example.myshopify.com' })
    expect((await fakeRun(cli)).args).toEqual([
      'theme',
      'dev',
      '--path',
      theme,
      '--store',
      'example.myshopify.com',
      '--port',
      expect.stringMatching(/^\d+$/),
    ])
    await expect.poll(() => studio.readPreview()).toEqual({ status: 'running', url: 'http://127.0.0.1:9292' })
  })

  const loginPrompt =
    'To run this command, log in to Shopify.\n' +
    'User verification code: ABCD-EFGH\n' +
    '👉 Open this link to start the auth process: https://accounts.shopify.com/activate-with-code?device_code%5Buser_code%5D=ABCD-EFGH\n'

  it('shows that a login is required while the CLI waits for one in the terminal', async () => {
    const studio = await openStudio(fixtureTheme(), { cli: fakeShopify({ output: loginPrompt }) })
    await expect
      .poll(() => studio.readPreview())
      .toEqual({ status: 'login-required', message: expect.stringContaining("Studio's terminal") })
  })

  it('shows the preview URL once the Creator logged in', async () => {
    const studio = await openStudio(fixtureTheme(), { cli: fakeShopify({ output: loginPrompt, later: running }) })
    await expect.poll(() => studio.readPreview()).toEqual({ status: 'running', url: 'http://127.0.0.1:9292' })
  })

  it('asks for `shopify auth login` when the CLI stops for want of a login', async () => {
    const cli = fakeShopify({
      output:
        'To run this command, log in to Shopify.\n' +
        'Authorization is required to continue, but the current environment does not support interactive prompts.\n',
      exitCode: 1,
    })
    const studio = await openStudio(fixtureTheme(), { cli })
    await expect
      .poll(() => studio.readPreview())
      .toEqual({ status: 'login-required', message: expect.stringContaining('shopify auth login') })
  })

  it('shows the CLI error when theme dev stops', async () => {
    const cli = fakeShopify({
      output:
        '╭─ error ───────────────────────────────────────╮\n' +
        '│  A store is required                          │\n' +
        '╰───────────────────────────────────────────────╯\n',
      exitCode: 1,
    })
    const studio = await openStudio(fixtureTheme(), { cli })
    await expect
      .poll(() => studio.readPreview())
      .toEqual({ status: 'error', message: expect.stringContaining('A store is required') })
  })

  it('hands the storefront password to theme dev without putting it in the arguments', async () => {
    const cli = fakeShopify()
    await openStudio(fixtureTheme(), { cli, storePassword: 'secret' })
    const run = await fakeRun(cli)
    expect(run.storePassword).toBe('secret')
    expect(run.args).not.toContain('secret')
  })

  it('asks for the storefront password when the store has a password page', async () => {
    const cli = fakeShopify({
      output:
        '╭─ error ───────────────────────────────────────╮\n' +
        '│  Failed to prompt:                            │\n' +
        '│  Enter your store password                    │\n' +
        '╰───────────────────────────────────────────────╯\n',
      exitCode: 1,
    })
    const studio = await openStudio(fixtureTheme(), { cli })
    await expect
      .poll(() => studio.readPreview())
      .toEqual({ status: 'error', message: expect.stringContaining('--store-password') })
  })

  it('explains a missing Shopify CLI', async () => {
    const studio = await openStudio(fixtureTheme(), { cli: path.join(tempDir('empty-'), 'shopify') })
    await expect
      .poll(() => studio.readPreview())
      .toEqual({ status: 'error', message: expect.stringContaining('npm install -g @shopify/cli') })
  })

  it('explains a Shopify CLI below the required version', async () => {
    const cli = fakeShopify({ version: '4.7.9' })
    const studio = await openStudio(fixtureTheme(), { cli })
    await expect
      .poll(() => studio.readPreview())
      .toEqual({ status: 'error', message: expect.stringMatching(/4\.7\.9.*4\.8\.0/) })
    expect(existsSync(path.join(path.dirname(cli), 'run.json'))).toBe(false)
  })

  it('runs theme dev on another port when 9292 is taken, as by a theme dev for another Theme', async () => {
    const taken = createServer()
    // Another process may hold 9292 already; either way it is taken.
    await new Promise((resolve) => taken.once('error', resolve).listen(9292, '127.0.0.1', () => resolve(undefined)))
    cleanup.push(() => new Promise((resolve) => taken.close(() => resolve())))
    const cli = fakeShopify()
    await openStudio(fixtureTheme(), { cli })
    const { args } = await fakeRun(cli)
    expect(args.slice(-2)).toEqual(['--port', expect.stringMatching(/^\d+$/)])
    expect(args.at(-1)).not.toBe('9292')
  })

  it('stops theme dev when the Studio closes', async () => {
    const cli = fakeShopify({ output: running })
    const studio = await openStudio(fixtureTheme(), { cli })
    const { pid } = await fakeRun(cli)
    await studio.close()
    await expect.poll(() => isRunning(pid)).toBe(false)
  })
})

function isRunning(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
