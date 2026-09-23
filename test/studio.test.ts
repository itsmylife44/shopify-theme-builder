import { spawnSync } from 'node:child_process'
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createServer as createHttpServer } from 'node:http'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { parseJSON } from '@shopify/theme-check-node'
import { startStudio, type Offense } from '../skills/shopify-theme-builder/studio/server/studio.mjs'

const projectDir = fileURLToPath(new URL('..', import.meta.url))
type StudioServer = Awaited<ReturnType<typeof startStudio>>
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
  cpSync(path.join(projectDir, 'skills/shopify-theme-builder/base-theme'), theme, { recursive: true })
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
 * A stand-in for the Shopify CLI: `version` prints the given version; `store execute` records its arguments
 * in store.json and prints `store` as JSON, or fails like the CLI without stored auth; `theme dev` records its
 * arguments and pid in run.json, prints the given output (and `later` half a second on), then runs until
 * killed or exits with exitCode.
 */
function fakeShopify({
  version = '4.8.0',
  output = '',
  later = '',
  exitCode,
  store,
}: { version?: string; output?: string; later?: string; exitCode?: number; store?: object } = {}) {
  const dir = tempDir('shopify-')
  const cli = path.join(dir, 'shopify')
  writeFileSync(
    cli,
    `#!/usr/bin/env node
if (process.argv[2] === 'version') {
  console.log(${JSON.stringify(version)})
  process.exit(0)
}
if (process.argv[2] === 'store') {
  require('node:fs').writeFileSync(${JSON.stringify(path.join(dir, 'store.json'))}, JSON.stringify(process.argv.slice(2)))
  ${
    store
      ? `console.log(${JSON.stringify(JSON.stringify(store, null, 2))})`
      : `console.error('No stored app authentication found for example.myshopify.com.'); process.exit(1)`
  }
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
    store = 'example.myshopify.com',
    storePassword,
  }: { catalog?: string; cli?: string; store?: string; storePassword?: string } = {},
) {
  const server: StudioServer = await startStudio({ theme, catalog, port: 0, cli, store, storePassword })
  cleanup.unshift(() => server.close())
  const url = server.resolvedUrls?.local[0]
  if (!url) throw new Error('Studio server has no local URL')
  return {
    url,
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
  it('returns the home, product and collection sections in order, the catalog sections per page and a clean validation', async () => {
    const studio = await openStudio(fixtureTheme())
    const state = await studio.readTheme()
    expect(state.home).toEqual([{ id: 'main', type: 'hello-world' }])
    expect(state.product).toEqual([{ id: 'main', type: 'product' }])
    expect(state.collection).toEqual([{ id: 'main', type: 'collection' }])
    expect(state.catalog).toEqual({ home: ['hero'], product: ['hero'], collection: ['hero'] })
    expect(state.custom).toEqual({ home: [], product: [], collection: [] })
    expect(state.validation.filter((o: { severity: string }) => o.severity === 'error')).toEqual([])
  })

  it('lists the Custom Sections per page: the Theme\'s sections that neither the Base Theme nor the catalog has', async () => {
    const theme = fixtureTheme()
    writeFileSync(path.join(theme, 'sections/pull-quote.liquid'), '<blockquote></blockquote>\n{% schema %}{"name": "Pull quote"}{% endschema %}\n')
    writeFileSync(
      path.join(theme, 'sections/size-guide.liquid'),
      '<div></div>\n{% schema %}{"name": "Size guide", "enabled_on": {"templates": ["product"]}}{% endschema %}\n',
    )
    const studio = await openStudio(theme)
    await studio.addSection('hero')
    expect((await studio.readTheme()).custom).toEqual({
      home: ['pull-quote'],
      product: ['pull-quote', 'size-guide'],
      collection: ['pull-quote'],
    })
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

describe('Studio stylesheet', () => {
  it("keeps its copy of shadcn's tailwind.css equal to the installed shadcn's", () => {
    const copy = readFileSync(path.join(projectDir, 'skills/shopify-theme-builder/studio/src/shadcn-tailwind.css'), 'utf8')
    const installed = readFileSync(path.join(projectDir, 'node_modules/shadcn/dist/tailwind.css'), 'utf8')
    // The copy starts with a two-line comment saying where it comes from.
    expect(copy.split('\n').slice(2).join('\n')).toBe(installed)
  })
})

describe('studio command', () => {
  function studio(...args: string[]) {
    const result = spawnSync('node', [path.join(projectDir, 'skills/shopify-theme-builder/studio/bin/studio.mjs'), ...args], {
      encoding: 'utf8',
      // A refused folder exits at once; a started Studio would run forever.
      timeout: 10_000,
    })
    return { code: result.status, stderr: result.stderr }
  }

  it('refuses a folder that is not a Theme', () => {
    const dir = tempDir('not-a-theme-')
    const result = studio('--theme', dir, '--store', 'example.myshopify.com')
    expect(result.code).toBe(1)
    expect(result.stderr).toContain(`${dir} is not a Shopify theme`)
  })

  it('refuses a Theme without a home template', () => {
    const dir = tempDir('no-home-')
    mkdirSync(path.join(dir, 'layout'))
    writeFileSync(path.join(dir, 'layout/theme.liquid'), '{{ content_for_layout }}')
    const result = studio('--theme', dir, '--store', 'example.myshopify.com')
    expect(result.code).toBe(1)
    expect(result.stderr).toContain(`${dir} is not a Shopify theme: templates/index.json is missing.`)
  })

  it('requires --theme', () => {
    const result = studio()
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('Usage: studio --theme <dir>')
  })

  it('requires --store, so theme dev never falls back to the store the CLI used last', () => {
    const result = studio('--theme', fixtureTheme())
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('--store <shop>.myshopify.com')
    expect(result.stderr).toContain('shopify store create dev --demo-data')
  })
})

const pages = [
  { page: 'home', file: 'templates/index.json', main: 'hello-world' },
  { page: 'product', file: 'templates/product.json', main: 'product' },
  { page: 'collection', file: 'templates/collection.json', main: 'collection' },
]

describe('Studio API: section settings', () => {
  const realCatalog = path.join(projectDir, 'skills/shopify-theme-builder/catalog')

  async function withTestimonials() {
    const theme = fixtureTheme()
    const studio = await openStudio(theme, { catalog: realCatalog })
    const { body } = await studio.addSection('testimonials')
    const id = body.home.at(-1).id
    return { theme, studio, id }
  }

  it("reads a section's text settings and its blocks' text settings, with their labels and current values", async () => {
    const { studio, id } = await withTestimonials()
    const { status, body } = await studio.send('GET', `api/home/sections/${id}`)
    expect(status).toBe(200)
    expect(body).toMatchObject({ id, type: 'testimonials', name: 'Testimonials', colorScheme: 'scheme-1' })
    expect(body.settings).toEqual([{ id: 'heading', type: 'inline_richtext', label: 'Heading', value: 'What our customers say' }])
    expect(body.blocks).toHaveLength(3)
    expect(body.blocks[0]).toEqual({
      id: expect.stringMatching(/^testimonial_/),
      type: 'testimonial',
      name: 'Testimonial',
      settings: [
        { id: 'quote', type: 'richtext', label: 'Quote', value: '<p>Share what a customer loved about your products.</p>' },
        { id: 'author', type: 'text', label: 'Author', value: 'Customer name' },
        { id: 'author_detail', type: 'text', label: 'Author detail', value: '' },
      ],
    })
  })

  it("writes a section's and its blocks' text settings into the page's template", async () => {
    const { theme, studio, id } = await withTestimonials()
    const block = (await studio.send('GET', `api/home/sections/${id}`)).body.blocks[1].id
    const { status, body } = await studio.send('PATCH', `api/home/sections/${id}`, {
      settings: { heading: 'Dicono di noi' },
      blocks: { [block]: { quote: '<p>Tazze bellissime.</p>', author: 'Giulia' } },
    })
    expect(status).toBe(200)
    expect(errors(body.validation)).toEqual([])
    const section = readTemplate(theme).sections[id]
    expect(section.settings.heading).toBe('Dicono di noi')
    expect(section.blocks[block].settings).toEqual({ quote: '<p>Tazze bellissime.</p>', author: 'Giulia' })
    const read = (await studio.send('GET', `api/home/sections/${id}`)).body
    expect(read.settings[0].value).toBe('Dicono di noi')
    expect(read.blocks[1].settings[1].value).toBe('Giulia')
  })

  it.each([
    [{ settings: { subtitle: 'x' } }, 'subtitle'],
    [{ settings: { color_scheme: 'scheme-2' } }, 'color_scheme'],
    [{ settings: { heading: 42 } }, 'heading'],
    [{ blocks: { nope: { author: 'x' } } }, 'nope'],
    [{ settings: { heading: 'ok' }, blocks: { nope: {} } }, 'nope'],
  ])('refuses %j, which names no text setting or block', async (change, named) => {
    const { theme, studio, id } = await withTestimonials()
    const before = readFileSync(path.join(theme, home), 'utf8')
    const { status, body } = await studio.send('PATCH', `api/home/sections/${id}`, change)
    expect(status).toBe(400)
    expect(body.error).toContain(named)
    expect(readFileSync(path.join(theme, home), 'utf8')).toBe(before)
  })

  it('refuses rich text that is not HTML paragraphs', async () => {
    const { studio, id } = await withTestimonials()
    const block = (await studio.send('GET', `api/home/sections/${id}`)).body.blocks[0].id
    const { status, body } = await studio.send('PATCH', `api/home/sections/${id}`, { blocks: { [block]: { quote: 'Just words' } } })
    expect(status).toBe(400)
    expect(body.error).toContain('quote')
  })

  it('refuses a write from another origin, like a script in the preview or another website', async () => {
    const { theme, studio, id } = await withTestimonials()
    const before = readFileSync(path.join(theme, home), 'utf8')
    const response = await fetch(new URL(`api/home/sections/${id}`, studio.url), {
      method: 'PATCH',
      headers: { 'Content-Type': 'text/plain', Origin: 'http://127.0.0.1:9999' },
      body: JSON.stringify({ settings: { heading: 'Hacked' } }),
    })
    expect(response.status).toBe(403)
    expect(readFileSync(path.join(theme, home), 'utf8')).toBe(before)
  })

  it('answers 404 for a section the page does not have', async () => {
    const { studio } = await withTestimonials()
    expect((await studio.send('GET', 'api/home/sections/nope')).status).toBe(404)
  })

  it("lists every catalog section's name and description", async () => {
    const theme = fixtureTheme()
    const studio = await openStudio(theme, { catalog: realCatalog })
    const { sectionInfo } = await studio.readTheme()
    expect(sectionInfo.testimonials).toEqual({ name: 'Testimonials', description: expect.stringMatching(/\w.+\./) })
    for (const file of readdirSync(path.join(realCatalog, 'sections')).filter((f) => f.endsWith('.liquid'))) {
      expect(sectionInfo[file.slice(0, -'.liquid'.length)]?.description, file).toBeTruthy()
    }
  })

  it("shows the Theme's own description of a section, else the catalog's", async () => {
    const theme = fixtureTheme()
    writeFileSync(path.join(theme, 'sections/footer.liquid'), `{% comment %}Our own footer.{% endcomment %}\n${readFileSync(path.join(theme, 'sections/footer.liquid'), 'utf8')}`)
    copyFileSync(path.join(realCatalog, 'sections/hero.liquid'), path.join(theme, 'sections/hero.liquid'))
    const heroWithout = readFileSync(path.join(theme, 'sections/hero.liquid'), 'utf8').replace(/^{% comment %}.*?{% endcomment %}\n/, '')
    writeFileSync(path.join(theme, 'sections/hero.liquid'), heroWithout)
    const { sectionInfo } = await (await openStudio(theme, { catalog: realCatalog })).readTheme()
    expect(sectionInfo.footer.description).toBe('Our own footer.')
    expect(sectionInfo.hero.description).toMatch(/banner/)
  })
})

describe('Studio API: store resource settings', () => {
  const realCatalog = path.join(projectDir, 'skills/shopify-theme-builder/catalog')
  const picks =
    '<div></div>\n{% schema %}{"name": "Picks", "settings": [' +
    '{"type": "product_list", "id": "products", "label": "Products", "limit": 2},' +
    '{"type": "collection_list", "id": "collections", "label": "Collections"},' +
    '{"type": "link_list", "id": "menu", "label": "Menu", "default": "main-menu"},' +
    '{"type": "product", "id": "product", "label": "Product"}' +
    '], "presets": [{"name": "Picks"}]}{% endschema %}\n'

  async function withSection(type: string) {
    const theme = fixtureTheme()
    writeFileSync(path.join(theme, 'sections/picks.liquid'), picks)
    const studio = await openStudio(theme, { catalog: realCatalog })
    const { body } = await studio.addSection(type)
    const id = body.home.at(-1).id
    const patch = (settings: object) => studio.send('PATCH', `api/home/sections/${id}`, { settings })
    const read = async () => (await studio.send('GET', `api/home/sections/${id}`)).body
    return { theme, studio, id, patch, read }
  }

  it("lists a section's collection and link settings with their values", async () => {
    const featured = await withSection('featured-collection')
    expect((await featured.read()).settings).toContainEqual({ id: 'collection', type: 'collection', label: 'Collection', value: '' })
    const hero = await withSection('hero')
    expect((await hero.read()).settings).toContainEqual({ id: 'button_link', type: 'url', label: 'Button link', value: '' })
    const custom = await withSection('picks')
    expect((await custom.read()).settings).toEqual([
      { id: 'products', type: 'product_list', label: 'Products', value: [] },
      { id: 'collections', type: 'collection_list', label: 'Collections', value: [] },
      { id: 'menu', type: 'link_list', label: 'Menu', value: 'main-menu' },
      { id: 'product', type: 'product', label: 'Product', value: '' },
    ])
  })

  it('writes the featured collection by its handle into the template, with a clean Theme Check', async () => {
    const { theme, id, patch, read } = await withSection('featured-collection')
    const { status, body } = await patch({ collection: 'summer-sale' })
    expect(status).toBe(200)
    expect(errors(body.validation)).toEqual([])
    expect(readTemplate(theme).sections[id].settings.collection).toBe('summer-sale')
    expect((await read()).settings).toContainEqual(expect.objectContaining({ id: 'collection', value: 'summer-sale' }))
  })

  it('clears a store resource setting with an empty value', async () => {
    const { theme, id, patch } = await withSection('picks')
    await patch({ product: 'mug', products: ['mug', 'plate'], menu: 'footer' })
    expect(readTemplate(theme).sections[id].settings).toMatchObject({ product: 'mug', products: ['mug', 'plate'], menu: 'footer' })
    expect((await patch({ product: '', products: [] })).status).toBe(200)
    const { settings } = readTemplate(theme).sections[id]
    expect(settings).not.toHaveProperty('product')
    expect(settings).not.toHaveProperty('products')
  })

  it.each(['/collections/all', 'https://example.com/about', 'shopify://collections/summer-sale', 'mailto:hi@example.com', ''])(
    'writes the link %j',
    async (link) => {
      const { theme, id, patch } = await withSection('hero')
      expect((await patch({ button_link: link })).status).toBe(200)
      expect(readTemplate(theme).sections[id].settings.button_link).toBe(link || undefined)
    },
  )

  it.each([
    ['hero', { button_link: 'javascript:alert(1)' }, 'button_link'],
    ['hero', { button_link: 42 }, 'button_link'],
    ['featured-collection', { collection: 'summer sale' }, 'collection'],
    ['featured-collection', { collection: ['summer'] }, 'collection'],
    ['picks', { products: 'mug' }, 'products'],
    ['picks', { products: ['a', 'b', 'c'] }, 'products'],
    ['picks', { collections: ['ok', 'no way'] }, 'collections'],
  ])('refuses %s %j', async (type, change, named) => {
    const { theme, patch } = await withSection(type)
    const before = readFileSync(path.join(theme, home), 'utf8')
    const { status, body } = await patch(change)
    expect(status).toBe(400)
    expect(body.error).toContain(named)
    expect(readFileSync(path.join(theme, home), 'utf8')).toBe(before)
  })

  it("lists the store's collections, products and menus through the Shopify CLI's stored auth, read-only", async () => {
    const cli = fakeShopify({
      store: {
        collections: { nodes: [{ handle: 'summer-sale', title: 'Summer sale' }] },
        products: { nodes: [{ handle: 'mug', title: 'Mug' }] },
        menus: { nodes: [{ handle: 'main-menu', title: 'Main menu' }] },
      },
    })
    const studio = await openStudio(fixtureTheme(), { cli })
    const { status, body } = await studio.send('GET', 'api/store')
    expect(status).toBe(200)
    expect(body).toEqual({
      collections: [{ handle: 'summer-sale', title: 'Summer sale' }],
      products: [{ handle: 'mug', title: 'Mug' }],
      menus: [{ handle: 'main-menu', title: 'Main menu' }],
    })
    const args: string[] = JSON.parse(readFileSync(path.join(path.dirname(cli), 'store.json'), 'utf8'))
    expect(args.slice(0, 4)).toEqual(['store', 'execute', '--store', 'example.myshopify.com'])
    expect(args).toContain('--json')
    expect(args).not.toContain('--allow-mutations')
  })

  it('tells how to authenticate the store when the CLI has no stored auth for it', async () => {
    const studio = await openStudio(fixtureTheme())
    const { status, body } = await studio.send('GET', 'api/store')
    expect(status).toBe(409)
    expect(body.error).toContain('shopify store auth --store example.myshopify.com --scopes read_products,read_online_store_navigation')
  })
})

describe('Studio API: checkbox, range, number, select and radio settings', () => {
  const layout =
    '<div></div>\n{% schema %}{"name": "Layout", "settings": [' +
    '{"type": "checkbox", "id": "show", "label": "Show", "default": true},' +
    '{"type": "range", "id": "columns", "label": "Columns", "min": 2, "max": 12, "step": 2, "unit": "px", "default": 4},' +
    '{"type": "range", "id": "rows", "label": "Rows", "min": 1, "max": 3, "default": 2},' +
    '{"type": "number", "id": "count", "label": "Count"},' +
    '{"type": "select", "id": "position", "label": "Position", "options": [{"value": "left", "label": "Left"}, {"value": "right", "label": "Right"}], "default": "left"},' +
    '{"type": "radio", "id": "size", "label": "Size", "options": [{"value": "s", "label": "Small"}, {"value": "l", "label": "Large"}], "default": "s"}' +
    '], "presets": [{"name": "Layout"}]}{% endschema %}\n'

  async function withLayout() {
    const theme = fixtureTheme()
    writeFileSync(path.join(theme, 'sections/layout.liquid'), layout)
    const studio = await openStudio(theme)
    const id = (await studio.addSection('layout')).body.home.at(-1).id
    const patch = (settings: object) => studio.send('PATCH', `api/home/sections/${id}`, { settings })
    const read = async () => (await studio.send('GET', `api/home/sections/${id}`)).body
    return { theme, id, patch, read }
  }

  it('lists them with their values, bounds and options', async () => {
    const { read } = await withLayout()
    expect((await read()).settings).toEqual([
      { id: 'show', type: 'checkbox', label: 'Show', value: true },
      { id: 'columns', type: 'range', label: 'Columns', value: 4, min: 2, max: 12, step: 2, unit: 'px' },
      { id: 'rows', type: 'range', label: 'Rows', value: 2, min: 1, max: 3, step: 1 },
      { id: 'count', type: 'number', label: 'Count', value: null },
      { id: 'position', type: 'select', label: 'Position', value: 'left', options: [{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }] },
      { id: 'size', type: 'radio', label: 'Size', value: 's', options: [{ value: 's', label: 'Small' }, { value: 'l', label: 'Large' }] },
    ])
  })

  it('writes them into the template with a clean Theme Check, and clears a number with null', async () => {
    const { theme, id, patch, read } = await withLayout()
    const { status, body } = await patch({ show: false, columns: 8, count: 3, position: 'right', size: 'l' })
    expect(status).toBe(200)
    expect(errors(body.validation)).toEqual([])
    expect(readTemplate(theme).sections[id].settings).toMatchObject({ show: false, columns: 8, count: 3, position: 'right', size: 'l' })
    expect((await read()).settings[0].value).toBe(false)
    expect((await patch({ count: null })).status).toBe(200)
    expect(readTemplate(theme).sections[id].settings).not.toHaveProperty('count')
  })

  it("edits the real featured collection's columns and link toggle", async () => {
    const theme = fixtureTheme()
    const studio = await openStudio(theme, { catalog: path.join(projectDir, 'skills/shopify-theme-builder/catalog') })
    const id = (await studio.addSection('featured-collection')).body.home.at(-1).id
    const { status, body } = await studio.send('PATCH', `api/home/sections/${id}`, { settings: { columns: 3, show_view_all: false } })
    expect(status).toBe(200)
    expect(errors(body.validation)).toEqual([])
    expect(readTemplate(theme).sections[id].settings).toMatchObject({ columns: 3, show_view_all: false })
  })

  it.each([
    [{ show: 'yes' }, 'show'],
    [{ columns: '4' }, 'columns'],
    [{ columns: 14 }, 'columns'],
    [{ columns: 0 }, 'columns'],
    [{ columns: 5 }, 'columns'],
    [{ count: 'x' }, 'count'],
    [{ position: 'center' }, 'position'],
    [{ size: 1 }, 'size'],
  ])('refuses %j', async (change, named) => {
    const { theme, patch } = await withLayout()
    const before = readFileSync(path.join(theme, home), 'utf8')
    const { status, body } = await patch(change)
    expect(status).toBe(400)
    expect(body.error).toContain(named)
    expect(readFileSync(path.join(theme, home), 'utf8')).toBe(before)
  })
})

describe('Studio API: section presets', () => {
  it("adds a section with its preset's settings and blocks, as the Theme Editor does", async () => {
    const theme = fixtureTheme()
    const catalog = fixtureCatalog()
    writeFileSync(
      path.join(catalog, 'sections/quotes.liquid'),
      `{% for block in section.blocks %}<p {{ block.shopify_attributes }}>{{ block.settings.quote }}</p>{% endfor %}
{% schema %}
{
  "name": "Quotes",
  "settings": [{ "type": "text", "id": "heading", "label": "Heading", "default": "Quotes" }],
  "blocks": [{ "type": "quote", "name": "Quote", "settings": [{ "type": "text", "id": "quote", "label": "Quote" }] }],
  "presets": [{ "name": "Quotes", "settings": { "heading": "Kind words" }, "blocks": [{ "type": "quote" }, { "type": "quote", "settings": { "quote": "Lovely" } }] }]
}
{% endschema %}
`,
    )
    const { status, body } = await (await openStudio(theme, { catalog })).addSection('quotes', 'home')
    expect(status).toBe(200)
    const template = readTemplate(theme, 'templates/index.json')
    const section = template.sections[template.order[1]]
    expect(section.settings).toEqual({ heading: 'Kind words' })
    expect(section.block_order).toHaveLength(2)
    expect(section.block_order.map((id: string) => section.blocks[id])).toEqual([
      { type: 'quote', settings: {} },
      { type: 'quote', settings: { quote: 'Lovely' } },
    ])
    expect(errors(body.validation)).toEqual([])
  })
})

describe('Studio API: add, remove and reorder blocks', () => {
  const realCatalog = path.join(projectDir, 'skills/shopify-theme-builder/catalog')
  const quotes = `{% for block in section.blocks %}<p {{ block.shopify_attributes }}>{{ block.settings.quote }}</p>{% endfor %}
{% schema %}
{
  "name": "Quotes",
  "max_blocks": 3,
  "blocks": [
    { "type": "quote", "name": "Quote", "settings": [{ "type": "text", "id": "quote", "label": "Quote" }] },
    { "type": "portrait", "name": "Portrait", "limit": 1 },
    { "type": "@app" }
  ],
  "presets": [{ "name": "Quotes", "blocks": [{ "type": "quote" }] }]
}
{% endschema %}
`

  async function withSection(type: string, catalog = realCatalog) {
    const theme = fixtureTheme()
    writeFileSync(path.join(theme, 'sections/quotes.liquid'), quotes)
    const studio = await openStudio(theme, { catalog })
    const id = (await studio.addSection(type)).body.home.at(-1).id
    const blocksUrl = `api/home/sections/${id}/blocks`
    return {
      theme,
      studio,
      id,
      section: () => readTemplate(theme).sections[id],
      read: async () => (await studio.send('GET', `api/home/sections/${id}`)).body,
      addBlock: (type: unknown) => studio.send('POST', blocksUrl, { type }),
      removeBlock: (block: string) => studio.send('DELETE', `${blocksUrl}/${encodeURIComponent(block)}`),
      reorderBlocks: (order: unknown) => studio.send('PUT', `api/home/sections/${id}/order`, { order }),
    }
  }

  it('lists the block types a section can add and its most blocks, leaving out app blocks', async () => {
    expect(await (await withSection('testimonials')).read()).toMatchObject({ blockTypes: [{ type: 'testimonial', name: 'Testimonial' }], maxBlocks: 12 })
    expect(await (await withSection('quotes')).read()).toMatchObject({
      blockTypes: [
        { type: 'quote', name: 'Quote' },
        { type: 'portrait', name: 'Portrait' },
      ],
      maxBlocks: 3,
    })
    expect(await (await withSection('hero')).read()).toMatchObject({ blockTypes: [], maxBlocks: 50 })
  })

  it('adds a testimonial at the end of the section, with a clean Theme Check', async () => {
    const { section, read, addBlock } = await withSection('testimonials')
    const { status, body } = await addBlock('testimonial')
    expect(status).toBe(200)
    expect(errors(body.validation)).toEqual([])
    const { blocks, block_order } = section()
    expect(block_order).toHaveLength(4)
    expect(blocks[block_order[3]]).toEqual({ type: 'testimonial', settings: {} })
    const details = await read()
    expect(details.blocks).toHaveLength(4)
    expect(details.blocks[3]).toMatchObject({ id: block_order[3], type: 'testimonial', name: 'Testimonial' })
  })

  it("refuses a block past the section's max_blocks or its type's limit, and a type the section has not", async () => {
    const { theme, addBlock } = await withSection('quotes')
    expect((await addBlock('portrait')).status).toBe(200)
    const refusals: [unknown, string][] = [
      ['portrait', 'portrait'],
      ['@app', '@app'],
      ['nope', 'nope'],
      [42, 'type'],
    ]
    for (const [type, named] of refusals) {
      const before = readFileSync(path.join(theme, home), 'utf8')
      const { status, body } = await addBlock(type)
      expect(status, String(type)).toBe(400)
      expect(body.error).toContain(named)
      expect(readFileSync(path.join(theme, home), 'utf8')).toBe(before)
    }
    expect((await addBlock('quote')).status).toBe(200)
    const { status, body } = await addBlock('quote')
    expect(status).toBe(400)
    expect(body.error).toContain('3')
  })

  it('removes a block from the section, down to none', async () => {
    const { section, addBlock, removeBlock } = await withSection('faq')
    const [first, ...rest] = section().block_order
    const { status, body } = await removeBlock(first)
    expect(status).toBe(200)
    expect(errors(body.validation)).toEqual([])
    expect(section().block_order).toEqual(rest)
    expect(section().blocks).not.toHaveProperty(first)
    for (const block of rest) expect((await removeBlock(block)).status).toBe(200)
    expect(section()).toMatchObject({ blocks: {}, block_order: [] })
    expect((await addBlock('question')).status).toBe(200)
    expect(section().block_order).toHaveLength(1)
  })

  it('answers 404 for a block the section does not have', async () => {
    const { theme, removeBlock } = await withSection('faq')
    const before = readFileSync(path.join(theme, home), 'utf8')
    expect((await removeBlock('nope')).status).toBe(404)
    expect(readFileSync(path.join(theme, home), 'utf8')).toBe(before)
  })

  it("reorders the section's blocks", async () => {
    const { section, read, reorderBlocks } = await withSection('testimonials')
    const order = section().block_order.toReversed()
    const { status, body } = await reorderBlocks(order)
    expect(status).toBe(200)
    expect(errors(body.validation)).toEqual([])
    expect(section().block_order).toEqual(order)
    expect((await read()).blocks.map((block: { id: string }) => block.id)).toEqual(order)
  })

  it.each([
    ['one missing', (order: string[]) => order.slice(1)],
    ['one twice', (order: string[]) => [...order.slice(1), order[1]]],
    ['an unknown id', (order: string[]) => [...order.slice(1), 'nope']],
    ['not a list', () => 'nope'],
  ])('refuses a block order with %s', async (_, change) => {
    const { theme, section, reorderBlocks } = await withSection('testimonials')
    const before = readFileSync(path.join(theme, home), 'utf8')
    const { status, body } = await reorderBlocks(change(section().block_order))
    expect(status).toBe(400)
    expect(body.error).toContain('block')
    expect(readFileSync(path.join(theme, home), 'utf8')).toBe(before)
  })
})

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

  it('adds the Base Theme locale keys a copied section needs to the shop\'s language too, in English, keeping its translations', async () => {
    // A Theme made before the Base Theme had the header keys, carrying Italian as the shop's language.
    const theme = fixtureTheme()
    const localeFile = path.join(theme, 'locales/en.default.json')
    const locale = parseJSON(readFileSync(localeFile, 'utf8'))
    delete locale.header
    writeFileSync(localeFile, JSON.stringify(locale, null, 2))
    const shopLanguage = path.join(theme, 'locales/it.json')
    writeFileSync(shopLanguage, JSON.stringify({ ...locale, cart: { ...locale.cart, title: 'Carrello' } }, null, 2))
    // Theme Editor labels too: the older Base Theme had no Heading label.
    const schemaLocaleFile = path.join(theme, 'locales/en.default.schema.json')
    const schemaLocale = parseJSON(readFileSync(schemaLocaleFile, 'utf8'))
    delete schemaLocale.labels.heading
    writeFileSync(schemaLocaleFile, JSON.stringify(schemaLocale, null, 2))
    const shopSchemaLanguage = path.join(theme, 'locales/it.schema.json')
    writeFileSync(shopSchemaLanguage, JSON.stringify({ ...schemaLocale, labels: { ...schemaLocale.labels, text: 'Testo' } }, null, 2))
    const catalog = fixtureCatalog()
    writeFileSync(
      path.join(catalog, 'sections/links.liquid'),
      '<nav aria-label="{{ \'header.main_menu\' | t }}"></nav>\n' +
        '{% schema %}{"name": "Links", "settings": [{"type": "text", "id": "heading", "label": "t:labels.heading"}], "presets": [{"name": "Links"}]}{% endschema %}\n',
    )

    const { status, body } = await (await openStudio(theme, { catalog })).addSection('links')
    expect(status).toBe(200)
    expect(errors(body.validation)).toEqual([])
    const italian = parseJSON(readFileSync(shopLanguage, 'utf8'))
    expect(italian.header.main_menu).toBe('Main menu')
    expect(italian.cart.title).toBe('Carrello')
    const italianSchema = parseJSON(readFileSync(shopSchemaLanguage, 'utf8'))
    expect(italianSchema.labels.heading).toBe('Heading')
    expect(italianSchema.labels.text).toBe('Testo')
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

  // Runs a Theme Check per section, which a busy CI runner can take over 5 seconds for.
  it('offers and adds every real catalog home section with a color scheme and a clean Theme Check', async () => {
    const theme = fixtureTheme()
    const studio = await openStudio(theme, { catalog: path.join(projectDir, 'skills/shopify-theme-builder/catalog') })
    const types = ['hero', 'featured-collection', 'featured-product', 'collection-list', 'slideshow', 'multicolumn', 'video', 'blog-posts', 'image-gallery', 'image-with-text', 'rich-text', 'logo-list', 'testimonials', 'faq', 'newsletter', 'custom-liquid']
    expect((await studio.readTheme()).catalog.home).toEqual(types.toSorted())
    let body
    for (const type of types) ({ body } = await studio.addSection(type))
    expect(body.home.slice(1)).toEqual(types.map((type) => expect.objectContaining({ type, colorScheme: 'scheme-1' })))
    expect(errors(body.validation)).toEqual([])
  }, 20_000)

  it('never offers the real catalog header or footer for the home page', async () => {
    const theme = fixtureTheme()
    cpSync(path.join(projectDir, 'skills/shopify-theme-builder/catalog'), theme, { recursive: true })
    const studio = await openStudio(theme, { catalog: path.join(projectDir, 'skills/shopify-theme-builder/catalog') })
    const { catalog } = await studio.readTheme()
    for (const page of ['home', 'product', 'collection']) {
      expect(catalog[page]).toContain('hero')
      expect(catalog[page]).not.toContain('header')
      expect(catalog[page]).not.toContain('footer')
      expect(catalog[page]).not.toContain('main-cart')
      expect(catalog[page]).not.toContain('main-search')
      expect(catalog[page]).not.toContain('predictive-search')
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
    expect((await studio.readTheme()).catalog).toEqual({ home: ['hero'], product: ['gallery', 'hero'], collection: ['hero'] })
    const before = readFileSync(path.join(theme, home), 'utf8')
    expect((await studio.addSection('gallery')).status).toBe(400)
    expect(readFileSync(path.join(theme, home), 'utf8')).toBe(before)
    expect((await studio.addSection('gallery', 'product')).status).toBe(200)
  })

  it('composes a product page from the real catalog\'s main product and related products with a clean Theme Check', async () => {
    const theme = fixtureTheme()
    const studio = await openStudio(theme, { catalog: path.join(projectDir, 'skills/shopify-theme-builder/catalog') })
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

  it('copies the Base Theme blocks the main product takes into a Theme that lacks them, and offers no theme block to add', async () => {
    const theme = fixtureTheme()
    rmSync(path.join(theme, 'blocks/custom-liquid.liquid'))
    const studio = await openStudio(theme, { catalog: path.join(projectDir, 'skills/shopify-theme-builder/catalog') })
    const { body } = await studio.addSection('main-product', 'product')
    expect(existsSync(path.join(theme, 'blocks/custom-liquid.liquid'))).toBe(true)
    expect(errors(body.validation)).toEqual([])
    const id = body.product.find((section: { type: string }) => section.type === 'main-product').id
    expect((await studio.send('GET', `api/product/sections/${id}`)).body).toMatchObject({ blockTypes: [] })
  })
})

describe('Studio API: collection page', () => {
  it('composes a collection page from the real catalog\'s main collection with a clean Theme Check', async () => {
    const theme = fixtureTheme()
    const studio = await openStudio(theme, { catalog: path.join(projectDir, 'skills/shopify-theme-builder/catalog') })
    const { catalog } = await studio.readTheme()
    expect(catalog.collection).toContain('main-collection')
    expect(catalog.home).not.toContain('main-collection')
    expect(catalog.product).not.toContain('main-collection')

    expect((await studio.addSection('main-collection', 'collection')).status).toBe(200)
    const { status, body } = await studio.removeSection('main', 'collection')
    expect(status).toBe(200)
    expect(body.collection).toEqual([expect.objectContaining({ type: 'main-collection', colorScheme: 'scheme-1' })])
    expect(errors(body.validation)).toEqual([])
    // The product grid shows once per page.
    expect((await studio.addSection('main-collection', 'collection')).status).toBe(400)
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

  it('refuses to start without a store, so theme dev never runs on the store the CLI used last', async () => {
    const cli = fakeShopify()
    // @ts-expect-error: store is required.
    await expect(startStudio({ theme: fixtureTheme(), catalog: fixtureCatalog(), port: 0, cli })).rejects.toThrow(
      'needs a store',
    )
    expect(existsSync(path.join(path.dirname(cli), 'run.json'))).toBe(false)
  })

  it("serves the preview to the Studio's iframe, without x-frame-options and with the selection script", async () => {
    const themeDev = createHttpServer((req, res) => {
      if (req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'X-Frame-Options': 'DENY' })
        res.end('<html><body><p>Shop</p></body></html>')
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end('{"products":[{"handle":"clay-mug"}]}')
      }
    })
    await new Promise<void>((resolve) => themeDev.listen(0, '127.0.0.1', resolve))
    cleanup.push(() => new Promise((resolve) => themeDev.close(() => resolve())))
    const themeDevUrl = `http://127.0.0.1:${(themeDev.address() as import('node:net').AddressInfo).port}`
    const studio = await openStudio(fixtureTheme(), { cli: fakeShopify({ output: running.replace('http://127.0.0.1:9292', themeDevUrl) }) })
    await expect.poll(() => studio.readPreview()).toEqual({ status: 'running', url: themeDevUrl })
    const { status, body } = await studio.send('GET', 'api/frame')
    expect(status).toBe(200)
    expect(body.paths).toEqual({ home: '/', product: '/products/clay-mug', collection: '/collections/all' })
    const page = await fetch(`${body.url}/`)
    expect(page.headers.get('x-frame-options')).toBeNull()
    expect(page.headers.get('access-control-allow-origin')).toBeNull()
    const html = await page.text()
    expect(html).toContain('<p>Shop</p>')
    expect(html).toMatch(/<script>[\s\S]*studio:select[\s\S]*<\/script><\/body>/)
    expect(await (await fetch(`${body.url}/products.json`)).text()).toBe('{"products":[{"handle":"clay-mug"}]}')
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

  it('keeps the preview on the same port when the Studio restarts, even with 9292 taken', async () => {
    const taken = createServer()
    await new Promise((resolve) => taken.once('error', resolve).listen(9292, '127.0.0.1', () => resolve(undefined)))
    cleanup.push(() => new Promise((resolve) => taken.close(() => resolve())))
    const theme = fixtureTheme()
    const first = fakeShopify()
    const studio = await openStudio(theme, { cli: first })
    const port = (await fakeRun(first)).args.at(-1)
    await studio.close()
    const second = fakeShopify()
    await openStudio(theme, { cli: second })
    expect((await fakeRun(second)).args.at(-1)).toBe(port)
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
