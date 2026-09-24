import { spawn, spawnSync } from 'node:child_process'
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { createServer as createHttpServer } from 'node:http'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { parseJSON } from '@shopify/theme-check-node'
import { startStudio, type Offense } from '../skills/shopify-theme-builder/studio/server/studio.mjs'
import { checkDirection } from '../skills/shopify-theme-builder/scripts/check-direction.mjs'

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

/** A fresh Theme folder built from the Base Theme, with a contact page template (SKILL.md's setup copies the catalog's). */
function fixtureTheme() {
  const theme = tempDir('theme-')
  cpSync(path.join(projectDir, 'skills/shopify-theme-builder/base-theme'), theme, { recursive: true })
  writeFileSync(path.join(theme, 'templates/page.contact.json'), JSON.stringify({ sections: { main: { type: 'page' } }, order: ['main'] }))
  return theme
}

/** The pages the Studio composes, in its page switcher's order. */
const pageNames = ['home', 'product', 'collection', 'page', 'contact', 'cart', 'search', 'blog', 'article', '404', 'collections']

/** The same value for every page, except the overrides. */
function everyPage<T>(value: T, overrides: Record<string, T> = {}) {
  return { ...Object.fromEntries(pageNames.map((page) => [page, value])), ...overrides }
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
 * A stand-in for the Shopify CLI: `version` prints the given version; `store execute` adds its arguments to
 * the list in store.json and prints `store` as JSON (given a list, the nth call prints the nth answer, and the
 * last one after that), or fails like the CLI without stored auth; `theme package` records its --path in
 * package.json and writes <theme_name>-<theme_version>.zip there, holding the list of files it packaged, or prints
 * `packageError` and fails; `theme dev` records its
 * arguments and pid in run.json, prints the given output (and `later` half a second on; given a list, the
 * nth run prints the nth one, and the last one after that), prints `onSignal` on each SIGUSR2, then runs
 * until killed or exits with exitCode.
 */
function fakeShopify({
  version = '4.8.0',
  output = '',
  later = '',
  onSignal = '',
  exitCode,
  store,
  storeError = 'No stored app authentication found for example.myshopify.com.',
  packageError,
}: {
  version?: string
  output?: string
  later?: string | string[]
  onSignal?: string
  exitCode?: number
  store?: object | object[]
  storeError?: string
  packageError?: string
} = {}) {
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
  const fs = require('node:fs')
  const log = ${JSON.stringify(path.join(dir, 'store.json'))}
  const calls = fs.existsSync(log) ? JSON.parse(fs.readFileSync(log, 'utf8')) : []
  calls.push(process.argv.slice(2))
  fs.writeFileSync(log, JSON.stringify(calls))
  ${
    store
      ? `const answers = ${JSON.stringify([store].flat())}
  console.log(JSON.stringify(answers[Math.min(calls.length, answers.length) - 1], null, 2))`
      : `process.stderr.write(${JSON.stringify(storeError)}); process.exit(1)`
  }
  process.exit(0)
}
if (process.argv[2] === 'theme' && process.argv[3] === 'package') {
  const fs = require('node:fs')
  const path = require('node:path')
  const dir = process.argv[process.argv.indexOf('--path') + 1]
  fs.writeFileSync(${JSON.stringify(path.join(dir, 'package.json'))}, JSON.stringify({ path: dir }))
  ${
    packageError === undefined
      ? `const info = JSON.parse(fs.readFileSync(path.join(dir, 'config/settings_schema.json'), 'utf8')).find((group) => group.name === 'theme_info')
  const files = fs.readdirSync(dir, { recursive: true }).filter((file) => fs.statSync(path.join(dir, file)).isFile()).sort()
  fs.writeFileSync(path.join(dir, info.theme_name + '-' + info.theme_version + '.zip'), 'PK' + JSON.stringify(files))
  process.exit(0)`
      : `console.error(${JSON.stringify(packageError)}); process.exit(1)`
  }
}
const fs = require('node:fs')
const runFile = ${JSON.stringify(path.join(dir, 'run.json'))}
const runs = (fs.existsSync(runFile) ? JSON.parse(fs.readFileSync(runFile, 'utf8')).runs : 0) + 1
fs.writeFileSync(runFile, JSON.stringify({ args: process.argv.slice(2), pid: process.pid, runs, storePassword: process.env.SHOPIFY_FLAG_STORE_PASSWORD }))
const later = ${JSON.stringify([later].flat())}
process.on('SIGUSR2', () => process.stdout.write(${JSON.stringify(onSignal)}))
process.stdout.write(${JSON.stringify(output)})
setTimeout(() => process.stdout.write(later[Math.min(runs, later.length) - 1]), 500)
${exitCode === undefined ? 'setInterval(() => {}, 1000)' : `setTimeout(() => process.exit(${exitCode}), 600)`}
`,
    { mode: 0o755 },
  )
  return cli
}

/** The arguments and pid of the fake CLI's `theme dev` run, once it started. */
async function fakeRun(cli: string): Promise<{ args: string[]; pid: number; runs: number; storePassword?: string }> {
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
    setStyle(style: unknown) {
      return send('PUT', 'api/style', style)
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

/** The types of the catalog sections each page can take, from the Theme state. */
function catalogTypes(state: { catalog: Record<string, { type: string }[]> }) {
  return Object.fromEntries(Object.entries(state.catalog).map(([page, sections]) => [page, sections.map((section) => section.type)]))
}

function errors<T extends { severity: string }>(offenses: T[]) {
  return offenses.filter((offense) => offense.severity === 'error')
}

describe('Studio API: unknown calls', () => {
  it('answers an unknown path with a JSON 404 naming the call, never the Studio page', async () => {
    const response = await fetch(new URL('api/nope?x=1', (await openStudio(fixtureTheme())).url))
    expect(response.status).toBe(404)
    expect(response.headers.get('content-type')).toBe('application/json')
    expect((await response.json()).error).toContain('No such call: GET /api/nope.')
  })

  it('points a section path without /sections/ at the documented call', async () => {
    const { status, body } = await (await openStudio(fixtureTheme())).send('GET', 'api/header/announcement-bar')
    expect(status).toBe(404)
    expect(body.error).toContain('No such call: GET /api/header/announcement-bar.')
    expect(body.error).toContain('GET /api/header/sections/announcement-bar')
  })

  it('answers a wrong method on a known path with a JSON 405 and the allowed methods', async () => {
    const studio = await openStudio(fixtureTheme())
    const response = await fetch(new URL('api/brand/logo', studio.url), { method: 'POST' })
    expect(response.status).toBe(405)
    expect(response.headers.get('allow')).toBe('GET, PUT, DELETE')
    expect((await response.json()).error).toContain('POST /api/brand/logo')
    const theme = await studio.send('DELETE', 'api/theme')
    expect(theme.status).toBe(405)
    expect(theme.body.error).toContain('GET')
  })
})

describe('Studio API: read Theme state', () => {
  it('returns every page\'s sections in order, the catalog sections per page and a clean validation', async () => {
    const studio = await openStudio(fixtureTheme())
    const state = await studio.readTheme()
    expect(state.home).toEqual([{ id: 'main', type: 'hello-world' }])
    expect(state.product).toEqual([{ id: 'main', type: 'product' }])
    expect(state.collection).toEqual([{ id: 'main', type: 'collection' }])
    const types = { page: 'page', contact: 'page', cart: 'cart', search: 'search', blog: 'blog', article: 'article', 404: '404', collections: 'collections' }
    for (const [page, type] of Object.entries(types)) expect(state[page]).toEqual([{ id: 'main', type, colorScheme: 'scheme-1' }])
    expect(state.catalog).toEqual(everyPage([{ type: 'hero', presets: [] }]))
    expect(state.custom).toEqual(everyPage([]))
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
    expect((await studio.readTheme()).custom).toEqual(everyPage(['pull-quote'], { product: ['pull-quote', 'size-guide'] }))
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
        'scheme-1': { background: '#FFFFFF', text: '#333333', button: '#333333', button_label: '#FFFFFF', accent: '#333333', border: '#8A8A8A' },
        'scheme-2': { background: '#333333', text: '#FFFFFF', button: '#FFFFFF', button_label: '#333333', accent: '#FFFFFF', border: '#858585' },
      },
      colorFields: ['background', 'text', 'button', 'button_label', 'accent', 'border'],
      gradientFields: ['background_gradient'],
      headingFont: 'work_sans_n4',
      bodyFont: 'work_sans_n4',
      accentFont: 'work_sans_n4',
      logo: null,
      logoAsset: null,
    })
  })

  it('writes color schemes, fonts and logo into settings data and returns a clean validation', async () => {
    const theme = fixtureTheme()
    const studio = await openStudio(theme)
    const { status, body } = await studio.setBrand({
      colorSchemes: {
        'scheme-1': { background: '#FAF7F2', text: '#1F1A17', accent: '#8C2F1B', background_gradient: 'linear-gradient(180deg, #FAF7F2, #EFE6D8 100%)' },
        'scheme-3': { background: '#0A3D62' },
      },
      headingFont: 'playfair_display_n7',
      bodyFont: 'assistant_n4',
      accentFont: 'space_mono_n4',
      logo: 'shopify://shop_images/logo.png',
    })
    expect(status).toBe(200)
    const current = readSettingsData(theme).current
    expect(current.color_schemes['scheme-1'].settings).toEqual({
      background: '#FAF7F2',
      background_gradient: 'linear-gradient(180deg, #FAF7F2, #EFE6D8 100%)',
      text: '#1F1A17',
      button: '#333333',
      button_label: '#FFFFFF',
      accent: '#8C2F1B',
      border: '#8A8A8A',
    })
    // A new scheme starts from the schema's default colors.
    expect(current.color_schemes['scheme-3'].settings).toEqual({
      background: '#0A3D62',
      text: '#333333',
      button: '#333333',
      button_label: '#FFFFFF',
      accent: '#333333',
      border: '#8A8A8A',
    })
    expect(current.type_heading_font).toBe('playfair_display_n7')
    expect(current.type_body_font).toBe('assistant_n4')
    expect(current.type_accent_font).toBe('space_mono_n4')
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

  it('fills a scheme color the settings data lacks with the schema default', async () => {
    const theme = fixtureTheme()
    writeFileSync(
      path.join(theme, 'config/settings_data.json'),
      JSON.stringify({ current: { color_schemes: { 'scheme-1': { settings: { background: '#FFFFFF', text: '#000000' } } } } }),
    )
    const state = await (await openStudio(theme)).readTheme()
    expect(state.brand.colorSchemes['scheme-1']).toEqual({
      background: '#FFFFFF',
      text: '#000000',
      button: '#333333',
      button_label: '#FFFFFF',
      accent: '#333333',
      border: '#8A8A8A',
    })
  })

  it('reads a background gradient and clears it with an empty string', async () => {
    const theme = fixtureTheme()
    const studio = await openStudio(theme)
    const gradient = 'radial-gradient(rgba(255, 255, 255, 1), rgba(238, 238, 238, 1) 100%)'
    const { body } = await studio.setBrand({ colorSchemes: { 'scheme-2': { background_gradient: gradient } } })
    expect(body.brand.colorSchemes['scheme-2'].background_gradient).toBe(gradient)
    const cleared = await studio.setBrand({ colorSchemes: { 'scheme-2': { background_gradient: '' } } })
    expect(readSettingsData(theme).current.color_schemes['scheme-2'].settings).not.toHaveProperty('background_gradient')
    expect(cleared.body.brand.colorSchemes['scheme-2']).not.toHaveProperty('background_gradient')
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
    ['a gradient that is a hex color', { colorSchemes: { 'scheme-1': { background_gradient: '#FFFFFF' } } }],
    ['a gradient that breaks out of its CSS rule', { colorSchemes: { 'scheme-1': { background_gradient: 'linear-gradient(red, blue); } body { display: none' } } }],
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

describe('Studio API: style settings', () => {
  it('reads the style settings grouped like the Theme Editor, with labels, values and choices', async () => {
    const state = await (await openStudio(fixtureTheme())).readTheme()
    expect(state.style.map((group: { name: string }) => group.name)).toEqual(['Type', 'Shape', 'Buttons', 'Spacing', 'Cards', 'Media', 'Motion'])
    const settings = Object.fromEntries(state.style.flatMap((group: { settings: { id: string }[] }) => group.settings.map((setting) => [setting.id, setting])))
    expect(Object.keys(settings)).toEqual([
      'type_body_size',
      'type_scale_ratio',
      'type_display_size',
      'type_heading_weight',
      'type_heading_case',
      'type_heading_tracking',
      'shape_family',
      'border_width',
      'button_primary_style',
      'button_text_case',
      'button_font_weight',
      'density',
      'page_width',
      'card_anatomy',
      'card_image_ratio',
      'card_style',
      'card_text_alignment',
      'card_text_style',
      'card_hover',
      'media_treatment',
      'media_tint',
      'motion',
    ])
    expect(settings.type_body_size).toEqual({ id: 'type_body_size', type: 'range', label: 'Body size', value: 16, min: 14, max: 18, step: 1, unit: 'px' })
    expect(settings.shape_family).toEqual({
      id: 'shape_family',
      type: 'select',
      label: 'Shape',
      value: 'soft',
      options: [
        { value: 'square', label: 'Square' },
        { value: 'soft', label: 'Soft' },
        { value: 'round', label: 'Round' },
      ],
    })
    expect(settings.card_text_alignment).toEqual({
      id: 'card_text_alignment',
      type: 'select',
      label: 'Text alignment',
      value: 'left',
      options: [
        { value: 'left', label: 'Left' },
        { value: 'center', label: 'Center' },
        { value: 'right', label: 'Right' },
      ],
    })
    expect(settings.media_tint).toEqual({ id: 'media_tint', type: 'color', label: 'Tint behind images', value: '' })
  })

  it('writes style settings into settings data with a clean Theme Check, one undo step, and clears a color with an empty string', async () => {
    const theme = fixtureTheme()
    const before = readFileSync(path.join(theme, 'config/settings_data.json'), 'utf8')
    const studio = await openStudio(theme)
    const { status, body } = await studio.setStyle({
      type_body_size: 17,
      shape_family: 'round',
      card_text_alignment: 'center',
      media_tint: '#F4EFE8',
      motion: 'expressive',
    })
    expect(status).toBe(200)
    const current = readSettingsData(theme).current
    expect(current).toMatchObject({ type_body_size: 17, shape_family: 'round', card_text_alignment: 'center', media_tint: '#F4EFE8', motion: 'expressive' })
    // The Brand's color schemes stay.
    expect(Object.keys(current.color_schemes)).toEqual(['scheme-1', 'scheme-2'])
    const read = (state: { style: { settings: { id: string; value: unknown }[] }[] }, id: string) =>
      state.style.flatMap((group) => group.settings).find((setting) => setting.id === id)?.value
    expect(read(body, 'shape_family')).toBe('round')
    expect(read(body, 'media_tint')).toBe('#F4EFE8')
    expect(errors(body.validation)).toEqual([])

    const cleared = await studio.setStyle({ media_tint: '' })
    expect(readSettingsData(theme).current).not.toHaveProperty('media_tint')
    expect(read(cleared.body, 'media_tint')).toBe('')

    await studio.send('POST', 'api/undo')
    const { body: undone } = await studio.send('POST', 'api/undo')
    expect(readFileSync(path.join(theme, 'config/settings_data.json'), 'utf8')).toBe(before)
    expect(undone.history).toEqual({ undo: false, redo: true })
  })

  it("writes and clears the social media links the footer's social block shows, one undo step each (SKILL.md step 4.6)", async () => {
    const theme = fixtureTheme()
    const before = readFileSync(path.join(theme, 'config/settings_data.json'), 'utf8')
    const studio = await openStudio(theme)
    const { status, body } = await studio.setStyle({ social_instagram: 'https://instagram.com/acme', social_tiktok: 'https://www.tiktok.com/@acme' })
    expect(status).toBe(200)
    expect(readSettingsData(theme).current).toMatchObject({ social_instagram: 'https://instagram.com/acme', social_tiktok: 'https://www.tiktok.com/@acme' })
    expect(errors(body.validation)).toEqual([])
    const written = readFileSync(path.join(theme, 'config/settings_data.json'), 'utf8')

    await studio.setStyle({ social_tiktok: '' })
    expect(readSettingsData(theme).current).not.toHaveProperty('social_tiktok')
    expect(readSettingsData(theme).current.social_instagram).toBe('https://instagram.com/acme')

    await studio.send('POST', 'api/undo')
    expect(readFileSync(path.join(theme, 'config/settings_data.json'), 'utf8')).toBe(written)
    const { body: undone } = await studio.send('POST', 'api/undo')
    expect(readFileSync(path.join(theme, 'config/settings_data.json'), 'utf8')).toBe(before)
    expect(undone.history).toEqual({ undo: false, redo: true })
  })

  it('writes the social media links into the current Direction, which keeps them when the preview switches Directions', async () => {
    const theme = fixtureTheme()
    const studio = await openStudio(theme)
    const template = { sections: { main: { type: 'hello-world' } }, order: ['main'] }
    await studio.send('PUT', 'api/directions/Quiet', { template })
    await studio.send('PUT', 'api/directions/Loud', { template })
    await studio.send('PUT', 'api/directions/chosen', { name: 'Quiet' })
    await studio.setStyle({ social_instagram: 'https://instagram.com/acme' })
    await studio.send('PUT', 'api/directions/current', { name: 'Loud' })
    const data = readSettingsData(theme)
    expect(data.current).toBe('Loud')
    expect(data.presets.Loud.social_instagram).toBe('https://instagram.com/acme')
  })

  it.each([
    ['a social link that is not https', { social_instagram: 'http://instagram.com/acme' }],
    ['a social link that is a store path', { social_facebook: '/pages/about' }],
    ['a social link that is not a string', { social_x: null }],
    ['a range value off its step', { type_scale_ratio: 132 }],
    ['a range value out of bounds', { type_body_size: 20 }],
    ['an option the setting does not have', { shape_family: 'blob' }],
    ['an alignment that is not left, center or right', { card_text_alignment: 'justify' }],
    ['a color that is not hex', { media_tint: 'beige' }],
    ['a setting that is not a style setting', { cart_type: 'page' }],
    ['a list instead of an object', ['round']],
  ])('rejects %s and leaves settings data untouched', async (_, style) => {
    const theme = fixtureTheme()
    const before = readFileSync(path.join(theme, 'config/settings_data.json'), 'utf8')
    const { status, body } = await (await openStudio(theme)).setStyle(style)
    expect(status).toBe(400)
    expect(body.error).toEqual(expect.any(String))
    expect(readFileSync(path.join(theme, 'config/settings_data.json'), 'utf8')).toBe(before)
  })
})

describe('Studio API: Directions', () => {
  const heroHome = { sections: { hero: { type: 'hero', settings: { color_scheme: 'scheme-2' } } }, order: ['hero'] }

  it('writes a Direction as a preset of the Theme settings with its style, and its home template as a listing', async () => {
    const theme = fixtureTheme()
    const studio = await openStudio(theme)
    await studio.setBrand({ headingFont: 'work_sans_n7' })
    await studio.setStyle({ density: 'airy' })
    const { status, body } = await studio.send('PUT', `api/directions/${encodeURIComponent('Olive Press')}`, {
      settings: { shape_family: 'square', motion: 'none' },
      template: heroHome,
    })
    expect(status).toBe(200)
    const data = readSettingsData(theme)
    const preset = data.presets['Olive Press']
    // The Brand comes along; the style is the Direction's own, and a style setting it leaves out takes its default.
    expect(preset).toMatchObject({ type_heading_font: 'work_sans_n7', shape_family: 'square', motion: 'none' })
    expect(preset).not.toHaveProperty('density')
    expect(Object.keys(preset.color_schemes)).toEqual(['scheme-1', 'scheme-2'])
    // Writing a Direction doesn't switch to it.
    expect(data.current.density).toBe('airy')
    expect(readTemplate(theme, 'listings/olive-press/templates/index.json')).toEqual(heroHome)
    // The catalog section the template names is copied into the Theme.
    expect(readFileSync(path.join(theme, 'sections/hero.liquid'), 'utf8')).toBe(catalogHero)
    expect(readTemplate(theme)).toMatchObject({ order: ['main'] })
    expect(errors(body.validation)).toEqual([])
  })

  it('switches to a Direction as Shopify applies a preset and its listing, keeping the logo, in one undo step', async () => {
    const theme = fixtureTheme()
    const settingsBefore = readFileSync(path.join(theme, 'config/settings_data.json'), 'utf8')
    const homeBefore = readFileSync(path.join(theme, home), 'utf8')
    const studio = await openStudio(theme)
    await studio.send('PUT', 'api/directions/Quiet', { settings: { shape_family: 'square', card_text_alignment: 'center' }, template: heroHome })
    await studio.send('PUT', 'api/directions/Loud', { settings: { shape_family: 'round' }, template: { sections: { main: { type: 'hello-world' } }, order: ['main'] } })
    // A logo added after the Directions were written, and a style change: switching keeps the one and not the other.
    await studio.uploadLogo(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2]), 'image/png')
    await studio.setStyle({ shape_family: 'soft' })
    const settingsWritten = readFileSync(path.join(theme, 'config/settings_data.json'), 'utf8')

    const { status, body } = await studio.send('PUT', 'api/directions/current', { name: 'Quiet' })
    expect(status).toBe(200)
    const data = readSettingsData(theme)
    expect(data.current).toBe('Quiet')
    expect(data.presets.Quiet).toMatchObject({ shape_family: 'square', card_text_alignment: 'center', logo_asset: 'studio-logo.png' })
    expect(readTemplate(theme)).toEqual(heroHome)
    // The preview reads the preset's values and the listing's home.
    const shape = body.style.flatMap((group: { settings: { id: string; value: unknown }[] }) => group.settings).find((setting: { id: string }) => setting.id === 'shape_family')
    expect(shape.value).toBe('square')
    expect(body.home).toEqual([{ id: 'hero', type: 'hero', colorScheme: 'scheme-2' }])
    expect(body.brand.logoAsset).toBe('studio-logo.png')
    expect(errors(body.validation)).toEqual([])

    // Rewriting the chosen Direction changes the home page with it.
    await studio.send('PUT', 'api/directions/Quiet', { settings: { shape_family: 'square' }, template: { sections: { main: { type: 'hello-world' } }, order: ['main'] } })
    expect(readTemplate(theme)).toMatchObject({ order: ['main'] })
    await studio.send('POST', 'api/undo')

    await studio.send('POST', 'api/undo')
    expect(readFileSync(path.join(theme, 'config/settings_data.json'), 'utf8')).toBe(settingsWritten)
    expect(readFileSync(path.join(theme, home), 'utf8')).toBe(homeBefore)
    for (let step = 0; step < 4; step++) await studio.send('POST', 'api/undo')
    expect(readFileSync(path.join(theme, 'config/settings_data.json'), 'utf8')).toBe(settingsBefore)
    expect(existsSync(path.join(theme, 'listings/quiet/templates/index.json'))).toBe(false)
    // Each write and undo runs Theme Check.
  }, 60_000)

  it('leaves the Direction just written for check-direction to check its contrast, without switching to it (SKILL.md step 4.3.2)', async () => {
    const theme = fixtureTheme()
    const studio = await openStudio(theme)
    const contrast = () => checkDirection(theme).filter(({ check }) => check === 'contrast')
    await studio.setBrand({ colorSchemes: { 'scheme-1': { background: '#FFFFFF', text: '#999999' } } })
    await studio.send('PUT', 'api/directions/Quiet', { template: heroHome })
    expect(contrast().map(({ message }) => message)).toContain('scheme-1: text on background is 2.8:1, needs 4.5:1.')

    await studio.setBrand({ colorSchemes: { 'scheme-1': { background: '#FFFFFF', text: '#222222' } } })
    await studio.send('PUT', 'api/directions/Loud', { template: heroHome })
    expect(contrast().filter(({ message }) => message.startsWith('scheme-1: text'))).toEqual([])
  })

  it.each([
    ['a name of three words', 'Very Quiet Press', { template: heroHome }],
    ['a name of 30 characters', 'A'.repeat(30), { template: heroHome }],
    ['a name with punctuation', 'Quiet!', { template: heroHome }],
    ['no template', 'Quiet', { settings: {} }],
    ['a template without sections', 'Quiet', { template: { sections: {}, order: [] } }],
    ['an order missing a section', 'Quiet', { template: { ...heroHome, order: [] } }],
    ['a section neither the Theme nor the catalog has', 'Quiet', { template: { sections: { a: { type: 'nope' } }, order: ['a'] } }],
    ['a section id starting with _, which Shopify rejects', 'Quiet', { template: { sections: { _hero: heroHome.sections.hero }, order: ['_hero'] } }],
    ['a block id starting with _, which Shopify rejects', 'Quiet', { template: { sections: { hero: { type: 'hero', blocks: { _note: { type: 'note' } }, block_order: ['_note'] } }, order: ['hero'] } }],
    ['a setting that is not a style setting', 'Quiet', { settings: { cart_type: 'page' }, template: heroHome }],
    ['a style value off its options', 'Quiet', { settings: { shape_family: 'blob' }, template: heroHome }],
    ['an unknown field', 'Quiet', { template: heroHome, thesis: 'Calm' }],
  ])('rejects %s and writes nothing', async (_, name, direction) => {
    const theme = fixtureTheme()
    const before = readFileSync(path.join(theme, 'config/settings_data.json'), 'utf8')
    const { status, body } = await (await openStudio(theme)).send('PUT', `api/directions/${encodeURIComponent(name)}`, direction)
    // A missing section is a 404, as when adding one to a page.
    expect([400, 404]).toContain(status)
    expect(body.error).toEqual(expect.any(String))
    expect(readFileSync(path.join(theme, 'config/settings_data.json'), 'utf8')).toBe(before)
    expect(existsSync(path.join(theme, 'listings'))).toBe(false)
    expect(existsSync(path.join(theme, 'sections/hero.liquid'))).toBe(false)
  })

  it("takes images from the shop's Files in its home template's sections and blocks, and refuses other image values", async () => {
    const theme = fixtureTheme()
    const studio = await openStudio(theme, { catalog: path.join(projectDir, 'skills/shopify-theme-builder/catalog') })
    const home = (image: unknown, tile: unknown) => ({
      sections: {
        hero: { type: 'hero', settings: { image } },
        gallery: { type: 'image-gallery', blocks: { tile: { type: 'image', settings: { image: tile } } }, block_order: ['tile'] },
      },
      order: ['hero', 'gallery'],
    })
    const placed = home('shopify://shop_images/cover.jpg', 'shopify://shop_images/tile.png')
    expect((await studio.send('PUT', 'api/directions/Quiet', { template: placed })).status).toBe(200)
    expect(readTemplate(theme, 'listings/quiet/templates/index.json')).toEqual(placed)

    const before = readFileSync(path.join(theme, 'listings/quiet/templates/index.json'), 'utf8')
    for (const template of [home('https://cdn.shopify.com/cover.jpg', ''), home('', '/Users/me/tile.png')]) {
      const { status, body } = await studio.send('PUT', 'api/directions/Quiet', { template })
      expect(status).toBe(400)
      expect(body.error).toContain('shopify://shop_images/')
    }
    expect(readFileSync(path.join(theme, 'listings/quiet/templates/index.json'), 'utf8')).toBe(before)
  })

  it('holds at most three Directions, refuses a name whose folder another has, and switches only to one it has', async () => {
    const theme = fixtureTheme()
    const studio = await openStudio(theme)
    for (const name of ['One', 'Two', 'Three']) expect((await studio.send('PUT', `api/directions/${name}`, { template: heroHome })).status).toBe(200)
    const fourth = await studio.send('PUT', 'api/directions/Four', { template: heroHome })
    expect(fourth.status).toBe(400)
    expect(fourth.body.error).toContain('at most 3 Directions: One, Two, Three')
    expect((await studio.send('PUT', 'api/directions/Two', { template: heroHome })).status).toBe(200)
    expect((await studio.send('PUT', 'api/directions/two', { template: heroHome })).body.error).toContain('Direction Two already')
    const unknown = await studio.send('PUT', 'api/directions/current', { name: 'Four' })
    expect(unknown.status).toBe(400)
    expect(unknown.body.error).toContain('One, Two, Three')
    expect(readSettingsData(theme).current).not.toEqual(expect.any(String))
  }, 30_000)

  const contract = [
    '# Directions',
    '',
    '## Quiet',
    '',
    'A calm shop that lets',
    'the olive oil speak.',
    '',
    '- Serif headings, tight tracking',
    '- Square shapes',
    '',
    '### Rules',
    '',
    '- Do: leave space. Don\'t: fill it.',
    '',
    '## Loud',
    '',
    'Big type, bold color.',
    '',
  ].join('\n')

  it("lists the Theme's Directions with the thesis and key choices DIRECTION.md gives them, and the one in the preview", async () => {
    const theme = fixtureTheme()
    const studio = await openStudio(theme)
    expect((await studio.readTheme()).directions).toEqual([])
    await studio.send('PUT', 'api/directions/Quiet', { template: heroHome })
    await studio.send('PUT', 'api/directions/Loud', { template: heroHome })
    await studio.send('PUT', 'api/directions/Plain', { template: heroHome })
    writeFileSync(path.join(theme, 'DIRECTION.md'), contract)
    const { body } = await studio.send('PUT', 'api/directions/current', { name: 'Loud' })
    expect(body.directions).toEqual([
      { name: 'Quiet', thesis: 'A calm shop that lets the olive oil speak.', choices: ['Serif headings, tight tracking', 'Square shapes'], showing: false, chosen: false },
      { name: 'Loud', thesis: 'Big type, bold color.', choices: [], showing: true, chosen: false },
      // A Direction DIRECTION.md doesn't describe shows by name.
      { name: 'Plain', thesis: '', choices: [], showing: false, chosen: false },
    ])
    expect(errors(body.validation)).toEqual([])
  }, 30_000)

  it('chooses a Direction: the preview shows it and DIRECTION.md names it, in one undo step', async () => {
    const theme = fixtureTheme()
    const studio = await openStudio(theme)
    await studio.send('PUT', 'api/directions/Quiet', { settings: { shape_family: 'square' }, template: heroHome })
    await studio.send('PUT', 'api/directions/Loud', { template: heroHome })
    writeFileSync(path.join(theme, 'DIRECTION.md'), contract)

    const { status, body } = await studio.send('PUT', 'api/directions/chosen', { name: 'Quiet' })
    expect(status).toBe(200)
    expect(readSettingsData(theme).current).toBe('Quiet')
    expect(readFileSync(path.join(theme, 'DIRECTION.md'), 'utf8')).toBe(contract.replace('# Directions\n\n', '# Directions\n\nChosen: Quiet\n\n'))
    expect(body.directions.map(({ name, showing, chosen }: { name: string; showing: boolean; chosen: boolean }) => ({ name, showing, chosen }))).toEqual([
      { name: 'Quiet', showing: true, chosen: true },
      { name: 'Loud', showing: false, chosen: false },
    ])
    expect(errors(body.validation)).toEqual([])

    // Tuned after choosing, it stays chosen; choosing another replaces the mark.
    expect((await studio.setStyle({ shape_family: 'round' })).body.directions[0]).toMatchObject({ showing: false, chosen: true })
    await studio.send('PUT', 'api/directions/chosen', { name: 'Loud' })
    expect(readFileSync(path.join(theme, 'DIRECTION.md'), 'utf8')).toContain('Chosen: Loud\n\n## Quiet')
    await studio.send('POST', 'api/undo')
    expect(readFileSync(path.join(theme, 'DIRECTION.md'), 'utf8')).toContain('Chosen: Quiet\n')
    expect(readSettingsData(theme).current).toMatchObject({ shape_family: 'round' })
  }, 30_000)

  it("keeps the chosen Direction's listing identical to the home page through every home edit, in the same undo step", async () => {
    const theme = fixtureTheme()
    const studio = await openStudio(theme)
    await studio.send('PUT', 'api/directions/Quiet', { template: heroHome })
    await studio.send('PUT', 'api/directions/Loud', { template: heroHome })
    const listing = path.join(theme, 'listings/quiet/templates/index.json')
    const read = (file: string) => readFileSync(file, 'utf8')
    const inSync = () => expect(read(listing)).toBe(read(path.join(theme, home)))

    // Before the choice, a home edit leaves the listings alone.
    await studio.send('PUT', 'api/directions/current', { name: 'Quiet' })
    await studio.setColorScheme('hero', 'scheme-1')
    expect(readTemplate(theme, 'listings/quiet/templates/index.json')).toEqual(heroHome)

    await studio.send('PUT', 'api/directions/chosen', { name: 'Quiet' })
    inSync()
    const chosen = read(listing)
    await studio.setColorScheme('hero', 'scheme-2')
    inSync()
    expect(readTemplate(theme, 'listings/quiet/templates/index.json').sections.hero.settings.color_scheme).toBe('scheme-2')
    const { body: added } = await studio.addSection('hello-world')
    inSync()
    const id = added.home.at(-1).id
    await studio.reorderSections([id, 'hero'])
    inSync()
    // Tuned after the choice, the preview still shows its home.
    await studio.setStyle({ shape_family: 'round' })
    await studio.removeSection(id)
    inSync()

    // Undo reverts both files in each step.
    await studio.send('POST', 'api/undo')
    await studio.send('POST', 'api/undo')
    inSync()
    await studio.send('POST', 'api/undo')
    await studio.send('POST', 'api/undo')
    inSync()
    await studio.send('POST', 'api/undo')
    expect(read(listing)).toBe(chosen)
    inSync()

    // With another Direction in the preview, its home isn't the chosen one's.
    await studio.send('PUT', 'api/directions/current', { name: 'Loud' })
    await studio.setColorScheme('hero', 'scheme-1')
    expect(read(listing)).toBe(chosen)
    expect(readTemplate(theme, 'listings/loud/templates/index.json')).toEqual(heroHome)
  }, 60_000)

  it('writes DIRECTION.md when the Theme has none, and chooses only a Direction it has', async () => {
    const theme = fixtureTheme()
    const studio = await openStudio(theme)
    await studio.send('PUT', 'api/directions/Quiet', { template: heroHome })
    const unknown = await studio.send('PUT', 'api/directions/chosen', { name: 'Loud' })
    expect(unknown.status).toBe(400)
    expect(unknown.body.error).toContain('Quiet')
    expect(existsSync(path.join(theme, 'DIRECTION.md'))).toBe(false)
    await studio.send('PUT', 'api/directions/chosen', { name: 'Quiet' })
    expect(readFileSync(path.join(theme, 'DIRECTION.md'), 'utf8')).toBe('Chosen: Quiet\n')
  }, 30_000)

  it("reads a DIRECTION.md written from the skill's template: the card's thesis and choices, never its sketch or rules", async () => {
    const template = readFileSync(path.join(projectDir, 'skills/shopify-theme-builder/references/design/direction-template.md'), 'utf8')
    const theme = fixtureTheme()
    const studio = await openStudio(theme)
    await studio.send('PUT', 'api/directions/Quiet', { template: heroHome })
    writeFileSync(path.join(theme, 'DIRECTION.md'), template.replaceAll('<Direction name>', 'Quiet'))

    const { body } = await studio.send('PUT', 'api/directions/chosen', { name: 'Quiet' })
    const [quiet] = body.directions
    expect(quiet).toMatchObject({ name: 'Quiet', chosen: true })
    expect(quiet.thesis).toMatch(/^<Thesis/)
    // One line per axis of the card, in its order.
    expect(quiet.choices.map((choice: string) => choice.split(':')[0])).toEqual(['Type', 'Color', 'Shape', 'Spacing', 'Cards', 'Media', 'Motion', 'Signature', 'Rejects'])
    expect(readFileSync(path.join(theme, 'DIRECTION.md'), 'utf8')).toMatch(/^# .+\n\nChosen: Quiet\n\n/)
  }, 30_000)

  describe('wait-for-choice command (SKILL.md step 4.4)', () => {
    /** Runs the waiter without blocking, so the Studio in this process keeps answering it. */
    function waitForChoice(...args: string[]) {
      const child = spawn('node', [path.join(projectDir, 'skills/shopify-theme-builder/studio/bin/wait-for-choice.mjs'), ...args])
      cleanup.push(() => void child.kill())
      let stdout = ''
      let stderr = ''
      child.stdout.on('data', (chunk) => (stdout += chunk))
      child.stderr.on('data', (chunk) => (stderr += chunk))
      return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) =>
        child.on('close', (code) => resolve({ code, stdout, stderr })),
      )
    }

    it('exits with the Direction the Creator chooses', async () => {
      const studio = await openStudio(fixtureTheme())
      await studio.send('PUT', 'api/directions/Quiet', { template: heroHome })
      await studio.send('PUT', 'api/directions/Loud', { template: heroHome })
      const waiting = waitForChoice('--port', new URL(studio.url).port)
      await new Promise((resolve) => setTimeout(resolve, 2500))
      await studio.send('PUT', 'api/directions/chosen', { name: 'Loud' })
      const { code, stdout } = await waiting
      expect(code).toBe(0)
      expect(stdout.trim()).toBe('Loud')
    }, 30_000)

    it('gives up with a message after its timeout', async () => {
      const studio = await openStudio(fixtureTheme())
      const { code, stdout, stderr } = await waitForChoice('--port', new URL(studio.url).port, '--timeout', '1')
      expect(code).toBe(1)
      expect(stdout).toBe('')
      expect(stderr).toContain('No Direction chosen after 1 seconds')
    }, 30_000)

    it('stops with a message when the Studio stops', async () => {
      const studio = await openStudio(fixtureTheme())
      const waiting = waitForChoice('--port', new URL(studio.url).port)
      await new Promise((resolve) => setTimeout(resolve, 500))
      await studio.close()
      const { code, stderr } = await waiting
      expect(code).toBe(1)
      expect(stderr).toContain(`No Studio answers on port ${new URL(studio.url).port}`)
    }, 30_000)
  })

  it('names only reference files the skill has', () => {
    const skillDir = path.join(projectDir, 'skills/shopify-theme-builder')
    const named = readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8').match(/references\/[\w/.-]+\.md/g) ?? []
    expect(named).toContain('references/design/brief.md')
    for (const file of named) expect(existsSync(path.join(skillDir, file)), file).toBe(true)
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
    const dir = fixtureTheme()
    rmSync(path.join(dir, home))
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
    expect(body.settings).toEqual([
      { id: 'heading', type: 'inline_richtext', label: 'Heading', value: 'What our customers say' },
      {
        id: 'layout',
        type: 'select',
        label: 'Layout',
        value: 'grid',
        options: [
          { value: 'grid', label: 'Grid' },
          { value: 'large_quote', label: 'Large quote' },
          { value: 'carousel', label: 'Carousel' },
          { value: 'portraits', label: 'With portraits' },
        ],
      },
    ])
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
      media: [{ id: 'image', type: 'image_picker', label: 'Image', set: false, value: null }],
    })
  })

  /** Writes a schema locale that is the Base Theme's English one with an Italian Testimonials name and Heading label. */
  function writeItalianSchema(theme: string, name: string) {
    const schema = parseJSON(readFileSync(path.join(theme, 'locales/en.default.schema.json'), 'utf8'))
    const italian = { ...schema, general: { ...schema.general, testimonials: 'Testimonianze' }, labels: { ...schema.labels, heading: 'Titolo' } }
    writeFileSync(path.join(theme, `locales/${name}`), JSON.stringify(italian, null, 2))
  }

  it("shows labels in the shop's default language, not in an added one", async () => {
    const { theme, studio, id } = await withTestimonials()
    writeItalianSchema(theme, 'it.schema.json')
    const { body } = await studio.send('GET', `api/home/sections/${id}`)
    expect(body.name).toBe('Testimonials')
    expect(body.settings[0].label).toBe('Heading')
  })

  it('shows labels in Italian when Italian is the default language', async () => {
    const { theme, studio, id } = await withTestimonials()
    writeItalianSchema(theme, 'it.default.schema.json')
    renameSync(path.join(theme, 'locales/en.default.schema.json'), path.join(theme, 'locales/en.schema.json'))
    const { body } = await studio.send('GET', `api/home/sections/${id}`)
    expect(body.name).toBe('Testimonianze')
    expect(body.settings[0].label).toBe('Titolo')
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

  it("lists a section's and its blocks' image and video settings with their values", async () => {
    const theme = fixtureTheme()
    const studio = await openStudio(theme, { catalog: realCatalog })
    const hero = (await studio.addSection('hero')).body.home.at(-1).id
    const gallery = (await studio.addSection('image-gallery')).body.home.at(-1).id
    // What the Theme Editor writes once the Merchant picks an image.
    const template = readTemplate(theme)
    template.sections[hero].settings.image = 'shopify://shop_images/cover.jpg'
    writeTemplate(theme, template)

    const read = (await studio.send('GET', `api/home/sections/${hero}`)).body
    expect(read.media).toEqual([
      { id: 'image', type: 'image_picker', label: 'Image', set: true, value: 'shopify://shop_images/cover.jpg' },
      { id: 'video', type: 'video', label: 'Video', set: false, value: null },
    ])
    expect(read.settings.map((setting: { id: string }) => setting.id)).not.toContain('image')
    const { blocks } = (await studio.send('GET', `api/home/sections/${gallery}`)).body
    expect(blocks[0].media).toEqual([{ id: 'image', type: 'image_picker', label: 'Image', set: false, value: null }])
  })

  it("writes and clears a section's and a block's image in one undo step each", async () => {
    const theme = fixtureTheme()
    const studio = await openStudio(theme, { catalog: realCatalog })
    const hero = (await studio.addSection('hero')).body.home.at(-1).id
    const gallery = (await studio.addSection('image-gallery')).body.home.at(-1).id
    const block = readTemplate(theme).sections[gallery].block_order[0]

    const placed = await studio.send('PATCH', `api/home/sections/${hero}`, { settings: { image: 'shopify://shop_images/cover.jpg' } })
    expect(placed.status).toBe(200)
    expect(readTemplate(theme).sections[hero].settings.image).toBe('shopify://shop_images/cover.jpg')
    const { body } = await studio.send('GET', `api/home/sections/${hero}`)
    expect(body.media[0]).toMatchObject({ id: 'image', set: true, value: 'shopify://shop_images/cover.jpg' })

    await studio.send('PATCH', `api/home/sections/${gallery}`, { blocks: { [block]: { image: 'shopify://shop_images/tile_1.webp' } } })
    expect(readTemplate(theme).sections[gallery].blocks[block].settings.image).toBe('shopify://shop_images/tile_1.webp')
    await studio.send('POST', 'api/undo')
    expect(readTemplate(theme).sections[gallery].blocks[block].settings).not.toHaveProperty('image')
    expect(readTemplate(theme).sections[hero].settings.image).toBe('shopify://shop_images/cover.jpg')

    expect((await studio.send('PATCH', `api/home/sections/${hero}`, { settings: { image: '' } })).status).toBe(200)
    expect(readTemplate(theme).sections[hero].settings).not.toHaveProperty('image')
    await studio.send('PATCH', `api/home/sections/${hero}`, { settings: { image: 'shopify://shop_images/cover.jpg' } })
    expect((await studio.send('PATCH', `api/home/sections/${hero}`, { settings: { image: null } })).status).toBe(200)
    expect(readTemplate(theme).sections[hero].settings).not.toHaveProperty('image')
   }, 30_000)

  it.each([
    ['a web link', { settings: { image: 'https://cdn.shopify.com/cover.jpg' } }],
    ['a local path', { settings: { image: '/Users/me/cover.jpg' } }],
    ['another shopify:// link', { settings: { image: 'shopify://files/videos/cover.mp4' } }],
    ['a shop image in a folder', { settings: { image: 'shopify://shop_images/a/cover.jpg' } }],
    ['a number', { settings: { image: 3 } }],
    ['a video', { settings: { video: 'shopify://shop_images/cover.jpg' } }],
  ])('refuses %s as an image and writes nothing', async (_, change) => {
    const theme = fixtureTheme()
    const studio = await openStudio(theme, { catalog: realCatalog })
    const hero = (await studio.addSection('hero')).body.home.at(-1).id
    const before = readFileSync(path.join(theme, home), 'utf8')
    const { status, body } = await studio.send('PATCH', `api/home/sections/${hero}`, change)
    expect(status).toBe(400)
    expect(body.error).toMatch(/image|video/)
    expect(readFileSync(path.join(theme, home), 'utf8')).toBe(before)
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
        collections: {
          nodes: [
            { handle: 'frontpage', title: 'Home page', productsCount: { count: 0 } },
            { handle: 'summer-sale', title: 'Summer sale', productsCount: { count: 8 } },
          ],
        },
        products: { nodes: [{ handle: 'mug', title: 'Mug' }] },
        menus: { nodes: [{ handle: 'main-menu', title: 'Main menu' }] },
      },
    })
    const studio = await openStudio(fixtureTheme(), { cli })
    const { status, body } = await studio.send('GET', 'api/store')
    expect(status).toBe(200)
    expect(body).toEqual({
      collections: [
        { handle: 'frontpage', title: 'Home page', products: 0 },
        { handle: 'summer-sale', title: 'Summer sale', products: 8 },
      ],
      products: [{ handle: 'mug', title: 'Mug' }],
      menus: [{ handle: 'main-menu', title: 'Main menu' }],
    })
    const [args]: string[][] = JSON.parse(readFileSync(path.join(path.dirname(cli), 'store.json'), 'utf8'))
    expect(args.slice(0, 4)).toEqual(['store', 'execute', '--store', 'example.myshopify.com'])
    expect(args).toContain('--json')
    expect(args).not.toContain('--allow-mutations')
    expect(args[args.indexOf('--query') + 1]).toContain('productsCount { count }')
  })

  it('tells how to authenticate the store when the CLI has no stored auth for it', async () => {
    const studio = await openStudio(fixtureTheme())
    const { status, body } = await studio.send('GET', 'api/store')
    expect(status).toBe(409)
    expect(body.error).toContain('shopify store auth --store example.myshopify.com --scopes read_products,read_online_store_navigation,read_online_store_pages,write_files,write_online_store_navigation,write_locales`')
  })
})

