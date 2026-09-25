import { copyFileSync, existsSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseJSON } from '@shopify/theme-check-node'
import { projectDir, fixtureTheme, fixtureCatalog, openStudio, home, readTemplate, writeTemplate, errors } from './helpers/studio.js'

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
      {
        id: 'spacing',
        type: 'select',
        label: 'Section spacing',
        value: 'theme',
        options: [
          { value: 'none', label: 'None' },
          { value: 'tight', label: 'Tight' },
          { value: 'theme', label: 'Theme default' },
          { value: 'loose', label: 'Loose' },
        ],
      },
      { id: 'reveal', type: 'checkbox', label: 'Reveal on scroll', value: false },
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

  it("writes a section's spacing like any other option, and refuses one off its options", async () => {
    const { theme, studio, id } = await withTestimonials()
    expect((await studio.send('PATCH', `api/home/sections/${id}`, { settings: { spacing: 'tight' } })).status).toBe(200)
    expect(readTemplate(theme).sections[id].settings.spacing).toBe('tight')
    const { status, body } = await studio.send('PATCH', `api/home/sections/${id}`, { settings: { spacing: 'huge' } })
    expect(status).toBe(400)
    expect(body.error).toContain('spacing')
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
      { id: 'image_mobile', type: 'image_picker', label: 'Mobile image', set: false, value: null },
      { id: 'video', type: 'video', label: 'Video', set: false, value: null },
    ])
    expect(read.settings.map((setting: { id: string }) => setting.id)).not.toContain('image')
    const { blocks } = (await studio.send('GET', `api/home/sections/${gallery}`)).body
    expect(blocks[0].media).toEqual([{ id: 'image', type: 'image_picker', label: 'Image', set: false, value: null }])
  })

  it("writes and clears a section's image, with an empty value or null", async () => {
    const theme = fixtureTheme()
    const studio = await openStudio(theme, { catalog: realCatalog })
    const hero = (await studio.addSection('hero')).body.home.at(-1).id

    const placed = await studio.send('PATCH', `api/home/sections/${hero}`, { settings: { image: 'shopify://shop_images/cover.jpg' } })
    expect(placed.status).toBe(200)
    expect(readTemplate(theme).sections[hero].settings.image).toBe('shopify://shop_images/cover.jpg')
    const { body } = await studio.send('GET', `api/home/sections/${hero}`)
    expect(body.media[0]).toMatchObject({ id: 'image', set: true, value: 'shopify://shop_images/cover.jpg' })

    expect((await studio.send('PATCH', `api/home/sections/${hero}`, { settings: { image: '' } })).status).toBe(200)
    expect(readTemplate(theme).sections[hero].settings).not.toHaveProperty('image')
    await studio.send('PATCH', `api/home/sections/${hero}`, { settings: { image: 'shopify://shop_images/cover.jpg' } })
    expect((await studio.send('PATCH', `api/home/sections/${hero}`, { settings: { image: null } })).status).toBe(200)
    expect(readTemplate(theme).sections[hero].settings).not.toHaveProperty('image')
  })

  it("writes a block's image in one undo step", async () => {
    const theme = fixtureTheme()
    const studio = await openStudio(theme, { catalog: realCatalog })
    const gallery = (await studio.addSection('image-gallery')).body.home.at(-1).id
    const block = readTemplate(theme).sections[gallery].block_order[0]
    await studio.send('PATCH', `api/home/sections/${gallery}`, { settings: { heading: 'Lookbook' } })

    await studio.send('PATCH', `api/home/sections/${gallery}`, { blocks: { [block]: { image: 'shopify://shop_images/tile_1.webp' } } })
    expect(readTemplate(theme).sections[gallery].blocks[block].settings.image).toBe('shopify://shop_images/tile_1.webp')
    await studio.send('POST', 'api/undo')
    expect(readTemplate(theme).sections[gallery].blocks[block].settings).not.toHaveProperty('image')
    expect(readTemplate(theme).sections[gallery].settings.heading).toBe('Lookbook')
  })

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
