import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { parseJSON } from '@shopify/theme-check-node'
import { checkDirection } from '../skills/shopify-theme-builder/scripts/check-direction.mjs'

const projectDir = fileURLToPath(new URL('..', import.meta.url))
const skillDir = path.join(projectDir, 'skills/shopify-theme-builder')
const command = path.join(skillDir, 'scripts/check-direction.mjs')
const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const direction = `# Olive Press

Chosen: Press Cloth

## Brief

- World: cold-pressed oil from one grove in Puglia

## Press Cloth

Linen and ink, not the cream-and-gold olive shop.

- Type: bodoni_moda_n4, because the harvest labels print the grove's name thin and tall; karla_n4, because the mill's price board is set in a plain sans; the accent karla_n7, because prices are stamped bold on the tins
- Color: restrained

## Harvest Date

- Type: work_sans_n4 for everything
`

/** A sample Theme that passes every check: the Base Theme, the catalog, a written Brand, pages and DIRECTION.md. */
function sampleTheme() {
  const theme = mkdtempSync(path.join(tmpdir(), 'check-direction-'))
  dirs.push(theme)
  cpSync(path.join(skillDir, 'base-theme'), theme, { recursive: true })
  cpSync(path.join(skillDir, 'catalog'), theme, { recursive: true })
  const scheme = { background: '#F4F1EA', text: '#1F2A1C', button: '#1F2A1C', button_label: '#F4F1EA', accent: '#5A3E1B', border: '#6B6B5E' }
  const inverse = { background: '#1F2A1C', text: '#F4F1EA', button: '#F4F1EA', button_label: '#1F2A1C', accent: '#E9D8A6', border: '#A3A89A' }
  writeJSON(theme, 'config/settings_data.json', {
    current: 'Press Cloth',
    presets: {
      'Press Cloth': {
        color_schemes: { 'scheme-1': { settings: scheme }, 'scheme-2': { settings: inverse } },
        type_heading_font: 'bodoni_moda_n4',
        type_body_font: 'karla_n4',
        type_accent_font: 'karla_n7',
        card_image_ratio: '4 / 5',
      },
    },
  })
  writeJSON(theme, 'templates/index.json', {
    sections: {
      hero: { type: 'hero', settings: { heading: 'Pressed the day it was picked', text: '<p>One grove, one mill.</p>', button_label: 'Shop the oil', button_link: 'shopify://collections/oil' } },
      rows: { type: 'featured-collection', settings: { heading: 'This harvest', collection: 'oil' } },
      story: { type: 'image-with-text', settings: { heading: 'The mill', text: '<p>Stone wheels since 1921.</p>', button_label: 'Shop the oil', button_link: '/collections/oil' } },
      note: { type: 'rich-text', settings: { heading: 'Harvest date on every tin', text: '<p>We stamp it by hand.</p>' } },
    },
    order: ['hero', 'rows', 'story', 'note'],
  })
  writeJSON(theme, 'templates/product.json', {
    sections: { main: { type: 'main-product', settings: {} }, related: { type: 'related-products', settings: { heading: 'From the same grove' } } },
    order: ['main', 'related'],
  })
  writeJSON(theme, 'templates/collection.json', { sections: { main: { type: 'main-collection', settings: {} } }, order: ['main'] })
  const header = readJSON(theme, 'sections/header-group.json')
  header.sections['announcement-bar'].blocks.announcement.settings.text = 'Harvest 2026 ships in November'
  writeJSON(theme, 'sections/header-group.json', header)
  writeFileSync(path.join(theme, 'DIRECTION.md'), direction)
  return theme
}

function readJSON(theme: string, file: string) {
  return parseJSON(readFileSync(path.join(theme, file), 'utf8')) as any
}

function writeJSON(theme: string, file: string, data: unknown) {
  writeFileSync(path.join(theme, file), JSON.stringify(data, null, 2))
}

/** Changes the Press Cloth preset's settings. */
function setSettings(theme: string, change: (settings: any) => void) {
  const data = readJSON(theme, 'config/settings_data.json')
  change(data.presets['Press Cloth'])
  writeJSON(theme, 'config/settings_data.json', data)
}

/** Changes a template's sections. */
function setTemplate(theme: string, file: string, change: (template: any) => void) {
  const template = readJSON(theme, file)
  change(template)
  writeJSON(theme, file, template)
}

