import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, expect } from 'vitest'
import { parseJSON } from '@shopify/theme-check-node'
import { startStudio } from '../../skills/shopify-theme-builder/studio/server/studio.mjs'

export const projectDir = fileURLToPath(new URL('../..', import.meta.url))
type StudioServer = Awaited<ReturnType<typeof startStudio>>
export const cleanup: (() => Promise<void> | void)[] = []

afterEach(async () => {
  for (const fn of cleanup.splice(0)) await fn()
})

export function tempDir(prefix: string) {
  const dir = mkdtempSync(path.join(tmpdir(), prefix))
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}

/** A fresh Theme folder built from the Base Theme, with a contact page template (SKILL.md's setup copies the catalog's). */
export function fixtureTheme() {
  const theme = tempDir('theme-')
  cpSync(path.join(projectDir, 'skills/shopify-theme-builder/base-theme'), theme, { recursive: true })
  writeFileSync(path.join(theme, 'templates/page.contact.json'), JSON.stringify({ sections: { main: { type: 'page' } }, order: ['main'] }))
  return theme
}

/** The pages the Studio composes, in its page switcher's order. */
export const pageNames = ['home', 'product', 'collection', 'page', 'contact', 'cart', 'search', 'blog', 'article', '404', 'collections']

/** The same value for every page, except the overrides. */
export function everyPage<T>(value: T, overrides: Record<string, T> = {}) {
  return { ...Object.fromEntries(pageNames.map((page) => [page, value])), ...overrides }
}

export const catalogHero =
  '<div class="color-{{ section.settings.color_scheme }}"></div>\n' +
  '{% schema %}{"name": "Hero", "settings": [{"type": "color_scheme", "id": "color_scheme", "label": "Color scheme", "default": "scheme-1"}]}{% endschema %}\n'

/** A Section Catalog holding one section, so tests don't depend on the real catalog's contents. */
export function fixtureCatalog() {
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
 * arguments and pid in run.json, prints the given output (and `later` a tenth of a second on; given a list, the
 * nth run prints the nth one, and the last one after that), prints `onSignal` on each SIGUSR2, then runs
 * until killed or exits with exitCode.
 */
export function fakeShopify({
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
setTimeout(() => process.stdout.write(later[Math.min(runs, later.length) - 1]), 100)
${exitCode === undefined ? 'setInterval(() => {}, 1000)' : `setTimeout(() => process.exit(${exitCode}), 200)`}
`,
    { mode: 0o755 },
  )
  return cli
}

/** The arguments and pid of the fake CLI's `theme dev` run, once it started. */
export async function fakeRun(cli: string): Promise<{ args: string[]; pid: number; runs: number; storePassword?: string }> {
  const file = path.join(path.dirname(cli), 'run.json')
  await expect.poll(() => existsSync(file)).toBe(true)
  return JSON.parse(readFileSync(file, 'utf8'))
}

export async function openStudio(
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

export const home = 'templates/index.json'

export function readTemplate(theme: string, file = home) {
  return parseJSON(readFileSync(path.join(theme, file), 'utf8'))
}

/** Writes a template the way the Theme Editor would: a comment header, settings, blocks and keys the Studio doesn't own. */
export function writeTemplate(theme: string, template: object, file = home) {
  writeFileSync(path.join(theme, file), '/* Written by the Theme Editor */\n' + JSON.stringify(template, null, 2))
}

export function readSettingsData(theme: string) {
  return parseJSON(readFileSync(path.join(theme, 'config/settings_data.json'), 'utf8'))
}

/** The types of the catalog sections each page can take, from the Theme state. */
export function catalogTypes(state: { catalog: Record<string, { type: string }[]> }) {
  return Object.fromEntries(Object.entries(state.catalog).map(([page, sections]) => [page, sections.map((section) => section.type)]))
}

export function errors<T extends { severity: string }>(offenses: T[]) {
  return offenses.filter((offense) => offense.severity === 'error')
}
