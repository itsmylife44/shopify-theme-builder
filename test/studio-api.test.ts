import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Offense } from '../skills/shopify-theme-builder/studio/server/studio.mjs'
import { projectDir, tempDir, fixtureTheme, everyPage, fakeShopify, openStudio, home, writeTemplate, errors } from './helpers/studio.js'

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
    expect(result.stderr).toContain('shopify store create dev')
    expect(result.stderr).not.toContain('--demo-data')
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