describe("Studio API: images in the shop's Files", () => {
  /** A stand-in for Shopify's staged upload target: it keeps each multipart form posted to it. */
  async function uploadTarget() {
    const forms: FormData[] = []
    const server = createHttpServer(async (req, res) => {
      const chunks: Buffer[] = []
      for await (const chunk of req) chunks.push(chunk)
      forms.push(await new Response(Buffer.concat(chunks), { headers: { 'Content-Type': req.headers['content-type'] ?? '' } }).formData())
      res.statusCode = 201
      res.end()
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    cleanup.push(() => new Promise((resolve) => server.close(() => resolve())))
    return { url: `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}/upload`, forms }
  }

  const resourceUrl = 'https://shopify-staged-uploads.storage.googleapis.com/tmp/1/hero.png'
  const staged = (url: string) => ({
    stagedUploadsCreate: {
      stagedTargets: [{ url, resourceUrl, parameters: [{ name: 'key', value: 'tmp/1/hero.png' }, { name: 'policy', value: 'signed' }] }],
      userErrors: [],
    },
  })
  const created = { fileCreate: { files: [{ id: 'gid://shopify/MediaImage/7', fileStatus: 'UPLOADED' }], userErrors: [] } }
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])

  function localImage(name = 'hero.png', bytes: Uint8Array = png) {
    const file = path.join(tempDir('image-'), name)
    writeFileSync(file, bytes)
    return file
  }

  function storeCalls(cli: string): string[][] {
    const log = path.join(path.dirname(cli), 'store.json')
    return existsSync(log) ? JSON.parse(readFileSync(log, 'utf8')) : []
  }

  const variables = (args: string[]) => JSON.parse(args[args.indexOf('--variables') + 1])

  it("puts a local image into the shop's Files and answers the value an image_picker setting takes", async () => {
    const target = await uploadTarget()
    const cdn = 'https://cdn.shopify.com/s/files/1/0001/files/hero_4f2a.png?v=1727180000'
    const cli = fakeShopify({
      store: [
        staged(target.url),
        created,
        { node: { fileStatus: 'PROCESSING', fileErrors: [], image: null } },
        { node: { fileStatus: 'READY', fileErrors: [], image: { url: cdn } } },
      ],
    })
    const studio = await openStudio(fixtureTheme(), { cli })
    const { status, body } = await studio.send('POST', 'api/files', { path: localImage() })
    expect(status).toBe(200)
    expect(body).toEqual({ image: 'shopify://shop_images/hero_4f2a.png', url: cdn })

    expect(target.forms).toHaveLength(1)
    const [form] = target.forms
    expect(form.get('key')).toBe('tmp/1/hero.png')
    expect(form.get('policy')).toBe('signed')
    expect(new Uint8Array(await (form.get('file') as File).arrayBuffer())).toEqual(png)

    const [stage, create, ...polls] = storeCalls(cli)
    for (const args of [stage, create, ...polls]) expect(args.slice(0, 4)).toEqual(['store', 'execute', '--store', 'example.myshopify.com'])
    expect(stage).toContain('--allow-mutations')
    expect(variables(stage)).toEqual({
      input: [{ resource: 'IMAGE', filename: 'hero.png', mimeType: 'image/png', fileSize: String(png.length), httpMethod: 'POST' }],
    })
    expect(create).toContain('--allow-mutations')
    expect(variables(create)).toEqual({ files: [{ originalSource: resourceUrl, contentType: 'IMAGE' }] })
    expect(polls).toHaveLength(2)
    for (const args of polls) {
      expect(args).not.toContain('--allow-mutations')
      expect(variables(args)).toEqual({ id: 'gid://shopify/MediaImage/7' })
    }
  })

  it.each([
    ['a type Shopify images are not', () => ({ path: localImage('hero.svg') }), 'jpg'],
    ['a file over 20 MB', () => ({ path: localImage('hero.png', new Uint8Array(20 * 1024 * 1024 + 1)) }), '20 MB'],
    ['a missing file', () => ({ path: path.join(tempDir('image-'), 'gone.png') }), 'gone.png'],
    ['a relative path', () => ({ path: 'hero.png' }), 'absolute'],
    ['no path', () => ({}), 'absolute'],
  ])('refuses %s with a 400, without calling the store', async (_, body, named) => {
    const cli = fakeShopify({ store: {} })
    const studio = await openStudio(fixtureTheme(), { cli })
    const answer = await studio.send('POST', 'api/files', body())
    expect(answer.status).toBe(400)
    expect(answer.body.error).toContain(named)
    expect(storeCalls(cli)).toEqual([])
  })

  it("quotes only the CLI's error, without its escape codes or the lines before it", async () => {
    const cli = fakeShopify({
      storeError:
        '\x1b[2K\x1b[1A\x1b[2K\x1b[G  value="shopify-ai-toolkit@claude-plugins-official" />\n' +
        'Loading stored store auth...\n' +
        '\x1b[31m╭─ error ──────────────────────────────╮\x1b[39m\n' +
        '│                                      │\n' +
        '│  No stored app authentication found  │\n' +
        '│  for example.myshopify.com.          │\n' +
        '╰──────────────────────────────────────╯\n',
    })
    const studio = await openStudio(fixtureTheme(), { cli })
    const { status, body } = await studio.send('POST', 'api/files', { path: localImage() })
    expect(status).toBe(409)
    expect(body.error).toMatch(/The CLI said: error No stored app authentication found for example\.myshopify\.com\.$/)
  })

  it('tells the command that grants write_files when the CLI has no stored auth or scope for it', async () => {
    const studio = await openStudio(fixtureTheme())
    const { status, body } = await studio.send('POST', 'api/files', { path: localImage() })
    expect(status).toBe(409)
    expect(body.error).toContain('`shopify store auth --store example.myshopify.com --scopes read_products,read_online_store_navigation,read_online_store_pages,write_files,write_online_store_navigation,write_locales`')
  })

  it("answers Shopify's error when it can't process the image", async () => {
    const target = await uploadTarget()
    const cli = fakeShopify({
      store: [staged(target.url), created, { node: { fileStatus: 'FAILED', fileErrors: [{ message: 'Image is corrupt.' }], image: null } }],
    })
    const studio = await openStudio(fixtureTheme(), { cli })
    const { status, body } = await studio.send('POST', 'api/files', { path: localImage() })
    expect(status).toBe(502)
    expect(body.error).toContain('Image is corrupt.')
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

describe('Studio API: add a section by preset', () => {
  const realCatalog = path.join(projectDir, 'skills/shopify-theme-builder/catalog')

  it("lists each catalog section's presets under the page's catalog, named in the Theme's language", async () => {
    const { catalog } = await (await openStudio(fixtureTheme(), { catalog: realCatalog })).readTheme()
    const hero = catalog.home.find((section: { type: string }) => section.type === 'hero')
    expect(hero.presets.map((preset: { name: string }) => preset.name)).toEqual([
      'Hero',
      'Hero: full screen',
      'Hero: split',
      'Hero: text on image',
      'Hero: small banner',
    ])
    expect(hero.presets[2]).toEqual({ name: 'Hero: split', key: 't:general.hero_split', settings: { height: 'medium', content_style: 'split' }, blocks: [] })
    const slideshow = catalog.home.find((section: { type: string }) => section.type === 'slideshow')
    expect(slideshow.presets[0].blocks).toEqual([{ type: 'slide' }, { type: 'slide' }])
    expect(catalog.product.map((section: { type: string }) => section.type)).toContain('main-product')
    expect(catalog.home.map((section: { type: string }) => section.type)).not.toContain('main-product')
  })

  it("lists the presets of the Theme's own copy of a section, which the Studio adds", async () => {
    const theme = fixtureTheme()
    writeFileSync(
      path.join(theme, 'sections/hero.liquid'),
      '<div></div>\n{% schema %}{"name": "Hero", "presets": [{"name": "Hero: own"}]}{% endschema %}\n',
    )
    const { catalog } = await (await openStudio(theme)).readTheme()
    expect(catalog.home).toEqual([{ type: 'hero', presets: [{ name: 'Hero: own', key: 'Hero: own', settings: {}, blocks: [] }] }])
  })

  it("adds a section with the named preset's settings and blocks, by its name or its key", async () => {
    const theme = fixtureTheme()
    const studio = await openStudio(theme, { catalog: realCatalog })
    const hero = await studio.send('POST', 'api/home/sections', { type: 'hero', preset: 'Hero: split' })
    expect(hero.status).toBe(200)
    // By its key, as the schema writes its name.
    const slideshow = await studio.send('POST', 'api/home/sections', { type: 'slideshow', preset: 't:general.slideshow_split' })
    expect(slideshow.status).toBe(200)
    const template = readTemplate(theme)
    const [heroId, slideshowId] = template.order.slice(1)
    expect(template.sections[heroId]).toEqual({ type: 'hero', settings: { height: 'medium', content_style: 'split' } })
    const slides = template.sections[slideshowId]
    expect(slides.settings).toEqual({ height: 'medium' })
    expect(slides.block_order.map((id: string) => slides.blocks[id])).toEqual([
      { type: 'slide', settings: { content_style: 'split' } },
      { type: 'slide', settings: { content_style: 'split' } },
    ])
    expect(errors(slideshow.body.validation)).toEqual([])
  })

  it.each([
    ['a preset the section lacks', 'Hero: upside down'],
    ['a preset that is not a string', 3],
  ])('refuses %s, naming the presets, and writes nothing', async (_, preset) => {
    const theme = fixtureTheme()
    const before = readFileSync(path.join(theme, home), 'utf8')
    const { status, body } = await (await openStudio(theme, { catalog: realCatalog })).send('POST', 'api/home/sections', { type: 'hero', preset })
    expect(status).toBe(400)
    expect(body.error).toContain('Hero: split')
    expect(readFileSync(path.join(theme, home), 'utf8')).toBe(before)
    expect(existsSync(path.join(theme, 'sections/hero.liquid'))).toBe(false)
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

  it('gives a block of a private type an id without its leading underscore, which Shopify rejects', async () => {
    const theme = fixtureTheme()
    writeFileSync(
      path.join(theme, 'sections/notes.liquid'),
      '<div></div>\n{% schema %}{"name": "Notes", "blocks": [{ "type": "_note", "name": "Note" }], "presets": [{ "name": "Notes" }]}{% endschema %}\n',
    )
    const studio = await openStudio(theme)
    const id = (await studio.addSection('notes')).body.home.at(-1).id
    expect((await studio.send('POST', `api/home/sections/${id}/blocks`, { type: '_note' })).status).toBe(200)
    const [block] = readTemplate(theme).sections[id].block_order
    expect(block).toMatch(/^note_[0-9a-f]{6}$/)
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
    expect(ids).toContain('page_width')
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
    expect(catalogTypes(await studio.readTheme()).home).toEqual(['hero'])
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
    const types = ['hero', 'featured-collection', 'featured-product', 'collection-list', 'slideshow', 'multicolumn', 'video', 'blog-posts', 'image-gallery', 'image-with-text', 'editorial-split', 'rich-text', 'type-banner', 'marquee', 'spec-tiles', 'lookbook', 'timeline', 'process-steps', 'comparison-table', 'press-quotes', 'logo-list', 'testimonials', 'faq', 'newsletter', 'custom-liquid']
    expect(catalogTypes(await studio.readTheme()).home).toEqual(types.toSorted())
    // A template holds at most 25 sections, so the catalog goes onto two home pages.
    const halves = [types.slice(0, 12), types.slice(12)]
    for (const [index, half] of halves.entries()) {
      const target = index === 0 ? studio : await openStudio(fixtureTheme(), { catalog: path.join(projectDir, 'skills/shopify-theme-builder/catalog') })
      let body
      for (const type of half) ({ body } = await target.addSection(type))
      expect(body.home.slice(1)).toEqual(half.map((type) => expect.objectContaining({ type, colorScheme: 'scheme-1' })))
      expect(errors(body.validation)).toEqual([])
    }
    // 25 writes, each validated by Theme Check: close to 20 seconds on CI.
  }, 60_000)

  it('never offers the real catalog header or footer for the home page', async () => {
    const theme = fixtureTheme()
    cpSync(path.join(projectDir, 'skills/shopify-theme-builder/catalog'), theme, { recursive: true })
    const studio = await openStudio(theme, { catalog: path.join(projectDir, 'skills/shopify-theme-builder/catalog') })
    const catalog = catalogTypes(await studio.readTheme())
    for (const page of ['home', 'product', 'collection']) {
      expect(catalog[page]).toContain('hero')
      expect(catalog[page]).not.toContain('header')
      expect(catalog[page]).not.toContain('footer')
      expect(catalog[page]).not.toContain('main-cart')
      expect(catalog[page]).not.toContain('main-search')
      expect(catalog[page]).not.toContain('main-blog')
      expect(catalog[page]).not.toContain('main-article')
      expect(catalog[page]).not.toContain('main-404')
      expect(catalog[page]).not.toContain('main-list-collections')
      expect(catalog[page]).not.toContain('predictive-search')
      expect(catalog[page]).not.toContain('quick-add')
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
    expect(catalogTypes(await studio.readTheme())).toEqual(everyPage(['hero'], { product: ['gallery', 'hero'] }))
    const before = readFileSync(path.join(theme, home), 'utf8')
    expect((await studio.addSection('gallery')).status).toBe(400)
    expect(readFileSync(path.join(theme, home), 'utf8')).toBe(before)
    expect((await studio.addSection('gallery', 'product')).status).toBe(200)
  })

  it('composes a product page from the real catalog\'s main product and related products with a clean Theme Check', async () => {
    const theme = fixtureTheme()
    const studio = await openStudio(theme, { catalog: path.join(projectDir, 'skills/shopify-theme-builder/catalog') })
    const catalog = catalogTypes(await studio.readTheme())
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

  it("gives the main product's private blocks ids without a leading underscore, which Shopify rejects", async () => {
    const theme = fixtureTheme()
    const studio = await openStudio(theme, { catalog: path.join(projectDir, 'skills/shopify-theme-builder/catalog') })
    const { body } = await studio.addSection('main-product', 'product')
    const id = body.product.find((section: { type: string }) => section.type === 'main-product').id
    const { blocks, block_order } = readTemplate(theme, 'templates/product.json').sections[id]
    expect(blocks[block_order[0]].type).toBe('_product-title')
    expect(block_order[0]).toMatch(/^product-title_[0-9a-f]{6}$/)
    for (const block of block_order) expect(block).not.toMatch(/^_/)
  })

  it("reads and writes the settings of the main product's theme blocks, from their blocks/ schema, in one undo step", async () => {
    const theme = fixtureTheme()
    const studio = await openStudio(theme, { catalog: path.join(projectDir, 'skills/shopify-theme-builder/catalog') })
    const { body: added } = await studio.addSection('main-product', 'product')
    const id = added.product.find((section: { type: string }) => section.type === 'main-product').id
    const read = async () => (await studio.send('GET', `api/product/sections/${id}`)).body
    const details = (await read()).blocks.find((block: { type: string }) => block.type === 'collapsible-content')
    expect(details).toMatchObject({
      name: 'Collapsible content',
      settings: [
        { id: 'heading', type: 'text', label: 'Heading', value: 'Description' },
        { id: 'source', type: 'select', value: 'description' },
        { id: 'text', type: 'richtext', value: '' },
      ],
    })

    const { status, body } = await studio.send('PATCH', `api/product/sections/${id}`, {
      blocks: { [details.id]: { heading: 'Descrizione', text: '<p>Fatta a mano.</p>' } },
    })
    expect(status).toBe(200)
    expect(errors(body.validation)).toEqual([])
    expect(readTemplate(theme, 'templates/product.json').sections[id].blocks[details.id].settings).toMatchObject({ heading: 'Descrizione', text: '<p>Fatta a mano.</p>' })
    const bad = await studio.send('PATCH', `api/product/sections/${id}`, { blocks: { [details.id]: { text: 'Not paragraphs' } } })
    expect(bad.status).toBe(400)

    await studio.send('POST', 'api/undo')
    expect((await read()).blocks.find((block: { id: string }) => block.id === details.id).settings[0].value).toBe('Description')
  })

  it('copies the Base Theme snippets a catalog section renders into a Theme that lacks them', async () => {
    const theme = fixtureTheme()
    rmSync(path.join(theme, 'snippets/product-card.liquid'), { force: true })
    const studio = await openStudio(theme, { catalog: path.join(projectDir, 'skills/shopify-theme-builder/catalog') })
    const { body } = await studio.addSection('related-products', 'product')
    expect(existsSync(path.join(theme, 'snippets/product-card.liquid'))).toBe(true)
    expect(errors(body.validation)).toEqual([])
  })
})

describe('Studio API: collection page', () => {
  it('composes a collection page from the real catalog\'s main collection with a clean Theme Check', async () => {
    const theme = fixtureTheme()
    const studio = await openStudio(theme, { catalog: path.join(projectDir, 'skills/shopify-theme-builder/catalog') })
    const catalog = catalogTypes(await studio.readTheme())
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

describe('Studio API: the other pages', () => {
  const realCatalog = path.join(projectDir, 'skills/shopify-theme-builder/catalog')
  const mains = {
    contact: 'contact-form',
    cart: 'main-cart',
    search: 'main-search',
    blog: 'main-blog',
    article: 'main-article',
    404: 'main-404',
    collections: 'main-list-collections',
  }

  it('offers each page\'s catalog main section on that page only, and the contact form on every page template', async () => {
    const catalog = catalogTypes(await (await openStudio(fixtureTheme(), { catalog: realCatalog })).readTheme())
    for (const [page, type] of Object.entries(mains)) {
      const on = pageNames.filter((other) => catalog[other].includes(type))
      expect(on).toEqual(type === 'contact-form' ? ['page', 'contact'] : [page])
    }
    expect(catalog.page).toContain('hero')
  })

  it('composes each page from its catalog main section with a clean Theme Check', async () => {
    const theme = fixtureTheme()
    const studio = await openStudio(theme, { catalog: realCatalog })
    for (const [page, type] of Object.entries(mains)) {
      expect((await studio.addSection(type, page)).status).toBe(200)
      if (page !== 'contact') expect((await studio.removeSection('main', page)).status).toBe(200)
      // The main section shows once per page.
      expect((await studio.addSection(type, page)).status).toBe(400)
    }
    const state = await studio.readTheme()
    expect(state.contact.map((section: { type: string }) => section.type)).toEqual(['page', 'contact-form'])
    for (const [page, type] of Object.entries(mains)) {
      if (page !== 'contact') expect(state[page]).toEqual([expect.objectContaining({ type })])
    }
    expect(errors(state.validation)).toEqual([])
    expect(readTemplate(theme, 'templates/list-collections.json').order).toHaveLength(1)
  }, 60_000)
})

describe('Studio API: header and footer', () => {
  const realCatalog = path.join(projectDir, 'skills/shopify-theme-builder/catalog')

  /** A Theme with the catalog's header and footer groups, as SKILL.md's setup copies them. */
  async function withGroups() {
    const theme = fixtureTheme()
    for (const file of ['header.liquid', 'header-group.json', 'announcement-bar.liquid', 'predictive-search.liquid', 'footer.liquid', 'footer-group.json']) {
      copyFileSync(path.join(realCatalog, 'sections', file), path.join(theme, 'sections', file))
    }
    return { theme, studio: await openStudio(theme, { catalog: realCatalog }) }
  }

  it("lists the header and footer groups' sections in order, with their color scheme", async () => {
    const { studio } = await withGroups()
    const { header, footer } = await studio.readTheme()
    expect(header.map((section: { id: string }) => section.id)).toEqual(['announcement-bar', 'header'])
    expect(footer).toEqual([{ id: 'footer', type: 'footer', colorScheme: 'scheme-1' }])
  })

  it("reads and writes the footer's settings, text and menu blocks in sections/footer-group.json, with a clean Theme Check", async () => {
    const { theme, studio } = await withGroups()
    const read = await studio.send('GET', 'api/footer/sections/footer')
    expect(read.status).toBe(200)
    expect(read.body.settings).toContainEqual({ id: 'show_newsletter', type: 'checkbox', label: 'Show newsletter signup', value: true })
    expect(read.body.blocks).toEqual(['text', 'menu', 'social'].map((type) => expect.objectContaining({ id: type, type })))

    const { status, body } = await studio.send('PATCH', 'api/footer/sections/footer', {
      colorScheme: 'scheme-2',
      settings: { show_newsletter: false },
      blocks: { menu: { menu: 'main-menu' }, text: { text: '<p>Hand-thrown mugs from Lisbon.</p>' } },
    })
    expect(status).toBe(200)
    expect(errors(body.validation)).toEqual([])
    expect(body.footer[0].colorScheme).toBe('scheme-2')
    const footer = readTemplate(theme, 'sections/footer-group.json').sections.footer
    expect(footer.settings).toEqual({ color_scheme: 'scheme-2', show_newsletter: false })
    expect(footer.blocks.menu.settings).toEqual({ menu: 'main-menu' })
    expect(footer.blocks.text.settings).toEqual({ text: '<p>Hand-thrown mugs from Lisbon.</p>' })

    expect((await studio.send('POST', 'api/footer/sections/footer/blocks', { type: 'menu' })).status).toBe(200)
    expect(readTemplate(theme, 'sections/footer-group.json').sections.footer.block_order).toHaveLength(4)
  })

  it("writes the header's menu into sections/header-group.json, keeping Shopify's comment header", async () => {
    const theme = fixtureTheme()
    const studio = await openStudio(theme)
    const { status } = await studio.send('PATCH', 'api/header/sections/header', { settings: { menu: 'main-menu' } })
    expect(status).toBe(200)
    const raw = readFileSync(path.join(theme, 'sections/header-group.json'), 'utf8')
    expect(raw.startsWith('/*')).toBe(true)
    expect(parseJSON(raw).sections.header.settings).toEqual({ menu: 'main-menu' })
  })

  it('answers 404 for a section the group does not have', async () => {
    const studio = await openStudio(fixtureTheme())
    expect((await studio.send('GET', 'api/header/sections/nope')).status).toBe(404)
  })
})

describe('Studio API: undo and redo', () => {
  it('undoes and redoes adding a section, restoring every file it touched, with a Theme Check each time', async () => {
    const theme = fixtureTheme()
    const before = readFileSync(path.join(theme, home), 'utf8')
    const studio = await openStudio(theme)
    expect((await studio.readTheme()).history).toEqual({ undo: false, redo: false })
    await studio.addSection('hero')
    const added = readFileSync(path.join(theme, home), 'utf8')

    const undone = await studio.send('POST', 'api/undo')
    expect(undone.status).toBe(200)
    expect(readFileSync(path.join(theme, home), 'utf8')).toBe(before)
    expect(existsSync(path.join(theme, 'sections/hero.liquid'))).toBe(false)
    expect(undone.body.home).toEqual([{ id: 'main', type: 'hello-world' }])
    expect(undone.body.history).toEqual({ undo: false, redo: true })
    expect(errors(undone.body.validation)).toEqual([])

    const redone = await studio.send('POST', 'api/redo')
    expect(redone.status).toBe(200)
    expect(readFileSync(path.join(theme, home), 'utf8')).toBe(added)
    expect(readFileSync(path.join(theme, 'sections/hero.liquid'), 'utf8')).toBe(catalogHero)
    expect(redone.body.history).toEqual({ undo: true, redo: false })
    expect(errors(redone.body.validation)).toEqual([])
  })

  it('undoes a logo upload and a Brand change, one step each, back to the Theme as it was', async () => {
    const theme = fixtureTheme()
    const settings = readFileSync(path.join(theme, 'config/settings_data.json'), 'utf8')
    const studio = await openStudio(theme)
    await studio.uploadLogo(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2]), 'image/png')
    await studio.setBrand({ headingFont: 'work_sans_n4' })

    await studio.send('POST', 'api/undo')
    expect(readSettingsData(theme).current.logo_asset).toBe('studio-logo.png')
    expect(readSettingsData(theme).current.type_heading_font).not.toBe('work_sans_n4')
    const { body } = await studio.send('POST', 'api/undo')
    expect(readFileSync(path.join(theme, 'config/settings_data.json'), 'utf8')).toBe(settings)
    expect(existsSync(path.join(theme, 'assets/studio-logo.png'))).toBe(false)
    expect(body.history).toEqual({ undo: false, redo: true })
  })

  it('records the live edits of one Studio field in a row as one step, ended by a write from another field or an undo', async () => {
    const theme = fixtureTheme()
    const settings = readFileSync(path.join(theme, 'config/settings_data.json'), 'utf8')
    const studio = await openStudio(theme)
    async function edit(field: string, brand: object) {
      const response = await fetch(new URL('api/brand', studio.url), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Studio-Field': field },
        body: JSON.stringify(brand),
      })
      expect(response.status).toBe(200)
    }
    const text = (color: string) => ({ colorSchemes: { 'scheme-1': { text: color } } })
    const textColor = () => readSettingsData(theme).current.color_schemes['scheme-1'].settings.text

    await edit('brand/scheme-1/text', text('#111111'))
    await edit('brand/scheme-1/text', text('#222222'))
    const { body } = await studio.send('POST', 'api/undo')
    expect(body.history).toEqual({ undo: false, redo: true })
    expect(readFileSync(path.join(theme, 'config/settings_data.json'), 'utf8')).toBe(settings)
    await studio.send('POST', 'api/redo')
    expect(textColor()).toBe('#222222')

    await edit('brand/scheme-1/text', text('#333333'))
    await edit('brand/body-font', { bodyFont: 'work_sans_n7' })
    await edit('brand/scheme-1/text', text('#444444'))
    await studio.send('POST', 'api/undo')
    expect(textColor()).toBe('#333333')
    await studio.send('POST', 'api/undo')
    await studio.send('POST', 'api/undo')
    expect(textColor()).toBe('#222222')

    // An edit made outside the Studio between two live edits keeps them apart, so undo never takes it back.
    await edit('brand/scheme-1/text', text('#555555'))
    const data = readSettingsData(theme)
    data.current.social_instagram = 'https://instagram.com/shop'
    writeFileSync(path.join(theme, 'config/settings_data.json'), JSON.stringify(data, null, 2))
    await edit('brand/scheme-1/text', text('#666666'))
    await studio.send('POST', 'api/undo')
    expect(textColor()).toBe('#555555')
    expect(readSettingsData(theme).current.social_instagram).toBe('https://instagram.com/shop')
    // Each write and undo runs Theme Check.
  }, 60_000)

  it('refuses with 409 when there is nothing to undo or redo', async () => {
    const studio = await openStudio(fixtureTheme())
    const undo = await studio.send('POST', 'api/undo')
    expect(undo.status).toBe(409)
    expect(undo.body.error).toBe('Nothing to undo.')
    expect((await studio.send('POST', 'api/redo')).status).toBe(409)
  })

  it('clears redo on a new write, and records nothing for a refused write', async () => {
    const studio = await openStudio(fixtureTheme())
    await studio.addSection('hero')
    await studio.send('POST', 'api/undo')
    expect((await studio.addSection('nope')).status).toBe(404)
    expect((await studio.readTheme()).history).toEqual({ undo: false, redo: true })
    const { body } = await studio.addSection('hero')
    expect(body.history).toEqual({ undo: true, redo: false })
  })

  it('keeps at most 50 steps', async () => {
    const theme = fixtureTheme()
    const studio = await openStudio(theme)
    const fonts = ['work_sans_n4', 'work_sans_n7']
    for (let step = 0; step < 51; step++) await studio.setBrand({ bodyFont: fonts[step % 2] })
    for (let step = 0; step < 50; step++) expect((await studio.send('POST', 'api/undo')).status).toBe(200)
    expect((await studio.send('POST', 'api/undo')).status).toBe(409)
    // The first write's step fell off: the Theme keeps its body font.
    expect(readSettingsData(theme).current.type_body_font).toBe('work_sans_n4')
    // Each write and undo runs Theme Check.
  }, 60_000)

  it('never undoes an edit made outside the Studio: it refuses, names the file and drops the step', async () => {
    const theme = fixtureTheme()
    const studio = await openStudio(theme)
    await studio.addSection('hero')
    await studio.setBrand({ bodyFont: 'work_sans_n7' })
    const edited = readFileSync(path.join(theme, 'config/settings_data.json'), 'utf8').replace('work_sans_n7', 'work_sans_n4')
    writeFileSync(path.join(theme, 'config/settings_data.json'), edited)

    const { status, body } = await studio.send('POST', 'api/undo')
    expect(status).toBe(409)
    expect(body.error).toContain('config/settings_data.json changed outside the Studio')
    expect(readFileSync(path.join(theme, 'config/settings_data.json'), 'utf8')).toBe(edited)
    // The step before, on other files, still undoes.
    expect((await studio.send('POST', 'api/undo')).status).toBe(200)
    expect(readTemplate(theme).order).toEqual(['main'])
  })
})

describe('Studio API: save', () => {
  function git(theme: string, ...args: string[]) {
    const result = spawnSync('git', args, { cwd: theme, encoding: 'utf8' })
    if (result.status !== 0) throw new Error(result.stderr)
    return result.stdout
  }

  /** A fixture Theme with its own Git history, everything committed, as create-theme and the agent leave it. */
  function committedTheme() {
    const theme = fixtureTheme()
    git(theme, 'init', '--quiet', '-b', 'main')
    git(theme, 'config', 'user.name', 'Creator')
    git(theme, 'config', 'user.email', 'creator@example.com')
    git(theme, 'add', '-A')
    git(theme, 'commit', '--quiet', '-m', 'Create the Theme')
    return theme
  }

  it('reads saved while the Theme matches its last commit, and unsaved after a Studio write or an edit elsewhere', async () => {
    const theme = committedTheme()
    const studio = await openStudio(theme)
    expect((await studio.readTheme()).saved).toBe(true)
    const { body } = await studio.setBrand({ bodyFont: 'work_sans_n7' })
    expect(body.saved).toBe(false)

    git(theme, 'commit', '--quiet', '-am', 'The agent commits')
    expect((await studio.readTheme()).saved).toBe(true)
    writeFileSync(path.join(theme, 'sections/new.liquid'), '{% schema %}{"name": "New"}{% endschema %}\n')
    expect((await studio.readTheme()).saved).toBe(false)
  })

  it('commits the Theme with a list of what changed, and refuses when there is nothing to save', async () => {
    const theme = committedTheme()
    const studio = await openStudio(theme)
    expect((await studio.send('POST', 'api/save')).status).toBe(409)
    await studio.addSection('hero')

    const { status, body } = await studio.send('POST', 'api/save')
    expect(status).toBe(200)
    expect(body.saved).toBe(true)
    expect(body.history).toEqual({ undo: true, redo: false })
    expect(git(theme, 'status', '--porcelain')).toBe('')
    expect(git(theme, 'log', '-1', '--format=%B').trim()).toBe('Studio: save\n\n- sections/hero.liquid\n- templates/index.json')
    const again = await studio.send('POST', 'api/save')
    expect(again.status).toBe(409)
    expect(again.body.error).toBe('Nothing to save.')
  })
})

describe('Studio API: package', () => {
  function packageRun(cli: string): { path: string } | null {
    const file = path.join(path.dirname(cli), 'package.json')
    return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null
  }

  it("answers the zip the CLI packages from a copy of the Theme outside it, named after the Theme's name and version", async () => {
    const theme = fixtureTheme()
    const cli = fakeShopify()
    const studio = await openStudio(theme, { cli })
    const response = await fetch(new URL('api/package', studio.url))
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/zip')
    expect(response.headers.get('content-disposition')).toContain('attachment; filename="Skeleton-0.1.0.zip"')
    const zip = await response.text()
    expect(zip.startsWith('PK')).toBe(true)
    expect(JSON.parse(zip.slice(2))).toEqual(expect.arrayContaining(['config/settings_schema.json', 'templates/index.json', 'templates/page.contact.json']))

    const run = packageRun(cli)
    expect(run).not.toBeNull()
    expect(path.relative(theme, run!.path).startsWith('..')).toBe(true)
    expect(readdirSync(theme).filter((file) => file.endsWith('.zip'))).toEqual([])
    expect(existsSync(run!.path)).toBe(false)
  })

  it('refuses with a 409, without packaging, while Theme Check finds errors', async () => {
    const theme = fixtureTheme()
    writeFileSync(path.join(theme, 'sections/broken.liquid'), '{% if %}\n{% schema %}{"name": "Broken"}{% endschema %}\n')
    const cli = fakeShopify()
    const studio = await openStudio(theme, { cli })
    const { status, body } = await studio.send('GET', 'api/package')
    expect(status).toBe(409)
    expect(body.error).toContain('sections/broken.liquid')
    expect(packageRun(cli)).toBeNull()
  })

  it("answers a 500 with the CLI's message, without its colors, when packaging fails", async () => {
    const cli = fakeShopify({ packageError: '\u001b[31mProvide a theme_info.theme_name configuration in config/settings_schema.json.\u001b[39m' })
    const studio = await openStudio(fixtureTheme(), { cli })
    const { status, body } = await studio.send('GET', 'api/package')
    expect(status).toBe(500)
    expect(body.error).toContain('Provide a theme_info.theme_name configuration in config/settings_schema.json.')
    expect(body.error).not.toContain('\u001b')
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
    await expect.poll(() => studio.readPreview()).toMatchObject({ status: 'running', url: 'http://127.0.0.1:9292' })
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
      } else if (req.url?.startsWith('/sitemap_')) {
        // Shopify's sitemaps list absolute URLs on the shop's domain; the blogs one lists each blog, then its articles.
        const shop = 'https://example.myshopify.com'
        const paths = req.url === '/sitemap_pages_1.xml' ? ['/pages/about-us', '/pages/faq'] : ['/blogs/news', '/blogs/news/hello-world']
        res.writeHead(200, { 'Content-Type': 'application/xml' })
        res.end(`<urlset>${paths.map((p) => `<url><loc>${shop}${p}</loc><lastmod>2026-09-23</lastmod></url>`).join('')}</urlset>`)
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end('{"products":[{"handle":"clay-mug"}]}')
      }
    })
    await new Promise<void>((resolve) => themeDev.listen(0, '127.0.0.1', resolve))
    cleanup.push(() => new Promise((resolve) => themeDev.close(() => resolve())))
    const themeDevUrl = `http://127.0.0.1:${(themeDev.address() as import('node:net').AddressInfo).port}`
    const studio = await openStudio(fixtureTheme(), { cli: fakeShopify({ output: running.replace('http://127.0.0.1:9292', themeDevUrl) }) })
    await expect.poll(() => studio.readPreview()).toMatchObject({ status: 'running', url: themeDevUrl })
    const { status, body } = await studio.send('GET', 'api/frame')
    expect(status).toBe(200)
    expect(body.paths).toEqual({
      home: '/',
      product: '/products/clay-mug',
      collection: '/collections/all',
      page: '/pages/about-us',
      contact: '/pages/about-us?view=contact',
      cart: '/cart',
      search: '/search?q=',
      blog: '/blogs/news',
      article: '/blogs/news/hello-world',
      404: '/studio-page-not-found',
      collections: '/collections',
    })
    // The Theme Editor on theme dev's development theme, from the share link theme dev printed.
    const editor = 'https://theme-builder-dev-ou5grn62.myshopify.com/admin/themes/207592816979/editor'
    expect(body.editor).toMatchObject({
      home: `${editor}?template=index`,
      product: `${editor}?template=product`,
      collection: `${editor}?template=collection`,
      contact: `${editor}?template=page.contact`,
      collections: `${editor}?template=list-collections`,
    })
    const page = await fetch(`${body.url}/`)
    expect(page.headers.get('x-frame-options')).toBeNull()
    expect(page.headers.get('access-control-allow-origin')).toBeNull()
    const html = await page.text()
    expect(html).toContain('<p>Shop</p>')
    expect(html).toMatch(/<script>[\s\S]*studio:select[\s\S]*<\/script><\/body>/)
    expect(await (await fetch(`${body.url}/products.json`)).text()).toBe('{"products":[{"handle":"clay-mug"}]}')
  })

  // theme dev's storefront session can expire (#113): the store then answers 401, or redirects to its password page.
  it.each([
    ['a 401', (res: import('node:http').ServerResponse) => res.writeHead(401).end()],
    ['a redirect to the password page', (res: import('node:http').ServerResponse) => res.writeHead(302, { Location: '/password' }).end()],
  ])('restarts theme dev when its storefront session expires with %s, then serves the preview again', async (_, expire) => {
    let expired = true
    const themeDev = createHttpServer((req, res) => {
      if (expired) return expire(res)
      res.writeHead(200, { 'Content-Type': 'text/html' }).end('<html><body><p>Shop</p></body></html>')
    })
    await new Promise<void>((resolve) => themeDev.listen(0, '127.0.0.1', resolve))
    cleanup.push(() => new Promise((resolve) => themeDev.close(() => resolve())))
    const themeDevUrl = `http://127.0.0.1:${(themeDev.address() as import('node:net').AddressInfo).port}`
    // Every run prints its preview link half a second after it starts, long enough to see the reconnection.
    const cli = fakeShopify({ later: running.replace('http://127.0.0.1:9292', themeDevUrl) })
    const studio = await openStudio(fixtureTheme(), { cli, storePassword: 'secret' })
    await expect.poll(() => studio.readPreview()).toMatchObject({ status: 'running', url: themeDevUrl })
    const { pid } = await fakeRun(cli)
    const { body } = await studio.send('GET', 'api/frame')

    // The Creator's preview never lands on the password page: the proxy answers while theme dev restarts.
    const lost = await fetch(`${body.url}/`, { redirect: 'manual' })
    expect(lost.status).toBe(503)
    expect(await studio.readPreview()).toMatchObject({ status: 'reconnecting', message: expect.stringContaining('Reconnecting') })
    await expect.poll(() => isRunning(pid)).toBe(false)
    expired = false
    await expect.poll(() => studio.readPreview()).toMatchObject({ status: 'running', url: themeDevUrl })
    expect((await fakeRun(cli)).pid).not.toBe(pid)
    expect(await (await fetch(`${body.url}/`)).text()).toContain('<p>Shop</p>')

    // A session lost again right away isn't fixed by restarting: no restart loop, the answer goes through.
    expired = true
    const again = await fetch(`${body.url}/`, { redirect: 'manual' })
    expect(again.status).not.toBe(503)
    expect((await studio.readPreview()).status).toBe('running')
  })

  // How Shopify CLI 4.8 reports an upload that failed because its credentials expired (#153).
  const credentialsExpired =
    '╭─ error ──────────────────────────────────────────────────────────────────────╮\n' +
    '│                                                                              │\n' +
    '│  Failed to upload file "sections/related-products.liquid" to remote theme.   │\n' +
    '│  The currently available CLI credentials are invalid.                        │\n' +
    '│                                                                              │\n' +
    '│  The CLI is currently unable to prompt for reauthentication.                 │\n' +
    '│                                                                              │\n' +
    '│  What to try                                                                 │\n' +
    '│    • Restart the CLI process you were running. If in an interactive          │\n' +
    '│      terminal, you will be prompted to reauthenticate.                       │\n' +
    '│                                                                              │\n' +
    '╰──────────────────────────────────────────────────────────────────────────────╯\n'

  it('restarts theme dev when its CLI credentials expire, and the new run uploads the failed files again', async () => {
    // Only the first run loses its credentials; a new run gets fresh ones.
    const cli = fakeShopify({ output: running, later: [credentialsExpired, ''] })
    const studio = await openStudio(fixtureTheme(), { cli })
    const first = await fakeRun(cli)
    await expect.poll(async () => (await fakeRun(cli)).runs).toBe(2)
    await expect.poll(() => isRunning(first.pid)).toBe(false)
    // A new run uploads every file that differs from the store, the failed one included.
    await expect.poll(() => studio.readPreview()).toEqual({ status: 'running', url: 'http://127.0.0.1:9292', uploadErrors: [] })
  })

  it('asks for `shopify auth login` when the credentials expire again right after a restart', async () => {
    const cli = fakeShopify({ output: running, later: credentialsExpired })
    const studio = await openStudio(fixtureTheme(), { cli })
    await expect
      .poll(() => studio.readPreview(), { timeout: 3000 })
      .toMatchObject({ status: 'login-required', message: expect.stringContaining('shopify auth login') })
    const second = await fakeRun(cli)
    expect(second.runs).toBe(2)
    await expect.poll(() => isRunning(second.pid)).toBe(false)
  })

  it('shows the uploads Shopify refused in the preview and in validation, until theme dev syncs the file', async () => {
    const refused =
      '╭─ error ──────────────────────────────────────────────╮\n' +
      '│                                                      │\n' +
      '│  Failed to upload file "templates/product.json" to   │\n' +
      '│  remote theme.                                       │\n' +
      '│                                                      │\n' +
      '│  Section type "related-products" does not refer to   │\n' +
      '│  an existing section file                            │\n' +
      '│                                                      │\n' +
      '╰──────────────────────────────────────────────────────╯\n'
    const cli = fakeShopify({
      output: running,
      later: refused,
      onSignal: '• 17:12:04  Synced » update templates/product.json\n',
    })
    const studio = await openStudio(fixtureTheme(), { cli })
    const uploadError = {
      file: 'templates/product.json',
      message: 'Section type "related-products" does not refer to an existing section file',
    }
    await expect
      .poll(() => studio.readPreview())
      .toEqual({ status: 'running', url: 'http://127.0.0.1:9292', uploadErrors: [uploadError] })
    expect((await studio.readTheme()).validation).toContainEqual(expect.objectContaining({ ...uploadError, severity: 'error' }))

    process.kill((await fakeRun(cli)).pid, 'SIGUSR2')
    await expect.poll(async () => (await studio.readPreview()).uploadErrors).toEqual([])
    expect((await studio.readTheme()).validation).not.toContainEqual(expect.objectContaining({ file: 'templates/product.json' }))
  })

  const loginPrompt =
    'To run this command, log in to Shopify.\n' +
    'User verification code: ABCD-EFGH\n' +
    '👉 Open this link to start the auth process: https://accounts.shopify.com/activate-with-code?device_code%5Buser_code%5D=ABCD-EFGH\n'

  it('shows that a login is required while the CLI waits for one in the terminal', async () => {
    const studio = await openStudio(fixtureTheme(), { cli: fakeShopify({ output: loginPrompt }) })
    await expect
      .poll(() => studio.readPreview())
      .toMatchObject({ status: 'login-required', message: expect.stringContaining("Studio's terminal") })
  })

  it('shows the preview URL once the Creator logged in', async () => {
    const studio = await openStudio(fixtureTheme(), { cli: fakeShopify({ output: loginPrompt, later: running }) })
    await expect.poll(() => studio.readPreview()).toMatchObject({ status: 'running', url: 'http://127.0.0.1:9292' })
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
      .toMatchObject({ status: 'login-required', message: expect.stringContaining('shopify auth login') })
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
      .toMatchObject({ status: 'error', message: expect.stringContaining('A store is required') })
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
      .toMatchObject({ status: 'error', message: expect.stringContaining('--store-password') })
  })

  it('explains a missing Shopify CLI', async () => {
    const studio = await openStudio(fixtureTheme(), { cli: path.join(tempDir('empty-'), 'shopify') })
    await expect
      .poll(() => studio.readPreview())
      .toMatchObject({ status: 'error', message: expect.stringContaining('npm install -g @shopify/cli') })
  })

  it('explains a Shopify CLI below the required version', async () => {
    const cli = fakeShopify({ version: '4.7.9' })
    const studio = await openStudio(fixtureTheme(), { cli })
    await expect
      .poll(() => studio.readPreview())
      .toMatchObject({ status: 'error', message: expect.stringMatching(/4\.7\.9.*4\.8\.0/) })
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
