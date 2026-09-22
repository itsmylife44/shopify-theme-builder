import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ViteDevServer } from 'vite'
import { afterEach, describe, expect, it } from 'vitest'
import { parseJSON } from '@shopify/theme-check-node'
import { startStudio } from '../studio/server/studio.mjs'

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

/** A Section Catalog holding one section, so tests don't depend on the real catalog's contents. */
function fixtureCatalog() {
  const catalog = tempDir('catalog-')
  mkdirSync(path.join(catalog, 'sections'))
  writeFileSync(path.join(catalog, 'sections/hero.liquid'), '{% schema %}{"name": "Hero"}{% endschema %}\n')
  return catalog
}

async function openStudio(theme: string, catalog = fixtureCatalog()) {
  const server: ViteDevServer = await startStudio({ theme, catalog, port: 0 })
  cleanup.unshift(() => server.close())
  const url = server.resolvedUrls?.local[0]
  if (!url) throw new Error('Studio server has no local URL')
  return {
    async readTheme() {
      const response = await fetch(new URL('api/theme', url))
      expect(response.status).toBe(200)
      return response.json()
    },
    async setBrand(brand: unknown) {
      const response = await fetch(new URL('api/brand', url), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(brand),
      })
      return { status: response.status, body: await response.json() }
    },
  }
}

function readSettingsData(theme: string) {
  return parseJSON(readFileSync(path.join(theme, 'config/settings_data.json'), 'utf8'))
}

function errors(offenses: { severity: string }[]) {
  return offenses.filter((offense) => offense.severity === 'error')
}

describe('Studio API: read Theme state', () => {
  it('returns the home sections in order, the catalog sections and a clean validation', async () => {
    const studio = await openStudio(fixtureTheme())
    const state = await studio.readTheme()
    expect(state.home).toEqual([{ id: 'main', type: 'hello-world' }])
    expect(state.catalog).toEqual(['hero'])
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
