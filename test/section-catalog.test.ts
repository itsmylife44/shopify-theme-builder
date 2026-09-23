import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseJSON } from '@shopify/theme-check-node'

const projectDir = fileURLToPath(new URL('..', import.meta.url))
const script = path.join(projectDir, 'scripts/check-theme.mjs')

function checkTheme(...args: string[]) {
  const result = spawnSync('node', [script, ...args], { cwd: projectDir, encoding: 'utf8' })
  return { code: result.status, output: result.stdout + result.stderr }
}

describe('Section Catalog theme check', () => {
  it('passes for the Base Theme plus the whole Section Catalog', () => {
    const result = checkTheme()
    expect(result.output).toContain('0 errors')
    expect(result.code).toBe(0)
  })

  it('fails and names the file when a catalog section has a Liquid error', () => {
    const catalog = mkdtempSync(path.join(tmpdir(), 'catalog-'))
    mkdirSync(path.join(catalog, 'sections'))
    writeFileSync(
      path.join(catalog, 'sections/broken.liquid'),
      '{% if section.settings.heading %}<h2>{{ section.settings.heading }}</h2>\n{% schema %}{"name": "Broken"}{% endschema %}\n',
    )
    const result = checkTheme(catalog)
    rmSync(catalog, { recursive: true })
    expect(result.code).not.toBe(0)
    expect(result.output).toContain('sections/broken.liquid:1 error')
  })
})

describe('Contact page', () => {
  const skillDir = path.join(projectDir, 'skills/shopify-theme-builder')

  it('ships a page.contact template with the page content and the contact form', () => {
    const { sections, order } = parseJSON(readFileSync(path.join(skillDir, 'catalog/templates/page.contact.json'), 'utf8'))
    expect(order.map((id: string) => sections[id].type)).toEqual(['page', 'contact-form'])
    const form = readFileSync(path.join(skillDir, 'catalog/sections/contact-form.liquid'), 'utf8')
    expect(form).toContain("{% form 'contact'")
    expect(form).toContain('form.posted_successfully?')
    expect(form).toContain('form.errors')
  })

  it('is copied into every new Theme by the skill', () => {
    const skill = readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8')
    expect(skill).toContain('<skill-dir>/catalog/sections/contact-form.liquid')
    expect(skill).toContain('<skill-dir>/catalog/templates/page.contact.json')
  })
})

describe('Base Theme templates', () => {
  const baseTheme = path.join(projectDir, 'skills/shopify-theme-builder/base-theme')
  // The pages the Studio doesn't compose: each ships a basic layout that takes a Brand color scheme.
  const basicPages = ['404', 'article', 'blog', 'cart', 'list-collections', 'page', 'password', 'search']

  it('has every template a complete theme needs', () => {
    for (const template of [...basicPages, 'index', 'product', 'collection']) {
      expect(existsSync(path.join(baseTheme, `templates/${template}.json`)), template).toBe(true)
    }
    expect(existsSync(path.join(baseTheme, 'templates/gift_card.liquid'))).toBe(true)
  })

  it('styles every basic page with a Brand color scheme', () => {
    for (const template of basicPages) {
      const { sections } = parseJSON(readFileSync(path.join(baseTheme, `templates/${template}.json`), 'utf8'))
      for (const { type } of Object.values(sections) as { type: string }[]) {
        const liquid = readFileSync(path.join(baseTheme, `sections/${type}.liquid`), 'utf8')
        expect(liquid, type).toContain('"type": "color_scheme"')
        expect(liquid, type).toContain('color-{{ section.settings.color_scheme }}')
      }
    }
  })

  it('passes with the shop\'s language added as a copy of the English locale', () => {
    const extra = mkdtempSync(path.join(tmpdir(), 'catalog-'))
    mkdirSync(path.join(extra, 'locales'))
    copyFileSync(path.join(baseTheme, 'locales/en.default.json'), path.join(extra, 'locales/it.json'))
    copyFileSync(path.join(baseTheme, 'locales/en.default.schema.json'), path.join(extra, 'locales/it.schema.json'))
    const result = checkTheme(extra)
    rmSync(extra, { recursive: true })
    expect(result.output).toContain('0 errors')
  })
})