describe('check-direction', () => {
  it('finds nothing on a Theme that follows its Direction', () => {
    expect(checkDirection(sampleTheme())).toEqual([])
  })

  it('reports each color pair of a scheme below its contrast minimum', () => {
    const theme = sampleTheme()
    setSettings(theme, (settings) => {
      settings.color_schemes['scheme-1'].settings.text = '#999999'
      settings.color_schemes['scheme-2'].settings.border = '#2A3527'
    })
    expect(checkDirection(theme)).toEqual([
      { check: 'contrast', file: 'config/settings_data.json', message: 'scheme-1: text on background is 2.5:1, needs 4.5:1.' },
      { check: 'contrast', file: 'config/settings_data.json', message: 'scheme-2: border on background is 1.1:1, needs 3:1.' },
    ])
  })

  it('reports a section type a page repeats', () => {
    const theme = sampleTheme()
    setTemplate(theme, 'templates/index.json', (template) => {
      template.sections.story2 = { type: 'image-with-text', settings: { heading: 'The grove', text: '<p>Coratina trees.</p>' } }
      template.order.push('story2')
    })
    expect(checkDirection(theme)).toEqual([
      { check: 'repeated-section', file: 'templates/index.json', message: 'image-with-text is on the page 2 times: story, story2.' },
    ])
  })

  it('reports filler words and em dashes in the text the storefront shows, a default text included', () => {
    const theme = sampleTheme()
    setTemplate(theme, 'templates/index.json', (template) => {
      template.sections.note.settings.text = '<p>Curated oils — to elevate a Seamless dinner.</p>'
      // Links and handles aren't copy.
      template.sections.rows.settings.collection = 'elevated-harvest'
      template.sections.note.settings.button_link = '/collections/elevated-harvest'
    })
    setTemplate(theme, 'sections/header-group.json', (group) => {
      delete group.sections['announcement-bar'].blocks.announcement.settings.text
    })
    expect(checkDirection(theme)).toEqual([
      { check: 'copy', file: 'sections/header-group.json', message: 'announcement-bar, announcement block, text: "welcome to".' },
      { check: 'copy', file: 'templates/index.json', message: 'note, text: "elevate", "curated", "seamless", "—".' },
    ])
  })

  it('reports text that looks like a to-do', () => {
    const theme = sampleTheme()
    setTemplate(theme, 'templates/product.json', (template) => {
      template.sections.main.blocks = {
        shipping: { type: 'collapsible-content', settings: { heading: 'Spedizione e resi', source: 'text', text: '<p>[Da completare: tempi di spedizione e condizioni di reso.]</p>' } },
      }
    })
    setTemplate(theme, 'templates/index.json', (template) => {
      template.sections.note.settings.heading = 'Harvest date TBD'
      template.sections.story.settings.text = '<p>Lorem ipsum dolor sit amet.</p>'
      template.sections.rows.settings.heading = 'Grove story: to be completed'
      // Spanish "todo" (all) and Liquid code aren't to-dos.
      template.sections.hero.settings.heading = 'Todo el aceite de un olivar'
      template.sections.code = { type: 'custom-liquid', settings: { custom_liquid: "{{ product.metafields['custom']['harvest'] }}" } }
      template.order.push('code')
    })
    setTemplate(theme, 'sections/header-group.json', (group) => {
      group.sections['announcement-bar'].blocks.announcement.settings.text = 'TODO: shipping line'
    })
    expect(checkDirection(theme)).toEqual([
      { check: 'todo', file: 'sections/header-group.json', message: 'announcement-bar, announcement block, text: "TODO". Write the fact, or leave it out and tell the Creator.' },
      { check: 'todo', file: 'templates/index.json', message: 'rows, heading: "to be completed". Write the fact, or leave it out and tell the Creator.' },
      { check: 'todo', file: 'templates/index.json', message: 'story, text: "Lorem ipsum". Write the fact, or leave it out and tell the Creator.' },
      { check: 'todo', file: 'templates/index.json', message: 'note, heading: "TBD". Write the fact, or leave it out and tell the Creator.' },
      {
        check: 'todo',
        file: 'templates/product.json',
        message: 'main, collapsible-content block, text: "[Da completare: tempi di spedizione e condizioni di reso.]". Write the fact, or leave it out and tell the Creator.',
      },
    ])
  })

  it('reports a link a page labels in more than one way', () => {
    const theme = sampleTheme()
    setTemplate(theme, 'templates/index.json', (template) => {
      template.sections.story.settings.button_label = 'Explore the collection'
    })
    expect(checkDirection(theme)).toEqual([
      {
        check: 'cta-labels',
        file: 'templates/index.json',
        message: '/collections/oil has 2 labels: "Shop the oil" (hero), "Explore the collection" (story). Give one intent one label.',
      },
    ])
  })

  it('reports eyebrow labels on more than one section in three', () => {
    const theme = sampleTheme()
    for (const name of ['grove-note', 'mill-note']) {
      const schema = { name: 'Note', settings: [{ type: 'text', id: 'eyebrow', label: 'Eyebrow' }, { type: 'text', id: 'heading', label: 'Heading' }] }
      writeFileSync(path.join(theme, `sections/${name}.liquid`), `<p>{{ section.settings.eyebrow }}</p>\n{% schema %}${JSON.stringify(schema)}{% endschema %}\n`)
    }
    setTemplate(theme, 'templates/index.json', (template) => {
      template.sections.grove = { type: 'grove-note', settings: { eyebrow: 'The grove', heading: 'Coratina trees' } }
      template.sections.mill = { type: 'mill-note', settings: { eyebrow: 'The mill', heading: 'Stone wheels' } }
      template.order.push('grove', 'mill')
    })
    expect(checkDirection(theme)).toEqual([])

    setTemplate(theme, 'templates/index.json', (template) => {
      delete template.sections.note
      template.order = template.order.filter((id: string) => id !== 'note')
    })
    expect(checkDirection(theme)).toEqual([
      { check: 'eyebrows', file: 'templates/index.json', message: '2 of 5 sections carry an eyebrow label (grove, mill); at most one in three should.' },
    ])
  })

  it("reports a font with no reason in the chosen Direction's part of DIRECTION.md", () => {
    const theme = sampleTheme()
    // Harvest Date names work_sans_n4, without a reason.
    setSettings(theme, (settings) => {
      settings.type_heading_font = 'work_sans_n4'
      settings.type_accent_font = 'work_sans_n4'
    })
    expect(checkDirection(theme)).toEqual([
      {
        check: 'fonts',
        file: 'DIRECTION.md',
        message: 'work_sans_n4 (heading, accent) has no reason under ## Press Cloth: write "work_sans_n4, because <a reason from the brief>" on its Type line.',
      },
    ])
  })

  it('reads the reasons of the Direction the Theme shows when none is chosen yet', () => {
    const theme = sampleTheme()
    const text = direction.replace('Chosen: Press Cloth\n\n', '').replace('work_sans_n4 for everything', 'work_sans_n4, because the timetable')
    writeFileSync(path.join(theme, 'DIRECTION.md'), text)
    setSettings(theme, (settings) => {
      settings.type_heading_font = 'work_sans_n4'
    })
    expect(checkDirection(theme).map((finding) => finding.message)).toEqual([
      'work_sans_n4 (heading) has no reason under ## Press Cloth: write "work_sans_n4, because <a reason from the brief>" on its Type line.',
    ])
  })

  it('reports a radius of its own beside the shape family', () => {
    const theme = sampleTheme()
    const css = '.size-guide { border-radius: var(--style-border-radius-cards); }\n.size-guide td { border-start-start-radius: 12px; }\n.size-guide th { border-radius: 0; }\n'
    writeFileSync(path.join(theme, 'sections/size-guide.liquid'), `{% stylesheet %}\n${css}{% endstylesheet %}\n{% schema %}{"name": "Size guide"}{% endschema %}\n`)
    expect(checkDirection(theme)).toEqual([
      {
        check: 'radius',
        file: 'sections/size-guide.liquid',
        message: 'line 3: border-start-start-radius: 12px is a second radius family. Use the shape family\'s var(--style-border-radius-*).',
      },
    ])
  })

  it('reports a page showing images in more than two ratios', () => {
    const theme = sampleTheme()
    setTemplate(theme, 'templates/index.json', (template) => {
      template.sections.list = { type: 'collection-list', settings: { heading: 'By harvest' } }
      template.order.push('list')
    })
    expect(checkDirection(theme)).toEqual([
      {
        check: 'image-ratios',
        file: 'templates/index.json',
        message: '3 image ratios: 4 / 5 (rows), 4 / 3 (story), 1 / 1 (list). Keep a page to two at most, the card ratio among them.',
      },
    ])
  })

  it('prints one line per finding and exits 1 when there is any, 0 when there is none', () => {
    const theme = sampleTheme()
    const clean = spawnSync(process.execPath, [command, theme], { encoding: 'utf8' })
    expect([clean.status, clean.stdout]).toEqual([0, 'Direction check: 0 findings\n'])

    setSettings(theme, (settings) => {
      settings.color_schemes['scheme-1'].settings.text = '#999999'
    })
    const failing = spawnSync(process.execPath, [command, theme], { encoding: 'utf8' })
    expect([failing.status, failing.stdout]).toEqual([
      1,
      'config/settings_data.json contrast: scheme-1: text on background is 2.5:1, needs 4.5:1.\nDirection check: 1 finding\n',
    ])
  })

  it('reports a Theme without DIRECTION.md', () => {
    const theme = sampleTheme()
    rmSync(path.join(theme, 'DIRECTION.md'))
    expect(checkDirection(theme)).toEqual([
      { check: 'fonts', file: 'DIRECTION.md', message: 'The Theme has no DIRECTION.md, so no font has a reason: write it as references/design/directions.md says.' },
    ])
  })
})
