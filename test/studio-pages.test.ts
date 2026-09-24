import { copyFileSync, cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseJSON } from '@shopify/theme-check-node'
import { projectDir, fixtureTheme, pageNames, everyPage, fixtureCatalog, openStudio, home, readTemplate, catalogTypes, errors } from './helpers/studio.js'

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

  const realCatalog = path.join(projectDir, 'skills/shopify-theme-builder/catalog')
  const homeTypes = ['hero', 'featured-collection', 'featured-product', 'collection-list', 'slideshow', 'multicolumn', 'video', 'blog-posts', 'image-gallery', 'image-with-text', 'editorial-split', 'rich-text', 'type-banner', 'marquee', 'spec-tiles', 'lookbook', 'timeline', 'process-steps', 'comparison-table', 'press-quotes', 'logo-list', 'testimonials', 'faq', 'newsletter', 'custom-liquid']

  it('offers every real catalog home section', async () => {
    const studio = await openStudio(fixtureTheme(), { catalog: realCatalog })
    expect(catalogTypes(await studio.readTheme()).home).toEqual(homeTypes.toSorted())
  })

  // Five sections per test: each write runs Theme Check.
  it.each([0, 5, 10, 15, 20].map((start) => homeTypes.slice(start, start + 5)))(
    'adds the real catalog home sections %s, %s, %s, %s and %s with a color scheme and a clean Theme Check',
    async (...types) => {
      const studio = await openStudio(fixtureTheme(), { catalog: realCatalog })
      let body
      for (const type of types) ({ body } = await studio.addSection(type))
      expect(body.home.slice(1)).toEqual(types.map((type) => expect.objectContaining({ type, colorScheme: 'scheme-1' })))
      expect(errors(body.validation)).toEqual([])
    },
  )

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

  it('copies the Base Theme blocks the main product takes into a Theme that lacks them, and offers them to add', async () => {
    const theme = fixtureTheme()
    rmSync(path.join(theme, 'blocks/custom-liquid.liquid'))
    const studio = await openStudio(theme, { catalog: path.join(projectDir, 'skills/shopify-theme-builder/catalog') })
    const { body } = await studio.addSection('main-product', 'product')
    expect(existsSync(path.join(theme, 'blocks/custom-liquid.liquid'))).toBe(true)
    expect(errors(body.validation)).toEqual([])
    const id = body.product.find((section: { type: string }) => section.type === 'main-product').id
    expect((await studio.send('GET', `api/product/sections/${id}`)).body).toMatchObject({ blockTypes: expect.arrayContaining([{ type: 'custom-liquid', name: 'Custom Liquid' }]) })
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

  it.each(Object.entries(mains))('composes the %s page from its catalog main section %s with a clean Theme Check', async (page, type) => {
    const theme = fixtureTheme()
    const studio = await openStudio(theme, { catalog: realCatalog })
    expect((await studio.addSection(type, page)).status).toBe(200)
    if (page !== 'contact') expect((await studio.removeSection('main', page)).status).toBe(200)
    // The main section shows once per page.
    expect((await studio.addSection(type, page)).status).toBe(400)
    const state = await studio.readTheme()
    expect(state[page].map((section: { type: string }) => section.type)).toEqual(page === 'contact' ? ['page', 'contact-form'] : [type])
    expect(errors(state.validation)).toEqual([])
    if (page === 'collections') expect(readTemplate(theme, 'templates/list-collections.json').order).toHaveLength(1)
  })
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
