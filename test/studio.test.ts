import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ViteDevServer } from 'vite'
import { afterEach, describe, expect, it } from 'vitest'
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
  }
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

describe('studio command', () => {
  function studio(...args: string[]) {
    const result = spawnSync('node', [path.join(projectDir, 'studio/bin/studio.mjs'), ...args], { encoding: 'utf8' })
    return { code: result.status, stderr: result.stderr }
  }

  it('refuses a folder that is not a Theme', () => {
    const dir = tempDir('not-a-theme-')
    const result = studio('--theme', dir)
    expect(result.code).toBe(1)
    expect(result.stderr).toContain(`${dir} is not a Shopify theme`)
  })

  it('requires --theme', () => {
    const result = studio()
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('Usage: studio --theme <dir>')
  })
})
