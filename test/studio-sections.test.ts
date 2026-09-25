import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseJSON } from '@shopify/theme-check-node'
import { projectDir, fixtureTheme, catalogHero, fixtureCatalog, openStudio, home, readTemplate, writeTemplate, errors } from './helpers/studio.js'

const pages = [
  { page: 'home', file: 'templates/index.json', main: 'hello-world' },
  { page: 'product', file: 'templates/product.json', main: 'product' },
  { page: 'collection', file: 'templates/collection.json', main: 'collection' },
]

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

  it("lists the theme blocks a section names, and adds them with their preset's settings", async () => {
    const theme = fixtureTheme()
    const studio = await openStudio(theme, { catalog: realCatalog })
    const id = (await studio.addSection('main-product', 'product')).body.product.find((section: { type: string }) => section.type === 'main-product').id
    const url = `api/product/sections/${id}`
    expect((await studio.send('GET', url)).body.blockTypes).toEqual([
      { type: '_product-title', name: 'Title' },
      { type: '_product-price', name: 'Price' },
      { type: '_variant-picker', name: 'Variant picker' },
      { type: 'size-guide', name: 'Size guide' },
      { type: '_buy-buttons', name: 'Buy buttons' },
      { type: 'custom-liquid', name: 'Custom Liquid' },
      { type: 'shipping-note', name: 'Shipping note' },
      { type: 'collapsible-content', name: 'Collapsible content' },
    ])
    for (const type of ['custom-liquid', 'shipping-note', 'collapsible-content', 'size-guide']) {
      const { status, body } = await studio.send('POST', `${url}/blocks`, { type })
      expect(status, type).toBe(200)
      expect(errors(body.validation)).toEqual([])
      const { blocks, block_order } = readTemplate(theme, 'templates/product.json').sections[id]
      expect(blocks[block_order.at(-1)].type).toBe(type)
      expect(block_order.at(-1)).toMatch(new RegExp(`^${type}_[0-9a-f]{6}$`))
    }
    // A private block the section names goes in once: the preset already has the title.
    const { status, body } = await studio.send('POST', `${url}/blocks`, { type: '_product-title' })
    expect(status).toBe(400)
    expect(body.error).toContain('1')
    expect((await studio.send('POST', `${url}/blocks`, { type: '@app' })).status).toBe(400)
  })

  it('lists every public theme block for a section that takes @theme, with its limit', async () => {
    const theme = fixtureTheme()
    writeFileSync(
      path.join(theme, 'blocks/badge.liquid'),
      '<span></span>\n{% schema %}{"name": "Badge", "limit": 1, "presets": [{ "name": "Badge" }]}{% endschema %}\n',
    )
    const studio = await openStudio(theme)
    const id = (await studio.addSection('custom-section')).body.home.at(-1).id
    const url = `api/home/sections/${id}`
    const { blockTypes } = (await studio.send('GET', url)).body
    expect(blockTypes).toContainEqual({ type: 'badge', name: 'Badge' })
    expect(blockTypes).toContainEqual({ type: 'group', name: 'Group' })
    expect(blockTypes.every((block: { type: string }) => !block.type.startsWith('_') && !block.type.startsWith('@'))).toBe(true)
    expect((await studio.send('POST', `${url}/blocks`, { type: 'group' })).status).toBe(200)
    const { blocks, block_order } = readTemplate(theme).sections[id]
    expect(blocks[block_order.at(-1)]).toEqual({ type: 'group', settings: { layout_direction: 'group--vertical', alignment: 'flex-start', padding: 0 } })
    expect((await studio.send('POST', `${url}/blocks`, { type: 'badge' })).status).toBe(200)
    expect((await studio.send('POST', `${url}/blocks`, { type: 'badge' })).status).toBe(400)
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
