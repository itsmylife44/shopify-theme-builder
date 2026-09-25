import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { starterFiles } from '../skills/shopify-theme-builder/studio/server/create-theme.mjs'
import { validate } from '../skills/shopify-theme-builder/studio/server/studio.mjs'

const projectDir = fileURLToPath(new URL('..', import.meta.url))
const skillDir = path.join(projectDir, 'skills/shopify-theme-builder')
const command = path.join(skillDir, 'studio/bin/create-theme.mjs')
const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function tempDir() {
  const dir = mkdtempSync(path.join(tmpdir(), 'create-theme-'))
  dirs.push(dir)
  return dir
}

function createTheme(...args: string[]) {
  return spawnSync(process.execPath, [command, ...args], { encoding: 'utf8' })
}

/** Every file under dir, relative to it, skipping .git. */
function listFiles(dir: string) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)))
    .filter((file) => !file.startsWith('.git/'))
    .sort()
}

describe('create-theme', () => {
  it('starts every Theme with the catalog header, footer, their groups and the catalog pages', () => {
    expect([...starterFiles].sort()).toEqual([
      'sections/announcement-bar.liquid',
      'sections/contact-form.liquid',
      'sections/footer-group.json',
      'sections/footer.liquid',
      'sections/header-group.json',
      'sections/header.liquid',
      'sections/main-404.liquid',
      'sections/main-article.liquid',
      'sections/main-blog.liquid',
      'sections/main-cart.liquid',
      'sections/main-list-collections.liquid',
      'sections/main-search.liquid',
      'sections/predictive-search.liquid',
      'sections/quick-add.liquid',
      'templates/404.json',
      'templates/article.json',
      'templates/blog.json',
      'templates/cart.json',
      'templates/list-collections.json',
      'templates/page.contact.json',
      'templates/search.json',
    ])
  })

  it('creates a Theme from the Base Theme and the starter files, named, in a Git repository, with a clean Theme Check', async () => {
    const theme = path.join(tempDir(), 'acme-theme')
    const result = createTheme(theme, '--name', 'Acme', '--author', 'Jane Doe')
    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)

    const expected = [...listFiles(path.join(skillDir, 'base-theme')).filter((file) => file !== 'PROVENANCE.md'), ...starterFiles]
    expect(listFiles(theme)).toEqual([...new Set(expected)].sort())
    expect(listFiles(theme)).toContain('.shopifyignore')
    for (const file of starterFiles) {
      expect(readFileSync(path.join(theme, file), 'utf8')).toBe(readFileSync(path.join(skillDir, 'catalog', file), 'utf8'))
    }

    const [info] = JSON.parse(readFileSync(path.join(theme, 'config/settings_schema.json'), 'utf8'))
    expect(info).toMatchObject({ name: 'theme_info', theme_name: 'Acme', theme_author: 'Jane Doe' })

    // The Theme is its own Git repository, on main.
    const git = (...args: string[]) => spawnSync('git', args, { cwd: theme, encoding: 'utf8' }).stdout.trim()
    expect(git('rev-parse', '--show-toplevel')).toBe(realpathSync(theme))
    expect(git('symbolic-ref', '--short', 'HEAD')).toBe('main')

    expect((await validate(theme)).filter((offense) => offense.severity === 'error')).toEqual([])
  }, 60_000)

  it('creates the Theme in an existing empty folder', () => {
    const theme = tempDir()
    expect(createTheme(theme, '--name', 'Acme', '--author', 'Jane Doe').status).toBe(0)
    expect(listFiles(theme)).toContain('layout/theme.liquid')
  })

  it("points the Theme's documentation and support links at the Creator's, or keeps Shopify's help without them", () => {
    const info = (theme: string) => JSON.parse(readFileSync(path.join(theme, 'config/settings_schema.json'), 'utf8'))[0]
    const theme = path.join(tempDir(), 'theme')
    const result = createTheme(theme, '--name', 'Acme', '--author', 'Jane Doe', '--documentation-url', 'https://studio.example/docs', '--support-url', 'https://studio.example/help')
    expect(result.stderr).toBe('')
    expect(info(theme)).toMatchObject({ theme_documentation_url: 'https://studio.example/docs', theme_support_url: 'https://studio.example/help' })

    const plain = path.join(tempDir(), 'theme')
    expect(createTheme(plain, '--name', 'Acme', '--author', 'Jane Doe').status).toBe(0)
    expect(info(plain)).toMatchObject({ theme_documentation_url: 'https://help.shopify.com/manual/online-store/themes', theme_support_url: 'https://support.shopify.com/' })
  })

  it('refuses a folder with files, and leaves it as it was', () => {
    const theme = tempDir()
    writeFileSync(path.join(theme, 'notes.txt'), 'mine')
    const result = createTheme(theme, '--name', 'Acme', '--author', 'Jane Doe')
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("isn't empty")
    expect(listFiles(theme)).toEqual(['notes.txt'])
  })

  it('refuses a folder inside the skill', () => {
    const result = createTheme(path.join(skillDir, 'my-theme'), '--name', 'Acme', '--author', 'Jane Doe')
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('outside')
  })

  it.each([
    ['no name', ['--author', 'Jane Doe']],
    ['no author', ['--name', 'Acme']],
    ['a name over 50 characters', ['--name', 'A'.repeat(51), '--author', 'Jane Doe']],
    ['a support link that is not an https URL', ['--name', 'Acme', '--author', 'Jane Doe', '--support-url', 'studio.example']],
    ['a documentation link that is not an https URL', ['--name', 'Acme', '--author', 'Jane Doe', '--documentation-url', 'http://studio.example']],
  ])('refuses %s', (_, args) => {
    const parent = tempDir()
    const result = createTheme(path.join(parent, 'theme'), ...args)
    expect(result.status).toBe(1)
    expect(result.stderr).not.toBe('')
    expect(readdirSync(parent)).toEqual([])
  })
})
