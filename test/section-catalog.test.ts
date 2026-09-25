import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseJSON } from '@shopify/theme-check-node'
import { starterFiles } from '../skills/shopify-theme-builder/studio/server/create-theme.mjs'

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
  }, 60_000)

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
  }, 60_000)
})

describe('App blocks', () => {
  it('lets apps add blocks to the main product info column', () => {
    const source = readFileSync(path.join(projectDir, 'skills/shopify-theme-builder/catalog/sections/main-product.liquid'), 'utf8')
    const schema = JSON.parse(source.match(/{% schema %}([\s\S]*){% endschema %}/)![1])
    expect(schema.blocks).toContainEqual({ type: '@app' })
    const details = source.slice(source.indexOf('class="main-product__details"'), source.indexOf('</product-info>'))
    expect(details).toContain("{% content_for 'blocks' %}")
  })
})

describe('Custom Liquid', () => {
  const skillDir = path.join(projectDir, 'skills/shopify-theme-builder')
  const parse = (source: string) => JSON.parse(source.match(/{% schema %}([\s\S]*){% endschema %}/)![1])
  const liquidSetting = { type: 'liquid', id: 'custom_liquid', label: 't:labels.liquid', info: 't:info.custom_liquid_setting' }

  it('is a catalog section with a Liquid setting, a color scheme and a preset', () => {
    const source = readFileSync(path.join(skillDir, 'catalog/sections/custom-liquid.liquid'), 'utf8')
    const schema = parse(source)
    expect(source).toMatch(/^{% comment %}.+{% endcomment %}\n/)
    expect(source).toContain('class="custom-liquid full-width color-{{ section.settings.color_scheme }}"')
    expect(source).toContain('{{ section.settings.custom_liquid }}')
    expect(schema.settings).toContainEqual(liquidSetting)
    expect(schema.settings).toContainEqual({ type: 'color_scheme', id: 'color_scheme', label: 't:labels.color_scheme', default: 'scheme-1' })
    expect(schema.presets).toEqual([{ name: 't:general.custom_liquid' }])
  })

  it('is a Base Theme block, so every Theme has it, that the main product takes', () => {
    const source = readFileSync(path.join(skillDir, 'base-theme/blocks/custom-liquid.liquid'), 'utf8')
    const schema = parse(source)
    expect(source).toContain('{{ block.shopify_attributes }}')
    expect(source).toContain('{{ block.settings.custom_liquid }}')
    expect(schema.settings).toEqual([liquidSetting])
    expect(schema.presets).toEqual([{ name: 't:general.custom_liquid' }])
    const mainProduct = parse(readFileSync(path.join(skillDir, 'catalog/sections/main-product.liquid'), 'utf8'))
    expect(mainProduct.blocks).toContainEqual({ type: 'custom-liquid' })
  })
})

describe('Contact page', () => {
  const skillDir = path.join(projectDir, 'skills/shopify-theme-builder')

  const form = readFileSync(path.join(skillDir, 'catalog/sections/contact-form.liquid'), 'utf8')
  const schema = JSON.parse(form.match(/{% schema %}([\s\S]*){% endschema %}/)![1])

  it('ships a page.contact template with the contact form alone, so the page shows one title', () => {
    const { sections, order } = parseJSON(readFileSync(path.join(skillDir, 'catalog/templates/page.contact.json'), 'utf8'))
    expect(order.map((id: string) => sections[id].type)).toEqual(['contact-form'])
    expect(form).toContain("{% form 'contact'")
    expect(form).toContain('form.posted_successfully?')
    expect(form).toContain('form.errors')
  })

  it("titles the form with the page's title, unless the heading overrides it, and shows the page's content as an intro", () => {
    expect(form).toContain('<h1>{{ section.settings.heading | default: page.title }}</h1>')
    expect(schema.settings).toContainEqual({ type: 'inline_richtext', id: 'heading', label: 't:labels.heading', info: 't:info.contact_form_heading' })
    expect(form).toMatch(/{% if page\.content != blank %}\s*<div class="contact-form__intro-text rte">{{ page\.content }}<\/div>/)
  })

  it('lays out as centered, split with contact details, or beside an image, each a named preset', () => {
    expect(schema.settings).toContainEqual({
      type: 'select',
      id: 'layout',
      label: 't:labels.layout',
      options: [
        { value: 'centered', label: 't:options.layout.centered' },
        { value: 'details', label: 't:options.layout.details' },
        { value: 'image', label: 't:options.layout.image' },
      ],
      default: 'centered',
    })
    expect(schema.settings).toContainEqual({ type: 'richtext', id: 'details', label: 't:labels.contact_details', info: 't:info.contact_form_details' })
    expect(schema.settings).toContainEqual({ type: 'image_picker', id: 'image', label: 't:labels.image' })
    expect(form).toContain('<div class="contact-form__details rte">{{ section.settings.details }}</div>')
    expect(form).toContain("{{ 'image' | placeholder_svg_tag: 'placeholder contact-form__placeholder' }}")
    expect(form).toContain('contact-form--{{ section.settings.layout }}')
    expect(schema.presets).toEqual([
      { name: 't:general.contact_form' },
      { name: 't:general.contact_form_split', settings: { layout: 'details' } },
      { name: 't:general.contact_form_image', settings: { layout: 'image' } },
    ])
  })

  it('centers the default layout in a narrow column and puts the split and image layouts side by side on desktop only', () => {
    const css = form.match(/{% stylesheet %}([\s\S]*?){% endstylesheet %}/)![1]
    expect(css).toMatch(/\.contact-form--centered \.contact-form__inner {[^}]*max-width: var\(--width-narrow\);/)
    expect(css).toMatch(/\.contact-form--centered \.contact-form__intro {[^}]*text-align: center;/)
    const desktop = css.slice(css.indexOf('@media (min-width: 750px) {'))
    expect(desktop).toMatch(/\.contact-form--details \.contact-form__inner,\s*\.contact-form--image \.contact-form__inner {[^}]*grid-template-columns: 1fr 1fr;/)
  })

  it("keeps the links in the page's text and the contact details in the accent color", () => {
    const critical = readFileSync(path.join(skillDir, 'base-theme/assets/critical.css'), 'utf8')
    expect(critical).toContain('.basic-page a:not(.button, .button--secondary, .rte a) {')
  })

  it('leaves the generic page its title and content in one centered column of running text', () => {
    const page = readFileSync(path.join(skillDir, 'base-theme/sections/page.liquid'), 'utf8')
    expect(page).toMatch(/<div class="page__column">\s*<h1>{{ page\.title }}<\/h1>\s*{% if page\.content != blank %}/)
    expect(page).toMatch(/\.page__column {[^}]*justify-self: center;[^}]*max-width: var\(--width-prose\);/)
  })

  it('is copied into every new Theme by the skill', () => {
    expect(starterFiles).toContain('sections/contact-form.liquid')
    expect(starterFiles).toContain('templates/page.contact.json')
  })
})

describe('Cart page', () => {
  const skillDir = path.join(projectDir, 'skills/shopify-theme-builder')
  const source = readFileSync(path.join(skillDir, 'catalog/sections/main-cart.liquid'), 'utf8')
  const schema = JSON.parse(source.match(/{% schema %}([\s\S]*){% endschema %}/)![1])

  it('ships a cart template with the main cart, only for cart templates', () => {
    const { sections, order } = parseJSON(readFileSync(path.join(skillDir, 'catalog/templates/cart.json'), 'utf8'))
    expect(order.map((id: string) => sections[id].type)).toEqual(['main-cart'])
    expect(schema.enabled_on).toEqual({ templates: ['cart'] })
    expect(schema.limit).toBe(1)
  })

  it('shows accelerated checkout buttons, an optional note, discounts, unit prices and an empty state', () => {
    expect(source).toMatch(/{%-? if additional_checkout_buttons[^%]*%}\s*<div[^>]*>\s*{{ content_for_additional_checkout_buttons }}/)
    expect(schema.settings).toContainEqual(expect.objectContaining({ id: 'show_additional_checkout_buttons', default: true }))
    expect(source).toContain('name="note"')
    expect(source).toContain('section.settings.show_note')
    expect(schema.settings).toContainEqual(expect.objectContaining({ id: 'show_note', type: 'checkbox' }))
    expect(source).toContain('item.line_level_discount_allocations')
    expect(source).toContain('cart.cart_level_discount_applications')
    expect(source).toContain('item.unit_price_measurement')
    expect(source).toContain('routes.all_products_collection_url')
  })

  it('updates quantities and removes lines on the cart page through /cart/change.js, with the Update button only without JavaScript', () => {
    expect(source).toMatch(/<noscript>\s*<button type="submit" name="update" form="CartForm-{{ section\.id }}" class="button--secondary">{{ 'cart\.update' \| t }}<\/button>\s*<\/noscript>/)
    expect(source).toMatch(/<div class="main-cart [^"]*"[^>]*data-section-id="{{ section\.id }}"[^>]*data-change-url="{{ routes\.cart_change_url }}"/)
    const script = source.match(/{% javascript %}([\s\S]*){% endjavascript %}/)![1]
    // The drawer changes its own copy of the cart.
    expect(script).toContain("target.closest('cart-drawer') ? null : target.closest('.main-cart')")
    expect(script).toContain('fetch(`${cart.dataset.changeUrl}.js`')
    expect(script).toMatch(/JSON\.stringify\({ line: Number\(line\), quantity: Number\(quantity\), sections: /)
    expect(script).toContain('cart.replaceWith(next)')
    // Enter in a quantity field changes it instead of submitting the form to checkout.
    expect(script).toMatch(/event\.key !== 'Enter'[\s\S]*event\.preventDefault\(\);\s*changeLine\(/)
    // Without a response it falls back to Shopify's own /cart/change.
    expect(script).toContain('location.assign(`${cart.dataset.changeUrl}?line=${line}&quantity=${quantity}`)')
    expect(source).toMatch(/<p class="main-cart__error" role="alert" hidden><\/p>/)
  })

  const settings = Object.fromEntries(schema.settings.map((setting: { id?: string }) => [setting.id, setting]))
  const css = source.match(/{% stylesheet %}([\s\S]*){% endstylesheet %}/)![1]
  const desktop = css.match(/@media \(min-width: 750px\) {([\s\S]*?)\n  }/)![1]

  it('lays the cart out stacked by default, or with the items beside a sticky summary', () => {
    expect(source).toContain('class="main-cart main-cart--{{ section.settings.layout }} basic-page full-width color-{{ section.settings.color_scheme }}"')
    expect(settings.layout).toMatchObject({ type: 'select', label: 't:labels.layout', default: 'stacked' })
    expect(values(settings.layout)).toEqual(['stacked', 'summary_sidebar'])
    // The summary holds the discounts, free shipping, subtotal, tax note, note, checkout and accelerated checkout buttons.
    const summary = source.slice(source.indexOf('<div class="main-cart__footer">'), source.indexOf('{% else %}\n    <p>{{ \'cart.empty\''))
    for (const part of ['main-cart__note', 'main-cart__shipping', 'main-cart__subtotal', "render 'tax-note'", 'name="checkout"', 'content_for_additional_checkout_buttons']) {
      expect(summary).toContain(part)
    }
    expect(desktop).toMatch(/\.main-cart--summary_sidebar \.main-cart__layout {\s*grid-template-columns: minmax\(0, 2fr\) minmax\(0, 1fr\);/)
    expect(desktop).toMatch(
      /\.main-cart--summary_sidebar \.main-cart__footer {\s*position: sticky;\s*inset-block-start: calc\(var\(--header-offset, 0px\) \+ var\(--space-xl\)\);/,
    )
    expect(css).toMatch(/\.main-cart--summary_sidebar \.main-cart__footer {[^}]*border: var\(--border-width\) solid var\(--color-border\);[^}]*border-radius: var\(--style-border-radius-cards\);/)
  })

  it('keeps the note and the buttons outside the items form in its form, and the accelerated checkout buttons out of any form', () => {
    expect(source).toContain('<form action="{{ routes.cart_url }}" method="post" id="CartForm-{{ section.id }}" class="main-cart__form">')
    const form = source.slice(source.indexOf('<form action="{{ routes.cart_url }}"'), source.indexOf('</form>'))
    expect(form).not.toContain('content_for_additional_checkout_buttons')
    expect(source).toMatch(/<textarea id="CartNote-{{ section\.id }}" name="note" form="CartForm-{{ section\.id }}"/)
    expect(source).toContain('<button type="submit" name="checkout" form="CartForm-{{ section.id }}" class="button">')
  })

  it('offers the summary sidebar layout as a named preset', () => {
    // A Theme made before the layouts keeps its look: the first preset sets no layout.
    expect(schema.presets).toEqual([{ name: 't:general.main_cart' }, { name: 't:general.main_cart_summary_sidebar', settings: { layout: 'summary_sidebar' } }])
  })

  it('announces the updated subtotal on the cart page from a status region the re-render keeps', () => {
    const cart = source.slice(0, source.indexOf('{% javascript %}'))
    const status = cart.indexOf('<p id="CartStatus-{{ section.id }}" class="visually-hidden" role="status"></p>')
    expect(status).toBeGreaterThan(cart.lastIndexOf('</div>'))
    expect(source).toContain('status.textContent = next.dataset.status')
  })

  it('suggests products from a collection when the cart is empty, from all products by default', () => {
    expect(schema.settings).toContainEqual({ type: 'collection', id: 'empty_collection', label: 't:labels.empty_cart_collection', info: 't:info.main_cart_empty_collection' })
    expect(schema.settings).toContainEqual({ type: 'text', id: 'empty_heading', label: 't:labels.empty_cart_heading', default: 'You might like' })
    const empty = source.slice(source.indexOf("<p>{{ 'cart.empty' | t }}</p>"))
    expect(empty).toMatch(/assign suggestion = section\.settings\.empty_collection\s+if suggestion == blank\s+assign suggestion = collections\.all\s+endif/)
    expect(empty).toContain('{% for product in suggestion.products limit: 4 %}')
    expect(empty).toContain("{% render 'product-card', product: product %}")
    expect(empty).toMatch(/<h2 class="main-cart__suggestions-title text-h4">{{ section\.settings\.empty_heading \| escape }}<\/h2>/)
    // The drawer keeps its empty state short.
    expect(readFileSync(path.join(skillDir, 'catalog/sections/header.liquid'), 'utf8')).toMatch(/\.header__cart-content \.main-cart__suggestions {\s*display: none;/)
  })

  it('has a free-shipping threshold theme setting, a number in the shop currency, off when blank', () => {
    const groups = parseJSON(readFileSync(path.join(skillDir, 'base-theme/config/settings_schema.json'), 'utf8'))
    const cart = groups.find((group: { name: string }) => group.name === 't:general.cart')
    const locale = JSON.parse(readFileSync(path.join(skillDir, 'base-theme/locales/en.default.schema.json'), 'utf8'))
    expect(cart.settings).toContainEqual({
      type: 'number',
      id: 'free_shipping_threshold',
      label: 't:labels.free_shipping_threshold',
      info: 't:info.free_shipping_threshold',
    })
    expect(locale.labels.free_shipping_threshold).toBeTruthy()
    expect(locale.info.free_shipping_threshold).toBeTruthy()
  })

  it('shows how far the cart is from free shipping, or that it ships free, with a progress bar, in the drawer too', () => {
    const locale = JSON.parse(readFileSync(path.join(skillDir, 'base-theme/locales/en.default.json'), 'utf8'))
    expect(source).toMatch(/{%-? if settings\.free_shipping_threshold > 0 and cart\.currency\.iso_code == shop\.currency -?%}/)
    expect(source).toContain("'cart.free_shipping_remaining' | t: amount:")
    expect(source).toContain("'cart.free_shipping' | t")
    expect(source).toMatch(/<progress[^>]*max="{{ threshold }}"[^>]*value="{{ progress }}"/)
    expect(locale.cart.free_shipping_remaining).toBe('{{ amount }} to free shipping')
    expect(locale.cart.free_shipping).toBe('Free shipping')
    // The drawer shows the same section, so it shows the bar too.
    expect(readFileSync(path.join(skillDir, 'catalog/sections/header.liquid'), 'utf8')).toContain('?section_id=main-cart')
  })

  it('tells the agent to ask the buying facts up front and write only the confirmed ones', () => {
    const skill = readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8')
    const brief = readFileSync(path.join(skillDir, 'references/design/brief.md'), 'utf8')
    expect(skill).toMatch(/\*\*Buying facts\*\*/)
    expect(skill).toContain('"free_shipping_threshold": 60')
    expect(brief).toContain('## Buying facts')
    expect(readFileSync(path.join(skillDir, 'references/design/review.md'), 'utf8')).toContain('| `default-text` |')
  })

  it('is copied into every new Theme by the skill', () => {
    expect(starterFiles).toContain('sections/main-cart.liquid')
    expect(starterFiles).toContain('templates/cart.json')
  })
})

describe('Cart drawer', () => {
  const skillDir = path.join(projectDir, 'skills/shopify-theme-builder')
  const read = (file: string) => readFileSync(path.join(skillDir, file), 'utf8')

  it('has a Cart type theme setting, drawer or page, drawer by default', () => {
    const groups = parseJSON(read('base-theme/config/settings_schema.json'))
    const all = groups.flatMap((group: { settings?: object[] }) => group.settings ?? [])
    expect(all).toContainEqual({
      type: 'select',
      id: 'cart_type',
      label: 't:labels.cart_type',
      options: [
        { value: 'drawer', label: 't:options.cart_type.drawer' },
        { value: 'page', label: 't:options.cart_type.page' },
      ],
      default: 'drawer',
    })
  })

  it('puts a dialog drawer holding the rendered main-cart around the header cart link, only with the drawer cart type', () => {
    const header = read('catalog/sections/header.liquid')
    const locale = JSON.parse(read('base-theme/locales/en.default.json'))
    expect(header).toMatch(/{%-? if settings\.cart_type == 'drawer' and template\.name != 'cart' -?%}\s*<cart-drawer/)
    const drawer = header.slice(header.indexOf('<cart-drawer'), header.indexOf('</cart-drawer>'))
    expect(drawer).toContain('{{ cart_link }}')
    expect(drawer).toMatch(/<dialog[^>]*aria-label="{{ 'cart\.title' \| t }}"/)
    expect(drawer).toMatch(/<form method="dialog">\s*<button[^>]*aria-label="{{ 'header\.close_cart' \| t }}"/)
    expect(drawer).toContain('data-sections="main-cart,{{ section.id }}"')
    expect(locale.header.close_cart).toBeTruthy()
    // The header cart link still goes to /cart without JavaScript or with the page cart type.
    expect(header).toMatch(/{% else %}\s*{{ cart_link }}/)
    expect(header).toMatch(/<a class="header__cart" href="{{ routes\.cart_url }}"/)
  })

  it('opens from the header cart link with the main-cart section, and returns focus on close', () => {
    const header = read('catalog/sections/header.liquid')
    expect(header).toContain('?section_id=main-cart')
    expect(header).toContain(".closest('.header__cart')")
    expect(header).toContain('this.dialog.showModal()')
    expect(header).toMatch(/addEventListener\(\s*'close'/)
    expect(header).toContain("customElements.define('cart-drawer'")
  })

  it('changes quantities and removes lines through /cart/change.js, then re-renders the drawer and the cart count', () => {
    const header = read('catalog/sections/header.liquid')
    const cart = read('catalog/sections/main-cart.liquid')
    expect(header).toContain('data-change-url="{{ routes.cart_change_url }}.js"')
    expect(header).toContain('sections: this.dataset.sections')
    expect(header).toContain("querySelector('.header__cart').replaceWith(")
    expect(cart).toMatch(/<input[^>]*\stype="number"\s+name="updates\[\]"[^>]*data-line="{{ forloop\.index }}"/)
    expect(cart).toMatch(/href="{{ item\.url_to_remove }}"\s+data-line="{{ forloop\.index }}"/)
  })

  it('announces "Cart updated" with the subtotal in a status region inside the drawer after an add or a change', () => {
    const header = read('catalog/sections/header.liquid')
    const cart = read('catalog/sections/main-cart.liquid')
    const locale = JSON.parse(read('base-theme/locales/en.default.json'))
    const dialog = header.slice(header.indexOf('<dialog class="header__drawer header__drawer--cart"'), header.indexOf('</cart-drawer>'))
    expect(dialog).toMatch(/<p class="header__cart-status visually-hidden" role="status"><\/p>/)
    expect(locale.cart.updated).toBe('Cart updated, subtotal {{ subtotal }}')
    expect(cart).toMatch(/assign subtotal = cart\.total_price \| money_with_currency \| strip_html/)
    expect(cart).toMatch(/<div class="main-cart [^"]*"[^>]*data-status="{{ 'cart\.updated' \| t: subtotal: subtotal }}"/)
    expect(header).toContain('this.render(json.sections, true)')
    expect(header).toContain('this.render((await response.json()).sections, true)')
    expect(header).toContain("status.textContent = cart.dataset.status")
  })

  it.each(['main-product', 'featured-product'])('adds from %s through /cart/add.js and opens the drawer, or posts to /cart without one', (name) => {
    const header = read('catalog/sections/header.liquid')
    const source = read(`catalog/sections/${name}.liquid`)
    expect(name === 'main-product' ? read('base-theme/blocks/_buy-buttons.liquid') : source).toContain("{% form 'product', product")
    expect(source).toMatch(/const drawer = document\.querySelector\('cart-drawer'\);\s*if \(!drawer\?\.add\) return;\s*event\.preventDefault\(\);\s*drawer\.add\(event\.target, event\.submitter\)/)
    expect(header).toContain('data-add-url="{{ routes.cart_add_url }}.js"')
    expect(header).toContain("body.append('sections', this.dataset.sections)")
    // A failed add falls back to the plain form post, which shows Shopify's error page.
    expect(header).toContain('return form.submit()')
  })
})

describe('Search page', () => {
  const skillDir = path.join(projectDir, 'skills/shopify-theme-builder')
  const source = readFileSync(path.join(skillDir, 'catalog/sections/main-search.liquid'), 'utf8')
  const schema = JSON.parse(source.match(/{% schema %}([\s\S]*){% endschema %}/)![1])

  it('ships a search template with the main search, only for search templates', () => {
    const { sections, order } = parseJSON(readFileSync(path.join(skillDir, 'catalog/templates/search.json'), 'utf8'))
    expect(order.map((id: string) => sections[id].type)).toEqual(['main-search'])
    expect(schema.enabled_on).toEqual({ templates: ['search'] })
    expect(schema.limit).toBe(1)
  })

  it('filters and sorts the results, keeping the search terms', () => {
    expect(source).toContain('{% for filter in search.filters %}')
    expect(source).toContain('filter_value.param_name')
    expect(source).toContain('url_to_remove')
    expect(source).toContain('{% for option in search.sort_options %}')
    expect(source).toMatch(/<input type="hidden" name="q" value="{{ search.terms \| escape }}">/)
    expect(schema.settings).toContainEqual(expect.objectContaining({ id: 'enable_filtering', type: 'checkbox' }))
    expect(schema.settings).toContainEqual(expect.objectContaining({ id: 'enable_sorting', type: 'checkbox' }))
  })

  it('shows products, articles and pages', () => {
    for (const type of ['product', 'article', 'page']) expect(source).toContain(`{% when '${type}' %}`)
    expect(source).toContain('{% case result.object_type %}')
  })

  it('with no results and no filters applied, suggests the chosen collection (or a list of collections) under a heading, with search tips', () => {
    const locale = JSON.parse(readFileSync(path.join(skillDir, 'base-theme/locales/en.default.json'), 'utf8'))
    expect(schema.settings).toContainEqual(expect.objectContaining({ id: 'no_results_collection', type: 'collection' }))
    expect(schema.settings).toContainEqual(expect.objectContaining({ id: 'no_results_heading', type: 'text' }))
    const empty = source.slice(source.indexOf('{% if search.results_count == 0 and active_filters == blank %}'))
    expect(empty).not.toBe(source)
    expect(empty).toContain('{{ section.settings.no_results_heading | escape }}')
    expect(empty).toContain("{% for product in suggestion.products limit: section.settings.columns %}")
    expect(empty).toContain("{% render 'product-card', product: product,")
    expect(empty).toContain('{% for collection in collections limit: 12 %}')
    expect(empty).toContain("{{ 'search.tips_title' | t }}")
    expect(Object.keys(locale.search.tips)).toEqual(['spelling', 'fewer_words', 'other_words'])
  })

  it('is copied into every new Theme by the skill', () => {
    expect(starterFiles).toContain('sections/main-search.liquid')
    expect(starterFiles).toContain('templates/search.json')
  })
})

describe('Collection and search results', () => {
  const skillDir = path.join(projectDir, 'skills/shopify-theme-builder')
  const locale = JSON.parse(readFileSync(path.join(skillDir, 'base-theme/locales/en.default.json'), 'utf8'))

  for (const name of ['main-collection', 'main-search']) {
    const source = readFileSync(path.join(skillDir, `catalog/sections/${name}.liquid`), 'utf8')

    it(`${name}: filters take several values, and applied ones show as removable chips with Clear all, scrolling sideways on mobile`, () => {
      expect(source).toMatch(/type="checkbox"\s+name="{{ filter_value\.param_name }}"/)
      expect(source).toContain('<a href="{{ filter_value.url_to_remove }}">')
      expect(source).toContain('<a href="{{ filter.url_to_remove }}">')
      expect(source).toMatch(/<a href="{{ clear_url }}">{{ 'collection\.clear_all' \| t }}<\/a>/)
      expect(source).toMatch(new RegExp(`@media \\(max-width: 749px\\) {[^@]*\\.${name}__active {[^}]*flex-wrap: nowrap;[^}]*overflow-x: auto;`))
    })

    it(`${name}: loads the next page with a Load more link on mobile through the Section Rendering API, keeping page links without JavaScript`, () => {
      expect(source).toMatch(/<ul\s+class="[\w-]+__grid"\s+role="list"\s+data-load-more-grid/)
      expect(source).toMatch(/<load-more class="[\w-]+__more" data-section-id="{{ section\.id }}">/)
      expect(source).toMatch(
        /{% if paginate\.next %}\s*<a class="button button--secondary [\w-]+__load-more" href="{{ paginate\.next\.url }}" data-load-more>/,
      )
      expect(source).toContain("{{- 'collection.load_more' | t -}}")
      expect(source).toContain('{{ paginate | default_pagination }}')
      // Without JavaScript the element never upgrades: the page links show and the Load more link doesn't.
      expect(source).toMatch(new RegExp(`\\.${name}__load-more {\\s*display: none;`))
      expect(source).toMatch(/@media \(max-width: 749px\) {[^@]*load-more:defined [^{]*__load-more {\s*display: flex;/)
      expect(source).toContain("url.searchParams.set('section_id', this.dataset.sectionId)")
      expect(source).toContain('grid.append(...items)')
      expect(source).toContain("customElements.define('load-more'")
    })

    it(`${name}: below 750px, one Filter and sort button opens the filters in a drawer that closes with a Show N results button`, () => {
      expect(source).toMatch(/<button\s+type="button"\s+class="button button--secondary [\w-]+__open"\s+aria-haspopup="dialog"\s+data-facets-open\s*>\s*{{ 'collection\.filter_and_sort' \| t }}/)
      expect(source).toMatch(/<dialog class="[\w-]+__drawer" aria-labelledby="[^"]+">\s*<form/)
      // The drawer is modal, so the page's status line is inert behind it: the Show N results button announces the count there.
      expect(source).toMatch(
        /<\/form>\s*<div class="[\w-]+__drawer-footer" role="status">\s*<button type="button" class="button [\w-]+__show" data-facets-close>\s*<span data-facets-part="show">{{ 'collection\.show_results' \| t: count: /,
      )
      expect(locale.collection.filter_and_sort).toBe('Filter and sort')
      expect(locale.collection.show_results).toEqual({ one: 'Show {{ count }} result', other: 'Show {{ count }} results' })
      expect(source).toContain('this.dialog.showModal()')
      // The drawer only takes over on a phone once the script runs: on desktop, or without JavaScript, the filters stay in the page.
      expect(source).toMatch(new RegExp(`@media \\(max-width: 749px\\) {[^@]*facet-filters:defined \\.${name}__drawer:not\\(\\[open\\]\\) {\\s*display: none;`))
      expect(source).toMatch(new RegExp(`\\.${name}__drawer {\\s*display: block;\\s*position: static;`))
    })

    it(`${name}: results update through the Section Rendering API, updating the URL, keeping focus and announcing the count`, () => {
      expect(source).toMatch(/<facet-filters class="[\w-]+__results" data-section-id="{{ section\.id }}">/)
      expect(source).toMatch(/<p class="[\w-]+__count" role="status" tabindex="-1" data-facets-part="count">/)
      expect(source).toContain("fetchUrl.searchParams.set('section_id', this.dataset.sectionId)")
      expect(source).toContain("history.replaceState(null, '', url)")
      expect(source).toContain('target?.focus()')
      expect(source).toContain("customElements.define('facet-filters'")
      expect(source).not.toContain('requestSubmit')
    })

    it(`${name}: without JavaScript the filter form submits with a visible Apply button`, () => {
      expect(source).toMatch(/<button type="submit" class="button [\w-]+__apply">{{ 'collection\.apply' \| t }}<\/button>/)
      expect(source).toMatch(new RegExp(`facet-filters:defined \\.${name}__apply {\\s*display: none;`))
    })
  }

  it('main-collection shows how many products match above the grid', () => {
    const source = readFileSync(path.join(skillDir, 'catalog/sections/main-collection.liquid'), 'utf8')
    expect(source).toContain("{{ 'collection.product_count' | t: count: collection.products_count }}")
    expect(locale.collection.product_count).toEqual({ one: '{{ count }} product', other: '{{ count }} products' })
    expect(source.indexOf("'collection.product_count'")).toBeLessThan(source.indexOf('data-load-more-grid'))
  })

  it('labels the Load more link', () => {
    expect(locale.collection.load_more).toBe('Load more')
  })
})

describe('Blog page', () => {
  const skillDir = path.join(projectDir, 'skills/shopify-theme-builder')
  const source = readFileSync(path.join(skillDir, 'catalog/sections/main-blog.liquid'), 'utf8')
  const schema = JSON.parse(source.match(/{% schema %}([\s\S]*){% endschema %}/)![1])

  it('ships a blog template with the main blog, a catalog section only for blog templates', () => {
    const { sections, order } = parseJSON(readFileSync(path.join(skillDir, 'catalog/templates/blog.json'), 'utf8'))
    expect(order.map((id: string) => sections[id].type)).toEqual(['main-blog'])
    expect(schema.enabled_on).toEqual({ templates: ['blog'] })
    expect(schema.limit).toBe(1)
    expect(source).toMatch(/^{% comment %}.+{% endcomment %}\n/)
    expect(source).toContain('color-{{ section.settings.color_scheme }}')
    expect(schema.settings).toContainEqual({ type: 'color_scheme', id: 'color_scheme', label: 't:labels.color_scheme', default: 'scheme-1' })
    expect(schema.presets[0]).toEqual({ name: 't:general.main_blog' })
  })

  it('shows the articles as cards with image, title, date, excerpt and the author as a setting, paginated', () => {
    expect(source).toContain('{{ blog.title | escape }}')
    expect(source).toContain('{% paginate blog.articles by section.settings.articles_per_page %}')
    expect(source).toContain('article.image')
    expect(source).toContain("'image' | placeholder_svg_tag")
    expect(source).toContain("article.published_at | time_tag: format: 'date'")
    expect(source).toContain('article.excerpt_or_content')
    expect(source).toContain('{% if section.settings.show_author %}')
    expect(source).toContain('paginate | default_pagination')
    expect(schema.settings).toContainEqual(expect.objectContaining({ id: 'show_author', type: 'checkbox' }))
  })

  it('links to the articles of each tag', () => {
    expect(source).toContain('{% for tag in blog.all_tags %}')
    expect(source).toContain('current_tags contains tag')
    expect(source).toContain('{{ blog.url }}/tagged/{{ tag | handle }}')
  })

  const settings = Object.fromEntries(schema.settings.map((setting: { id?: string }) => [setting.id, setting]))
  const css = source.match(/{% stylesheet %}([\s\S]*){% endstylesheet %}/)![1]
  const desktop = css.match(/@media \(min-width: 750px\) {([\s\S]*?)\n  }/)![1]

  it('lays the articles out as a grid by default, a list or the latest article first', () => {
    expect(source).toContain('class="main-blog main-blog--{{ section.settings.layout }} full-width color-{{ section.settings.color_scheme }}"')
    expect(settings.layout).toMatchObject({ type: 'select', label: 't:labels.layout', default: 'grid' })
    expect(values(settings.layout)).toEqual(['grid', 'list', 'featured_first'])
    expect(settings.columns).toMatchObject({ visible_if: "{{ section.settings.layout != 'list' }}" })
  })

  it('lists one article a row with a small image beside its date, title and excerpt', () => {
    expect(css).toMatch(/\.main-blog--list \.main-blog__card {[^}]*display: grid;[^}]*grid-template-columns: 6rem 1fr;/)
    expect(desktop).toMatch(/\.main-blog--list \.main-blog__grid {\s*grid-template-columns: 1fr;/)
    expect(desktop).toMatch(/\.main-blog--list \.main-blog__card {[^}]*grid-template-columns: 12rem 1fr;/)
    expect(css).toMatch(/\.main-blog--list \.main-blog__meta {\s*order: -1;/)
    expect(css).toMatch(/\.main-blog__image {[^}]*aspect-ratio: var\(--image-ratio\);/)
  })

  it('shows the latest article full width on the first page, then the grid, stacked on mobile', () => {
    expect(source).toMatch(/if layout == 'featured_first' and forloop\.first and paginate\.current_page == 1\s+assign featured = true/)
    expect(source).toContain('<li class="main-blog__card{% if featured %} main-blog__card--featured{% endif %}">')
    expect(desktop).toMatch(/\.main-blog--featured_first \.main-blog__card--featured {[^}]*grid-column: 1 \/ -1;[^}]*grid-template-columns: 3fr 2fr;/)
    expect(source).toContain("assign card_sizes = '(min-width: 750px) 60vw, 100vw'")
  })

  it('offers each other layout as a named preset', () => {
    // A Theme made before the layouts keeps its look: the first preset sets no layout.
    expect(schema.presets).toEqual([
      { name: 't:general.main_blog' },
      { name: 't:general.main_blog_list', settings: { layout: 'list' } },
      { name: 't:general.main_blog_featured_first', settings: { layout: 'featured_first' } },
    ])
  })

  it('is copied into every new Theme by the skill', () => {
    expect(starterFiles).toContain('sections/main-blog.liquid')
    expect(starterFiles).toContain('templates/blog.json')
  })
})

describe('Article page', () => {
  const skillDir = path.join(projectDir, 'skills/shopify-theme-builder')
  const source = readFileSync(path.join(skillDir, 'catalog/sections/main-article.liquid'), 'utf8')
  const schema = JSON.parse(source.match(/{% schema %}([\s\S]*){% endschema %}/)![1])

  it('ships an article template with the main article, a catalog section only for article templates', () => {
    const { sections, order } = parseJSON(readFileSync(path.join(skillDir, 'catalog/templates/article.json'), 'utf8'))
    expect(order.map((id: string) => sections[id].type)).toEqual(['main-article'])
    expect(schema.enabled_on).toEqual({ templates: ['article'] })
    expect(schema.limit).toBe(1)
    expect(source).toMatch(/^{% comment %}.+{% endcomment %}\n/)
    expect(source).toContain('color-{{ section.settings.color_scheme }}')
    expect(schema.settings).toContainEqual({ type: 'color_scheme', id: 'color_scheme', label: 't:labels.color_scheme', default: 'scheme-1' })
    expect(schema.presets).toEqual([{ name: 't:general.main_article' }])
  })

  it('shows the image, title, date, author, content and tags', () => {
    expect(source).toContain('article.image')
    expect(source).toContain("'image' | placeholder_svg_tag")
    expect(source).toContain('{{ article.title | escape }}')
    expect(source).toContain("article.published_at | time_tag: format: 'date'")
    expect(source).toContain('{% if section.settings.show_author %}')
    expect(source).toContain('{{ article.content }}')
    expect(source).toContain('{% for tag in article.tags %}')
    expect(source).toContain('{{ blog.url }}/tagged/{{ tag | handle }}')
  })

  it('shows paginated comments and a labelled comment form when the blog allows comments', () => {
    const comments = source.slice(source.indexOf('{% if blog.comments_enabled? %}'))
    expect(comments).toContain('{% paginate article.comments by')
    expect(comments).toContain("paginate | default_pagination: anchor: 'comments'")
    expect(comments).toContain("{% form 'new_comment', article")
    for (const field of ['author', 'email', 'body']) {
      expect(comments).toContain(`<label for="Comment-${field}-{{ section.id }}">`)
      expect(comments).toContain(`name="comment[${field}]" id="Comment-${field}-{{ section.id }}"`)
    }
  })

  it('is copied into every new Theme by the skill', () => {
    expect(starterFiles).toContain('sections/main-article.liquid')
    expect(starterFiles).toContain('templates/article.json')
  })
})

describe('404 page', () => {
  const skillDir = path.join(projectDir, 'skills/shopify-theme-builder')
  const source = readFileSync(path.join(skillDir, 'catalog/sections/main-404.liquid'), 'utf8')
  const schema = JSON.parse(source.match(/{% schema %}([\s\S]*){% endschema %}/)![1])

  it('ships a 404 template with the main 404, a catalog section only for 404 templates', () => {
    const { sections, order } = parseJSON(readFileSync(path.join(skillDir, 'catalog/templates/404.json'), 'utf8'))
    expect(order.map((id: string) => sections[id].type)).toEqual(['main-404'])
    expect(schema.enabled_on).toEqual({ templates: ['404'] })
    expect(schema.limit).toBe(1)
    expect(source).toMatch(/^{% comment %}.+{% endcomment %}\n/)
    expect(source).toContain('color-{{ section.settings.color_scheme }}')
    expect(schema.settings).toContainEqual({ type: 'color_scheme', id: 'color_scheme', label: 't:labels.color_scheme', default: 'scheme-1' })
    expect(schema.presets[0]).toEqual({ name: 't:general.main_404' })
  })

  const settings = Object.fromEntries(schema.settings.map((setting: { id?: string }) => [setting.id, setting]))
  const css = source.match(/{% stylesheet %}([\s\S]*){% endstylesheet %}/)![1]
  const desktop = css.match(/@media \(min-width: 750px\) {([\s\S]*?)\n  }/)![1]

  it('lays the page out centered by default, split with an image, with suggestions or beside a big number', () => {
    expect(source).toContain('class="main-404 main-404--{{ section.settings.layout }} basic-page full-width color-{{ section.settings.color_scheme }}"')
    expect(settings.layout).toMatchObject({ type: 'select', label: 't:labels.layout', default: 'centered' })
    expect(values(settings.layout)).toEqual(['centered', 'split', 'suggestions', 'big_number'])
    // The centered layouts center the message; the others align it to the start side.
    expect(css).toMatch(/\.main-404--centered \.main-404__message,\s*\.main-404--suggestions \.main-404__message {[^}]*align-items: center;[^}]*text-align: center;/)
  })

  it('puts an image in the image ratio box beside the message in the split layout, stacked on mobile', () => {
    expect(settings.image).toMatchObject({ type: 'image_picker', label: 't:labels.image', visible_if: "{{ section.settings.layout == 'split' }}" })
    expect(source).toMatch(/{% if layout == 'split' %}\s*<div class="main-404__media">/)
    expect(source).toContain("{{ 'image' | placeholder_svg_tag: 'placeholder main-404__placeholder' }}")
    expect(css).toMatch(/\.main-404__media {[^}]*aspect-ratio: var\(--image-ratio\);/)
    expect(desktop).toMatch(/\.main-404--split \.main-404__inner {\s*grid-template-columns: 1fr 1fr;/)
    expect(source).toContain("sizes: '(min-width: 750px) 50vw, 100vw'")
  })

  it("suggests four products of a collection under the message, or the shop's collections when none is set", () => {
    expect(settings.collection).toMatchObject({ type: 'collection', label: 't:labels.collection', info: 't:info.main_404_collection' })
    expect(settings.suggestions_heading).toMatchObject({ type: 'text', label: 't:labels.suggestions_heading', default: expect.any(String) })
    expect(source).toMatch(/{% if suggestion != blank and suggestion\.products_count > 0 %}[\s\S]*{% for product in suggestion\.products limit: 4 %}[\s\S]*{% elsif collections\.size > 0 %}/)
    expect(source).toContain("{% render 'product-card', product: product, collection: suggestion %}")
    expect(css).toMatch(/\.main-404__grid {[^}]*grid-template-columns: repeat\(2, 1fr\);[^}]*gap: var\(--grid-row-gap\) var\(--grid-gap\);/)
    expect(desktop).toMatch(/\.main-404__grid {\s*grid-template-columns: repeat\(4, 1fr\);/)
  })

  it('shows "404" in display type as the graphic, hidden from screen readers, beside the message on desktop', () => {
    expect(source).toMatch(/{% if layout == 'big_number' %}\s*<p class="main-404__number text-display" aria-hidden="true">404<\/p>/)
    expect(desktop).toMatch(/\.main-404--big_number \.main-404__inner {\s*grid-template-columns: auto 1fr;/)
  })

  it('offers each other layout as a named preset', () => {
    // A Theme made before the layouts keeps its look: the first preset sets no layout.
    expect(schema.presets).toEqual([
      { name: 't:general.main_404' },
      { name: 't:general.main_404_split', settings: { layout: 'split' } },
      { name: 't:general.main_404_suggestions', settings: { layout: 'suggestions' } },
      { name: 't:general.main_404_big_number', settings: { layout: 'big_number' } },
    ])
  })

  it('shows the heading and text the Creator writes, a search form and a link back to the shop', () => {
    expect(source).toContain('{{ section.settings.heading }}')
    expect(source).toContain('{{ section.settings.text }}')
    expect(schema.settings).toContainEqual(expect.objectContaining({ id: 'heading', default: expect.any(String) }))
    expect(schema.settings).toContainEqual(expect.objectContaining({ id: 'text', default: expect.any(String) }))
    expect(source).toContain('<form action="{{ routes.search_url }}" method="get" role="search"')
    expect(source).toContain('name="q"')
    expect(source).toContain('href="{{ routes.all_products_collection_url }}"')
  })

  it('is copied into every new Theme by the skill', () => {
    expect(starterFiles).toContain('sections/main-404.liquid')
    expect(starterFiles).toContain('templates/404.json')
  })
})

describe('Collections list page', () => {
  const skillDir = path.join(projectDir, 'skills/shopify-theme-builder')
  const source = readFileSync(path.join(skillDir, 'catalog/sections/main-list-collections.liquid'), 'utf8')
  const schema = JSON.parse(source.match(/{% schema %}([\s\S]*){% endschema %}/)![1])

  it('ships a list-collections template with the main collections list, a catalog section only for list-collections templates', () => {
    const { sections, order } = parseJSON(readFileSync(path.join(skillDir, 'catalog/templates/list-collections.json'), 'utf8'))
    expect(order.map((id: string) => sections[id].type)).toEqual(['main-list-collections'])
    expect(schema.enabled_on).toEqual({ templates: ['list-collections'] })
    expect(schema.limit).toBe(1)
    expect(source).toMatch(/^{% comment %}.+{% endcomment %}\n/)
    expect(source).toContain('color-{{ section.settings.color_scheme }}')
    expect(schema.settings).toContainEqual({ type: 'color_scheme', id: 'color_scheme', label: 't:labels.color_scheme', default: 'scheme-1' })
    expect(schema.presets).toEqual([{ name: 't:general.main_list_collections' }])
  })

  it('shows every collection as a card with image and title, sorted by a setting, paginated', () => {
    expect(source).toContain("assign sorted = collections | sort: 'published_at'")
    expect(source).toContain('{% paginate sorted by section.settings.collections_per_page %}')
    expect(source).toContain('collection.featured_image')
    expect(source).toContain("'collection-' | append: placeholder | placeholder_svg_tag")
    expect(source).toContain('{{ collection.title | escape }}')
    expect(source).toContain('paginate | default_pagination')
    const sort = schema.settings.find((setting: { id: string }) => setting.id === 'sort')
    expect(sort.options.map((option: { value: string }) => option.value)).toEqual(['alphabetical', 'date_reversed', 'date'])
  })

  it('is copied into every new Theme by the skill', () => {
    expect(starterFiles).toContain('sections/main-list-collections.liquid')
    expect(starterFiles).toContain('templates/list-collections.json')
  })
})

describe('Unit prices', () => {
  it('shows the variant unit price inside the product info, so it updates with the variant', () => {
    const info = readFileSync(path.join(projectDir, 'skills/shopify-theme-builder/base-theme/blocks/_product-price.liquid'), 'utf8')
    expect(info).toContain('{% if current_variant.unit_price_measurement %}')
    expect(info).toContain('current_variant.unit_price | unit_price_with_measurement: current_variant.unit_price_measurement')
    expect(info).toContain("'product.unit_price' | t")
  })

  it('shows the unit price on product cards', () => {
    const card = readFileSync(path.join(projectDir, 'skills/shopify-theme-builder/base-theme/snippets/product-card.liquid'), 'utf8')
    expect(card).toContain('{% assign unit_variant = product.selected_or_first_available_variant %}')
    expect(card).toContain('unit_variant.unit_price | unit_price_with_measurement: unit_variant.unit_price_measurement')
    expect(card).toContain("'product.unit_price' | t")
  })
})

describe('Product page shipping note and collapsible content', () => {
  const skillDir = path.join(projectDir, 'skills/shopify-theme-builder')
  const read = (file: string) => readFileSync(path.join(skillDir, file), 'utf8')
  const parse = (source: string) => JSON.parse(source.match(/{% schema %}([\s\S]*){% endschema %}/)![1])
  const mainProduct = read('catalog/sections/main-product.liquid')

  it('lets the Merchant place the title, price, variant picker, buy buttons, shipping note and collapsible content in any order, as theme blocks', () => {
    const schema = parse(mainProduct)
    // Private blocks: only the main product offers them, since they need the product page's product.
    const info = ['_product-title', '_product-price', '_variant-picker', '_buy-buttons', 'shipping-note', 'collapsible-content']
    expect(schema.blocks).toEqual(expect.arrayContaining(info.map((type) => ({ type }))))
    expect(schema.presets[0].blocks.map((block: { type: string }) => block.type)).toEqual([
      ...info,
      'collapsible-content',
      'collapsible-content',
      'collapsible-content',
    ])
    expect(schema.presets[0].blocks[5].settings).toMatchObject({ source: 'description' })
    for (const type of info.slice(0, 4)) {
      const block = read(`base-theme/blocks/${type}.liquid`)
      expect(block, type).toContain('{{ block.shopify_attributes }}')
      expect(parse(block).presets, type).toHaveLength(1)
    }
    // The info renders only through the blocks, in the Merchant's order.
    const details = mainProduct.slice(mainProduct.indexOf('class="main-product__details"'), mainProduct.indexOf('</product-info>'))
    expect(details.replace(/\s+/g, ' ')).toMatch(/^class="main-product__details"> {% content_for 'blocks' %} <\/div>/)
  })

  it('moves the vendor and dynamic checkout settings to the title and buy buttons blocks', () => {
    expect(parse(mainProduct).settings.map((setting: { id: string }) => setting.id)).toEqual(['color_scheme', 'image_ratio', 'gallery_layout', 'image_zoom', 'sticky_buy_bar', 'spacing'])
    expect(parse(read('base-theme/blocks/_product-title.liquid')).settings).toContainEqual({ type: 'checkbox', id: 'show_vendor', label: 't:labels.show_vendor', default: true })
    expect(parse(read('base-theme/blocks/_buy-buttons.liquid')).settings).toContainEqual({
      type: 'checkbox',
      id: 'show_dynamic_checkout',
      label: 't:labels.show_dynamic_checkout_buttons',
      default: true,
    })
  })

  it('shows the description only through a collapsible block, never as one fixed block of text', () => {
    expect(mainProduct).not.toContain('product.description')
  })

  it("summarises shipping and returns with links to the shop's policy pages", () => {
    const source = read('base-theme/blocks/shipping-note.liquid')
    const schema = parse(source)
    expect(source).toContain('{{ block.shopify_attributes }}')
    expect(source).toContain('{{ block.settings.text }}')
    for (const policy of ['shipping_policy', 'refund_policy']) {
      expect(source).toContain(`{% if shop.${policy} %}`)
      expect(source).toContain(`href="{{ shop.${policy}.url }}"`)
      expect(source).toContain(`{{ shop.${policy}.title | escape }}`)
    }
    expect(schema.settings).toContainEqual(expect.objectContaining({ type: 'richtext', id: 'text' }))
  })

  it("ships no example policy: the text is empty until the Creator's facts fill it", () => {
    const text = parse(read('base-theme/blocks/shipping-note.liquid')).settings.find((setting: { id: string }) => setting.id === 'text')
    expect(text).not.toHaveProperty('default')
  })

  it('shows the free-shipping threshold, only in the shop currency', () => {
    const source = read('base-theme/blocks/shipping-note.liquid')
    const locale = JSON.parse(read('base-theme/locales/en.default.json'))
    expect(source).toMatch(/{%-? if settings\.free_shipping_threshold > 0 and cart\.currency\.iso_code == shop\.currency -?%}/)
    expect(source).toContain("'product.free_shipping_over' | t: amount:")
    expect(locale.product.free_shipping_over).toBe('Free shipping on orders over {{ amount }}.')
  })

  it('collapses content in a native disclosure, open on desktop, never in tabs', () => {
    const source = read('base-theme/blocks/collapsible-content.liquid')
    const schema = parse(source)
    expect(source).toMatch(/<details[^>]*>\s*<summary[^>]*>/)
    expect(source).toContain('{{ block.settings.heading | escape }}')
    expect(source).not.toMatch(/role="tab/)
    expect(source).toContain("matchMedia('(min-width: 750px)')")
    const sourceSetting = schema.settings.find((setting: { id: string }) => setting.id === 'source')
    expect(sourceSetting.options.map((option: { value: string }) => option.value)).toEqual(['description', 'text'])
    expect(source).toContain('product.description')
    expect(source).toContain('block.settings.text')
    // Hidden from customers when it has nothing to show, like a product without a description.
    expect(source).toMatch(/{% if content != blank %}/)
  })

  it('ships its text blocks empty and says their text shows on every product, so per-product facts come from a metafield', () => {
    const text = parse(read('base-theme/blocks/collapsible-content.liquid')).settings.find((setting: { id: string }) => setting.id === 'text')
    expect(text).not.toHaveProperty('default')
    expect(text.info).toBe('t:info.collapsible_content_text')
    expect(JSON.parse(read('base-theme/locales/en.default.schema.json')).info.collapsible_content_text).toMatch(/every product[\s\S]*metafield/)
    for (const preset of parse(mainProduct).presets) {
      for (const block of preset.blocks.filter((block: { type: string }) => block.type === 'collapsible-content')) {
        expect(block.settings ?? {}).not.toHaveProperty('text')
      }
    }
  })

  it('tells the agent to write only shop-wide facts on the product template, and the Creator how to connect per-product facts', () => {
    const skill = read('SKILL.md')
    const write = skill.match(/^6\. Write the text of every section[^\n]*/m)?.[0] ?? ''
    const handOff = skill.match(/^## 5\. Hand-off\n([\s\S]*?)^## /m)?.[1] ?? ''
    expect(write).toMatch(/shop-wide facts/)
    expect(write).toMatch(/product metafields/)
    expect(handOff).toMatch(/Settings › Custom data › Products/)
    expect(handOff).toMatch(/dynamic source/)
    expect(read('references/design/brief.md')).toMatch(/per product[^\n]*metafield/)
    expect(read('references/design/quality-floor.md')).toMatch(/every product[^\n]*metafield/)
  })
})

describe('Blank product page blocks', () => {
  const skillDir = path.join(projectDir, 'skills/shopify-theme-builder')
  const read = (file: string) => readFileSync(path.join(skillDir, file), 'utf8')
  const locale = JSON.parse(read('base-theme/locales/en.default.json'))

  it('leave no gap in the details column: a block wrapper with nothing in it takes no space', () => {
    // Shopify wraps each theme block in a .shopify-block div, which a flex gap would space even when empty.
    expect(read('catalog/sections/main-product.liquid')).toMatch(/\.main-product__details > \.shopify-block:not\(:has\(\*\)\) {\s*display: none;/)
  })

  it.each(['collapsible-content', 'shipping-note', 'custom-liquid', 'size-guide'])(
    '%s outputs nothing when blank, and a muted hint in the Theme Editor',
    (type) => {
      const source = read(`base-theme/blocks/${type}.liquid`)
      const key = type.replace('-', '_')
      expect(source).not.toContain('or request.design_mode')
      expect(source).toMatch(
        new RegExp(`{% elsif request\\.design_mode %}\\s*<p class="block-hint text-small" {{ block\\.shopify_attributes }}>{{ 'blank_block\\.${key}' \\| t[^}]*}}</p>\\s*{% endif %}`),
      )
      expect(locale.blank_block[key]).toBeTruthy()
    },
  )

  it('styles the hint as muted text', () => {
    expect(read('base-theme/assets/critical.css')).toMatch(/\.block-hint {[^}]*color: var\(--color-foreground-muted\);/)
  })
})

describe('Product page size guide', () => {
  const skillDir = path.join(projectDir, 'skills/shopify-theme-builder')
  const read = (file: string) => readFileSync(path.join(skillDir, file), 'utf8')
  const parse = (source: string) => JSON.parse(source.match(/{% schema %}([\s\S]*){% endschema %}/)![1])
  const source = read('base-theme/blocks/size-guide.liquid')
  const schema = parse(source)
  const dialog = source.slice(source.indexOf('<dialog'), source.indexOf('</dialog>'))

  it('is a theme block the main product lists after the variant picker, added only for sized products', () => {
    const mainProduct = parse(read('catalog/sections/main-product.liquid'))
    const types = mainProduct.blocks.map((block: { type: string }) => block.type)
    expect(types.indexOf('size-guide')).toBe(types.indexOf('_variant-picker') + 1)
    for (const preset of mainProduct.presets) expect(preset.blocks.map((block: { type: string }) => block.type)).not.toContain('size-guide')
    expect(source).toContain('{{ block.shopify_attributes }}')
    expect(schema.presets).toEqual([{ name: 't:general.size_guide' }])
  })

  it("shows the shop page picked in its settings, and nothing until one is picked", () => {
    expect(schema.settings).toContainEqual({ type: 'page', id: 'page', label: 't:labels.page', info: 't:info.size_guide_page' })
    expect(schema.settings).toContainEqual({ type: 'text', id: 'label', label: 't:labels.label', default: 'Size guide' })
    expect(source).toMatch(/{% if guide != blank %}/)
    expect(dialog).toContain('{{ guide.title | escape }}')
    expect(dialog).toMatch(/<div class="size-guide__content rte">\s*{{ guide\.content }}/)
  })

  it('opens the page in a modal dialog: labelled, a close button, Escape closes, the page behind locked', () => {
    expect(source).toMatch(/<button\s+type="button"\s+class="button--secondary size-guide__open"\s+aria-haspopup="dialog"\s*>\s*{{ block\.settings\.label \| escape }}/)
    expect(dialog).toMatch(/<dialog class="size-guide__dialog" aria-labelledby="SizeGuide-{{ block\.id }}" scroll-lock>/)
    expect(dialog).toMatch(/<h2 id="SizeGuide-{{ block\.id }}"/)
    expect(dialog).toMatch(/<form method="dialog">\s*<button class="size-guide__close" aria-label="{{ 'product\.close_size_guide' \| t }}"/)
    expect(source).toContain('this.dialog.showModal()')
    expect(source).not.toMatch(/key === 'Escape'/)
    expect(JSON.parse(read('base-theme/locales/en.default.json')).product.close_size_guide).toBe('Close size guide')
  })

  it('scrolls a wide size chart inside the dialog, never the page', () => {
    expect(source).toMatch(/\.size-guide__content {[^}]*overflow-x: auto;/)
  })
})

describe('Product page layouts', () => {
  const skillDir = path.join(projectDir, 'skills/shopify-theme-builder')
  const source = readFileSync(path.join(skillDir, 'catalog/sections/main-product.liquid'), 'utf8')
  const schema = JSON.parse(source.match(/{% schema %}([\s\S]*){% endschema %}/)![1])
  const locale = JSON.parse(readFileSync(path.join(skillDir, 'base-theme/locales/en.default.schema.json'), 'utf8'))
  const layouts = ['grid', 'stacked', 'thumbnails', 'carousel']

  it('lays out the gallery as a grid, stacked full bleed, a main image with thumbnails or a carousel', () => {
    const setting = schema.settings.find((s: { id: string }) => s.id === 'gallery_layout')
    expect(setting).toMatchObject({ type: 'select', label: 't:labels.gallery_layout', default: 'grid' })
    expect(setting.options.map((option: { value: string }) => option.value)).toEqual(layouts)
    for (const { label } of setting.options) expect(locale.options.gallery_layout[label.split('.').pop()]).toBeTruthy()
    expect(source).toContain('class="main-product main-product--{{ section.settings.gallery_layout }} full-width')
  })

  it('shows thumbnails on desktop only for the thumbnails layout, and arrows only for the carousel', () => {
    expect(source).toMatch(/@media \(min-width: 750px\) {[^@]*\.main-product:not\(\.main-product--thumbnails\) \.main-product__thumbnails {\s*display: none;/)
    const arrows = source.slice(source.indexOf("{% if section.settings.gallery_layout == 'carousel' and ordered_media.size > 1 %}"))
    expect(arrows).toMatch(/data-step="-1" aria-label="{{ 'product\.previous_media' \| t }}"/)
    expect(arrows).toMatch(/data-step="1" aria-label="{{ 'product\.next_media' \| t }}"/)
    expect(source).toMatch(/\.main-product__arrow svg:dir\(rtl\) {\s*scale: -1 1;/)
    expect(source).toContain('this.show(this.index + Number(arrow.dataset.step))')
  })

  it('keeps the stacked gallery full bleed: to the edge of the page, square', () => {
    expect(source).toMatch(/\.main-product--stacked \.main-product__inner {\s*grid-column: 1 \/ -1;/)
    expect(source).toMatch(/\.main-product:not\(\.main-product--stacked\) \.main-product__media-item {\s*border-radius: var\(--style-border-radius-media\);/)
  })

  it('offers each layout as a named preset with the same info blocks', () => {
    expect(schema.presets.map((preset: { settings?: { gallery_layout?: string } }) => preset.settings?.gallery_layout ?? 'grid')).toEqual(layouts)
    expect(schema.presets[0].name).toBe('t:general.main_product')
    for (const preset of schema.presets.slice(1)) {
      expect(locale.general[preset.name.replace('t:general.', '')]).toMatch(/^Product: /)
      expect(preset.blocks).toEqual(schema.presets[0].blocks)
    }
  })
})

describe('Sticky buy bar', () => {
  const skillDir = path.join(projectDir, 'skills/shopify-theme-builder')
  const read = (file: string) => readFileSync(path.join(skillDir, file), 'utf8')
  const source = read('catalog/sections/main-product.liquid')
  const schema = JSON.parse(source.match(/{% schema %}([\s\S]*){% endschema %}/)![1])
  const locale = JSON.parse(read('base-theme/locales/en.default.schema.json'))
  const bar = source.slice(source.indexOf('{% if section.settings.sticky_buy_bar %}'), source.indexOf('</product-info>'))
  const css = source.slice(source.indexOf('{% stylesheet %}'), source.indexOf('{% endstylesheet %}'))

  it('is a main product setting, on by default', () => {
    expect(schema.settings).toContainEqual({
      type: 'checkbox',
      id: 'sticky_buy_bar',
      label: 't:labels.sticky_buy_bar',
      info: 't:info.main_product_sticky_buy_bar',
      default: true,
    })
    expect(locale.labels.sticky_buy_bar).toBeTruthy()
    expect(locale.info.main_product_sticky_buy_bar).toBeTruthy()
  })

  it("shows the title, the selected variant's price and an add to cart button, refreshed with the variant", () => {
    // Inside <product-info>, so a variant change re-renders it with the rest of the product info.
    expect(bar).toMatch(/^{% if section\.settings\.sticky_buy_bar %}/)
    expect(bar).toContain('<sticky-buy-bar')
    expect(bar).toContain('{{ product.title | escape }}')
    expect(bar).toMatch(/class="[^"]*\bprice\b[^"]*">\s*{{ price \| money }}/)
    expect(source).toContain('assign price = current_variant.price')
    expect(bar).toMatch(/<button\s+type="submit"\s+form="product-form-{{ section\.id }}"\s+class="button main-product__buy-bar-button"/)
    expect(bar).toMatch(/{% unless current_variant\.available %}\s*disabled\s*{% endunless %}/)
    expect(bar).toContain("{{ 'product.add_to_cart' | t }}")
    expect(bar).toContain("{{ 'product.sold_out' | t }}")
  })

  it('submits the buy buttons form, so it hands off to the cart drawer like the main button', () => {
    expect(read('base-theme/blocks/_buy-buttons.liquid')).toMatch(/assign form_id = 'product-form-' \| append: section\.id[\s\S]*{% form 'product', product, id: form_id, class: 'buy-buttons__form' %}/)
    expect(source).toMatch(/drawer\.add\(event\.target, event\.submitter\)/)
  })

  it('slides in below 750px once the main add to cart scrolls out of view, above the safe area and eased only without reduced motion', () => {
    expect(source).toContain("customElements.define('sticky-buy-bar'")
    expect(source).toContain('new IntersectionObserver(')
    expect(source).toMatch(/toggleAttribute\('data-visible', !entry\.isIntersecting && entry\.boundingClientRect\.bottom < 0\)/)
    expect(css).toMatch(/\.main-product__buy-bar {[^}]*position: fixed;[^}]*inset-block-end: 0;[^}]*padding-block-end: calc\(var\(--space-sm\) \+ env\(safe-area-inset-bottom\)\);[^}]*translate: 0 100%;[^}]*visibility: hidden;/)
    expect(css).toMatch(/\.main-product__buy-bar\[data-visible\] {\s*translate: none;\s*visibility: visible;/)
    expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\) {\s*\.main-product__buy-bar {\s*transition:/)
    expect(css).toMatch(/@media \(min-width: 750px\) {\s*\.main-product__buy-bar {\s*display: none;/)
    // The page keeps room for it, so it never covers the end of the page or a focused control.
    expect(css).toMatch(/body:has\(\.main-product__buy-bar\) {\s*padding-block-end: var\(--buy-bar-height\);/)
    expect(css).toMatch(/html:has\(\.main-product__buy-bar\) {\s*scroll-padding-block-end: var\(--buy-bar-height\);/)
  })
})

describe('Product image zoom', () => {
  const skillDir = path.join(projectDir, 'skills/shopify-theme-builder')
  const source = readFileSync(path.join(skillDir, 'catalog/sections/main-product.liquid'), 'utf8')
  const schema = JSON.parse(source.match(/{% schema %}([\s\S]*){% endschema %}/)![1])
  const locale = JSON.parse(readFileSync(path.join(skillDir, 'base-theme/locales/en.default.schema.json'), 'utf8'))
  const lightbox = source.slice(source.indexOf('<dialog class="main-product__lightbox"'), source.indexOf('</dialog>'))

  it('has an image_zoom setting, a lightbox by default or none', () => {
    const setting = schema.settings.find((s: { id: string }) => s.id === 'image_zoom')
    expect(setting).toMatchObject({ type: 'select', label: 't:labels.image_zoom', default: 'lightbox' })
    expect(setting.options.map((option: { value: string }) => option.value)).toEqual(['lightbox', 'none'])
    for (const { label } of setting.options) expect(locale.options.image_zoom[label.split('.').pop()]).toBeTruthy()
    expect(locale.labels.image_zoom).toBeTruthy()
  })

  it('opens each product image in a full-screen dialog at 3000px, only when the setting is lightbox', () => {
    const media = source.slice(source.indexOf('class="main-product__media"'), source.indexOf('</ul>'))
    expect(media).toMatch(/{% if zoom %}\s*<button\s+type="button"\s+class="main-product__zoom"\s+data-index="{{ image_index \| minus: 1 }}"\s+aria-haspopup="dialog"/)
    expect(media).toContain("aria-label=\"{{ 'product.zoom' | t: index: image_index, count: images.size }}\"")
    expect(source).toMatch(/if section\.settings\.image_zoom == 'lightbox' and images != empty\s*assign zoom = true/)
    expect(source).toMatch(/{% if zoom %}\s*<media-lightbox>\s*<dialog class="main-product__lightbox"/)
    expect(lightbox).toContain("image_url: width: 3000")
    expect(source).toContain('this.dialog.showModal()')
    expect(source).toContain('this.lightbox?.open(Number(zoom.dataset.index), zoom)')
  })

  it('follows the dialog pattern: labelled, a close button, Escape closes, focus back on the image', () => {
    expect(lightbox).toMatch(/<dialog class="main-product__lightbox[^"]*"[^>]*aria-label="{{ 'product\.lightbox' \| t }}"/)
    expect(lightbox).toMatch(/<form method="dialog">\s*<button class="main-product__lightbox-close" aria-label="{{ 'product\.close_lightbox' \| t }}"/)
    // Escape closes a modal <dialog> natively; closing returns focus to the image that opened it.
    expect(source).toMatch(/addEventListener\('close', \(\) => this\.opener\?\.focus\(\)\)/)
    expect(source).not.toMatch(/key === 'Escape'/)
    // Only the current image is in the accessibility tree, and its position is announced.
    expect(lightbox).toContain('{% unless forloop.first %}hidden{% endunless %}')
    expect(lightbox).toMatch(/aria-live="polite"/)
  })

  it('moves between images with arrow buttons and the arrow keys, mirrored right to left', () => {
    expect(lightbox).toMatch(/data-step="-1" aria-label="{{ 'product\.previous_media' \| t }}"/)
    expect(lightbox).toMatch(/data-step="1" aria-label="{{ 'product\.next_media' \| t }}"/)
    expect(source).toMatch(/\.main-product__lightbox-arrow svg:dir\(rtl\) {\s*scale: -1 1;/)
    expect(source).toContain("getComputedStyle(this).direction === 'rtl'")
    expect(source).toMatch(/'ArrowRight'/)
    expect(source).toMatch(/'ArrowLeft'/)
  })

  it('pinches to zoom and pans the zoomed image on touch', () => {
    expect(source).toMatch(/\.main-product__lightbox-image {[^}]*touch-action: none;/)
    for (const event of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) expect(source).toContain(`'${event}'`)
    expect(source).toContain('Math.hypot(')
  })

  it('tells the agent about the lightbox', () => {
    expect(readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8')).toMatch(/`image_zoom`/)
  })
})

describe('Product page requirements', () => {
  const skillDir = path.join(projectDir, 'skills/shopify-theme-builder')
  const block = (name: string) => readFileSync(path.join(skillDir, `base-theme/blocks/${name}.liquid`), 'utf8')
  const source = readFileSync(path.join(skillDir, 'catalog/sections/main-product.liquid'), 'utf8')
  const buyButtons = block('_buy-buttons')
  const info = ['_product-title', '_product-price', '_variant-picker'].map(block).join('\n') + buyButtons
  const form = buyButtons.slice(buyButtons.indexOf("{% form 'product'"), buyButtons.indexOf('{% endform %}'))

  it('shows the vendor, with a setting to hide it', () => {
    expect(info).toContain('{% if block.settings.show_vendor and product.vendor != blank %}')
    expect(info).toContain('product.vendor | escape')
  })

  it('shows pickup availability of the current variant inside the product info, so it updates with the variant', () => {
    expect(buyButtons).toContain("current_variant.store_availabilities | where: 'pick_up_enabled', true")
    expect(buyButtons).toContain('.pick_up_time')
  })

  it('shows Shop Pay Installments inside the product form', () => {
    expect(form).toContain('{{ form | payment_terms }}')
  })

  it('offers one-time purchase and the selling plans of the current variant inside the product form', () => {
    expect(form).toContain('{% if product.selling_plan_groups != empty %}')
    expect(form).toContain('{% unless product.requires_selling_plan %}')
    expect(form).toContain("'product.one_time_purchase' | t")
    expect(form).toContain("current_variant.selling_plan_allocations | where: 'selling_plan_group_id', group.id")
    expect(form).toMatch(/name="selling_plan"\s+value=""/)
    expect(form).toMatch(/name="selling_plan"\s+value="{{ allocation.selling_plan.id }}"/)
  })

  it('prices the product with the selected plan and re-renders the product info when the plan changes', () => {
    expect(info).toContain('assign selling_plan_allocation = current_variant.selected_selling_plan_allocation')
    expect(info).toContain('selling_plan_allocation.per_delivery_price')
    expect(info).toContain('selling_plan_allocation.selling_plan.description')
    expect(source).toContain("event.target.name !== 'selling_plan'")
    expect(source).toContain("params.set('selling_plan', sellingPlan)")
  })

  it('announces the new price and availability in a status region outside the re-rendered product info after a variant change', () => {
    const locale = JSON.parse(readFileSync(path.join(skillDir, 'base-theme/locales/en.default.json'), 'utf8'))
    expect(locale.product.variant_status).toBe('{{ price }}, {{ availability }}')
    expect(locale.product.in_stock).toBe('In stock')
    expect(source).toMatch(/<product-info[^>]*data-status="{{ variant_status }}"/)
    expect(source).toContain("assign variant_status = 'product.variant_status' | t: price: variant_price, availability: availability")
    expect(source).toMatch(/<\/product-info>\s*<p class="main-product__status visually-hidden" role="status"><\/p>/)
    expect(source).toContain('status.textContent = fresh.dataset.status')
  })

  it('lets the customer send a gift card to a recipient, with labelled and validated fields', () => {
    const recipient = form.slice(form.indexOf('{% if product.gift_card? %}'))
    const fields = recipient.slice(recipient.indexOf('<fieldset'), recipient.indexOf('</fieldset>'))
    expect(recipient).toMatch(/<fieldset[^>]*class="buy-buttons__recipient-fields"[^>]*hidden\s+disabled/)
    expect(fields).toMatch(/type="hidden"\s+name="properties\[__shopify_send_gift_card_to_recipient\]"\s+value="true"/)
    expect(fields).toMatch(/type="email"\s+name="properties\[Recipient email\]"\s+required/)
    expect(recipient).toMatch(/name="properties\[Recipient name\]"\s+maxlength="255"/)
    expect(recipient).toMatch(/name="properties\[Message\]"\s+maxlength="200"/)
    expect(recipient).toMatch(/type="date"\s+name="properties\[Send on\]"\s+min="{{ today }}"\s+max="{{ latest_send_date }}"/)
    expect(recipient).toContain('name="properties[__shopify_offset]"')
    for (const key of ['send_to_recipient', 'email', 'name', 'message', 'message_info', 'send_on', 'send_on_info']) {
      expect(recipient).toContain(`'product.recipient.${key}' | t`)
    }
    expect(buyButtons).toContain('fields.hidden = fields.disabled = !checkbox.checked')
    expect(buyButtons).toContain('new Date().getTimezoneOffset()')
  })

  it('keeps what the customer typed for the recipient when the variant changes', () => {
    expect(source).toMatch(/this\.querySelector\('\.buy-buttons__recipient'\)\?\.replaceWith\(recipient\)/)
  })

  it('shows color and image swatches in the variant picker, falling back to the text pill', () => {
    const picker = block('_variant-picker')
    expect(picker).toContain('{% if option_value.swatch.image %}')
    expect(picker).toContain('option_value.swatch.image | image_url')
    expect(picker).toContain('{% elsif option_value.swatch.color %}')
    expect(picker).toContain('option_value.swatch.color')
    expect(picker).toMatch(/{% else %}\s*{{- option_value \| escape -}}/)
    expect(picker).toContain('<span class="visually-hidden">{{ option_value | escape }}</span>')
  })

  it('names the selected value next to the option name, like "Color: Sage", re-rendered with the variant', () => {
    const picker = block('_variant-picker')
    expect(picker).toMatch(/{%- if option\.selected_value != blank -%}\s*{{ 'product\.option_with_value' \| t: option: option\.name, value: option\.selected_value }}/)
    const locale = JSON.parse(readFileSync(path.join(skillDir, 'base-theme/locales/en.default.json'), 'utf8'))
    expect(locale.product.option_with_value).toBe('{{ option }}: {{ value }}')
    expect(source).toContain('this.replaceChildren(...fresh.childNodes)')
    expect(readFileSync(path.join(skillDir, 'references/design/quality-floor.md'), 'utf8')).toContain('"Color: Sage"')
  })

  it('links option values of combined listings to their sibling product, swatches included', () => {
    const picker = block('_variant-picker')
    expect(picker).toContain('data-product-url="{{ option_value.product_url }}"')
    expect(source).toContain('const { productUrl } = event.target.dataset')
    expect(source).toMatch(/if \(productUrl && productUrl !== this\.dataset\.url\) {\s*location\.assign\(`\${productUrl}\?option_values=\${optionValues}`\)/)
  })

  it('loads the Shopify model viewer for 3D models and plays YouTube or Vimeo media', () => {
    const media = source.slice(source.indexOf('class="main-product__media"'), source.indexOf('</ul>'))
    expect(media).toMatch(/{% when 'model' %}\s*<product-model[^>]*>\s*{{ media \| model_viewer_tag/)
    expect(media).toMatch(/{% when 'external_video' %}\s*{{ media \| external_video_tag/)
    expect(source).toContain('https://cdn.shopify.com/shopifycloud/model-viewer-ui/assets/v1.0/model-viewer-ui.css')
    expect(source).toContain("name: 'model-viewer-ui'")
    expect(source).toContain('new Shopify.ModelViewerUI(')
    expect(source).toContain("customElements.define('product-model'")
  })

  it('shows scrollable thumbnails under the swipeable media on mobile, the current one marked, a partial last one when more exist', () => {
    const gallery = source.slice(source.indexOf('<media-gallery'), source.indexOf('</media-gallery>'))
    expect(gallery).toMatch(/<ul class="main-product__media" role="list" tabindex="0"/)
    const thumbnails = gallery.slice(gallery.indexOf('{% if ordered_media.size > 1 %}'))
    expect(thumbnails).toMatch(/<ul class="main-product__thumbnails" role="list" aria-label="{{ 'product\.media_thumbnails' \| t }}">\s*{% for media in ordered_media %}/)
    expect(thumbnails).toMatch(/<button\s+type="button"\s+class="main-product__thumbnail"\s+aria-label="{{ 'product\.show_media' \| t: index: forloop\.index, count: forloop\.length }}"/)
    expect(thumbnails).toContain('{% if forloop.first %}aria-current="true"{% endif %}')
    expect(thumbnails).toContain("media.preview_image | image_url: width: 160 | image_tag: alt: ''")
    // Four and a half thumbnails fill the strip, so a cut-off fifth signals more.
    expect(source).toMatch(/\.main-product__thumbnails {[^}]*grid-auto-columns: calc\(\(100% - 4 \* var\(--space-xs\)\) \/ 4\.5\);[^}]*overflow-x: auto;/)
    expect(source).toMatch(/\.main-product__thumbnail\[aria-current='true'\] {/)
    expect(source).toContain("customElements.define('media-gallery'")
    expect(source).toContain('.scrollIntoView(')
    expect(source).toContain("setAttribute('aria-current', 'true')")
  })

  it('shows the selling plan of each cart line', () => {
    const cart = readFileSync(path.join(projectDir, 'skills/shopify-theme-builder/catalog/sections/main-cart.liquid'), 'utf8')
    expect(cart).toContain('{% if item.selling_plan_allocation %}')
    expect(cart).toContain('item.selling_plan_allocation.selling_plan.name | escape')
  })

  it('shows the line item properties of each cart line, like a gift card recipient, but not hidden ones', () => {
    const cart = readFileSync(path.join(projectDir, 'skills/shopify-theme-builder/catalog/sections/main-cart.liquid'), 'utf8')
    expect(cart).toContain('{% for property in item.properties %}')
    expect(cart).toContain("first_character != '_'")
    expect(cart).toContain('{{ property.first | escape }}: {{ property.last | escape }}')
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

  it('passes with several shop languages added as copies of the English locale', () => {
    const extra = mkdtempSync(path.join(tmpdir(), 'catalog-'))
    mkdirSync(path.join(extra, 'locales'))
    for (const code of ['it', 'de']) {
      copyFileSync(path.join(baseTheme, 'locales/en.default.json'), path.join(extra, `locales/${code}.json`))
      copyFileSync(path.join(baseTheme, 'locales/en.default.schema.json'), path.join(extra, `locales/${code}.schema.json`))
    }
    const result = checkTheme(extra)
    rmSync(extra, { recursive: true })
    expect(result.output).toContain('0 errors')
  })
})

describe('Keyboard navigation', () => {
  const baseTheme = path.join(projectDir, 'skills/shopify-theme-builder/base-theme')

  it('opens every page with a skip link to the main content', () => {
    const layout = readFileSync(path.join(baseTheme, 'layout/theme.liquid'), 'utf8')
    expect(layout).toMatch(/<body>\s*<a class="skip-to-content" href="#MainContent">{{ 'general\.skip_to_content' \| t }}<\/a>/)
    expect(layout).toMatch(/<main id="MainContent">\s*{{ content_for_layout }}\s*<\/main>/)
  })

  it('hides the skip link until it has focus and rings every focused control in the color scheme text color', () => {
    const css = readFileSync(path.join(baseTheme, 'assets/critical.css'), 'utf8')
    expect(css).toMatch(/\n\.skip-to-content:not\(:focus\) {[^}]*clip-path: inset\(50%\)/)
    expect(css).toMatch(/\n:focus-visible,[^{]*{\s*outline: var\(--focus-ring-width\) solid var\(--color-foreground\);\s*outline-offset: var\(--focus-ring-offset\);\s*}/)
  })
})

describe('Form fields', () => {
  const skillDir = path.join(projectDir, 'skills/shopify-theme-builder')
  const files = ['base-theme', 'catalog'].flatMap((dir) =>
    readdirSync(path.join(skillDir, dir), { recursive: true, encoding: 'utf8' })
      .filter((file) => file.endsWith('.liquid'))
      .map((file) => path.join(dir, file)),
  )
  const markup = (file: string) =>
    readFileSync(path.join(skillDir, file), 'utf8').replace(/{% (schema|javascript|stylesheet) %}[\s\S]*?{% end\1 %}/g, '')
  const fields = (source: string) =>
    [...source.matchAll(/<(?:input|select|textarea)\b(?:[^>{]|{{[\s\S]*?}}|{%[\s\S]*?%})*>/g)]
      .map(([tag]) => tag)
      .filter((tag) => !/type="(hidden|submit|button|image|reset)"/.test(tag))

  it('gives every input, select and textarea an id and a <label for> it, never only a placeholder or aria-label (Theme Store requirement)', () => {
    const unlabelled = files.flatMap((file) => {
      const source = markup(file)
      const labelled = new Set([...source.matchAll(/<label\b[^>]*?\sfor="([^"]+)"/g)].map((m) => m[1]))
      return fields(source)
        .filter((tag) => !labelled.has(tag.match(/\sid="([^"]+)"/)?.[1] ?? ''))
        .map((tag) => `${file}: ${tag.replace(/\s+/g, ' ')}`)
    })
    expect(unlabelled).toEqual([])
  })

  it.each(['catalog/sections/newsletter.liquid', 'catalog/sections/footer.liquid'])('labels the newsletter email in %s, visually hidden, with email autocomplete', (file) => {
    const source = markup(file)
    const email = fields(source).find((tag) => tag.includes('name="contact[email]"'))!
    expect(email).toContain('autocomplete="email"')
    expect(email).not.toContain('aria-label')
    const id = email.match(/\sid="([^"]+)"/)![1]
    expect(source).toContain(`<label for="${id}" class="visually-hidden">{{ 'footer.newsletter_email' | t }}</label>`)
  })
})

describe('Header search', () => {
  const source = readFileSync(path.join(projectDir, 'skills/shopify-theme-builder/catalog/sections/header.liquid'), 'utf8')
  const schema = JSON.parse(source.match(/{% schema %}([\s\S]*){% endschema %}/)![1])

  const icons = source.slice(source.indexOf('class="header__icons"'), source.indexOf('class="header__cart"'))

  it('opens a search form from the header icons, with an accessible label and a setting to hide it', () => {
    expect(icons).toMatch(/{%-? if section\.settings\.show_search -?%}\s*<details class="header__search">\s*<summary[^>]*aria-label="{{ 'header\.search' \| t }}"/)
    expect(schema.settings).toContainEqual(expect.objectContaining({ id: 'show_search', type: 'checkbox', default: true }))
  })

  it('falls back to the search page without JavaScript', () => {
    expect(icons).toMatch(/<form action="{{ routes\.search_url }}" method="get" role="search"/)
    expect(icons).toMatch(/<input[^>]*type="search"[^>]*name="q"/)
    expect(icons).toMatch(/<button type="submit"/)
  })

  it('makes the search box an ARIA combobox that suggests results as the customer types', () => {
    const input = icons.match(/<input[^>]*name="q"[^>]*>/)![0]
    expect(input).toContain('role="combobox"')
    expect(input).toContain('aria-expanded="false"')
    expect(input).toContain('aria-autocomplete="list"')
    expect(input).toContain('aria-controls="PredictiveSearchResults"')
    expect(icons).toMatch(/id="PredictiveSearchResults"[^>]*role="listbox"/)
    expect(icons).toContain('data-url="{{ routes.predictive_search_url }}"')
    expect(source).toContain('section_id=predictive-search')
    expect(source).toContain("customElements.define('predictive-search'")
  })

  it('moves through the suggestions with the arrow keys, opens one with Enter and closes them with Escape', () => {
    for (const key of ['ArrowDown', 'ArrowUp', 'Enter', 'Escape']) expect(source).toContain(`'${key}'`)
    expect(source).toContain("'aria-activedescendant'")
    expect(source).toContain("'aria-selected'")
  })
})

describe('Predictive search', () => {
  const skillDir = path.join(projectDir, 'skills/shopify-theme-builder')
  const source = readFileSync(path.join(skillDir, 'catalog/sections/predictive-search.liquid'), 'utf8')
  const schema = JSON.parse(source.match(/{% schema %}([\s\S]*){% endschema %}/)![1])

  it('suggests queries, products, collections and pages as listbox options', () => {
    expect(source).toContain('{% if predictive_search.performed %}')
    for (const [item, type] of [['query', 'queries'], ['product', 'products'], ['collection', 'collections'], ['page', 'pages']]) {
      expect(source).toContain(`{% for ${item} in predictive_search.resources.${type} %}`)
    }
    expect(source.match(/role="option"/g)!.length).toBeGreaterThanOrEqual(5)
  })

  it('ends with an option that searches for the terms on the search page', () => {
    expect(source).toContain('{{ routes.search_url }}?q={{ predictive_search.terms | url_encode }}')
    expect(source).toContain("'search.search_for_html' | t")
  })

  it('belongs to the header, so the Studio never offers it for a page', () => {
    expect(schema.enabled_on).toEqual({ groups: ['header'] })
    expect(schema.presets).toBeUndefined()
  })

  it('is copied into every new Theme by the skill', () => {
    expect(starterFiles).toContain('sections/predictive-search.liquid')
  })
})

describe('Header menu', () => {
  const skillDir = path.join(projectDir, 'skills/shopify-theme-builder')
  const source = readFileSync(path.join(skillDir, 'catalog/sections/header.liquid'), 'utf8')
  const locale = JSON.parse(readFileSync(path.join(skillDir, 'base-theme/locales/en.default.json'), 'utf8'))

  it('opens nested links as keyboard dropdowns and marks the current page', () => {
    expect(source).toMatch(/{%-? if link\.links\.size > 0 -?%}\s*<details class="header__submenu"[^>]*>\s*<summary/)
    expect(source).toMatch(/{%-? for child in link\.links -?%}/)
    expect(source).toMatch(/href="{{ child\.url }}"\s*{%-? if child\.current -?%}\s*aria-current="page"/)
    expect(source).toMatch(/href="{{ link\.url }}"\s*{%-? if link\.current -?%}\s*aria-current="page"/)
  })

  it('opens and closes a desktop dropdown 300 ms after a mouse enters or leaves it, the click and keys still toggling it', () => {
    const script = source.match(/class HeaderMenu[\s\S]*?\n  }\n/)![0]
    expect(script).toMatch(/querySelectorAll\('\.header__menu \.header__submenu'\)/)
    expect(script).toMatch(/'pointerenter'[\s\S]*'pointerleave'/)
    expect(script).toMatch(/pointerType [!=]== 'mouse'/)
    expect(script).toMatch(/clearTimeout\([^)]*\);\s*[^;]*setTimeout\([^;]*, 300\)/)
    expect(script).toMatch(/event\.key === 'Escape'/)
  })

  it('opens the menu in a dialog drawer from a menu button on mobile', () => {
    expect(source).toMatch(/<button[^>]*class="header__menu-button"[^>]*aria-controls="HeaderDrawer"/)
    expect(source).toMatch(/<dialog[^>]*id="HeaderDrawer"/)
    expect(source).toContain('.showModal()')
    expect(source).toMatch(/<form method="dialog">/)
    expect(locale.header.menu).toBeTruthy()
    expect(locale.header.close_menu).toBeTruthy()
  })

  it('keeps the menu button, the logo and the icons on one row on mobile, shrinking only the logo', () => {
    const mobile = source.slice(source.indexOf('@media (max-width: 749px) {'), source.indexOf('@media (min-width: 750px) {'))
    expect(mobile).toMatch(/\.header__inner {[^}]*flex-wrap: nowrap;/)
    expect(mobile).toMatch(/\.header__logo {[^}]*min-width: 0;/)
    expect(mobile).toMatch(/\.header__menu-button,\s*\.header__icons {[^}]*flex-shrink: 0;/)
    // The centered logo's column gives way before the side columns do, so that layout stays one row too.
    expect(mobile).toMatch(/\.header--logo_center_menu_below \.header__inner {[^}]*grid-template-columns: minmax\(max-content, 1fr\) minmax\(0, auto\) minmax\(max-content, 1fr\);/)
  })
})

describe('Country and language selector', () => {
  const catalog = path.join(projectDir, 'skills/shopify-theme-builder/catalog/sections')
  const header = readFileSync(path.join(catalog, 'header.liquid'), 'utf8')
  const headerSchema = JSON.parse(header.match(/{% schema %}([\s\S]*){% endschema %}/)![1])

  it.each(['footer', 'header'])('lets customers pick a country and a language in the %s from a disclosure list, without JavaScript', (name) => {
    const source = readFileSync(path.join(catalog, `${name}.liquid`), 'utf8')
    const form = source.slice(source.indexOf("{% form 'localization'"), source.indexOf('{% endform %}', source.indexOf("{% form 'localization'")))
    // A select that submits on change navigates away on an arrow key (WCAG F37): each choice is its own submit button instead.
    expect(form).not.toMatch(/<select/)
    expect(form).toMatch(
      /{%-? if localization\.available_countries\.size > 1 -?%}\s*<details class="[\w-]+__disclosure"[^>]*>\s*<summary[^>]*>[\s\S]*?{{ 'localization\.country' \| t }}[\s\S]*?{{ localization\.country\.name }} \({{ localization\.country\.currency\.iso_code }} {{ localization\.country\.currency\.symbol }}\)[\s\S]*?<\/summary>/,
    )
    expect(form).toMatch(/{% for country in localization\.available_countries %}\s*<li>\s*<button\s+type="submit"\s+name="country_code"\s+value="{{ country\.iso_code }}"/)
    expect(form).toContain('{{ country.name }} ({{ country.currency.iso_code }} {{ country.currency.symbol }})')
    expect(form).toMatch(
      /{%-? if localization\.available_languages\.size > 1 -?%}\s*<details class="[\w-]+__disclosure"[^>]*>\s*<summary[^>]*>[\s\S]*?{{ 'localization\.language' \| t }}[\s\S]*?{{ localization\.language\.endonym_name \| capitalize }}[\s\S]*?<\/summary>/,
    )
    expect(form).toMatch(/{% for language in localization\.available_languages %}\s*<li>\s*<button\s+type="submit"\s+name="language_code"\s+value="{{ language\.iso_code }}"\s+lang="{{ language\.iso_code }}"/)
    expect(form).toContain('{{ language.endonym_name | capitalize }}')
    // The current choice is marked for screen readers, not only visually.
    expect(form.match(/aria-current="true"/g)).toHaveLength(2)
    // Opening one list closes the other.
    expect(form.match(new RegExp(`<details class="${name}__disclosure" name="${name}-localization"`, 'g'))).toHaveLength(2)
    // Both sections can render the form on one page, so each needs its own id instead of the default localization_form.
    expect(source).toContain(`{% form 'localization', id: '${name[0].toUpperCase()}${name.slice(1)}Localization'`)
    expect(form).not.toMatch(/<script|\son[a-z]+=/)
  })

  it.each(['footer', 'header'])('shows nothing in the %s that a script hides once it loads, so nothing shifts', (name) => {
    const source = readFileSync(path.join(catalog, `${name}.liquid`), 'utf8')
    expect(source).not.toMatch(/requestSubmit/)
    expect(source).not.toMatch(/:defined \.[\w-]+__localization button/)
    expect(source).not.toContain("'localization.update'")
  })

  it.each(['footer', 'header'])('styles the %s lists from the style system, with 24px targets and the current choice underlined', (name) => {
    const source = readFileSync(path.join(catalog, `${name}.liquid`), 'utf8')
    const css = source.match(/{% stylesheet %}([\s\S]*){% endstylesheet %}/)![1]
    expect(css).toMatch(new RegExp(`\\.${name}__disclosure-list {[^}]*position: absolute;[^}]*max-height: [^;]+;[^}]*overflow-y: auto;[^}]*border: var\\(--border-width\\) solid var\\(--color-border-subtle\\);[^}]*background-color: var\\(--color-background\\);`))
    expect(css).toMatch(new RegExp(`\\.${name}__disclosure-option {[^}]*min-block-size: var\\(--target-size-min\\);`))
    expect(css).toMatch(new RegExp(`\\.${name}__disclosure-option\\[aria-current='true'\\][^{]*{[^}]*text-decoration: underline;`))
  })

  it.each([
    ['footer', 'footer-localization'],
    ['header', 'header-menu'],
  ])('closes the open %s list with Escape and puts focus back on its button', (name, element) => {
    const source = readFileSync(path.join(catalog, `${name}.liquid`), 'utf8')
    const script = source.match(/{% javascript %}([\s\S]*){% endjavascript %}/)![1]
    expect(source).toContain(`<${element}`)
    expect(script).toMatch(new RegExp(`event\\.key === 'Escape'[^\\n]*\\.${name}__disclosure\\[open\\]`))
    expect(script).toMatch(/\.querySelector\('summary'\)\.focus\(\)/)
  })

  it('shows the selector in the header only when the Merchant turns it on', () => {
    expect(header).toMatch(/{%-? if section\.settings\.show_localization -?%}\s*{%-? if localization\.available_countries\.size > 1 or localization\.available_languages\.size > 1 -?%}\s*{% form 'localization'/)
    expect(headerSchema.settings).toContainEqual(expect.objectContaining({ id: 'show_localization', type: 'checkbox', default: false }))
  })

  it('moves the header selector into the menu drawer on mobile, with its own ids', () => {
    const drawer = header.slice(header.indexOf('<dialog id="HeaderDrawer"'), header.indexOf('</dialog>', header.indexOf('<dialog id="HeaderDrawer"')))
    expect(drawer).toContain("{{ header_localization | replace: 'Header', 'HeaderDrawer' }}")
    expect(header).toMatch(/\.header__menu-button ~ \.header__icons \.header__localization {\s*display: none;/)
  })
})

describe('Footer', () => {
  const catalog = path.join(projectDir, 'skills/shopify-theme-builder/catalog/sections')
  const source = readFileSync(path.join(catalog, 'footer.liquid'), 'utf8')
  const schema = JSON.parse(source.match(/{% schema %}([\s\S]*){% endschema %}/)![1])
  const block = (type: string) => schema.blocks.find((block: { type: string }) => block.type === type)

  it('takes a text block: a heading and a rich text line, like the brand, an address or opening hours', () => {
    expect(block('text').settings).toEqual([
      expect.objectContaining({ type: 'text', id: 'heading' }),
      expect.objectContaining({ type: 'richtext', id: 'text' }),
    ])
    // The shop's own text, written by the agent: a guidance sentence as its default would show on the storefront.
    expect(block('text').settings[1]).not.toHaveProperty('default')
    expect(source).toMatch(/<div class="rte{% if layout == 'split_menus' %} text-h4{% endif %}">{{ block\.settings\.text }}<\/div>/)
  })

  it("takes a social block that links the theme's social media settings as icons, named for screen readers", () => {
    expect(block('social').settings).toContainEqual(expect.objectContaining({ type: 'text', id: 'heading' }))
    expect(block('social').settings).toContainEqual({ type: 'paragraph', content: 't:info.social_links_setting' })
    expect(source).toMatch(/assign key = 'social_' \| append: icon\s*assign url = settings\[key\]\s*assign label = social_names\[index\]/)
    for (const network of ['instagram', 'facebook', 'tiktok', 'x', 'youtube', 'pinterest']) {
      expect(source).toMatch(new RegExp(`when '${network}' -?%}\\s*<svg[^>]*aria-hidden="true"`))
    }
    expect(source).toMatch(/<a\s+href="{{ url }}"\s+class="footer__social-link"[^>]*aria-label="{{ label \| escape }}"/)
    expect(schema.blocks.map((block: { type: string }) => block.type)).toEqual(['text', 'menu', 'social'])
  })

  it('starts every new Theme, and the preset, with the brand text, a menu and the social links', () => {
    const group = JSON.parse(readFileSync(path.join(catalog, 'footer-group.json'), 'utf8')).sections.footer
    expect(group.block_order.map((id: string) => group.blocks[id].type)).toEqual(['text', 'menu', 'social'])
    expect(schema.presets[0].blocks.map((block: { type: string }) => block.type)).toEqual(['text', 'menu', 'social'])
  })

  it("shows Shop's own Follow on Shop button behind a setting that starts on, never restyled (Theme Store requirement)", () => {
    expect(schema.settings).toContainEqual(expect.objectContaining({ type: 'checkbox', id: 'show_follow_on_shop', default: true }))
    expect(source).toMatch(/{% if section\.settings\.show_follow_on_shop %}\s*<div class="footer__follow">\s*{{ shop \| login_button: action: 'follow' }}\s*<\/div>\s*{% endif %}/)
    const styles = source.match(/{% stylesheet %}([\s\S]*){% endstylesheet %}/)![1]
    expect(styles).not.toMatch(/\.footer__follow\s+[^{,]+{|shop-login-button|shop-follow/)
  })

  const layouts = ['columns', 'wordmark', 'split_menus', 'newsletter_band', 'centered', 'menu_grid', 'top_bar', 'one_row']

  it('takes eight layouts, columns by default so existing Themes keep theirs, each also a named preset with the same blocks', () => {
    expect(schema.settings).toContainEqual({
      type: 'select',
      id: 'layout',
      label: 't:labels.layout',
      info: 't:info.footer_layout',
      options: layouts.map((value) => ({ value, label: `t:options.layout.${value}` })),
      default: 'columns',
    })
    expect(source).toContain('class="footer footer--{{ section.settings.layout }} full-width')
    expect(schema.presets.map((preset: { name: string }) => preset.name)).toEqual(['t:general.footer', ...layouts.slice(1).map((layout) => `t:general.footer_${layout}`)])
    for (const [index, layout] of layouts.slice(1).entries()) {
      expect(schema.presets[index + 1]).toEqual({ name: `t:general.footer_${layout}`, settings: { layout }, blocks: schema.presets[0].blocks })
    }
  })

  it('stacks the blocks on mobile and sizes each column to its content on desktop, the brand text and newsletter taking the room left', () => {
    expect(source).toMatch(/\.footer__columns {[^}]*grid-template-columns: 1fr;/)
    const desktop = source.slice(source.indexOf('@media (min-width: 750px) {'))
    expect(desktop).toMatch(/\.footer__columns {[^}]*display: flex;[^}]*flex-wrap: wrap;[^}]*justify-content: space-between;/)
    expect(desktop).toMatch(/\.footer__columns > \* {\s*flex: 0 1 auto;/)
    expect(desktop).toMatch(/\.footer__columns > :is\(\.footer__text, \.footer__newsletter\) {\s*flex: 2 1 16rem;/)
  })

  it('sets a few social icons under the last menu instead of in a column of their own', () => {
    expect(source).toMatch(/if block\.type == 'menu'\s*assign last_menu = forloop\.index/)
    expect(source).toMatch(/if social_count > 0 and social_count <= 3 and last_menu > 0 and stacking_layouts contains layout\s*assign stack_social = true/)
    expect(source).toMatch(/{% if stack_social and forloop\.index == last_menu %}\s*<div class="footer__stack">\s*{{ block_html }}\s*{{ social_html }}\s*<\/div>/)
  })

  it('takes up to three other social links, shown as text or, for a known network, as its icon', () => {
    const social = block('social')
    expect(social.limit).toBe(1)
    for (const n of [1, 2, 3]) {
      expect(social.settings).toContainEqual({ type: 'text', id: `link_${n}_label`, label: 't:labels.link_label' })
      expect(social.settings).toContainEqual({ type: 'url', id: `link_${n}`, label: 't:labels.link' })
    }
    expect(source).toMatch(/assign host = url \| split: '\/\/' \| last \| split: '\/' \| first \| downcase \| remove_first: 'www\.'/)
    expect(source).toMatch(/when 'x\.com', 'twitter\.com'\s*assign icon = 'x'/)
    expect(source).toMatch(/<a href="{{ url }}" class="footer__social-text" rel="noopener" target="_blank">{{ label \| default: host \| default: url \| escape }}<\/a>/)
  })

  it('sets the wordmark large at the bottom, small above a line in the top bar or on top when centered', () => {
    expect(source).toMatch(/assign wordmark_class = 'text-h3'\s*if layout == 'wordmark'\s*assign wordmark_class = 'text-display'/)
    expect(source).toMatch(/{% if layout == 'top_bar' %}\s*<div class="footer__top">\s*{{ wordmark }}\s*{{ social_html }}/)
    expect(source).toMatch(/\.footer__top {[^}]*border-block-end: var\(--border-width\) solid var\(--color-border-subtle\);/)
    expect(source.indexOf("{% if layout == 'wordmark' %}")).toBeGreaterThan(source.indexOf('<div class="footer__bottom'))
  })

  it('opens the newsletter band layout with the signup across the full width on its own color scheme, hidden when the page has a newsletter', () => {
    expect(schema.settings).toContainEqual(
      expect.objectContaining({ type: 'color_scheme', id: 'newsletter_color_scheme', default: 'scheme-2', visible_if: "{{ section.settings.layout == 'newsletter_band' }}" }),
    )
    expect(source).toContain('<div class="footer__band color-{{ section.settings.newsletter_color_scheme }}">')
    expect(source).toMatch(/\.footer__band {[^}]*grid-column: 1 \/ -1;/)
    expect(source).toMatch(/body:has\(\.shopify-section > \.newsletter\) :is\(\.footer__newsletter, \.footer__band\) {\s*display: none;/)
  })

  it('puts the brand and the menus on two sides in the split, grid and one row layouts, the menus 2 × 2 in the grid', () => {
    expect(source).toMatch(/{% when 'split_menus', 'menu_grid' %}\s*<div class="footer__brand">{{ brand_html }}{{ newsletter_html }}<\/div>\s*<div class="footer__links">{{ links_html }}<\/div>/)
    expect(source).toMatch(/{% when 'one_row' %}\s*<div class="footer__links">{{ links_html }}<\/div>\s*<div class="footer__brand">{{ brand_html }}{{ newsletter_html }}<\/div>/)
    expect(source).toMatch(/\.footer--menu_grid \.footer__links {[^}]*grid-template-columns: repeat\(2, /)
  })
})

describe('Announcement bar', () => {
  const skillDir = path.join(projectDir, 'skills/shopify-theme-builder')
  const source = readFileSync(path.join(skillDir, 'catalog/sections/announcement-bar.liquid'), 'utf8')
  const schema = JSON.parse(source.match(/{% schema %}([\s\S]*){% endschema %}/)![1])

  it('sits once in the header group, with a color scheme and a rotating and a stacked preset', () => {
    expect(schema.enabled_on).toEqual({ groups: ['header'] })
    expect(schema.limit).toBe(1)
    expect(schema.presets[1]).toEqual({ name: 't:general.announcement_bar_stacked', settings: { layout: 'stack' }, blocks: schema.presets[0].blocks })
    expect(source).toContain('class="announcement-bar full-width color-{{ section.settings.color_scheme }}"')
  })

  it('rotates or stacks several messages, each with an optional link', () => {
    expect(schema.settings).toContainEqual(expect.objectContaining({ id: 'layout', type: 'select', default: 'rotate' }))
    expect(schema.blocks[0].settings).toContainEqual(expect.objectContaining({ id: 'link', type: 'url' }))
    expect(source).toMatch(/{% if block\.settings\.link != blank %}\s*<a href="{{ block\.settings\.link }}">/)
    expect(source).toMatch(/{% if rotate and forloop\.first == false %}\s*hidden/)
  })

  it('lets customers step through rotating messages, and holds the rotation on hover or focus', () => {
    expect(source).toContain(`aria-label="{{ 'announcement_bar.previous' | t }}"`)
    expect(source).toContain(`aria-label="{{ 'announcement_bar.next' | t }}"`)
    expect(source).toContain("this.matches(':hover, :focus-within')")
  })

  it('lets customers pause and play the rotation with a labelled 24px button (WCAG 2.2.2)', () => {
    const locale = JSON.parse(readFileSync(path.join(skillDir, 'base-theme/locales/en.default.json'), 'utf8'))
    const css = source.match(/{% stylesheet %}([\s\S]*){% endstylesheet %}/)![1]
    expect(source).toMatch(
      /<button\s+type="button"\s+class="announcement-bar__button"\s+data-pause\s+aria-label="{{ 'announcement_bar\.pause' \| t }}"\s+data-label-pause="{{ 'announcement_bar\.pause' \| t }}"\s+data-label-play="{{ 'announcement_bar\.play' \| t }}"\s+hidden\s*>/,
    )
    expect(locale.announcement_bar.pause).toBe('Pause announcements')
    expect(locale.announcement_bar.play).toBe('Play announcements')
    // The label says what pressing does next, so the state is announced.
    expect(source).toContain("this.pauseButton.setAttribute('aria-label', this.pauseButton.dataset[paused ? 'labelPlay' : 'labelPause'])")
    expect(css).toMatch(/\.announcement-bar__button {[^}]*min-inline-size: var\(--target-size-min\);[^}]*min-block-size: var\(--target-size-min\);/)
    expect(css).toMatch(/\.announcement-bar__button\[hidden\] {\s*display: none;/)
  })

  it('stops after one full cycle when the Merchant turned motion off or the shopper prefers reduced motion', () => {
    expect(source).toMatch(/{% if settings\.motion == 'none' %}\s*data-once\s*{% endif %}/)
    expect(source).toContain("this.once = this.hasAttribute('data-once') || matchMedia('(prefers-reduced-motion: reduce)').matches;")
    expect(source).toContain('if (this.once && this.current === 0) this.setPaused(true);')
  })

  it('is in the header group of every new Theme, above the header', () => {
    const group = JSON.parse(readFileSync(path.join(skillDir, 'catalog/sections/header-group.json'), 'utf8'))
    expect(group.order).toEqual(['announcement-bar', 'header'])
    expect(group.sections['announcement-bar'].type).toBe('announcement-bar')
    expect(starterFiles).toContain('sections/announcement-bar.liquid')
    expect(starterFiles).toContain('sections/header-group.json')
  })
})

describe('Collection list', () => {
  const source = readFileSync(path.join(projectDir, 'skills/shopify-theme-builder/catalog/sections/collection-list.liquid'), 'utf8')
  const schema = JSON.parse(source.match(/{% schema %}([\s\S]*){% endschema %}/)![1])

  it('is a catalog section with a description, a color scheme and a preset', () => {
    expect(source).toMatch(/^{% comment %}.+{% endcomment %}\n/)
    expect(source).toContain(
      'class="collection-list full-width collection-list--{{ section.settings.layout }} color-{{ section.settings.color_scheme }}"',
    )
    expect(schema.settings).toContainEqual({ type: 'color_scheme', id: 'color_scheme', label: 't:labels.color_scheme', default: 'scheme-1' })
    // A Theme made before the layouts keeps its grid: the first preset sets no layout.
    expect(schema.presets[0]).toEqual({ name: 't:general.collection_list' })
  })

  it('lays the collections out as a grid by default, a large first tile, a carousel or a text list', () => {
    const layout = schema.settings.find((setting: { id?: string }) => setting.id === 'layout')
    expect(layout).toMatchObject({ type: 'select', label: 't:labels.layout', default: 'grid' })
    expect(values(layout)).toEqual(['grid', 'large_first', 'carousel', 'text_list'])
  })

  it('offers each other layout as a named preset with the same blocks as the first', () => {
    expect(schema.presets.slice(1)).toEqual([
      { name: 't:general.collection_list_large_first', settings: { layout: 'large_first' } },
      { name: 't:general.collection_list_carousel', settings: { layout: 'carousel' } },
      { name: 't:general.collection_list_text_list', settings: { layout: 'text_list' } },
    ])
  })

  it('spans the first collection two rows and two columns on desktop in the large first tile layout, across the row on mobile', () => {
    const css = source.match(/{% stylesheet %}([\s\S]*){% endstylesheet %}/)![1]
    expect(css).toMatch(/\.collection-list--large_first \.collection-list__grid > :first-child {\s*grid-column: 1 \/ -1;/)
    const desktop = css.match(/@media \(min-width: 750px\) {([\s\S]*?)\n  }/)![1]
    expect(desktop).toMatch(/\.collection-list--large_first \.collection-list__grid > :first-child {\s*grid-column: span 2;\s*grid-row: span 2;/)
    // The large tile asks for a larger image.
    expect(source).toMatch(/sizes = '\(min-width: 750px\) 66vw, 100vw'/)
  })

  it('scrolls the collections in the carousel layout, with previous and next buttons, never on its own, mirrored right to left', () => {
    const css = source.match(/{% stylesheet %}([\s\S]*){% endstylesheet %}/)![1]
    expect(source).toMatch(/<collection-list-carousel/)
    expect(css).toMatch(/\.collection-list--carousel \.collection-list__grid {[^}]*scroll-snap-type: x mandatory;/)
    expect(source).toContain('tabindex="0"')
    expect(source).toContain(`aria-label="{{ 'collection_list.previous' | t }}"`)
    expect(source).toContain(`aria-label="{{ 'collection_list.next' | t }}"`)
    expect(css).toMatch(/\.collection-list__control svg:dir\(rtl\) {\s*scale: -1 1;/)
    expect(source).toContain("getComputedStyle(this).direction === 'rtl'")
    expect(source).not.toMatch(/setInterval|autoplay/)
    // Smooth scrolling is motion: only when the customer has not asked for less.
    expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\) {\s*\.collection-list--carousel \.collection-list__grid {\s*scroll-behavior: smooth;/)
    const locale = JSON.parse(readFileSync(path.join(projectDir, 'skills/shopify-theme-builder/base-theme/locales/en.default.json'), 'utf8'))
    expect(locale.collection_list).toMatchObject({ previous: expect.any(String), next: expect.any(String) })
  })

  it('lists the collection titles large with their product count and no images in the text list layout, a divider between them', () => {
    const css = source.match(/{% stylesheet %}([\s\S]*){% endstylesheet %}/)![1]
    expect(source).toMatch(/{% unless text_list %}\s*<span class="collection-list__image">/)
    expect(source).toContain("'collection_list.product_count' | t: count: collection.products_count")
    expect(css).toMatch(/\.collection-list--text_list \.collection-list__grid {[^}]*grid-template-columns: 1fr;/)
    expect(css).toMatch(/\.collection-list--text_list \.collection-list__grid > \* \+ \* {\s*border-block-start: var\(--border-width\) solid var\(--color-border-subtle\);/)
    const locale = JSON.parse(readFileSync(path.join(projectDir, 'skills/shopify-theme-builder/base-theme/locales/en.default.json'), 'utf8'))
    expect(locale.collection_list.product_count).toEqual({ one: '{{ count }} product', other: '{{ count }} products' })
  })

  it('shows the picked collections with their image and title, and native placeholders when there are none', () => {
    expect(schema.settings).toContainEqual(expect.objectContaining({ type: 'collection_list', id: 'collections' }))
    expect(source).toContain('{% for collection in section.settings.collections %}')
    expect(source).toContain('collection.featured_image')
    expect(source).toContain('{{ collection.title | escape }}')
    expect(source).toContain("{{ 'collection-' | append: placeholder | placeholder_svg_tag")
  })
})

describe('Featured product', () => {
  const source = readFileSync(path.join(projectDir, 'skills/shopify-theme-builder/catalog/sections/featured-product.liquid'), 'utf8')
  const schema = JSON.parse(source.match(/{% schema %}([\s\S]*){% endschema %}/)![1])

  it('is a catalog section with a description, a color scheme and a preset', () => {
    expect(source).toMatch(/^{% comment %}.+{% endcomment %}\n/)
    expect(source).toContain('color-{{ section.settings.color_scheme }}')
    expect(schema.settings).toContainEqual({ type: 'color_scheme', id: 'color_scheme', label: 't:labels.color_scheme', default: 'scheme-1' })
    expect(schema.presets[0]).toEqual({ name: 't:general.featured_product' })
    expect(schema.enabled_on).toBeUndefined()
  })

  const settings = Object.fromEntries(schema.settings.map((setting: { id?: string }) => [setting.id, setting]))
  const css = source.match(/{% stylesheet %}([\s\S]*){% endstylesheet %}/)![1]
  const desktop = css.match(/@media \(min-width: 750px\) {([\s\S]*?)\n  }/)![1]

  it('lays the product out with the image left by default, image right, full bleed or with thumbnails', () => {
    expect(source).toContain(
      'class="featured-product full-width featured-product--{{ section.settings.layout }} color-{{ section.settings.color_scheme }}{% if section.settings.layout == \'full_bleed\' %} media-edge{% endif %}"',
    )
    expect(settings.layout).toMatchObject({ type: 'select', label: 't:labels.layout', default: 'image_left' })
    expect(values(settings.layout)).toEqual(['image_left', 'image_right', 'full_bleed', 'with_thumbnails'])
    expect(desktop).toMatch(/\.featured-product__inner {\s*grid-template-columns: 1fr 1fr;/)
    expect(desktop).toMatch(/\.featured-product--image_right \.featured-product__gallery {\s*order: 1;/)
  })

  it('runs the full-bleed image to the edge of the page, square, with the details in a narrow column', () => {
    expect(css).toMatch(/\.featured-product--full_bleed \.featured-product__inner {[^}]*grid-column: 1 \/ -1;[^}]*padding-block: 0;/)
    expect(css).toMatch(/\.featured-product:not\(\.featured-product--full_bleed\) \.featured-product__media {\s*border-radius: var\(--style-border-radius-media\);/)
    expect(css).toMatch(/\.featured-product--full_bleed \.featured-product__details {[^}]*max-width: var\(--width-narrow\);/)
  })

  it('shows every image of the product with a thumbnail strip below the main one that switches it', () => {
    expect(source).toMatch(/{% for media in product\.media %}[\s\S]*<div class="featured-product__image"{% unless media\.id == featured_media\.id %} hidden{% endunless %}>/)
    expect(source).toContain('<ul class="featured-product__thumbnails" role="list" aria-label="{{ \'product.media_thumbnails\' | t }}">')
    expect(source).toContain("aria-label=\"{{ 'product.show_media' | t: index: forloop.index, count: forloop.length }}\"")
    expect(source).toMatch(/image_tag: alt: '', sizes: '5rem', loading: 'lazy'/)
    expect(css).toMatch(/\.featured-product__thumbnail :is\(img, svg\) {[^}]*aspect-ratio: var\(--image-ratio\);/)
    expect(css).toMatch(/\.featured-product__thumbnail\[aria-current='true'\] {[^}]*opacity: 1;/)
    expect(source).toMatch(/closest\('\.featured-product__thumbnail'\)/)
  })

  it('offers each other layout as a named preset', () => {
    // A Theme made before the layouts keeps its look: the first preset sets no layout.
    expect(schema.presets).toEqual([
      { name: 't:general.featured_product' },
      { name: 't:general.featured_product_image_right', settings: { layout: 'image_right' } },
      { name: 't:general.featured_product_full_bleed', settings: { layout: 'full_bleed' } },
      { name: 't:general.featured_product_with_thumbnails', settings: { layout: 'with_thumbnails' } },
    ])
  })

  it('shows the picked product with its media, price, variant picker and add to cart, and a placeholder when none is picked', () => {
    expect(schema.settings).toContainEqual(expect.objectContaining({ type: 'product', id: 'product' }))
    expect(source).toContain("{% form 'product', product")
    expect(source).toContain('<select')
    expect(source).toContain('name="id"')
    expect(source).toContain("{{ 'product.add_to_cart' | t }}")
    expect(source).toContain('| money')
    expect(source).toContain("'product-1' | placeholder_svg_tag")
  })

  it('takes app blocks', () => {
    expect(schema.blocks).toContainEqual({ type: '@app' })
    expect(source).toContain("{% content_for 'blocks' %}")
  })
})

// The layout variants the hero and each slide share: the height, where the content sits and how it sits on the media.
const values = (setting: { options: { value: string }[] }) => setting.options.map((option) => option.value)
// A preset's value fits its setting: one of its options, or a step of its range.
const fits = (setting: { options?: { value: string }[]; min?: number; max?: number; step?: number }, value: unknown) =>
  setting.options ? values(setting as { options: { value: string }[] }).includes(value as string) : Number(value) >= setting.min! && Number(value) <= setting.max! && (Number(value) - setting.min!) % (setting.step ?? 1) === 0
const positions = ['top', 'middle', 'bottom'].flatMap((row) => ['left', 'center', 'right'].map((column) => `${row}_${column}`))

describe('Hero', () => {
  const source = readFileSync(path.join(projectDir, 'skills/shopify-theme-builder/catalog/sections/hero.liquid'), 'utf8')
  const schema = JSON.parse(source.match(/{% schema %}([\s\S]*){% endschema %}/)![1])
  const settings = Object.fromEntries(schema.settings.map((setting: { id?: string }) => [setting.id, setting]))
  const css = source.match(/{% stylesheet %}([\s\S]*){% endstylesheet %}/)![1]

  it('is a catalog section with a description, a color scheme and a preset that keeps the boxed layout', () => {
    expect(source).toMatch(/^{% comment %}.+{% endcomment %}\n/)
    expect(source).toContain('color-{{ section.settings.color_scheme }}"')
    expect(settings.color_scheme).toEqual({ type: 'color_scheme', id: 'color_scheme', label: 't:labels.color_scheme', default: 'scheme-1' })
    expect(schema.presets[0]).toEqual({ name: 't:general.hero' })
  })

  it('offers four heights, nine content positions and three content styles, defaulting to the boxed layout', () => {
    expect(values(settings.height)).toEqual(['small', 'medium', 'large', 'full_screen'])
    expect(settings.height.default).toBe('large')
    expect(values(settings.content_position)).toEqual(positions)
    expect(settings.content_position.default).toBe('middle_left')
    expect(values(settings.content_style)).toEqual(['bare', 'boxed', 'split'])
    expect(settings.content_style.default).toBe('boxed')
    for (const height of values(settings.height)) expect(css).toContain(`.hero--${height} {`)
  })

  it('shows the overlay opacity only for bare text, as a layer of the color scheme background over the media', () => {
    expect(settings.overlay_opacity).toMatchObject({ type: 'range', min: 0, unit: '%', visible_if: "{{ section.settings.content_style == 'bare' }}" })
    expect(css).toMatch(/\.hero--bare \.hero__media::after {[^}]*background-color: var\(--color-background\);[^}]*opacity: var\(--overlay-opacity\);/)
  })

  it('places the content in logical directions, so a right-to-left shop mirrors it', () => {
    expect(source).toMatch(/replace: 'left', 'start' \| replace: 'right', 'end'/)
    expect(css).toMatch(/\.hero__content {[^}]*align-self: var\(--content-block\);[^}]*justify-self: var\(--content-inline\);/)
  })

  it('plays its video on its own only without reduced motion and when the Merchant kept motion, with controls either way', () => {
    const video = source.match(/{{\s*section\.settings\.video[^}]*}}/)![0]
    expect(video).toContain('controls: true')
    expect(video).not.toContain('autoplay')
    expect(source).toMatch(/<hero-video{% if settings\.motion != 'none' %} data-autoplay{% endif %}>\s*{{\s*section\.settings\.video/)
    expect(source).toMatch(/if \(this\.hasAttribute\('data-autoplay'\) && !matchMedia\('\(prefers-reduced-motion: reduce\)'\)\.matches\)/)
    expect(source).toContain("customElements.define('hero-video'")
    expect(css).toMatch(/hero-video {\s*display: contents;/)
  })

  it('sizes the image for half the viewport when it sits beside the content', () => {
    expect(source).toContain("assign sizes = '(min-width: 750px) 50vw, 100vw'")
    expect(css).toMatch(/@media \(min-width: 750px\) {\s*\.hero--split {[^}]*grid-template-columns: 1fr 1fr;/)
  })

  it('offers each layout as a named preset', () => {
    expect(schema.presets.length).toBeGreaterThanOrEqual(4)
    for (const preset of schema.presets.slice(1)) {
      expect(preset.name).toMatch(/^t:general\.hero_/)
      for (const [id, value] of Object.entries(preset.settings)) expect(fits(settings[id], value), `${id}: ${value}`).toBe(true)
    }
    expect(schema.presets.map((preset: { settings?: { content_style?: string } }) => preset.settings?.content_style ?? 'boxed')).toEqual(
      expect.arrayContaining(['bare', 'boxed', 'split']),
    )
  })
})

describe('Slideshow', () => {
  const source = readFileSync(path.join(projectDir, 'skills/shopify-theme-builder/catalog/sections/slideshow.liquid'), 'utf8')
  const schema = JSON.parse(source.match(/{% schema %}([\s\S]*){% endschema %}/)![1])
  const settings = Object.fromEntries(schema.settings.map((setting: { id?: string }) => [setting.id, setting]))
  const slide = Object.fromEntries(schema.blocks[0].settings.map((setting: { id?: string }) => [setting.id, setting]))

  it('is a catalog section with a description, a color scheme and a preset with slides', () => {
    expect(source).toMatch(/^{% comment %}.+{% endcomment %}\n/)
    expect(source).toContain('class="slideshow full-width media-edge slideshow--{{ section.settings.height }} color-{{ section.settings.color_scheme }}"')
    expect(schema.settings).toContainEqual({ type: 'color_scheme', id: 'color_scheme', label: 't:labels.color_scheme', default: 'scheme-1' })
    expect(schema.presets[0]).toEqual({ name: 't:general.slideshow', blocks: [{ type: 'slide' }, { type: 'slide' }] })
    expect(schema.enabled_on).toBeUndefined()
  })

  it('offers the hero heights for the slideshow, and the content positions and styles for each slide', () => {
    expect(values(settings.height)).toEqual(['small', 'medium', 'large', 'full_screen'])
    expect(settings.height.default).toBe('large')
    expect(values(slide.content_position)).toEqual(positions)
    expect(values(slide.content_style)).toEqual(['bare', 'boxed', 'split'])
    expect(slide.content_style.default).toBe('boxed')
    expect(slide.overlay_opacity).toMatchObject({ type: 'range', visible_if: "{{ block.settings.content_style == 'bare' }}" })
  })

  it('offers each layout as a named preset with two slides', () => {
    expect(schema.presets.length).toBeGreaterThanOrEqual(4)
    for (const preset of schema.presets.slice(1)) {
      expect(preset.name).toMatch(/^t:general\.slideshow_/)
      expect(preset.blocks).toHaveLength(2)
      for (const block of preset.blocks) {
        for (const [id, value] of Object.entries(block.settings ?? {})) expect(fits(slide[id], value), `${id}: ${value}`).toBe(true)
      }
    }
  })

  it('shows full-width slides, each with an image, heading, text and button, and a placeholder without an image', () => {
    const ids = schema.blocks[0].settings.map((setting: { id?: string }) => setting.id)
    expect(ids).toEqual(expect.arrayContaining(['image', 'heading', 'text', 'button_label', 'button_link']))
    expect(source).toContain('placeholder_svg_tag')
    expect(source).toContain('scroll-snap-type: x mandatory')
  })

  it('does not autoplay by default, and lets customers pause it and step through with buttons, keys and swipe', () => {
    expect(schema.settings).toContainEqual(expect.objectContaining({ id: 'autoplay', type: 'checkbox', default: false }))
    expect(source).toContain(`aria-label="{{ 'slideshow.previous' | t }}"`)
    expect(source).toContain(`aria-label="{{ 'slideshow.next' | t }}"`)
    expect(source).toContain("{{ 'slideshow.pause' | t }}")
    expect(source).toContain("'ArrowLeft'")
    expect(source).toContain("'ArrowRight'")
    expect(source).toContain("matchMedia('(prefers-reduced-motion: reduce)')")
  })

  it('follows the ARIA carousel pattern: the pause button first, then the arrows, then a track that announces slides only while not rotating', () => {
    const controls = source.indexOf('<div class="slideshow__controls">')
    const track = source.indexOf('<div\n      id="Slideshow-{{ section.id }}"\n      class="slideshow__track"')
    expect(controls).toBeGreaterThan(-1)
    expect(track).toBeGreaterThan(controls)
    const buttons = [...source.slice(controls, track).matchAll(/<button[^>]*>/g)].map(([button]) => button)
    expect(buttons.map((button) => button.match(/data-(step="-?1"|pause)/)![1])).toEqual(['pause', 'step="-1"', 'step="1"'])
    for (const button of buttons) expect(button).toContain('aria-controls="Slideshow-{{ section.id }}"')
    expect(source.slice(track, source.indexOf('>', track))).toContain('aria-live="polite"')
    expect(source).toMatch(/this\.track\.setAttribute\('aria-live', rotating \? 'off' : 'polite'\)/)
    expect(source).toContain("this.addEventListener('focusin', () => this.live(), { signal })")
    expect(source).toContain("this.addEventListener('focusout', (event) => this.live(event.relatedTarget), { signal })")
    // The controls stay below the slides.
    expect(source).toMatch(/\.slideshow__controls {[^}]*order: 1;/)
  })

  it('does not autoplay when the Merchant turned motion off, and stays swipeable with working arrows', () => {
    expect(source).toMatch(/if several and section\.settings\.autoplay and settings\.motion != 'none'\s+assign autoplay = true/)
    expect(source).toMatch(/{% if autoplay %}\s*data-autoplay=/)
    expect(source).toMatch(/{% if autoplay %}\s*<button[^>]*data-pause/)
    expect(source).not.toMatch(/if [^%]*section\.settings\.autoplay %}/)
    expect(source).toMatch(/{% if several %}\s*<div class="slideshow__controls">/)
  })
})

describe('Header layouts', () => {
  const source = readFileSync(path.join(projectDir, 'skills/shopify-theme-builder/catalog/sections/header.liquid'), 'utf8')
  const schema = JSON.parse(source.match(/{% schema %}([\s\S]*){% endschema %}/)![1])
  const settings = Object.fromEntries(schema.settings.map((setting: { id?: string }) => [setting.id, setting]))
  const css = source.match(/{% stylesheet %}([\s\S]*){% endstylesheet %}/)![1]
  const script = source.match(/class HeaderMenu[\s\S]*?\n  }\n/)![0]

  it('offers three layouts, defaulting to the logo on the left with the menu beside it', () => {
    expect(values(settings.layout)).toEqual(['logo_left_menu_center', 'logo_center_menu_below', 'logo_left_drawer'])
    expect(settings.layout.default).toBe('logo_left_menu_center')
    expect(source).toContain('class="header full-width header--{{ section.settings.layout }}')
  })

  it('centers the logo with the menu on a row below it', () => {
    expect(css).toMatch(/\.header--logo_center_menu_below \.header__inner {[^}]*display: grid;[^}]*grid-template-columns: 1fr auto 1fr;/)
    expect(css).toMatch(/\.header--logo_center_menu_below \.header__logo {[^}]*grid-area: 1 \/ 2;/)
    expect(css).toMatch(/\.header--logo_center_menu_below \.header__menu {[^}]*grid-area: 2 \/ 1 \/ 3 \/ -1;/)
  })

  it('keeps the menu in the drawer on desktop too, with the selectors only in the icon row there', () => {
    expect(css).toMatch(/@media \(min-width: 750px\) {[\s\S]*\.header--logo_left_drawer \.header__menu {\s*display: none;[\s\S]*\.header--logo_left_drawer \.header__menu-button {\s*display: flex;/)
    expect(css).toMatch(/@media \(min-width: 750px\) {[\s\S]*\.header__drawer \.header__localization {\s*display: none;/)
  })

  it('sizes the logo from a height setting', () => {
    expect(settings.logo_height).toMatchObject({ type: 'range', unit: 'px', default: 48 })
    expect(source).toContain('--logo-height: {{ section.settings.logo_height }}px')
    expect(css).toMatch(/\.header__logo-image {[^}]*max-height: var\(--logo-height\);/)
    expect(css).toMatch(/\.header__logo-image--asset {[^}]*height: var\(--logo-height\);/)
  })

  it('sticks to the top when the Merchant turns it on, hiding as customers scroll down and coming back as they scroll up or tab into it', () => {
    expect(settings.sticky).toMatchObject({ type: 'checkbox', default: false })
    expect(source).toMatch(/{%- if section\.settings\.sticky %} header--sticky{% endif -%}/)
    // The section wrapper sticks, since a sticky element only sticks inside its parent.
    expect(css).toMatch(/\.shopify-section:has\(> \.header--sticky\) {[^}]*position: sticky;[^}]*inset-block-start: 0;/)
    expect(css).toMatch(/\.shopify-section:has\(> \.header--sticky\[data-hidden\]\) {[^}]*translate: 0 -100%;/)
    expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\) {\s*\.shopify-section:has\(> \.header--sticky\) {\s*transition: translate var\(--motion-duration\) var\(--motion-easing\);/)
    expect(script).toContain("this.closest('.header--sticky')")
    expect(script).toMatch(/addEventListener\(\s*'scroll'/)
    expect(script).toMatch(/toggleAttribute\('data-hidden'/)
    expect(script).toMatch(/addEventListener\(\s*'focusin'/)
  })

  it('keeps anchors, focus and sticky columns clear of the sticky header while it shows', () => {
    const read = (name: string) => readFileSync(path.join(projectDir, `skills/shopify-theme-builder/catalog/sections/${name}.liquid`), 'utf8')
    expect(script).toContain("setProperty('--header-offset'")
    expect(css).toMatch(/html:has\(\.header--sticky\) {\s*scroll-padding-block-start: var\(--header-offset\);/)
    expect(read('main-product')).toMatch(/\.main-product__details {\s*position: sticky;\s*top: calc\(var\(--header-offset, 0px\) \+ 2rem\);/)
    expect(read('editorial-split')).toMatch(/\.editorial-split__media {\s*position: sticky;\s*inset-block-start: calc\(var\(--header-offset, 0px\) \+ var\(--space-xl\)\);/)
  })

  it('offers each layout as a named preset', () => {
    expect(schema.presets[0]).toEqual({ name: 't:general.header' })
    expect(schema.presets.length).toBeGreaterThanOrEqual(4)
    for (const preset of schema.presets.slice(1)) {
      expect(preset.name).toMatch(/^t:general\.header_/)
      for (const [id, value] of Object.entries(preset.settings)) {
        expect(settings[id].type === 'checkbox' ? typeof value === 'boolean' : fits(settings[id], value), `${id}: ${value}`).toBe(true)
      }
    }
    expect(schema.presets.map((preset: { settings?: { layout?: string } }) => preset.settings?.layout ?? 'logo_left_menu_center')).toEqual(
      expect.arrayContaining(values(settings.layout)),
    )
  })
})

describe('Multicolumn', () => {
  const source = readFileSync(path.join(projectDir, 'skills/shopify-theme-builder/catalog/sections/multicolumn.liquid'), 'utf8')
  const schema = JSON.parse(source.match(/{% schema %}([\s\S]*){% endschema %}/)![1])

  it('is a catalog section with a description, a color scheme and a preset with columns', () => {
    expect(source).toMatch(/^{% comment %}.+{% endcomment %}\n/)
    expect(source).toContain('class="multicolumn full-width color-{{ section.settings.color_scheme }}"')
    expect(schema.settings).toContainEqual({ type: 'color_scheme', id: 'color_scheme', label: 't:labels.color_scheme', default: 'scheme-1' })
    expect(schema.presets[0]).toEqual({ name: 't:general.multicolumn', blocks: [{ type: 'column' }, { type: 'column' }, { type: 'column' }] })
    expect(schema.enabled_on).toBeUndefined()
  })

  it('shows columns, each with an icon or image, a heading and text, and a placeholder without an image', () => {
    const ids = schema.blocks[0].settings.map((setting: { id?: string }) => setting.id)
    expect(ids).toEqual(expect.arrayContaining(['image', 'heading', 'text']))
    expect(source).toContain('{% for block in section.blocks %}')
    expect(source).toContain('{{ block.shopify_attributes }}')
    expect(source).toContain("{{ 'image' | placeholder_svg_tag")
  })

  it('lays the columns out as icons (the default, as before), images on top, numbered steps or cards', () => {
    const layout = schema.settings.find((setting: { id: string }) => setting.id === 'layout')
    expect(layout).toMatchObject({ type: 'select', label: 't:labels.layout', default: 'icons' })
    expect(layout.options).toEqual([
      { value: 'icons', label: 't:options.layout.icons' },
      { value: 'images', label: 't:options.layout.images' },
      { value: 'numbered', label: 't:options.layout.numbered' },
      { value: 'cards', label: 't:options.layout.cards' },
    ])
    expect(source).toContain('multicolumn__grid--{{ section.settings.layout }}')
    expect(source).toContain('{{ forloop.index }}')
    for (const variable of ['--card-padding', '--card-border-width', '--card-background', '--style-border-radius-cards']) {
      expect(source).toContain(`var(${variable})`)
    }
  })

  it('offers each other layout as a named preset with the same columns', () => {
    expect(schema.presets.slice(1)).toEqual(
      ['images', 'numbered', 'cards'].map((layout) => ({ name: `t:general.multicolumn_${layout}`, settings: { layout }, blocks: schema.presets[0].blocks })),
    )
  })
})

describe('Rich text', () => {
  const source = readFileSync(path.join(projectDir, 'skills/shopify-theme-builder/catalog/sections/rich-text.liquid'), 'utf8')
  const schema = JSON.parse(source.match(/{% schema %}([\s\S]*){% endschema %}/)![1])
  const setting = (id: string) => schema.settings.find((candidate: { id: string }) => candidate.id === id)

  it('lays the text out centered (the default, as before) or aligned to the start and as wide as running text', () => {
    expect(setting('layout')).toMatchObject({ type: 'select', label: 't:labels.layout', default: 'centered' })
    expect(setting('layout').options).toEqual([
      { value: 'centered', label: 't:options.layout.centered' },
      { value: 'left_wide', label: 't:options.layout.left_wide' },
    ])
    expect(source).toContain('rich-text--{{ section.settings.layout }}')
    expect(setting('alignment').visible_if).toBe("{{ section.settings.layout != 'left_wide' }}")
  })

  it('shows an eyebrow above the heading and a second button beside the first, in any layout, when filled', () => {
    expect(setting('eyebrow')).toEqual({ type: 'text', id: 'eyebrow', label: 't:labels.eyebrow' })
    expect(setting('button_label_2')).toEqual({ type: 'text', id: 'button_label_2', label: 't:labels.button_label_2' })
    expect(setting('button_link_2')).toEqual({ type: 'url', id: 'button_link_2', label: 't:labels.button_link_2' })
    expect(source).toContain('{% if section.settings.eyebrow != blank %}')
    expect(source).toContain('<p class="rich-text__eyebrow text-label">{{ section.settings.eyebrow | escape }}</p>')
    expect(source).toContain('{% if section.settings.button_label_2 != blank %}')
    expect(source).toMatch(/class="button--secondary"\s+href="{{ section.settings.button_link_2/)
  })

  it('offers each other layout as a named preset with the same blocks as the first', () => {
    expect(schema.presets).toEqual([
      { name: 't:general.rich_text' },
      { name: 't:general.rich_text_left_wide', settings: { layout: 'left_wide' } },
      {
        name: 't:general.rich_text_eyebrow',
        settings: { eyebrow: 'New season', button_label: 'Shop all', button_label_2: 'Browse collections' },
      },
    ])
  })
})

describe('Video', () => {
  const source = readFileSync(path.join(projectDir, 'skills/shopify-theme-builder/catalog/sections/video.liquid'), 'utf8')
  const schema = JSON.parse(source.match(/{% schema %}([\s\S]*){% endschema %}/)![1])

  it('is a catalog section with a description, a color scheme and a preset', () => {
    expect(source).toMatch(/^{% comment %}.+{% endcomment %}\n/)
    expect(source).toContain('class="video full-width color-{{ section.settings.color_scheme }}"')
    expect(schema.settings).toContainEqual({ type: 'color_scheme', id: 'color_scheme', label: 't:labels.color_scheme', default: 'scheme-1' })
    expect(schema.presets).toEqual([{ name: 't:general.video' }])
    expect(schema.enabled_on).toBeUndefined()
  })

  it('plays a Shopify-hosted, YouTube or Vimeo video behind an optional cover image, with a placeholder until one is picked', () => {
    const settings = Object.fromEntries(schema.settings.map((setting: { id?: string }) => [setting.id, setting]))
    expect(settings.video.type).toBe('video')
    expect(settings.video_url).toMatchObject({ type: 'video_url', accept: ['youtube', 'vimeo'] })
    expect(settings.cover_image.type).toBe('image_picker')
    expect(settings.heading.type).toBe('inline_richtext')
    expect(source).toContain('| video_tag:')
    expect(source).toContain('https://www.youtube-nocookie.com/embed/')
    expect(source).toContain('https://player.vimeo.com/video/')
    expect(source).toContain("{{ 'video.play' | t }}")
    expect(source).toMatch(/'lifestyle-2' \| placeholder_svg_tag/)
  })
})

describe('Blog posts', () => {
  const source = readFileSync(path.join(projectDir, 'skills/shopify-theme-builder/catalog/sections/blog-posts.liquid'), 'utf8')
  const schema = JSON.parse(source.match(/{% schema %}([\s\S]*){% endschema %}/)![1])

  it('is a catalog section with a description, a color scheme and a preset', () => {
    expect(source).toMatch(/^{% comment %}.+{% endcomment %}\n/)
    expect(schema.settings).toContainEqual({ type: 'color_scheme', id: 'color_scheme', label: 't:labels.color_scheme', default: 'scheme-1' })
    expect(schema.presets[0]).toEqual({ name: 't:general.blog_posts' })
    expect(schema.enabled_on).toBeUndefined()
  })

  it('shows the latest articles of a blog with image, title, date and excerpt, with placeholders until a blog is picked', () => {
    const settings = Object.fromEntries(schema.settings.map((setting: { id?: string }) => [setting.id, setting]))
    expect(settings.blog.type).toBe('blog')
    expect(settings.posts_to_show.type).toBe('range')
    expect(source).toContain('for article in featured_blog.articles limit: section.settings.posts_to_show')
    expect(source).toContain('article.image')
    expect(source).toContain('article.title')
    expect(source).toContain("article.published_at | time_tag: format: 'date'")
    expect(source).toContain('article.excerpt_or_content')
    expect(source).toMatch(/'image' \| placeholder_svg_tag/)
  })

  const settings = Object.fromEntries(schema.settings.map((setting: { id?: string }) => [setting.id, setting]))
  const css = source.match(/{% stylesheet %}([\s\S]*){% endstylesheet %}/)![1]
  const desktop = css.match(/@media \(min-width: 750px\) {([\s\S]*?)\n  }/)![1]

  it('lays the articles out as cards by default, a featured article with a list, a list with thumbnails or a text list', () => {
    expect(source).toContain('class="blog-posts blog-posts--{{ section.settings.layout }} full-width color-{{ section.settings.color_scheme }}"')
    expect(settings.layout).toMatchObject({ type: 'select', label: 't:labels.layout', default: 'cards' })
    expect(values(settings.layout)).toEqual(['cards', 'featured', 'thumbnails', 'text_list'])
    expect(settings.columns).toMatchObject({ visible_if: "{{ section.settings.layout == 'cards' }}" })
  })

  it('shows the latest article large on the start side and the next ones as a list on the end side, stacked on mobile', () => {
    expect(desktop).toMatch(/\.blog-posts--featured \.blog-posts__grid {[^}]*grid-template-columns: 3fr 2fr;[^}]*grid-template-rows: repeat\(var\(--rows\), auto\) 1fr;/)
    expect(desktop).toMatch(/\.blog-posts--featured \.blog-posts__card:first-child {[^}]*grid-row: 1 \/ -1;/)
    expect(source).toContain('--rows: {{ rows }};')
    // Only the featured article has an image, and a larger title; the ones listed beside it have neither.
    expect(source).toMatch(/if layout == 'featured' and forloop\.first\s+assign title_class = 'text-h3'\s+elsif layout == 'featured'\s+assign show_image = false/)
    expect(source).toContain("assign sizes = '(min-width: 750px) 60vw, 100vw'")
  })

  it('lists one article a row with a small image beside its date, title and excerpt', () => {
    expect(css).toMatch(/\.blog-posts--thumbnails \.blog-posts__card {[^}]*display: grid;[^}]*grid-template-columns: 6rem 1fr;/)
    expect(desktop).toMatch(/\.blog-posts--thumbnails \.blog-posts__card {[^}]*grid-template-columns: 12rem 1fr;/)
    expect(desktop).toMatch(/\.blog-posts--thumbnails \.blog-posts__grid,\s*\.blog-posts--text_list \.blog-posts__grid {\s*grid-template-columns: 1fr;/)
    // The image stays in the ratio box the image ratio setting sets.
    expect(css).toMatch(/\.blog-posts__image {[^}]*aspect-ratio: var\(--image-ratio\);/)
  })

  it('lists only titles and dates in the text list, divided by rules, with no images or excerpts', () => {
    expect(css).toMatch(/\.blog-posts--text_list \.blog-posts__card \+ \.blog-posts__card {\s*border-block-start: var\(--border-width\) solid var\(--color-border-subtle\);/)
    expect(source).toMatch(/if layout == 'text_list'\s+assign show_images = false\s+assign show_excerpt = false/)
    expect(source).toContain('{% if show_excerpt %}')
  })

  it('offers each other layout as a named preset', () => {
    // A Theme made before the layouts keeps its look: the first preset sets no layout.
    expect(schema.presets).toEqual([
      { name: 't:general.blog_posts' },
      { name: 't:general.blog_posts_featured', settings: { layout: 'featured', posts_to_show: 4 } },
      { name: 't:general.blog_posts_thumbnails', settings: { layout: 'thumbnails', posts_to_show: 4 } },
      { name: 't:general.blog_posts_text_list', settings: { layout: 'text_list', posts_to_show: 6 } },
    ])
  })
})

describe('Image gallery', () => {
  const source = readFileSync(path.join(projectDir, 'skills/shopify-theme-builder/catalog/sections/image-gallery.liquid'), 'utf8')
  const schema = JSON.parse(source.match(/{% schema %}([\s\S]*){% endschema %}/)![1])

  it('is a catalog section with a description, a color scheme and a preset with images', () => {
    expect(source).toMatch(/^{% comment %}.+{% endcomment %}\n/)
    expect(schema.settings).toContainEqual({ type: 'color_scheme', id: 'color_scheme', label: 't:labels.color_scheme', default: 'scheme-1' })
    expect(schema.presets[0]).toEqual({ name: 't:general.image_gallery', blocks: [{ type: 'image' }, { type: 'image' }, { type: 'image' }] })
    expect(schema.enabled_on).toBeUndefined()
  })

  it('shows a grid of images, each with an optional caption and link, and a placeholder without an image', () => {
    const settings = Object.fromEntries(schema.blocks[0].settings.map((setting: { id?: string }) => [setting.id, setting]))
    expect(settings.image.type).toBe('image_picker')
    expect(settings.caption.type).toBe('text')
    expect(settings.link.type).toBe('url')
    expect(source).toContain('{% for block in section.blocks %}')
    expect(source).toContain('{{ block.shopify_attributes }}')
    expect(source).toContain('<figcaption')
    expect(source).toContain('href="{{ block.settings.link }}"')
    expect(source).toContain("{{ 'image' | placeholder_svg_tag")
  })

  const settings = Object.fromEntries(schema.settings.map((setting: { id?: string }) => [setting.id, setting]))
  const css = source.match(/{% stylesheet %}([\s\S]*){% endstylesheet %}/)![1]
  const desktop = css.match(/@media \(min-width: 750px\) {([\s\S]*?)\n  }/)![1]
  const images = (count: number) => Array.from({ length: count }, () => ({ type: 'image' }))

  it('lays the images out in an equal grid by default, as a bento or as a scrolling strip', () => {
    expect(source).toContain('class="image-gallery image-gallery--{{ section.settings.layout }} full-width color-{{ section.settings.color_scheme }}"')
    expect(settings.layout).toMatchObject({ type: 'select', label: 't:labels.layout', default: 'grid' })
    expect(values(settings.layout)).toEqual(['grid', 'bento', 'strip'])
    expect(settings.columns).toMatchObject({ visible_if: "{{ section.settings.layout == 'grid' }}" })
  })

  it('gives every fifth image, from the first, a large tile two rows and two columns big in the bento, across the row on mobile', () => {
    expect(css).toMatch(/\.image-gallery--bento \.image-gallery__item:nth-child\(5n \+ 1\) {[^}]*grid-column: 1 \/ -1;/)
    expect(desktop).toMatch(/\.image-gallery--bento \.image-gallery__grid {[^}]*grid-template-columns: repeat\(4, 1fr\);[^}]*grid-auto-flow: dense;/)
    expect(desktop).toMatch(/\.image-gallery--bento \.image-gallery__item:nth-child\(5n \+ 1\) {[^}]*grid-column: span 2;[^}]*grid-row: span 2;/)
    // The large tile fills its two rows whatever the image ratio (unless no image follows it), and loads an image twice as wide.
    expect(desktop).toMatch(/\.image-gallery--bento \.image-gallery__item:nth-child\(5n \+ 1\):not\(:last-child\) {\s*--image-ratio: auto;\s*}/)
    expect(desktop).toMatch(/\.image-gallery--bento \.image-gallery__item:nth-child\(5n \+ 1\):not\(:last-child\) \.image-gallery__media {[^}]*flex: 1;[^}]*contain: size;/)
    expect(source).toContain("assign sizes = '(min-width: 750px) 50vw, 100vw'")
  })

  it('scrolls the images in a full-bleed strip, snapped, with previous and next buttons that mirror right to left', () => {
    expect(css).toMatch(/\.image-gallery--strip \.image-gallery__inner {[^}]*grid-column: 1 \/ -1;/)
    expect(css).toMatch(/\.image-gallery--strip \.image-gallery__grid {[^}]*grid-auto-flow: column;[^}]*overflow-x: auto;[^}]*scroll-snap-type: x mandatory;[^}]*padding-inline: calc\(\(100% - var\(--content-width\)\) \/ 2\);[^}]*scroll-padding-inline: calc\(\(100% - var\(--content-width\)\) \/ 2\);/)
    expect(css).toMatch(/\.image-gallery--strip \.image-gallery__item {[^}]*scroll-snap-align: start;/)
    expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\) {\s*\.image-gallery--strip \.image-gallery__grid {\s*scroll-behavior: smooth;/)
    expect(css).toMatch(/\.image-gallery__control svg:dir\(rtl\) {\s*scale: -1 1;/)
    // The row takes the keyboard's arrows, and each button says what it does.
    expect(source).toMatch(/<ul\s+id="ImageGallery-{{ section\.id }}"[\s\S]*?{% if strip %}tabindex="0"{% endif %}/)
    expect(source).toContain('<image-gallery-strip class="image-gallery__strip">')
    for (const step of ['previous', 'next']) expect(source).toContain(`aria-label="{{ 'image_gallery.${step}' | t }}"`)
    expect(source).toContain("getComputedStyle(this).direction === 'rtl' ? -1 : 1")
  })

  it('offers each other layout as a named preset, the strip with tall images', () => {
    // A Theme made before the layouts keeps its look: the first preset sets no layout.
    expect(schema.presets).toEqual([
      { name: 't:general.image_gallery', blocks: images(3) },
      { name: 't:general.image_gallery_bento', settings: { layout: 'bento' }, blocks: images(5) },
      { name: 't:general.image_gallery_strip', settings: { layout: 'strip', image_ratio: 'portrait' }, blocks: images(6) },
    ])
  })
})

describe('Type banner', () => {
  const source = readFileSync(path.join(projectDir, 'skills/shopify-theme-builder/catalog/sections/type-banner.liquid'), 'utf8')
  const schema = JSON.parse(source.match(/{% schema %}([\s\S]*){% endschema %}/)![1])
  const settings = Object.fromEntries(schema.settings.map((setting: { id?: string }) => [setting.id, setting]))

  it('is a catalog section with a description, a color scheme and a preset', () => {
    expect(source).toMatch(/^{% comment %}.+{% endcomment %}\n/)
    expect(source).toMatch(/class="type-banner full-width color-{{ section\.settings\.color_scheme }}"/)
    expect(settings.color_scheme).toEqual({ type: 'color_scheme', id: 'color_scheme', label: 't:labels.color_scheme', default: 'scheme-1' })
    expect(schema.presets).toEqual([{ name: 't:general.type_banner' }])
    expect(schema.enabled_on).toBeUndefined()
  })

  it('sets a line or two of type at the display size or a step below, with the line break the Merchant types', () => {
    expect(settings.heading.type).toBe('textarea')
    expect(source).toMatch(/{{-? section\.settings\.heading \| escape \| newline_to_br -?}}/)
    expect(settings.size.options.map((option: { value: string }) => option.value)).toEqual(['display', 'h1', 'h2'])
    expect(settings.size.default).toBe('display')
    expect(source).toContain('class="type-banner__heading text-{{ section.settings.size }}"')
  })

  it('makes the heading the page heading only as the first section', () => {
    expect(source).toMatch(/assign heading_tag = 'h2'\s+if section\.index == 1\s+assign heading_tag = 'h1'/)
    expect(source).toContain('<{{ heading_tag }} class="type-banner__heading')
  })

  it('shows optional small text and a link under the type', () => {
    expect(settings.text.type).toBe('inline_richtext')
    expect(source).toMatch(/<p class="type-banner__text text-small">{{ section\.settings\.text }}<\/p>/)
    expect(settings.link_label.type).toBe('text')
    expect(settings.link.type).toBe('url')
    expect(source).toMatch(/<a class="type-banner__link text-label" href="{{ section\.settings\.link[^"]*}}">/)
  })
})

describe('Image with text', () => {
  const source = readFileSync(path.join(projectDir, 'skills/shopify-theme-builder/catalog/sections/image-with-text.liquid'), 'utf8')
  const schema = JSON.parse(source.match(/{% schema %}([\s\S]*){% endschema %}/)![1])
  const settings = Object.fromEntries(schema.settings.map((setting: { id?: string }) => [setting.id, setting]))
  const css = source.match(/{% stylesheet %}([\s\S]*){% endstylesheet %}/)![1]

  it('lays the image and text out side by side by default, on an overlapping panel or full bleed, with the image on either side', () => {
    expect(source).toContain(
      'class="image-with-text full-width image-with-text--{{ section.settings.layout }} image-with-text--image-{{ section.settings.image_position }} color-{{ section.settings.color_scheme }}{% if section.settings.layout == \'full_bleed\' %} media-edge{% endif %}"',
    )
    expect(settings.layout).toMatchObject({ type: 'select', label: 't:labels.layout', default: 'side_by_side' })
    expect(values(settings.layout)).toEqual(['side_by_side', 'overlap', 'full_bleed'])
    expect(values(settings.image_position)).toEqual(['left', 'right'])
    // A Theme made before the layouts keeps its look: the first preset sets no layout.
    expect(schema.presets[0]).toEqual({ name: 't:general.image_with_text' })
  })

  it('offers the image on the right and each other layout as a named preset', () => {
    expect(schema.presets.slice(1)).toEqual([
      { name: 't:general.image_with_text_right', settings: { image_position: 'right' } },
      { name: 't:general.image_with_text_overlap', settings: { layout: 'overlap' } },
      { name: 't:general.image_with_text_full_bleed', settings: { layout: 'full_bleed' } },
    ])
  })

  it("sets the text on a panel in the scheme's background over the image's edge on desktop, stacked under it on mobile", () => {
    const desktop = css.match(/@media \(min-width: 750px\) {([\s\S]*?)\n  }/)![1]
    expect(desktop).toMatch(/\.image-with-text--overlap \.image-with-text__content {[^}]*background-color: var\(--color-background\);[^}]*padding: var\(--space-2xl\);/)
    expect(desktop).toMatch(/\.image-with-text--overlap\.image-with-text--image-right \.image-with-text__media {[^}]*grid-column:/)
  })

  it('fills its half with the image to the edge of the page in the full bleed layout, square, the text in a narrow column', () => {
    expect(css).toMatch(/\.image-with-text--full_bleed \.image-with-text__inner {[^}]*grid-column: 1 \/ -1;/)
    expect(css).toMatch(/\.image-with-text:not\(\.image-with-text--full_bleed\) \.image-with-text__media {\s*border-radius: var\(--style-border-radius-media\);/)
    expect(css).toMatch(/\.image-with-text--full_bleed \.image-with-text__content {[^}]*max-width: var\(--width-text\);/)
  })
})

describe('Newsletter', () => {
  const source = readFileSync(path.join(projectDir, 'skills/shopify-theme-builder/catalog/sections/newsletter.liquid'), 'utf8')
  const schema = JSON.parse(source.match(/{% schema %}([\s\S]*){% endschema %}/)![1])
  const settings = Object.fromEntries(schema.settings.map((setting: { id?: string }) => [setting.id, setting]))
  const css = source.match(/{% stylesheet %}([\s\S]*){% endstylesheet %}/)![1]
  const desktop = css.match(/@media \(min-width: 750px\) {([\s\S]*?)\n  }/)![1]

  it('lays the signup out centered by default, split with an image or inline', () => {
    expect(source).toContain('class="newsletter full-width newsletter--{{ section.settings.layout }} color-{{ section.settings.color_scheme }}"')
    expect(settings.layout).toMatchObject({ type: 'select', label: 't:labels.layout', default: 'centered' })
    expect(values(settings.layout)).toEqual(['centered', 'split', 'inline'])
    // A Theme made before the layouts keeps its look: the first preset sets no layout.
    expect(schema.presets[0]).toEqual({ name: 't:general.newsletter' })
  })

  it("shows an optional image, Shopify's placeholder when blank, beside the signup in the split layout, stacked on mobile", () => {
    expect(settings.image).toEqual({
      type: 'image_picker',
      id: 'image',
      label: 't:labels.image',
      visible_if: "{{ section.settings.layout == 'split' }}",
    })
    expect(source).toContain("{% if section.settings.layout == 'split' %}")
    expect(source).toContain("{{ 'image' | placeholder_svg_tag: 'placeholder newsletter__placeholder' }}")
    expect(desktop).toMatch(/\.newsletter--split \.newsletter__inner {[^}]*grid-template-columns: 1fr 1fr;/)
  })

  it('sets the heading and text beside the form in one row on desktop in the inline layout', () => {
    expect(desktop).toMatch(/\.newsletter--inline \.newsletter__body {[^}]*flex-direction: row;/)
  })

  it('offers each other layout as a named preset with the same blocks as the first', () => {
    expect(schema.presets.slice(1)).toEqual([
      { name: 't:general.newsletter_split', settings: { layout: 'split' } },
      { name: 't:general.newsletter_inline', settings: { layout: 'inline' } },
    ])
  })
})

describe('FAQ', () => {
  const source = readFileSync(path.join(projectDir, 'skills/shopify-theme-builder/catalog/sections/faq.liquid'), 'utf8')
  const schema = JSON.parse(source.match(/{% schema %}([\s\S]*){% endschema %}/)![1])
  const settings = Object.fromEntries(schema.settings.map((setting: { id?: string }) => [setting.id, setting]))
  const css = source.match(/{% stylesheet %}([\s\S]*){% endstylesheet %}/)![1]
  const desktop = css.match(/@media \(min-width: 750px\) {([\s\S]*?)\n  }/)![1]
  const questions = (count: number) => Array.from({ length: count }, () => ({ type: 'question' }))

  it('lays the questions out as an accordion by default, on cards in two or three columns, or as a three-column list', () => {
    expect(source).toContain('class="faq full-width faq--{{ section.settings.layout }} color-{{ section.settings.color_scheme }}"')
    expect(settings.layout).toMatchObject({ type: 'select', label: 't:labels.layout', default: 'accordion' })
    expect(values(settings.layout)).toEqual(['accordion', 'two_column_cards', 'three_column_cards', 'three_column_list'])
    // A Theme made before the layouts keeps its look: the first preset sets no layout.
    expect(schema.presets[0]).toEqual({ name: 't:general.faq', blocks: questions(3) })
  })

  it('opens one answer at a time only in the accordion, and shows every other answer under its question', () => {
    expect(source).toContain("{% if section.settings.layout == 'accordion' %}")
    expect(source).toMatch(/<details class="faq__item"[\s\S]*<summary class="faq__question">/)
    expect(source).toMatch(/<h3 class="faq__question text-h5">/)
  })

  it('puts each question on a card only in the card layouts, in two or three columns on desktop, stacked on mobile', () => {
    for (const variable of ['--card-padding', '--card-border-width', '--card-background', '--style-border-radius-cards']) {
      expect(css).toContain(`var(${variable})`)
    }
    expect(css).toMatch(/\.faq--two_column_cards \.faq__item,\s*\.faq--three_column_cards \.faq__item {[^}]*padding: var\(--card-padding\);/)
    expect(css).toMatch(/\.faq:not\(\.faq--accordion\) \.faq__list {[^}]*display: grid;[^}]*grid-template-columns: 1fr;/)
    expect(css).toMatch(/\.faq--two_column_cards {\s*--faq-columns: 2;/)
    expect(css).toMatch(/\.faq--three_column_cards,\s*\.faq--three_column_list {\s*--faq-columns: 3;/)
    // As specific as the mobile rule, so it wins over it.
    expect(desktop).toMatch(/\.faq:not\(\.faq--accordion\) \.faq__list {[^}]*grid-template-columns: repeat\(var\(--faq-columns\), 1fr\);/)
    expect(source).toContain('data-reveal-stagger')
  })

  it('offers each other layout as a named preset, with a question for each of its cells', () => {
    expect(schema.presets.slice(1)).toEqual([
      { name: 't:general.faq_two_column_cards', settings: { layout: 'two_column_cards' }, blocks: questions(4) },
      { name: 't:general.faq_three_column_cards', settings: { layout: 'three_column_cards' }, blocks: questions(6) },
      { name: 't:general.faq_three_column_list', settings: { layout: 'three_column_list' }, blocks: questions(6) },
    ])
  })
})

describe('Logo list', () => {
  const source = readFileSync(path.join(projectDir, 'skills/shopify-theme-builder/catalog/sections/logo-list.liquid'), 'utf8')
  const schema = JSON.parse(source.match(/{% schema %}([\s\S]*){% endschema %}/)![1])
  const settings = Object.fromEntries(schema.settings.map((setting: { id?: string }) => [setting.id, setting]))
  const css = source.match(/{% stylesheet %}([\s\S]*){% endstylesheet %}/)![1]
  const desktop = css.match(/@media \(min-width: 750px\) {([\s\S]*?)\n  }/)![1]
  const logos = (count: number) => Array.from({ length: count }, () => ({ type: 'logo' }))

  it('lays the logos out in a row by default, on tiles beside the heading, or on a band', () => {
    expect(source).toContain('class="logo-list logo-list--{{ section.settings.layout }} full-width color-{{ section.settings.color_scheme }}"')
    expect(settings.layout).toMatchObject({ type: 'select', label: 't:labels.layout', default: 'row' })
    expect(values(settings.layout)).toEqual(['row', 'tile_grid', 'accent_band'])
    // A Theme made before the layouts keeps its look: the first preset sets no layout.
    expect(schema.presets[0]).toEqual({ name: 't:general.logo_list', blocks: logos(4) })
  })

  it('puts the heading and a short text on the start side of a 3 × 2 grid of tiles, stacked on mobile', () => {
    expect(settings.text).toMatchObject({ type: 'richtext', label: 't:labels.text', visible_if: "{{ section.settings.layout == 'tile_grid' }}" })
    expect(source).toMatch(/{% if layout == 'tile_grid' and section\.settings\.text != blank %}\s*<div class="logo-list__text rte">{{ section\.settings\.text }}<\/div>/)
    expect(css).toMatch(/\.logo-list--tile_grid \.logo-list__item {[^}]*padding: var\(--card-padding\);[^}]*border: var\(--card-border-width\) solid var\(--color-border\);[^}]*border-radius: var\(--style-border-radius-cards\);[^}]*background-color: var\(--card-background\);/)
    expect(css).toMatch(/\.logo-list--tile_grid \.logo-list__items {[^}]*display: grid;[^}]*grid-template-columns: repeat\(2, 1fr\);/)
    expect(desktop).toMatch(/\.logo-list--tile_grid \.logo-list__inner {[^}]*grid-template-columns: minmax\(0, 1fr\) minmax\(0, 2fr\);/)
    expect(desktop).toMatch(/\.logo-list--tile_grid \.logo-list__items {[^}]*grid-template-columns: repeat\(3, 1fr\);/)
    expect(source).toContain('data-reveal-stagger')
  })

  it('sets the logos in one row on a full-width band in its own color scheme, the heading above', () => {
    expect(settings.band_color_scheme).toMatchObject({
      type: 'color_scheme',
      label: 't:labels.band_color_scheme',
      visible_if: "{{ section.settings.layout == 'accent_band' }}",
    })
    expect(source).toContain('<div class="logo-list__band color-{{ section.settings.band_color_scheme }}">')
    expect(css).toMatch(/\.logo-list__band {[^}]*grid-column: 1 \/ -1;[^}]*grid-template-columns: var\(--content-grid\);/)
    expect(desktop).toMatch(/\.logo-list__band \.logo-list__items {[^}]*grid-auto-flow: column;/)
  })

  it('offers each other layout as a named preset, with a logo for each of its cells', () => {
    expect(schema.presets.slice(1)).toEqual([
      { name: 't:general.logo_list_tile_grid', settings: { layout: 'tile_grid' }, blocks: logos(6) },
      { name: 't:general.logo_list_accent_band', settings: { layout: 'accent_band' }, blocks: logos(5) },
    ])
  })
})

describe('Call to action', () => {
  const source = readFileSync(path.join(projectDir, 'skills/shopify-theme-builder/catalog/sections/call-to-action.liquid'), 'utf8')
  const schema = JSON.parse(source.match(/{% schema %}([\s\S]*){% endschema %}/)![1])
  const settings = Object.fromEntries(schema.settings.map((setting: { id?: string }) => [setting.id, setting]))
  const css = source.match(/{% stylesheet %}([\s\S]*){% endstylesheet %}/)![1]
  const desktop = css.match(/@media \(min-width: 750px\) {([\s\S]*?)\n  }/)![1]

  it('is a catalog section for the home and other pages, with a heading, a text and a color scheme', () => {
    expect(source).toMatch(/^{% comment %}.+{% endcomment %}\n/)
    expect(source).toContain('class="call-to-action call-to-action--{{ section.settings.layout }} full-width color-{{ section.settings.color_scheme }}"')
    expect(settings.color_scheme).toEqual({ type: 'color_scheme', id: 'color_scheme', label: 't:labels.color_scheme', default: 'scheme-1' })
    expect(settings.heading.type).toBe('inline_richtext')
    expect(settings.text.type).toBe('richtext')
    expect(source).toContain('<h2 class="call-to-action__heading">{{ section.settings.heading }}</h2>')
    expect(source).toContain('<div class="call-to-action__text rte">{{ section.settings.text }}</div>')
    expect(schema.enabled_on).toEqual({ templates: ['index', 'page'] })
  })

  it('lays it out as a centered band by default, split with an image, over an image, or in one row', () => {
    expect(settings.layout).toMatchObject({ type: 'select', label: 't:labels.layout', default: 'centered' })
    expect(settings.layout.options).toEqual([
      { value: 'centered', label: 't:options.layout.centered' },
      { value: 'split', label: 't:options.layout.split' },
      { value: 'over_image', label: 't:options.layout.over_image' },
      { value: 'inline', label: 't:options.layout.inline' },
    ])
    expect(css).toMatch(/\.call-to-action--centered \.call-to-action__content,[^{]*{[^}]*align-items: center;[^}]*text-align: center;/)
    expect(desktop).toMatch(/\.call-to-action--split \.call-to-action__inner {[^}]*grid-template-columns: 1fr 1fr;/)
    // The inline row keeps the heading on the start side and the buttons on the end side, stacked on mobile.
    expect(css).toMatch(/\.call-to-action__content {[^}]*flex-direction: column;/)
    expect(desktop).toMatch(/\.call-to-action--inline \.call-to-action__content {[^}]*flex-direction: row;[^}]*justify-content: space-between;/)
  })

  it('shows a primary button and, when filled, a secondary one beside it', () => {
    expect(settings.button_label).toMatchObject({ type: 'text', label: 't:labels.button_label' })
    expect(settings.button_label_2).toEqual({ type: 'text', id: 'button_label_2', label: 't:labels.button_label_2' })
    expect(settings.button_link_2).toEqual({ type: 'url', id: 'button_link_2', label: 't:labels.button_link_2' })
    expect(source).toMatch(/class="button"\s+href="{{ section\.settings\.button_link/)
    expect(source).toContain('{% if section.settings.button_label_2 != blank %}')
    expect(source).toMatch(/class="button--secondary"\s+href="{{ section\.settings\.button_link_2/)
  })

  it('shows an image only beside or behind the text, a placeholder until one is picked', () => {
    expect(settings.image).toEqual({
      type: 'image_picker',
      id: 'image',
      label: 't:labels.image',
      visible_if: "{{ section.settings.layout == 'split' or section.settings.layout == 'over_image' }}",
    })
    expect(source).toMatch(/{% if layout == 'split' or layout == 'over_image' %}\s*<div class="call-to-action__media">/)
    expect(source).toContain("{{ 'image' | placeholder_svg_tag: 'placeholder call-to-action__placeholder' }}")
    expect(css).toMatch(/\.call-to-action__media {[^}]*border-radius: var\(--style-border-radius-media\);/)
    // The split image takes the image ratio; over an image, it covers a banner as tall as the text needs.
    expect(css).toMatch(/\.call-to-action--split \.call-to-action__media {\s*aspect-ratio: var\(--image-ratio\);/)
    expect(css).toMatch(/\.call-to-action--over_image \.call-to-action__media img,\s*\.call-to-action--over_image \.call-to-action__placeholder {\s*position: absolute;\s*inset: 0;/)
  })

  it('lays the text over the image under an overlay of the background color, like the hero', () => {
    expect(settings.overlay_opacity).toMatchObject({
      type: 'range',
      label: 't:labels.overlay_opacity',
      info: 't:info.hero_overlay_opacity',
      visible_if: "{{ section.settings.layout == 'over_image' }}",
      default: 30,
    })
    expect(source).toContain('--overlay-opacity: {{ overlay_opacity }};')
    expect(css).toMatch(/\.call-to-action--over_image \.call-to-action__media,\s*\.call-to-action--over_image \.call-to-action__content {\s*grid-area: 1 \/ 1;/)
    expect(css).toMatch(/\.call-to-action--over_image \.call-to-action__media::after {[^}]*background-color: var\(--color-background\);[^}]*opacity: var\(--overlay-opacity\);/)
  })

  it('offers each layout as a named preset, the centered band on the inverse scheme', () => {
    expect(schema.presets).toEqual([
      { name: 't:general.call_to_action', settings: { color_scheme: 'scheme-2' } },
      { name: 't:general.call_to_action_split', settings: { layout: 'split' } },
      { name: 't:general.call_to_action_over_image', settings: { layout: 'over_image', overlay_opacity: 40 } },
      { name: 't:general.call_to_action_inline', settings: { layout: 'inline', spacing: 'tight' } },
    ])
  })
})

describe('Team', () => {
  const source = readFileSync(path.join(projectDir, 'skills/shopify-theme-builder/catalog/sections/team.liquid'), 'utf8')
  const schema = JSON.parse(source.match(/{% schema %}([\s\S]*){% endschema %}/)![1])
  const settings = Object.fromEntries(schema.settings.map((setting: { id?: string }) => [setting.id, setting]))
  const person = Object.fromEntries(schema.blocks[0].settings.map((setting: { id?: string }) => [setting.id, setting]))
  const css = source.match(/{% stylesheet %}([\s\S]*){% endstylesheet %}/)![1]
  const desktop = css.match(/@media \(min-width: 750px\) {([\s\S]*?)\n  }/)![1]

  it('is a catalog section for the home and other pages, with a heading, a text and a color scheme', () => {
    expect(source).toMatch(/^{% comment %}.+{% endcomment %}\n/)
    expect(source).toContain('class="team team--{{ section.settings.layout }} full-width color-{{ section.settings.color_scheme }}"')
    expect(settings.color_scheme).toEqual({ type: 'color_scheme', id: 'color_scheme', label: 't:labels.color_scheme', default: 'scheme-1' })
    expect(settings.heading.type).toBe('inline_richtext')
    expect(settings.text.type).toBe('richtext')
    expect(source).toContain('<h2 class="team__heading">{{ section.settings.heading }}</h2>')
    expect(source).toContain('<div class="team__text rte">{{ section.settings.text }}</div>')
    expect(schema.enabled_on).toEqual({ templates: ['index', 'page'] })
  })

  it('lists a person per block: a portrait, a name, a role, and an optional short line and link on the name', () => {
    expect(schema.blocks[0]).toMatchObject({ type: 'person', name: 't:general.person' })
    expect(person.image).toEqual({ type: 'image_picker', id: 'image', label: 't:labels.portrait' })
    expect(person.name).toMatchObject({ type: 'text', label: 't:labels.name' })
    expect(person.role).toMatchObject({ type: 'text', label: 't:labels.role' })
    expect(person.bio).toEqual({ type: 'text', id: 'bio', label: 't:labels.short_line' })
    expect(person.link).toEqual({ type: 'url', id: 'link', label: 't:labels.link', info: 't:info.team_link' })
    expect(source).toMatch(/<ul class="team__grid" data-reveal-stagger role="list">\s*{% for block in section\.blocks %}\s*<li class="team__person" {{ block\.shopify_attributes }}>/)
    expect(source).toMatch(/<a href="{{ block\.settings\.link }}">{{ block\.settings\.name \| escape }}<\/a>/)
    expect(source).toContain("{{ 'image' | placeholder_svg_tag: 'placeholder team__placeholder' }}")
    expect(css).toMatch(/\.team__role {[^}]*color: var\(--color-foreground-muted\);/)
  })

  it('lays people out as photo cards by default, round portraits, an inline list or cards, stacked on mobile', () => {
    expect(settings.layout).toMatchObject({ type: 'select', label: 't:labels.layout', default: 'photo_cards' })
    expect(settings.layout.options).toEqual([
      { value: 'photo_cards', label: 't:options.layout.photo_cards' },
      { value: 'round_portraits', label: 't:options.layout.round_portraits' },
      { value: 'inline_list', label: 't:options.layout.inline_list' },
      { value: 'cards', label: 't:options.layout.cards' },
    ])
    expect(css).toMatch(/\.team__grid {[^}]*grid-template-columns: 1fr;/)
    expect(desktop).toMatch(/\.team__grid {\s*grid-template-columns: repeat\(3, 1fr\);/)
    expect(desktop).toMatch(/\.team--round_portraits \.team__grid {\s*grid-template-columns: repeat\(4, 1fr\);/)
    expect(css).toMatch(/\.team--inline_list \.team__person {[^}]*flex-direction: row;/)
    expect(css).toMatch(/\.team--cards \.team__person {[^}]*padding: var\(--card-padding\);[^}]*border: var\(--card-border-width\) solid var\(--color-border\);[^}]*border-radius: var\(--style-border-radius-cards\);[^}]*background-color: var\(--card-background\);/)
  })

  it('gives photo cards the image ratio, and the other layouts small portraits in the badge shape', () => {
    expect(css).toMatch(/\.team--photo_cards \.team__portrait img,\s*\.team--photo_cards \.team__placeholder {[^}]*aspect-ratio: var\(--image-ratio\);/)
    expect(css).toMatch(/\.team--round_portraits \.team__portrait,\s*\.team--inline_list \.team__portrait,\s*\.team--cards \.team__portrait {[^}]*border-radius: var\(--style-border-radius-badges\);/)
  })

  it('offers each layout as a named preset', () => {
    const people = (count: number) => Array.from({ length: count }, () => ({ type: 'person' }))
    expect(schema.presets).toEqual([
      { name: 't:general.team', blocks: people(3) },
      { name: 't:general.team_round_portraits', settings: { layout: 'round_portraits' }, blocks: people(4) },
      { name: 't:general.team_inline_list', settings: { layout: 'inline_list' }, blocks: people(6) },
      { name: 't:general.team_cards', settings: { layout: 'cards' }, blocks: people(3) },
    ])
  })
})

describe('Editorial split', () => {
  const source = readFileSync(path.join(projectDir, 'skills/shopify-theme-builder/catalog/sections/editorial-split.liquid'), 'utf8')
  const schema = JSON.parse(source.match(/{% schema %}([\s\S]*){% endschema %}/)![1])
  const settings = Object.fromEntries(schema.settings.map((setting: { id?: string }) => [setting.id, setting]))
  const css = source.match(/{% stylesheet %}([\s\S]*){% endstylesheet %}/)![1]

  it('is a catalog section with a description, a color scheme and a preset', () => {
    expect(source).toMatch(/^{% comment %}.+{% endcomment %}\n/)
    expect(source).toMatch(/class="editorial-split full-width editorial-split--image-{{ section\.settings\.image_position }} color-{{ section\.settings\.color_scheme }}"/)
    expect(settings.color_scheme).toEqual({ type: 'color_scheme', id: 'color_scheme', label: 't:labels.color_scheme', default: 'scheme-1' })
    expect(schema.presets).toEqual([{ name: 't:general.editorial_split' }, { name: 't:general.editorial_split_right', settings: { image_position: 'right' } }])
    expect(schema.enabled_on).toBeUndefined()
  })

  it('sets an image beside a long text column, on either side on desktop', () => {
    expect(settings.image.type).toBe('image_picker')
    expect(settings.image_position.options.map((option: { value: string }) => option.value)).toEqual(['left', 'right'])
    expect(css).toMatch(/\.editorial-split__media {[^}]*aspect-ratio: var\(--image-ratio\);/)
    expect(settings.text.type).toBe('richtext')
    expect(css).toMatch(/\.editorial-split__content {[^}]*max-width: var\(--width-prose\);/)
  })

  it('offers a drop cap on the first paragraph, sized in lines rather than a font size', () => {
    expect(settings.drop_cap).toMatchObject({ type: 'checkbox', default: true })
    expect(source).toContain("{% if section.settings.drop_cap %} editorial-split__text--drop-cap{% endif %}")
    expect(css).toMatch(/\.editorial-split__text--drop-cap > p:first-child::first-letter {[^}]*initial-letter: 3;/)
  })

  it('shows an optional pull quote at a heading size from the type scale', () => {
    expect(settings.quote.type).toBe('inline_richtext')
    expect(source).toMatch(/{% if section\.settings\.quote != blank %}\s*<blockquote class="editorial-split__quote text-h3">/)
  })
})

describe('Marquee', () => {
  const source = readFileSync(path.join(projectDir, 'skills/shopify-theme-builder/catalog/sections/marquee.liquid'), 'utf8')
  const schema = JSON.parse(source.match(/{% schema %}([\s\S]*){% endschema %}/)![1])
  const settings = Object.fromEntries(schema.settings.map((setting: { id?: string }) => [setting.id, setting]))
  const css = source.match(/{% stylesheet %}([\s\S]*){% endstylesheet %}/)![1]
  const noPreference = css.match(/@media \(prefers-reduced-motion: no-preference\) {([\s\S]*)\n {2}}/)?.[1] ?? ''

  it('is a catalog section with a description, a color scheme and a preset with a few items', () => {
    expect(source).toMatch(/^{% comment %}.+{% endcomment %}\n/)
    expect(source).toMatch(/class="marquee full-width marquee--{{ section\.settings\.item_style }} color-{{ section\.settings\.color_scheme }}/)
    expect(settings.color_scheme).toEqual({ type: 'color_scheme', id: 'color_scheme', label: 't:labels.color_scheme', default: 'scheme-1' })
    expect(schema.presets[0].name).toBe('t:general.marquee')
    expect(schema.presets[0].blocks.length).toBeGreaterThan(1)
    expect(schema.enabled_on).toBeUndefined()
  })

  it('offers badges as a named preset with the same items', () => {
    expect(schema.presets[1]).toEqual({ name: 't:general.marquee_badges', settings: { item_style: 'badge' }, blocks: schema.presets[0].blocks })
  })

  it('scrolls short texts or badges, each an item block', () => {
    expect(schema.blocks).toEqual([expect.objectContaining({ type: 'item', name: 't:general.item' })])
    expect(settings.item_style.options.map((option: { value: string }) => option.value)).toEqual(['text', 'badge'])
    expect(css).toMatch(/\.marquee--badge \.marquee__item {[^}]*border: var\(--border-width\) solid var\(--color-border\);[^}]*border-radius: var\(--style-border-radius-badges\);/)
  })

  it('sets badges at the same heading size as texts, padded from the spacing scale', () => {
    expect(source).toMatch(/<li\s+class="marquee__item text-h3"/)
    expect(source).not.toContain('text-label')
    expect(css).toMatch(/\.marquee--badge \.marquee__item {[^}]*padding: var\(--space-xs\) var\(--space-lg\);/)
  })

  it('keeps its band close to one row of items, never taller than the section spacing', () => {
    expect(css).toMatch(/\.marquee {[^}]*padding-block: min\(var\(--section-spacing-start\), var\(--space-2xl\)\) min\(var\(--section-spacing\), var\(--space-2xl\)\);/)
  })

  it('stays one line when still, scrolling sideways with snap points instead of wrapping', () => {
    expect(css).not.toMatch(/flex-wrap: wrap/)
    expect(css).toMatch(/\.marquee__list {[^}]*flex-wrap: nowrap;[^}]*justify-content: safe center;/)
    expect(css).toMatch(/\.marquee__viewport {[^}]*overflow-x: auto;[^}]*scroll-snap-type: x proximity;/)
    expect(css).toMatch(/\.marquee__item {[^}]*scroll-snap-align: start;/)
    expect(noPreference).toMatch(/\.marquee--animated \.marquee__viewport {[^}]*overflow: hidden;/)
  })

  it('reads the items once to assistive technology, however often they repeat', () => {
    expect(source).toMatch(/<ul class="marquee__list" role="list"{% unless forloop\.first %} aria-hidden="true"{% endunless %}>/)
  })

  it('takes its loop duration from the speed setting, never a raw duration in the stylesheet', () => {
    expect(settings.speed.options.map((option: { value: string }) => option.value)).toEqual(['slow', 'medium', 'fast'])
    expect(source).toMatch(/style="--marquee-duration: {{ duration }}s;"/)
    expect(css).not.toMatch(/\d(m?s)\b/)
    expect(noPreference).toMatch(/animation: marquee var\(--marquee-duration\) linear infinite;/)
  })

  it('moves only without reduced motion and unless the Merchant turned motion off', () => {
    expect(source).toMatch(/if settings\.motion != 'none' and section\.blocks\.size > 0\s+assign animated = true/)
    expect(css.replace(/@media \(prefers-reduced-motion: no-preference\) {[\s\S]*\n {2}}/, '')).not.toMatch(/animation|@keyframes/)
  })

  it('pauses on hover, on focus and with a pause control customers can press', () => {
    // A visually hidden checkbox before its label, so the label shows the shared focus ring.
    expect(source).toMatch(
      /<input type="checkbox" id="MarqueePause-{{ section\.id }}" class="marquee__pause-input visually-hidden">\s*<label for="MarqueePause-{{ section\.id }}" class="marquee__pause">\s*<span class="visually-hidden">{{ 'marquee\.pause' \| t }}<\/span>/,
    )
    expect(noPreference).toMatch(/\.marquee:is\(:hover, :focus-within, :has\(\.marquee__pause-input:checked\)\) \.marquee__track {\s*animation-play-state: paused;/)
    expect(css).toMatch(/\.marquee__pause {[^}]*min-inline-size: var\(--target-size\);[^}]*min-block-size: var\(--target-size\);/)
  })

  it('lets the keyboard scroll a still row that overflows, keeping a moving one out of the tab order', () => {
    const script = source.match(/{% javascript %}([\s\S]*){% endjavascript %}/)?.[1] ?? ''
    const locale = JSON.parse(readFileSync(path.join(projectDir, 'skills/shopify-theme-builder/base-theme/locales/en.default.json'), 'utf8'))
    expect(source).toMatch(/<marquee-viewport class="marquee__viewport" role="region" aria-label="{{ 'marquee\.label' \| t }}">[\s\S]*<\/marquee-viewport>/)
    expect(locale.marquee.label).toBe('Highlights')
    // Still is what the stylesheet decides (reduced motion, or motion none): the row scrolls instead of hiding its overflow.
    expect(script).toMatch(/getComputedStyle\(this\)\.overflowX !== 'hidden' && this\.scrollWidth > this\.clientWidth/)
    expect(script).toMatch(/this\.tabIndex = 0;[\s\S]*this\.removeAttribute\('tabindex'\)/)
    expect(script).toMatch(/new ResizeObserver\(/)
    expect(script).toMatch(/matchMedia\('\(prefers-reduced-motion: reduce\)'\)\.addEventListener\('change'/)
    expect(script).toContain("customElements.define('marquee-viewport'")
  })

  it('scrolls toward the start of the line, mirrored in right-to-left shops', () => {
    expect(css).toMatch(/\.marquee__track:dir\(rtl\) {\s*--marquee-shift: 50%;/)
    expect(css).toMatch(/@keyframes marquee {\s*to {\s*translate: var\(--marquee-shift\);/)
  })
})

describe('Spec tiles', () => {
  const source = readFileSync(path.join(projectDir, 'skills/shopify-theme-builder/catalog/sections/spec-tiles.liquid'), 'utf8')
  const schema = JSON.parse(source.match(/{% schema %}([\s\S]*){% endschema %}/)![1])
  const settings = Object.fromEntries(schema.settings.map((setting: { id?: string }) => [setting.id, setting]))
  const css = source.match(/{% stylesheet %}([\s\S]*){% endstylesheet %}/)![1]

  it('is a catalog section with a description, a color scheme and a preset with a few tiles', () => {
    expect(source).toMatch(/^{% comment %}.+{% endcomment %}\n/)
    expect(source).toMatch(/class="spec-tiles full-width spec-tiles--{{ section\.settings\.tile_style }} color-{{ section\.settings\.color_scheme }}"/)
    expect(settings.color_scheme).toEqual({ type: 'color_scheme', id: 'color_scheme', label: 't:labels.color_scheme', default: 'scheme-1' })
    expect(schema.presets[0].name).toBe('t:general.spec_tiles')
    expect(schema.presets[0].blocks.length).toBeGreaterThan(1)
    expect(schema.enabled_on).toBeUndefined()
  })

  it('offers boxed tiles as a named preset with the same tiles', () => {
    expect(schema.presets[1]).toEqual({ name: 't:general.spec_tiles_boxes', settings: { tile_style: 'box' }, blocks: schema.presets[0].blocks })
  })

  it('shows each tile as a big value and its label, read label first', () => {
    expect(schema.blocks).toEqual([expect.objectContaining({ type: 'tile', name: 't:general.tile' })])
    expect(schema.blocks[0].settings.map((setting: { id: string }) => setting.id)).toEqual(['value', 'label'])
    expect(source).toMatch(
      /<dt class="spec-tiles__label text-label">{{ block\.settings\.label \| escape }}<\/dt>\s*<dd class="spec-tiles__value text-h2">{{ block\.settings\.value \| escape }}<\/dd>/,
    )
    expect(css).toMatch(/\.spec-tiles__tile {[^}]*flex-direction: column-reverse;/)
  })

  it('lays the tiles in a grid, two across on mobile and the Merchant’s columns on desktop', () => {
    expect(settings.columns).toMatchObject({ type: 'range', min: 2, max: 4 })
    expect(css).toMatch(/\.spec-tiles__grid {[^}]*grid-template-columns: repeat\(2, 1fr\);[^}]*gap: var\(--grid-gap\);/)
    expect(css).toMatch(/@media \(min-width: 750px\) {\s*\.spec-tiles__grid {\s*grid-template-columns: repeat\(var\(--columns\), 1fr\);/)
  })

  it('sets the tiles apart with a rule or a box, from the style system', () => {
    expect(settings.tile_style.options.map((option: { value: string }) => option.value)).toEqual(['rule', 'box'])
    expect(css).toMatch(/\.spec-tiles--rule \.spec-tiles__tile {[^}]*border-block-start: var\(--border-width\) solid var\(--color-border\);/)
    expect(css).toMatch(
      /\.spec-tiles--box \.spec-tiles__tile {[^}]*border: var\(--border-width\) solid var\(--color-border\);[^}]*border-radius: var\(--style-border-radius-cards\);/,
    )
  })
})

describe('Lookbook', () => {
  const source = readFileSync(path.join(projectDir, 'skills/shopify-theme-builder/catalog/sections/lookbook.liquid'), 'utf8')
  const schema = JSON.parse(source.match(/{% schema %}([\s\S]*){% endschema %}/)![1])
  const settings = Object.fromEntries(schema.settings.map((setting: { id?: string }) => [setting.id, setting]))
  const hotspot = schema.blocks[0]
  const blockSettings = Object.fromEntries(hotspot.settings.map((setting: { id?: string }) => [setting.id, setting]))
  const css = source.match(/{% stylesheet %}([\s\S]*){% endstylesheet %}/)![1]

  it('is a catalog section with a description, an image, a color scheme and a preset with a few hotspots', () => {
    expect(source).toMatch(/^{% comment %}.+{% endcomment %}\n/)
    expect(source).toContain('class="lookbook full-width color-{{ section.settings.color_scheme }}"')
    expect(settings.color_scheme).toEqual({ type: 'color_scheme', id: 'color_scheme', label: 't:labels.color_scheme', default: 'scheme-1' })
    expect(settings.image.type).toBe('image_picker')
    expect(source).toContain("'lifestyle-2' | placeholder_svg_tag: 'placeholder lookbook__placeholder'")
    expect(schema.presets[0].name).toBe('t:general.lookbook')
    expect(schema.presets[0].blocks.length).toBeGreaterThan(1)
    expect(schema.enabled_on).toBeUndefined()
  })

  it('places each hotspot, a product block, at an x and y position in percent of the image', () => {
    expect(hotspot).toEqual(expect.objectContaining({ type: 'hotspot', name: 't:general.hotspot' }))
    expect(blockSettings.product.type).toBe('product')
    for (const id of ['x', 'y']) expect(blockSettings[id]).toEqual(expect.objectContaining({ type: 'range', min: 0, max: 100, unit: '%' }))
    expect(source).toContain('style="--hotspot-x: {{ block.settings.x }}%; --hotspot-y: {{ block.settings.y }}%;')
    // The image keeps its own ratio, with no inset, so the hotspots stay where the Merchant put them.
    expect(css).toMatch(/\.lookbook__stage > img,\s*\.lookbook__placeholder {[^}]*height: auto;/)
    expect(css).toMatch(/\.lookbook__stage {\s*position: relative;/)
  })

  it('measures x from the left of the image in every language, since the image never mirrors', () => {
    expect(css).toMatch(/\.lookbook__hotspot {[^}]*inset-inline-start: var\(--hotspot-x\);[^}]*translate: -50% -50%;/)
    expect(css).toMatch(/\.lookbook__hotspot:dir\(rtl\) {\s*inset-inline-start: calc\(100% - var\(--hotspot-x\)\);\s*translate: 50% -50%;/)
  })

  it('opens a product card from a labelled button, with the keyboard too, through a native popover', () => {
    expect(source).toMatch(
      /<button\s+type="button"\s+class="lookbook__hotspot"\s+popovertarget="LookbookCard-{{ section\.id }}-{{ forloop\.index }}"[^>]*aria-label="{{ 'lookbook\.hotspot' \| t: product: [^}]+}}"/,
    )
    expect(source).toMatch(/<div\s+id="LookbookCard-{{ section\.id }}-{{ forloop\.index }}"\s+class="lookbook__card"\s+popover/)
    expect(source).toContain("{% render 'product-card', product: product %}")
    expect(css).toMatch(/\.lookbook__hotspot {[^}]*min-inline-size: var\(--target-size\);[^}]*min-block-size: var\(--target-size\);/)
    const locale = JSON.parse(readFileSync(path.join(projectDir, 'skills/shopify-theme-builder/base-theme/locales/en.default.json'), 'utf8'))
    expect(locale.lookbook.hotspot).toContain('{{ product }}')
  })

  it('shows the card next to its hotspot where the browser can anchor it, styled from the style system', () => {
    expect(css).toMatch(/\.lookbook__card {[^}]*border: var\(--border-width\) solid var\(--color-border\);[^}]*border-radius: var\(--style-border-radius-cards\);/)
    expect(css).toMatch(/@supports \(position-area: block-end\) {\s*\.lookbook__card {[^}]*position-area: block-end;/)
    expect(source).toContain('anchor-name: --lookbook-{{ section.id }}-{{ forloop.index }};')
    expect(source).toContain('style="position-anchor: --lookbook-{{ section.id }}-{{ forloop.index }};"')
  })
})

describe('Timeline', () => {
  const source = readFileSync(path.join(projectDir, 'skills/shopify-theme-builder/catalog/sections/timeline.liquid'), 'utf8')
  const schema = JSON.parse(source.match(/{% schema %}([\s\S]*){% endschema %}/)![1])
  const settings = Object.fromEntries(schema.settings.map((setting: { id?: string }) => [setting.id, setting]))
  const milestone = schema.blocks[0]
  const blockSettings = Object.fromEntries(milestone.settings.map((setting: { id?: string }) => [setting.id, setting]))
  const css = source.match(/{% stylesheet %}([\s\S]*){% endstylesheet %}/)![1]

  it('is a catalog section with a description, a heading, a color scheme and a preset with a few milestones', () => {
    expect(source).toMatch(/^{% comment %}.+{% endcomment %}\n/)
    expect(source).toContain('class="timeline full-width color-{{ section.settings.color_scheme }}"')
    expect(settings.color_scheme).toEqual({ type: 'color_scheme', id: 'color_scheme', label: 't:labels.color_scheme', default: 'scheme-1' })
    expect(settings.heading.type).toBe('inline_richtext')
    expect(schema.presets[0].name).toBe('t:general.timeline')
    expect(schema.presets[0].blocks.length).toBeGreaterThan(2)
    expect(schema.enabled_on).toBeUndefined()
  })

  it('lists milestones in order, each with a year, a heading, a text and an optional image', () => {
    expect(milestone).toEqual(expect.objectContaining({ type: 'milestone', name: 't:general.milestone' }))
    expect(blockSettings.year.type).toBe('text')
    expect(blockSettings.heading.type).toBe('text')
    expect(blockSettings.text.type).toBe('richtext')
    expect(blockSettings.image.type).toBe('image_picker')
    expect(source).toMatch(/<ol class="timeline__list"[^>]*>\s*{% for block in section\.blocks %}\s*<li class="timeline__item" {{ block\.shopify_attributes }}>/)
    expect(source).toContain('<div class="timeline__text rte">')
    // No placeholder: the image is optional, a milestone without one shows only its text.
    expect(source).toMatch(/{% if block\.settings\.image != blank %}\s*<div class="timeline__media">/)
    expect(source).not.toContain('placeholder_svg_tag')
  })

  it('draws a vertical line on mobile and a horizontal one on desktop, from the style system', () => {
    expect(css).toMatch(/\.timeline__item {[^}]*border-inline-start: var\(--border-width\) solid var\(--color-border\);/)
    expect(css).toMatch(
      /@media \(min-width: 750px\) {\s*\.timeline__list {\s*grid-template-columns: repeat\(var\(--columns\), 1fr\);[^}]*}\s*\.timeline__item {[^}]*border-inline-start: 0;[^}]*border-block-start: var\(--border-width\) solid var\(--color-border\);/,
    )
    expect(source).toContain('assign columns = section.blocks.size | at_most: 4 | at_least: 1')
    expect(source).toContain('style="--columns: {{ columns }};"')
    expect(css).toMatch(/\.timeline__item::before {[^}]*border-radius: var\(--style-border-radius-badges\);/)
  })

  it('shows each image filling its box, with the media radius of the style system', () => {
    expect(css).toMatch(/\.timeline__media {[^}]*border-radius: var\(--style-border-radius-media\);/)
    expect(css).toMatch(/\.timeline__media img {[^}]*object-fit: cover;/)
  })
})

describe('Process steps', () => {
  const source = readFileSync(path.join(projectDir, 'skills/shopify-theme-builder/catalog/sections/process-steps.liquid'), 'utf8')
  const schema = JSON.parse(source.match(/{% schema %}([\s\S]*){% endschema %}/)![1])
  const settings = Object.fromEntries(schema.settings.map((setting: { id?: string }) => [setting.id, setting]))
  const step = schema.blocks[0]
  const blockSettings = Object.fromEntries(step.settings.map((setting: { id?: string }) => [setting.id, setting]))
  const css = source.match(/{% stylesheet %}([\s\S]*){% endstylesheet %}/)![1]

  it('is a catalog section with a description, a heading, a color scheme and a preset with a few steps', () => {
    expect(source).toMatch(/^{% comment %}.+{% endcomment %}\n/)
    expect(source).toContain('class="process-steps full-width color-{{ section.settings.color_scheme }}"')
    expect(settings.color_scheme).toEqual({ type: 'color_scheme', id: 'color_scheme', label: 't:labels.color_scheme', default: 'scheme-1' })
    expect(settings.heading.type).toBe('inline_richtext')
    expect(schema.presets[0].name).toBe('t:general.process_steps')
    expect(schema.presets[0].blocks.length).toBeGreaterThan(2)
    expect(schema.enabled_on).toBeUndefined()
  })

  it('lists numbered steps in order, each with an image, a heading and a text', () => {
    expect(step).toEqual(expect.objectContaining({ type: 'step', name: 't:general.step' }))
    expect(blockSettings.image.type).toBe('image_picker')
    expect(blockSettings.heading.type).toBe('text')
    expect(blockSettings.text.type).toBe('richtext')
    expect(source).toMatch(/<ol class="process-steps__list" role="list"[^>]*>\s*{% for block in section\.blocks %}\s*<li class="process-steps__item" {{ block\.shopify_attributes }}>/)
    // The ordered list already gives screen readers each step's number, so the visible one is hidden from them.
    expect(source).toContain('<span class="process-steps__number text-h2" aria-hidden="true">{{ forloop.index }}</span>')
    expect(source).toContain('<div class="process-steps__text rte">')
  })

  it('shows each image, or a placeholder, filling its box, with the media radius of the style system', () => {
    expect(source).toMatch(/{% else %}\s*{{ 'image' \| placeholder_svg_tag: 'placeholder' }}/)
    expect(css).toMatch(/\.process-steps__media {[^}]*aspect-ratio: [^;]+;[^}]*border-radius: var\(--style-border-radius-media\);/)
    expect(css).toMatch(/\.process-steps__media > \* {[^}]*object-fit: cover;/)
  })

  it('stacks the steps on mobile and puts up to four in a row on desktop, spaced by the grid gap', () => {
    expect(source).toContain('assign columns = section.blocks.size | at_most: 4 | at_least: 1')
    expect(source).toContain('style="--columns: {{ columns }};"')
    expect(css).toMatch(/\.process-steps__list {[^}]*gap: var\(--grid-row-gap\) var\(--grid-gap\);/)
    expect(css).toMatch(/@media \(min-width: 750px\) {\s*\.process-steps__list {\s*grid-template-columns: repeat\(var\(--columns\), 1fr\);/)
  })
})

describe('Comparison table', () => {
  const source = readFileSync(path.join(projectDir, 'skills/shopify-theme-builder/catalog/sections/comparison-table.liquid'), 'utf8')
  const schema = JSON.parse(source.match(/{% schema %}([\s\S]*){% endschema %}/)![1])
  const settings = Object.fromEntries(schema.settings.map((setting: { id?: string }) => [setting.id, setting]))
  const row = schema.blocks[0]
  const blockSettings = Object.fromEntries(row.settings.map((setting: { id?: string }) => [setting.id, setting]))
  const css = source.match(/{% stylesheet %}([\s\S]*){% endstylesheet %}/)![1]

  it('is a catalog section with a description, a heading, a color scheme and a preset with a few rows', () => {
    expect(source).toMatch(/^{% comment %}.+{% endcomment %}\n/)
    expect(source).toContain('class="comparison-table full-width color-{{ section.settings.color_scheme }}"')
    expect(settings.color_scheme).toEqual({ type: 'color_scheme', id: 'color_scheme', label: 't:labels.color_scheme', default: 'scheme-1' })
    expect(settings.heading.type).toBe('inline_richtext')
    expect(schema.presets[0].name).toBe('t:general.comparison_table')
    expect(schema.presets[0].blocks.length).toBeGreaterThan(2)
    expect(schema.enabled_on).toBeUndefined()
  })

  it('compares up to four products or options, a column each, by rows of attributes', () => {
    for (const n of [1, 2, 3, 4]) {
      expect(settings[`option_${n}`]).toEqual(expect.objectContaining({ type: 'text', label: `t:labels.option_${n}` }))
      expect(blockSettings[`value_${n}`]).toEqual(expect.objectContaining({ type: 'text', label: `t:labels.option_${n}` }))
    }
    expect(settings.option_1.info).toBe('t:info.comparison_table_options')
    expect(row).toEqual(expect.objectContaining({ type: 'row', name: 't:general.row' }))
    expect(blockSettings.label.type).toBe('text')
    // A column shows only when its product or option has a name, in the header and in every row alike.
    expect(source.match(/{% if section\.settings\[option_key\] != blank %}/g)).toHaveLength(2)
    expect(source).toMatch(/<th class="comparison-table__option text-h6" scope="col">{{ section\.settings\[option_key\] \| escape }}<\/th>/)
    expect(source).toMatch(/<tr class="comparison-table__row" {{ block\.shopify_attributes }}>\s*<th class="comparison-table__label text-label" scope="row">{{ block\.settings\.label \| escape }}<\/th>/)
    expect(source).toContain('<td class="comparison-table__value">{{ block.settings[value_key] | escape }}</td>')
  })

  it('names the table for screen readers and lets the keyboard scroll it', () => {
    expect(source).toContain('<h2 class="comparison-table__heading" id="ComparisonTable-{{ section.id }}">')
    expect(source).toMatch(/<div\s+class="comparison-table__scroll"\s+role="region"\s+tabindex="0"/)
    expect(source).toContain("aria-label=\"{{ 'comparison_table.label' | t }}\"")
    expect(source).toContain('aria-labelledby="ComparisonTable-{{ section.id }}"')
  })

  it('scrolls sideways on narrow screens with the attribute column held in place', () => {
    expect(css).toMatch(/\.comparison-table__scroll {[^}]*overflow-x: auto;/)
    expect(css).toMatch(/\.comparison-table__label,\s*\.comparison-table__corner {[^}]*position: sticky;[^}]*inset-inline-start: 0;[^}]*background-color: var\(--color-background\);/)
    expect(css).toMatch(/\.comparison-table__table th,\s*\.comparison-table__table td {[^}]*padding: var\(--space-sm\) var\(--space-md\);[^}]*border-block-end: var\(--border-width\) solid var\(--color-border-subtle\);/)
    expect(css).toMatch(/\.comparison-table__table th,\s*\.comparison-table__table td {[^}]*text-align: start;/)
  })
})

describe('Press quotes', () => {
  const source = readFileSync(path.join(projectDir, 'skills/shopify-theme-builder/catalog/sections/press-quotes.liquid'), 'utf8')
  const schema = JSON.parse(source.match(/{% schema %}([\s\S]*){% endschema %}/)![1])
  const settings = Object.fromEntries(schema.settings.map((setting: { id?: string }) => [setting.id, setting]))
  const quote = schema.blocks[0]
  const blockSettings = Object.fromEntries(quote.settings.map((setting: { id?: string }) => [setting.id, setting]))
  const css = source.match(/{% stylesheet %}([\s\S]*){% endstylesheet %}/)![1]

  it('is a catalog section with a description, a heading, a color scheme and a preset with a few quotes', () => {
    expect(source).toMatch(/^{% comment %}.+{% endcomment %}\n/)
    expect(source).toContain('class="press-quotes full-width press-quotes--{{ section.settings.layout }} color-{{ section.settings.color_scheme }}"')
    expect(settings.color_scheme).toEqual({ type: 'color_scheme', id: 'color_scheme', label: 't:labels.color_scheme', default: 'scheme-1' })
    expect(settings.heading.type).toBe('inline_richtext')
    expect(schema.presets[0].name).toBe('t:general.press_quotes')
    expect(schema.presets[0].blocks.length).toBeGreaterThan(2)
    expect(schema.enabled_on).toBeUndefined()
  })

  it('shows each quote with the outlet’s logo, or its name without one, linked to the article', () => {
    expect(quote).toEqual(expect.objectContaining({ type: 'quote', name: 't:general.quote' }))
    expect(blockSettings.quote.type).toBe('richtext')
    expect(blockSettings.publication.type).toBe('text')
    expect(blockSettings.logo.type).toBe('image_picker')
    expect(blockSettings.link.type).toBe('url')
    expect(source).toMatch(/<figure class="press-quotes__figure">\s*<blockquote class="press-quotes__quote text-h5"/)
    expect(source).toMatch(/{% if block\.settings\.link != blank %}\s*<a\s+class="press-quotes__source"\s+href="{{ block\.settings\.link }}"/)
    // The logo stands for the outlet's name, so it carries the name as its text alternative.
    expect(source).toMatch(/image_tag: alt: publication,[^}]*sizes: /)
    expect(source).toMatch(/{% else %}\s*<span class="press-quotes__name text-label">{{ publication \| escape }}<\/span>/)
    expect(source).toContain("'press_quotes.link' | t: publication: publication")
    const locale = JSON.parse(readFileSync(path.join(projectDir, 'skills/shopify-theme-builder/base-theme/locales/en.default.json'), 'utf8'))
    expect(locale.press_quotes.link).toContain('{{ publication }}')
  })

  it('lays the quotes in a row or a wall, stacked on mobile and spaced by the grid gap', () => {
    expect(settings.layout.options.map((option: { value: string }) => option.value)).toEqual(['row', 'wall'])
    expect(css).toMatch(/\.press-quotes__list {[^}]*gap: var\(--grid-row-gap\) var\(--grid-gap\);/)
    expect(css).toMatch(/@media \(min-width: 750px\) {\s*\.press-quotes--row \.press-quotes__list {\s*grid-template-columns: repeat\(var\(--columns\), 1fr\);/)
    expect(css).toMatch(/\.press-quotes--wall \.press-quotes__list {[^}]*columns: 3;[^}]*column-gap: var\(--grid-gap\);/)
    expect(css).toMatch(/\.press-quotes--wall \.press-quotes__item {[^}]*break-inside: avoid;[^}]*margin-block-end: var\(--grid-row-gap\);/)
  })

  it('takes its borders, radius and link target size from the style system', () => {
    expect(css).toMatch(/\.press-quotes__figure {[^}]*border: var\(--border-width\) solid var\(--color-border-subtle\);[^}]*border-radius: var\(--style-border-radius-cards\);/)
    expect(css).toMatch(/\.press-quotes__source {[^}]*min-block-size: var\(--target-size-min\);/)
  })
})

describe('Testimonials', () => {
  const source = readFileSync(path.join(projectDir, 'skills/shopify-theme-builder/catalog/sections/testimonials.liquid'), 'utf8')
  const schema = JSON.parse(source.match(/{% schema %}([\s\S]*){% endschema %}/)![1])
  const settings = Object.fromEntries(schema.settings.map((setting: { id?: string }) => [setting.id, setting]))
  const blockSettings = Object.fromEntries(schema.blocks[0].settings.map((setting: { id?: string }) => [setting.id, setting]))
  const css = source.match(/{% stylesheet %}([\s\S]*){% endstylesheet %}/)![1]

  it('lays the quotes out as a grid by default, a large quote, a carousel or with portraits', () => {
    expect(source).toContain('class="testimonials full-width testimonials--{{ section.settings.layout }} color-{{ section.settings.color_scheme }}"')
    expect(settings.layout).toMatchObject({ type: 'select', label: 't:labels.layout', default: 'grid' })
    expect(values(settings.layout)).toEqual(['grid', 'large_quote', 'carousel', 'portraits'])
    // A Theme made before the layouts keeps its grid: the first preset sets no layout.
    expect(schema.presets[0].settings?.layout).toBeUndefined()
  })

  it('offers each other layout as a named preset with the same testimonials', () => {
    expect(schema.presets.slice(1)).toEqual(
      ['large_quote', 'carousel', 'portraits'].map((layout) => ({
        name: `t:general.testimonials_${layout}`,
        settings: { layout },
        blocks: schema.presets[0].blocks,
      })),
    )
  })

  it('sets the first quote large and centered in the heading style in the large quote layout, the others in a row below', () => {
    expect(source).toMatch(/if section\.settings\.layout == 'large_quote' and forloop\.first/)
    expect(source).toContain('text-h3')
    expect(css).toMatch(/\.testimonials--large_quote \.testimonials__item:first-child {[^}]*grid-column: 1 \/ -1;/)
    expect(css).toMatch(/\.testimonials--large_quote \.testimonials__item:first-child \.testimonials__quote {[^}]*font-family: var\(--font-heading--family\);/)
  })

  it('scrolls the quotes in the carousel layout, with previous and next buttons, never on its own, mirrored right to left', () => {
    expect(source).toMatch(/<testimonials-carousel/)
    expect(css).toMatch(/\.testimonials--carousel \.testimonials__list {[^}]*scroll-snap-type: x mandatory;/)
    expect(source).toContain('tabindex="0"')
    expect(source).toContain(`aria-label="{{ 'testimonials.previous' | t }}"`)
    expect(source).toContain(`aria-label="{{ 'testimonials.next' | t }}"`)
    expect(css).toMatch(/\.testimonials__control svg:dir\(rtl\) {\s*scale: -1 1;/)
    expect(source).toContain("getComputedStyle(this).direction === 'rtl'")
    expect(source).not.toMatch(/setInterval|autoplay/)
    // Smooth scrolling is motion: only when the customer has not asked for less.
    expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\) {\s*\.testimonials--carousel \.testimonials__list {\s*scroll-behavior: smooth;/)
    expect(css).toMatch(/@media \(min-width: 750px\) {[^@]*\.testimonials--carousel \.testimonials__list {/)
    const locale = JSON.parse(readFileSync(path.join(projectDir, 'skills/shopify-theme-builder/base-theme/locales/en.default.json'), 'utf8'))
    expect(locale.testimonials).toMatchObject({ previous: expect.any(String), next: expect.any(String) })
  })

  it('shows a small portrait beside each author in the portraits layout, only when the testimonial has one', () => {
    expect(blockSettings.image).toEqual({ type: 'image_picker', id: 'image', label: 't:labels.image', info: 't:info.testimonials_image' })
    expect(source).toMatch(/if section\.settings\.layout == 'portraits' and block\.settings\.image != blank/)
    expect(source).toMatch(/block\.settings\.image\s*\| image_url: width: \d+, height: \d+, crop: 'center'/)
    expect(css).toMatch(/\.testimonials__portrait {[^}]*border-radius: var\(--style-border-radius-badges\);/)
  })
})

describe('Product recommendations', () => {
  const source = readFileSync(path.join(projectDir, 'skills/shopify-theme-builder/catalog/sections/related-products.liquid'), 'utf8')
  const schema = JSON.parse(source.match(/{% schema %}([\s\S]*){% endschema %}/)![1])

  it('loads related or complementary products through the recommendations endpoint', () => {
    const intent = schema.settings.find((setting: { id: string }) => setting.id === 'intent')
    expect(intent.options.map((option: { value: string }) => option.value)).toEqual(['related', 'complementary'])
    expect(intent.default).toBe('related')
    expect(source).toContain('{{ routes.product_recommendations_url }}?product_id={{ product.id }}')
    expect(source).toContain('&intent={{ section.settings.intent }}')
  })

  it('offers a complementary products preset', () => {
    expect(schema.presets).toContainEqual(expect.objectContaining({ settings: expect.objectContaining({ intent: 'complementary' }) }))
  })

  it('renders nothing outside the Theme Editor when there are no recommendations', () => {
    expect(source).toContain('{% if recommendations.products_count > 0 or show_placeholders %}')
    expect(source).toMatch(/recommendations\.products_count == 0 and request\.design_mode/)
  })
})

describe('Product rows', () => {
  const read = (name: string) => readFileSync(path.join(projectDir, `skills/shopify-theme-builder/catalog/sections/${name}.liquid`), 'utf8')

  // Two columns on a phone leave the third of three cards alone on its row: below 750px the row swipes instead,
  // one row whatever the count, each card three quarters wide so the next one peeks in.
  it.each(['featured-collection', 'related-products'])('%s swipes as one snapped row below 750px, never a grid with a lone card', (name) => {
    const css = read(name).match(/{% stylesheet %}([\s\S]*){% endstylesheet %}/)![1]
    const grid = `.${name}__grid`
    const mobile = css.match(/@media \(max-width: 749px\) {([\s\S]*?)\n  }\n/)![1]
    expect(mobile).toMatch(new RegExp(`\\${grid} {[^}]*grid-auto-flow: column;[^}]*grid-auto-columns: 75%;[^}]*overflow-x: auto;[^}]*scroll-snap-type: x mandatory;`))
    expect(mobile).toMatch(new RegExp(`\\${grid} > \\* {\\s*scroll-snap-align: start;`))
    // Keyboard: focusing a card's title link scrolls it into view. Right to left: a column-flow grid follows the
    // page's direction, so the row starts on the right with no rule of its own.
    // No two-column grid outside the desktop rule, so an odd count can't orphan a card.
    expect(css.replace(/@media \(min-width: 750px\) {[\s\S]*?\n  }\n/, '')).not.toMatch(/grid-template-columns: repeat\(2/)
  })

  it.each(['featured-collection', 'related-products'])('%s presets show a multiple of their desktop columns, so no desktop row ends short', (name) => {
    const schema = JSON.parse(read(name).match(/{% schema %}([\s\S]*){% endschema %}/)![1])
    const defaults = Object.fromEntries(schema.settings.map((setting: { id: string; default: unknown }) => [setting.id, setting.default]))
    for (const preset of schema.presets) {
      const { products_to_show, columns } = { ...defaults, ...preset.settings }
      expect(products_to_show % columns, preset.name).toBe(0)
    }
  })
})

describe('Quick add', () => {
  const skillDir = path.join(projectDir, 'skills/shopify-theme-builder')
  const read = (file: string) => readFileSync(path.join(skillDir, file), 'utf8')
  const parse = (source: string) => JSON.parse(source.match(/{% schema %}([\s\S]*){% endschema %}/)![1])
  const cards = { 'featured-collection': 'product', 'main-collection': 'product', 'main-search': 'result', 'related-products': 'recommendation' }

  it.each(Object.entries(cards))('has a setting to show quick add on %s cards', (name, item) => {
    const source = read(`catalog/sections/${name}.liquid`)
    expect(parse(source).settings).toContainEqual({ type: 'checkbox', id: 'show_quick_add', label: 't:labels.show_quick_add', default: true })
    expect(source).toMatch(new RegExp(`{% render 'product-card', product: ${item}, show_quick_add: section\\.settings\\.show_quick_add[,\\s%]`))
    const card = read('base-theme/snippets/product-card.liquid')
    expect(card).toMatch(/{% if show_quick_add( and anatomy != 'editorial')? %}/)
    expect(card).toContain('{% if product.has_only_default_variant and product.requires_selling_plan == false %}')
  })

  it('adds a single-variant product from a card with a form the cart drawer takes, or a post to /cart without it', () => {
    const card = read('base-theme/snippets/product-card.liquid')
    expect(card).toMatch(/<form[^>]*action="{{ routes\.cart_add_url }}" method="post"[^>]*data-quick-add-form/)
    expect(card).toContain('<input type="hidden" name="id" value="{{ product.selected_or_first_available_variant.id }}">')
    expect(card).toContain("'quick_add.add_label' | t: product: product.title")
    const quickAdd = read('catalog/sections/header.liquid')
    expect(quickAdd).toMatch(/const drawer = document\.querySelector\('cart-drawer'\);\s*if \(!drawer\?\.add\) return;\s*event\.preventDefault\(\);/)
    expect(quickAdd).toContain("event.target.closest('[data-quick-add-form]')")
  })

  it('loads its script and styles from a section every page renders, since a section fetched through the Section Rendering API brings neither', () => {
    const groups = ['header-group.json', 'footer-group.json'].map((file) => JSON.parse(read(`catalog/sections/${file}`)))
    const everyPage = groups.flatMap((group) => Object.values(group.sections).map((section: any) => section.type as string))
    const script = (name: string) => read(`catalog/sections/${name}.liquid`).match(/{% javascript %}([\s\S]*){% endjavascript %}/)?.[1] ?? ''
    const sections = readdirSync(path.join(skillDir, 'catalog/sections')).filter((file) => file.endsWith('.liquid')).map((file) => file.replace('.liquid', ''))
    for (const needle of ["customElements.define('quick-add-dialog'", "closest('[data-quick-add]')", "closest('[data-quick-add-form]')"]) {
      const loaders = sections.filter((name) => script(name).includes(needle))
      expect(loaders, needle).not.toEqual([])
      for (const name of loaders) expect(everyPage, `${needle} in ${name}`).toContain(name)
    }
    expect(read('catalog/sections/header.liquid')).toMatch(/{% stylesheet %}[\s\S]*\n  \.quick-add {[\s\S]*{% endstylesheet %}/)
    expect(read('catalog/sections/quick-add.liquid')).not.toContain('{% stylesheet %}')
  })

  it('links a product with variants on a card to its page, which quick add opens in a dialog instead', () => {
    const card = read('base-theme/snippets/product-card.liquid')
    expect(card).toMatch(/<a\s+class="button product-card__quick-add-button"\s+href="{{ product_url }}"\s+aria-haspopup="dialog"/)
    expect(card).toContain("'quick_add.choose_options_label' | t: product: product.title")
    expect(card).toMatch(/\s+data-quick-add\s/)
  })

  describe('dialog', () => {
    const source = read('catalog/sections/quick-add.liquid')
    const script = read('catalog/sections/header.liquid')
    const schema = parse(source)
    const locale = JSON.parse(read('base-theme/locales/en.default.json'))

    it('renders the variant picker and the product form of the product in a dialog, with a close button', () => {
      expect(source).toMatch(/<quick-add-dialog>\s*<dialog class="quick-add color-{{ section\.settings\.color_scheme }}"/)
      expect(source).toMatch(/<form method="dialog">\s*<button[^>]*aria-label="{{ 'quick_add\.close' \| t }}"/)
      expect(source).toContain('{% for option in product.options_with_values %}')
      expect(source).toContain('data-option-value-id="{{ option_value.id }}"')
      expect(source).toContain("{% form 'product', product")
      expect(source).toContain('<input type="hidden" name="id" value="{{ current_variant.id }}">')
      for (const key of ['add', 'add_label', 'choose_options', 'choose_options_label', 'close', 'view_details']) expect(locale.quick_add[key], key).toBeTruthy()
    })

    it('loads through the Section Rendering API, re-renders when an option changes and falls back to the product page', () => {
      expect(script).toContain("searchParams.set('section_id', 'quick-add')")
      expect(script).toContain("searchParams.set('option_values', optionValues)")
      expect(script).toContain("event.target.closest('[data-quick-add]')")
      expect(script).toContain('location.assign(trigger.href)')
    })

    it('handles focus like the cart drawer: modal, closes on the backdrop, returns focus to the card', () => {
      expect(script).toContain('this.dialog.showModal()')
      expect(script).toContain('event.target === this.dialog && this.dialog.close()')
      expect(script).toMatch(/addEventListener\(\s*'close'/)
      expect(script).toContain('this.opener?.focus()')
      expect(script).toContain("customElements.define('quick-add-dialog'")
    })

    it('hands the add to the cart drawer, which opens with focus returning to the card', () => {
      expect(script).toMatch(/const drawer = document\.querySelector\('cart-drawer'\);\s*if \(!drawer\?\.add\) return;\s*event\.preventDefault\(\);\s*this\.dialog\.close\(\);\s*drawer\.add\(event\.target, this\.opener\)/)
    })

    it('is rendered only through the Section Rendering API, so neither the Studio nor the Theme Editor offers it', () => {
      expect(schema.enabled_on).toEqual({ groups: ['header'] })
      expect(schema.presets).toBeUndefined()
      expect(schema.settings).toContainEqual({ type: 'color_scheme', id: 'color_scheme', label: 't:labels.color_scheme', default: 'scheme-1' })
    })

    it('is copied into every new Theme by the skill', () => {
      expect(starterFiles).toContain('sections/quick-add.liquid')
    })
  })
})

describe('Structured data', () => {
  const baseTheme = path.join(projectDir, 'skills/shopify-theme-builder/base-theme')

  it('describes the shop as an Organization with its name, logo and social links on every page', () => {
    const meta = readFileSync(path.join(baseTheme, 'snippets/meta-tags.liquid'), 'utf8')
    const organization = meta.slice(meta.indexOf('"@type": "Organization"'))
    expect(organization).toContain('"name": {{ shop.name | json }}')
    expect(organization).toMatch(/"logo": {{ logo_url \| json }}/)
    expect(organization).toMatch(/"sameAs": \[{{ same_as }}\]/)
    for (const network of ['instagram', 'facebook', 'tiktok', 'x', 'youtube', 'pinterest']) {
      expect(meta).toContain(network)
    }
  })

  it("describes a product page's product and an article page's article with Shopify's structured data", () => {
    const meta = readFileSync(path.join(baseTheme, 'snippets/meta-tags.liquid'), 'utf8')
    expect(meta).toMatch(/{%- if request\.page_type == 'product' -%}\s*<script type="application\/ld\+json">\s*{{ product \| structured_data }}/)
    expect(meta).toMatch(/{%- if request\.page_type == 'article' -%}\s*<script type="application\/ld\+json">\s*{{ article \| structured_data }}/)
  })

  it('shares the page image over https only', () => {
    const meta = readFileSync(path.join(baseTheme, 'snippets/meta-tags.liquid'), 'utf8')
    expect(meta).toMatch(/property="og:image"\s+content="https:{{ page_image \| image_url }}"/)
    expect(meta).not.toContain('http:{{')
  })

  it('shows breadcrumbs with BreadcrumbList data on product, collection, article and page templates, with a setting to hide them', () => {
    const layout = readFileSync(path.join(baseTheme, 'layout/theme.liquid'), 'utf8')
    expect(layout).toMatch(/{% sections 'header-group' %}\s*{% render 'breadcrumbs' %}\s*<main/)

    const snippet = readFileSync(path.join(baseTheme, 'snippets/breadcrumbs.liquid'), 'utf8')
    expect(snippet).toContain('settings.show_breadcrumbs')
    for (const pageType of ['product', 'collection', 'article', 'page']) expect(snippet).toContain(`when '${pageType}'`)
    expect(snippet).toContain('"@type": "BreadcrumbList"')
    expect(snippet).toContain('"@type": "ListItem"')
    expect(snippet).toMatch(/<nav class="breadcrumbs" aria-label="{{ 'breadcrumbs\.label' \| t }}">/)
    expect(snippet).toContain('aria-current="page"')

    const settings = parseJSON(readFileSync(path.join(baseTheme, 'config/settings_schema.json'), 'utf8'))
    const all = settings.flatMap((group: { settings?: object[] }) => group.settings ?? [])
    expect(all).toContainEqual(expect.objectContaining({ id: 'show_breadcrumbs', type: 'checkbox', default: true }))
  })

  it('gives breadcrumb links the minimum target size', () => {
    const snippet = readFileSync(path.join(baseTheme, 'snippets/breadcrumbs.liquid'), 'utf8')
    expect(snippet).toMatch(/\.breadcrumbs a {[^}]*display: inline-flex;[^}]*align-items: center;[^}]*min-inline-size: var\(--target-size-min\);[^}]*min-block-size: var\(--target-size-min\);/)
  })
})

describe('Right-to-left languages', () => {
  const skillDir = path.join(projectDir, 'skills/shopify-theme-builder')
  const files = (dir: string, ext: string) =>
    readdirSync(path.join(skillDir, dir), { recursive: true, encoding: 'utf8' })
      .filter((file) => file.endsWith(ext))
      .map((file) => path.join(dir, file))

  it.each(['base-theme/layout/theme.liquid', 'base-theme/layout/password.liquid', 'base-theme/templates/gift_card.liquid'])(
    'sets the page direction from the locale in %s',
    (file) => {
      expect(readFileSync(path.join(skillDir, file), 'utf8')).toContain(
        '<html lang="{{ request.locale.iso_code }}" dir="{{ request.locale.direction }}">',
      )
    },
  )

  it('styles the Base Theme and the Section Catalog with logical properties, so layouts mirror', () => {
    for (const file of [...files('base-theme', '.liquid'), ...files('catalog', '.liquid'), ...files('base-theme', '.css')]) {
      const source = readFileSync(path.join(skillDir, file), 'utf8')
      expect(source, file).not.toMatch(/[\s;{](left|right|(margin|padding|border)-(left|right))\s*:/)
      expect(source, file).not.toMatch(/[\s;{](margin|padding):\s*[^\s;]+\s+[^\s;]+\s+[^\s;]+\s+[^\s;]+\s*;/)
    }
  })

  it.each(['base-theme/blocks/text.liquid', 'catalog/sections/rich-text.liquid'])('aligns text to the start or end of the line in %s', (file) => {
    expect(readFileSync(path.join(skillDir, file), 'utf8')).toMatch(
      /--text-align: {{ (block|section)\.settings\.alignment \| replace: 'left', 'start' \| replace: 'right', 'end' }}/,
    )
  })
})

describe('Type scale', () => {
  const skillDir = path.join(projectDir, 'skills/shopify-theme-builder')
  const read = (file: string) => readFileSync(path.join(skillDir, file), 'utf8')
  const files = (dir: string) =>
    readdirSync(path.join(skillDir, dir), { recursive: true, encoding: 'utf8' })
      .filter((file) => file.endsWith('.liquid'))
      .map((file) => path.join(dir, file))
  const styles = ['display', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'body', 'small', 'label']

  it('defines one type scale, with line heights for headings and body, in the CSS variables', () => {
    const variables = read('base-theme/snippets/css-variables.liquid')
    for (const style of styles) expect(variables).toMatch(new RegExp(`--font-size-${style}:`))
    expect(variables).toMatch(/--line-height-heading:/)
    expect(variables).toMatch(/--line-height-body:/)
  })

  it('gives every text style a shared class in critical.css, sized only from the scale', () => {
    const critical = read('base-theme/assets/critical.css')
    for (const style of styles) expect(critical).toMatch(new RegExp(`\\.text-${style}\\b`))
    for (const [, value] of critical.matchAll(/(?:font-size|line-height)\s*:\s*([^;]+);/g)) expect(value).toMatch(/^var\(--/)
  })

  it('leaves font sizes and line heights to the shared text styles in every section, block and snippet', () => {
    for (const file of [...files('base-theme'), ...files('catalog')]) {
      expect(read(file), file).not.toMatch(/[\s;{"'](font-size|line-height)\s*:/)
    }
  })
})

describe('Style system', () => {
  const skillDir = path.join(projectDir, 'skills/shopify-theme-builder')
  const read = (file: string) => readFileSync(path.join(skillDir, file), 'utf8')
  const stylesheets = ['base-theme', 'catalog'].flatMap((dir) =>
    readdirSync(path.join(skillDir, dir), { recursive: true, encoding: 'utf8' })
      .filter((file) => file.endsWith('.liquid'))
      .map((file) => path.join(dir, file))
      .map((file) => ({ file, css: [...read(file).matchAll(/{%-? stylesheet -?%}([\s\S]*?){%-? endstylesheet -?%}/g)].map((m) => m[1]).join('\n') }))
      .filter(({ css }) => css),
  )
  // Raw values a stylesheet may still use for these properties: sizes of one component, not of the design.
  const allowed = new Set(['max-width: 10rem'])

  it('defines spacing, widths, borders, the focus ring and muted text as variables', () => {
    const variables = read('base-theme/snippets/css-variables.liquid')
    for (const name of ['2xs', 'xs', 'sm', 'md', 'lg', 'xl', '2xl']) expect(variables).toMatch(new RegExp(`--space-${name}:`))
    for (const name of [
      '--section-spacing',
      '--width-narrow',
      '--width-text',
      '--width-prose',
      '--border-width',
      '--color-border',
      '--color-border-subtle',
      '--style-border-radius-pill',
      '--focus-ring-width',
      '--focus-ring-offset',
      '--opacity-muted',
      '--opacity-disabled',
    ]) {
      expect(variables).toMatch(new RegExp(`${name}:`))
    }
    expect(variables).toMatch(/750px/)
  })

  it('shares the focus ring, visually hidden text and placeholders in critical.css', () => {
    const critical = read('base-theme/assets/critical.css')
    expect(critical).toMatch(/:focus-visible[^{]*{[^}]*outline: var\(--focus-ring-width\)/)
    expect(critical).toMatch(/\.visually-hidden\b[^{]*{[^}]*clip-path/)
    expect(critical).toMatch(/\.placeholder {[^}]*fill:/)
  })

  it('leaves the focus ring, visually hidden text and placeholder colors out of every section, block and snippet', () => {
    for (const { file, css } of stylesheets) {
      expect(css, file).not.toMatch(/:focus-visible[^{]*{[^}]*[\s;{]outline\s*:/)
      expect(css, file).not.toMatch(/\.visually-hidden\s*{/)
      expect(css, file).not.toMatch(/\.placeholder[^{]*{[^}]*(fill|background-color)\s*:/)
    }
  })

  it('rejects raw spacing, gaps, radii, borders, widths and opacities in every stylesheet', () => {
    for (const { file, css } of stylesheets) {
      for (const [declaration, property, value] of css.matchAll(/([a-z-]+)\s*:\s*([^;{}]+);/g)) {
        const checked = /^(padding|margin|gap|row-gap|column-gap|border|outline|max-width)/.test(property)
        if (checked && /\d(rem|px)\b|clamp\(/.test(value) && !allowed.has(`${property}: ${value.trim()}`)) {
          expect.fail(`${file}: ${declaration.trim()} uses a raw value; use a style system variable`)
        }
        if (property === 'opacity' && /^0?\.\d/.test(value.trim())) expect.fail(`${file}: ${declaration.trim()}`)
        if (/rgb\(from var\(--color-foreground\)|color-mix\(in srgb, currentcolor 15%/.test(value)) expect.fail(`${file}: ${declaration.trim()}`)
      }
    }
  })

  it('takes the accent and border colors from each color scheme', () => {
    const variables = read('base-theme/snippets/css-variables.liquid')
    expect(variables).toContain('--color-accent: {{ scheme.settings.accent }};')
    expect(variables).toContain('--color-border: {{ scheme.settings.border }};')
    expect(variables).toMatch(/--color-border-subtle: rgb\(from {{ scheme\.settings\.border }} r g b \/ [\d.]+\);/)
  })

  it('derives muted text per scheme: the text mixed toward the background only as far as 4.5:1 allows', () => {
    const variables = read('base-theme/snippets/css-variables.liquid')
    const schemes = variables.slice(variables.indexOf('{% for scheme in settings.color_schemes %}'))
    // 70% text first, as the old opacity looked; then more text until it reads, with a margin for the rounding of
    // color_contrast; the text itself when no mix does. check-direction.mjs derives it the same way.
    expect(schemes).toMatch(/assign muted_text = scheme\.settings\.text\s+for step in \(14\.\.19\)\s+assign share = step \| times: 5/)
    expect(schemes).toMatch(/assign mix = scheme\.settings\.text \| color_mix: scheme\.settings\.background, share/)
    expect(schemes).toMatch(/assign mix_contrast = mix \| color_contrast: scheme\.settings\.background\s+if mix_contrast >= 4\.6\s+assign muted_text = mix\s+break/)
    expect(schemes).toContain('--color-foreground-muted: {{ muted_text }};')
  })

  it('mutes text with the muted color, and keeps the muted opacity for unavailable options and thumbnails', () => {
    const critical = read('base-theme/assets/critical.css')
    const faded = [...stylesheets, { file: 'critical.css', css: critical }].flatMap(({ css }) =>
      [...css.matchAll(/([^{}]+){[^{}]*opacity: var\(--opacity-muted\)/g)].map(([, selector]) => selector.trim()),
    )
    expect(faded.sort()).toEqual(['.featured-product__thumbnail', '.main-product__thumbnail', '.quick-add__option-label--unavailable', '.variant-picker__option-label--unavailable'])
    expect(critical).toMatch(/\.product-card__vendor,\s*\.product-card__rating,\s*\.product-card__compare-at {\s*color: var\(--color-foreground-muted\);/)
  })

  it('borders every input and select with the border color, not the text color', () => {
    const critical = read('base-theme/assets/critical.css')
    for (const { file, css } of [...stylesheets, { file: 'critical.css', css: critical }]) {
      for (const [, selectors, body] of css.matchAll(/([^{}]+){([^{}]*)}/g)) {
        if (/\b(input|select|textarea)\b/.test(selectors) && /border(-[a-z-]+)?\s*:[^;]*currentcolor/.test(body)) {
          expect.fail(`${file}: ${selectors.trim()} has a currentcolor border; use var(--color-border)`)
        }
      }
    }
  })

  it('colors sale prices, links in running text and the cart count with the accent color', () => {
    const critical = read('base-theme/assets/critical.css')
    expect(critical).toMatch(/\.price__sale {[^}]*color: var\(--color-accent\)/)
    expect(critical).toMatch(/\.rte a[^{]*{[^}]*color: var\(--color-accent\)/)
    expect(read('catalog/sections/header.liquid')).toMatch(/\.header__cart-count {[^}]*background-color: var\(--color-accent\)/)
    for (const file of ['base-theme/blocks/_product-price.liquid', 'catalog/sections/featured-product.liquid', 'catalog/sections/quick-add.liquid']) {
      const sale = read(file).match(/compare_at_price > [\s\S]*?{% else %}/)![0]
      expect(sale, file).toMatch(/<span class="price__sale">{{ [\w.]*price \| money }}<\/span>/)
    }
    // The Merchant's running text: page and article content, the collection description and text settings.
    const runningText = /<div class="[^"]*">{{ (page\.content|article\.content|collection\.description|content|(section|block)\.settings\.(text|answer)) }}/g
    const files = ['base-theme', 'catalog'].flatMap((dir) =>
      readdirSync(path.join(skillDir, dir), { recursive: true, encoding: 'utf8' })
        .filter((file) => file.endsWith('.liquid'))
        .map((file) => path.join(dir, file)),
    )
    // Text over a hero image or slide keeps the text color: the accent is checked against the background only.
    const overMedia = ['catalog/sections/hero.liquid', 'catalog/sections/slideshow.liquid']
    const wrappers = files
      .filter((file) => !overMedia.includes(file))
      .flatMap((file) => [...read(file).matchAll(runningText)].map(([tag]) => ({ file, tag })))
    expect(wrappers.length).toBeGreaterThanOrEqual(10)
    for (const { file, tag } of wrappers) expect(tag, file).toMatch(/class="[^"]*\brte\b/)
  })

  it('switches layouts at the one 750px breakpoint', () => {
    for (const { file, css } of stylesheets) {
      for (const [query] of css.matchAll(/\((min|max)-width:[^)]*\)/g)) {
        expect(['(min-width: 750px)', '(max-width: 749px)'], file).toContain(query)
      }
    }
  })
})

describe('Touch targets and text measure', () => {
  const skillDir = path.join(projectDir, 'skills/shopify-theme-builder')
  const read = (file: string) => readFileSync(path.join(skillDir, file), 'utf8')
  const liquidFiles = ['base-theme', 'catalog'].flatMap((dir) =>
    readdirSync(path.join(skillDir, dir), { recursive: true, encoding: 'utf8' })
      .filter((file) => file.endsWith('.liquid'))
      .map((file) => path.join(dir, file)),
  )
  const markup = liquidFiles.map((file) => ({ file, source: read(file) }))
  const css = [
    read('base-theme/assets/critical.css'),
    ...markup.flatMap(({ source }) => [...source.matchAll(/{%-? stylesheet -?%}([\s\S]*?){%-? endstylesheet -?%}/g)].map((m) => m[1])),
  ]
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
  // Every rule, as its selectors (split on commas outside parentheses) and its declarations.
  const rules = [...css.matchAll(/([^{}]+){([^{}]*)}/g)].map(([, selectors, body]) => ({
    selectors: selectors.split(/,(?![^(]*\))/).map((s) => s.trim()),
    body,
  }))
  const px = { '--target-size': 44, '--target-size-min': 24 }
  // The smallest size, in px, the stylesheets give a selector on one axis: 0 when none does.
  const target = (selector: string, axis: 'block' | 'inline') =>
    Math.max(
      0,
      ...rules
        .filter((rule) => rule.selectors.includes(selector))
        .flatMap((rule) => [...rule.body.matchAll(new RegExp(`min-${axis}-size:\\s*var\\((--target-size(?:-min)?)\\)`, 'g'))])
        .map((m) => px[m[1] as keyof typeof px]),
    )
  const field = "input:not([type='checkbox'], [type='radio'])"

  it('defines a 44px size for primary controls and a 24px floor for every other target', () => {
    const variables = read('base-theme/snippets/css-variables.liquid')
    expect(variables).toMatch(/--target-size: 44px;/)
    expect(variables).toMatch(/--target-size-min: 24px;/)
  })

  it('gives every button, summary, select and field the 24px floor, and buttons, selects and fields 44px', () => {
    for (const selector of ['button', 'summary', 'select', 'textarea', field]) {
      expect(target(selector, 'block'), selector).toBeGreaterThanOrEqual(24)
      expect(target(selector, 'inline'), selector).toBeGreaterThanOrEqual(24)
    }
    for (const selector of ['.button', '.button--secondary', 'select', field]) expect(target(selector, 'block'), selector).toBe(44)
  })

  it('sizes every icon control to at least 24px square, from the target variables', () => {
    const icons = markup.flatMap(({ file, source }) =>
      [...source.matchAll(/<(button|summary|a)\b([^>]*aria-label[^>]*)>([\s\S]*?)<\/\1>/g)]
        .filter(([, , , content]) => /<svg|inline_asset_content/.test(content))
        .map(([, , attributes]) => ({ file, selector: `.${attributes.match(/class="([\w-]+)/)?.[1]}` })),
    )
    expect(icons.length).toBeGreaterThan(5)
    for (const { file, selector } of icons) {
      expect(target(selector, 'block'), `${file} ${selector}`).toBeGreaterThanOrEqual(24)
      expect(target(selector, 'inline'), `${file} ${selector}`).toBeGreaterThanOrEqual(24)
    }
  })

  it('makes the menu and close buttons and the variant options 44px square', () => {
    for (const selector of ['.header__menu-button', '.header__drawer-close', '.quick-add__close', '.variant-picker__option-label', '.quick-add__option-label']) {
      expect(target(selector, 'block'), selector).toBe(44)
      expect(target(selector, 'inline'), selector).toBe(44)
    }
  })

  it('gives menu links and every label around a checkbox or radio button the 24px floor', () => {
    const labels = markup.flatMap(({ source }) =>
      [...source.matchAll(/<label\b[^>]*?\sclass="([\w-]+)"[^>]*>\s*<input[^>]*type="(checkbox|radio)"/g)].map((m) => `.${m[1]}`),
    )
    expect(labels).toContain('.main-collection__filter-value')
    for (const selector of ['.header__menu-link', ...labels]) expect(target(selector, 'block'), selector).toBeGreaterThanOrEqual(24)
  })

  it('caps running text at about 70 characters a line', () => {
    expect(read('base-theme/snippets/css-variables.liquid')).toMatch(/--width-prose: 70ch;/)
    for (const selector of ['.basic-page__text', '.rich-text__inner > *', '.faq__list', '.main-article__header', '.main-collection__description']) {
      expect(rules.some((rule) => rule.selectors.includes(selector) && /max-width: var\(--width-prose\)/.test(rule.body)), selector).toBe(true)
    }
  })
})

describe('Type settings', () => {
  const skillDir = path.join(projectDir, 'skills/shopify-theme-builder')
  const read = (file: string) => readFileSync(path.join(skillDir, file), 'utf8')
  const typography = parseJSON(read('base-theme/config/settings_schema.json')).find(
    (group: { name: string }) => group.name === 't:general.typography',
  )
  const setting = (id: string) => typography.settings.find((s: { id?: string }) => s.id === id)
  const variables = read('base-theme/snippets/css-variables.liquid')
  const critical = read('base-theme/assets/critical.css')

  it('has an accent font next to the heading and body fonts, Work Sans like them by default', () => {
    for (const id of ['type_heading_font', 'type_body_font', 'type_accent_font']) {
      expect(setting(id)).toMatchObject({ type: 'font_picker', default: 'work_sans_n4' })
    }
  })

  it('sizes the type from a scale ratio, a body size and a display size, defaulting to the old scale', () => {
    expect(setting('type_scale_ratio')).toMatchObject({ type: 'range', min: 120, max: 160, unit: '%', default: 130 })
    expect(setting('type_body_size')).toMatchObject({ type: 'range', min: 14, max: 18, unit: 'px', default: 16 })
    expect(setting('type_display_size')).toMatchObject({ type: 'range', unit: 'px', default: 56 })
  })

  it('sizes display type on phones from its own setting, growing linearly from 390px to the display size at 1200px', () => {
    const mobile = setting('type_display_size_mobile')
    expect(mobile).toMatchObject({ type: 'range', min: 24, unit: 'px', label: 't:labels.display_size_mobile', default: 36 })
    expect(mobile.max).toBeLessThanOrEqual(setting('type_display_size').max)
    // Never above the desktop size, and never below h1 (the max()).
    expect(variables).toMatch(/assign display_mobile = settings\.type_display_size_mobile \| at_most: settings\.type_display_size/)
    expect(variables).toMatch(/--font-size-display: max\(var\(--font-size-h1\), clamp\(\{\{ display_mobile \| divided_by: 16\.0 \}\}rem, /)
    expect(variables).not.toContain('times: 0.64')
  })

  it('wraps headings and display type whole words at a time, in balanced lines', () => {
    const rule = (selector: RegExp) => critical.match(selector)?.[1] ?? ''
    expect(rule(/\nh1,\nh2,\nh3,\n\.text-display {([^}]*)}/)).toMatch(/overflow-wrap: normal;[^}]*text-wrap: balance;/)
    // Running text still breaks a long word rather than overflow.
    expect(rule(/\np,\nh4,\nh5,\nh6 {([^}]*)}/)).toContain('overflow-wrap: break-word;')
  })

  it('styles headings with a weight, a case and a tracking, the heading font as it is by default', () => {
    expect(setting('type_heading_weight')).toMatchObject({ type: 'select', default: 'font' })
    expect(setting('type_heading_case').options.map((o: { value: string }) => o.value)).toEqual(['none', 'uppercase'])
    expect(setting('type_heading_case').default).toBe('none')
    expect(setting('type_heading_tracking').options.map((o: { value: string }) => o.value)).toEqual(['tighter', 'tight', 'normal', 'wide', 'wider'])
    expect(setting('type_heading_tracking').default).toBe('normal')
    expect(setting('type_heading_line_height').options.map((o: { value: string }) => o.value)).toEqual(['tight', 'normal', 'loose'])
    expect(setting('type_heading_line_height').default).toBe('normal')
  })

  it("reaches the archetypes' tracking and line heights: -0.04em to 0.12em, display down to 1.0", () => {
    const tracking = { tighter: '-0.04em', tight: '-0.02em', wide: '0.06em', wider: '0.12em' }
    for (const [value, em] of Object.entries(tracking)) {
      expect(variables).toMatch(new RegExp(`when '${value}'\\s+assign heading_tracking = '${em}'`))
    }
    const lineHeights = { tight: ['1', '1.1'], loose: ['1.2', '1.3'] }
    for (const [value, [display, heading]] of Object.entries(lineHeights)) {
      expect(variables).toMatch(new RegExp(`when '${value}'\\s+assign line_height_display = ${display}\\s+assign line_height_heading = ${heading}\\s`))
    }
    expect(variables).toMatch(/assign line_height_display = 1\.1\s+assign line_height_heading = 1\.2\s/)
    expect(variables).toContain('--line-height-display: {{ line_height_display }};')
    expect(variables).toContain('--line-height-heading: {{ line_height_heading }};')
  })

  it('labels every setting with a translation key the schema locale has', () => {
    const locale = JSON.parse(read('base-theme/locales/en.default.schema.json'))
    const keys = typography.settings.flatMap((s: { label?: string; content?: string; info?: string; options?: { label: string }[] }) => [
      s.label ?? s.content,
      ...(s.info ? [s.info] : []),
      ...(s.options ?? []).map((o) => o.label),
    ])
    for (const key of keys) {
      expect(key).toMatch(/^t:/)
      expect(key.slice(2).split('.').reduce((node: Record<string, unknown>, part: string) => node?.[part] as Record<string, unknown>, locale), key).toBeTypeOf('string')
    }
  })

  it('wires every type setting into the CSS variables', () => {
    for (const { id } of typography.settings.filter((s: { id?: string }) => s.id)) {
      expect(variables).toContain(`settings.${id}`)
    }
    for (const name of ['--font-accent--family', '--font-heading--case', '--font-heading--tracking', '--font-scale']) {
      expect(variables).toMatch(new RegExp(`${name}:`))
    }
    expect(variables).toMatch(/--font-size-display: max\(var\(--font-size-h1\)/)
  })

  it('preloads the heading font variant its @font-face loads, the one the heading weight picks', () => {
    // Render scope is isolated, so the snippet that computes the variant preloads it, only when the layout asks.
    expect(variables).toMatch(/{%- if preload -%}[\s\S]*{{ heading_font \| font_url \| preload_tag: as: 'font', crossorigin: 'anonymous' }}/)
    expect(variables).toContain("{{ heading_font | font_face: font_display: 'swap' }}")
    const layout = read('base-theme/layout/theme.liquid')
    expect(layout).toContain("{% render 'css-variables', preload: true %}")
    expect(layout).not.toContain('type_heading_font | font_url')
  })

  it('gives headings their case and tracking, and labels and prices the accent font, in critical.css', () => {
    expect(critical).toMatch(/h6 {[^}]*text-transform: var\(--font-heading--case\)/)
    expect(critical).toMatch(/h6 {[^}]*letter-spacing: var\(--font-heading--tracking\)/)
    expect(critical).toMatch(/\.text-label,\s*\.price {[^}]*font-family: var\(--font-accent--family\)/)
  })

  it.each([
    'base-theme/snippets/product-card.liquid',
    'catalog/sections/featured-product.liquid',
    'base-theme/blocks/_product-price.liquid',
    'catalog/sections/quick-add.liquid',
    'catalog/sections/predictive-search.liquid',
    'catalog/sections/main-cart.liquid',
  ])('marks every price in %s with the shared price class', (file) => {
    expect(read(file)).toMatch(/class="([^"]* )?price[ "]/)
    expect(read(file)).not.toMatch(/<(p|td)>\s*{{[^}]*\| money/)
  })
})

describe('Shape and button settings', () => {
  const skillDir = path.join(projectDir, 'skills/shopify-theme-builder')
  const read = (file: string) => readFileSync(path.join(skillDir, file), 'utf8')
  const groups = parseJSON(read('base-theme/config/settings_schema.json'))
  const all = groups.flatMap((group: { settings?: object[] }) => group.settings ?? [])
  const setting = (id: string) => all.find((s: { id?: string }) => s.id === id)
  const values = (id: string) => setting(id).options.map((o: { value: string }) => o.value)
  const variables = read('base-theme/snippets/css-variables.liquid')
  const critical = read('base-theme/assets/critical.css')
  const liquidFiles = ['base-theme', 'catalog'].flatMap((dir) =>
    readdirSync(path.join(skillDir, dir), { recursive: true, encoding: 'utf8' })
      .filter((file) => file.endsWith('.liquid'))
      .map((file) => path.join(dir, file)),
  )
  const radii = ['--button-radius', '--style-border-radius-inputs', '--style-border-radius-cards', '--style-border-radius-media', '--style-border-radius-badges']

  it('picks every radius from one shape family, soft by default, instead of an input corner radius', () => {
    expect(values('shape_family')).toEqual(['square', 'soft', 'round'])
    expect(setting('shape_family').default).toBe('soft')
    expect(setting('input_corner_radius')).toBeUndefined()
    expect(variables).not.toContain('input_corner_radius')
  })

  it('sets a radius for buttons, inputs, cards, media and badges for each family', () => {
    expect(variables).toMatch(/case settings\.shape_family\s+when 'square'[\s\S]*when 'round'[\s\S]*endcase/)
    for (const name of radii) expect(variables).toMatch(new RegExp(`${name}: {{ [a-z_]+ }};`))
  })

  it('shapes every rounded element in the Base Theme and the Section Catalog from the family', () => {
    const sources = [{ file: 'base-theme/assets/critical.css', css: critical }, ...liquidFiles.map((file) => ({ file, css: read(file) }))]
    for (const { file, css } of sources) {
      for (const [, value] of css.matchAll(/border-radius\s*:\s*([^;]+);/g)) {
        // 0 squares a corner off, like the image of a bordered or surface card, whose card rounds it.
        expect(['0', ...radii.map((name) => `var(${name})`)], `${file}: border-radius: ${value}`).toContain(value.trim())
      }
    }
  })

  it.each([
    ['base-theme/assets/critical.css', 'media'],
    ['base-theme/assets/critical.css', 'cards'],
    ['catalog/sections/testimonials.liquid', 'cards'],
    ...[
      'blog-posts',
      'collection-list',
      'featured-product',
      'header',
      'image-gallery',
      'image-with-text',
      'main-blog',
      'main-cart',
      'main-list-collections',
      'main-product',
      'main-search',
      'multicolumn',
      'predictive-search',
      'video',
    ].map((name) => [`catalog/sections/${name}.liquid`, 'media']),
    ...['header', 'main-blog', 'main-article', 'main-collection', 'main-search'].map((name) => [`catalog/sections/${name}.liquid`, 'badges']),
  ])('rounds the %s %s with the family', (file, family) => {
    expect(read(file)).toContain(`border-radius: var(--style-border-radius-${family});`)
  })

  it('sets the border width', () => {
    expect(setting('border_width')).toMatchObject({ type: 'range', min: 1, unit: 'px', default: 1 })
    expect(variables).toContain('--border-width: {{ settings.border_width }}px;')
  })

  it('styles the primary button as filled or outline, with a case and a weight', () => {
    expect(values('button_primary_style')).toEqual(['filled', 'outline'])
    expect(setting('button_primary_style').default).toBe('filled')
    expect(values('button_text_case')).toEqual(['none', 'uppercase'])
    expect(setting('button_text_case').default).toBe('none')
    expect(setting('button_font_weight')).toMatchObject({ type: 'select', default: 'font' })
    expect(variables).toContain('--button-text-transform: {{ settings.button_text_case }};')
    expect(variables).toContain("--button-letter-spacing: {% if settings.button_text_case == 'uppercase' %}0.06em{% else %}normal{% endif %};")
    expect(critical).toMatch(/\.button,\s*\.button--secondary {[^}]*letter-spacing: var\(--button-letter-spacing\);/)
    expect(critical).not.toMatch(/letter-spacing: inherit/)
    expect(variables).toContain('settings.button_font_weight')
    expect(variables).toMatch(/--color-primary-button: {% if outline_button %}transparent{% else %}{{ scheme\.settings\.button }}{% endif %}/)
    expect(variables).toMatch(/--color-primary-button-label: {% if outline_button %}{{ scheme\.settings\.button }}{% else %}{{ scheme\.settings\.button_label }}{% endif %}/)
    expect(critical).toMatch(/\.button,\s*\.button--secondary {[^}]*background-color: var\(--color-primary-button\);[^}]*color: var\(--color-primary-button-label\)/)
  })

  it('labels every new setting with a translation key the schema locale has', () => {
    const locale = JSON.parse(read('base-theme/locales/en.default.schema.json'))
    const ids = ['shape_family', 'border_width', 'button_primary_style', 'button_text_case', 'button_font_weight']
    const keys = ids.flatMap((id) => [setting(id).label, ...(setting(id).options ?? []).map((o: { label: string }) => o.label)])
    for (const key of keys) {
      expect(key).toMatch(/^t:/)
      expect(key.slice(2).split('.').reduce((node: Record<string, unknown>, part: string) => node?.[part] as Record<string, unknown>, locale), key).toBeTypeOf('string')
    }
  })
})

describe('Density and page width', () => {
  const skillDir = path.join(projectDir, 'skills/shopify-theme-builder')
  const read = (file: string) => readFileSync(path.join(skillDir, file), 'utf8')
  const all = parseJSON(read('base-theme/config/settings_schema.json')).flatMap((group: { settings?: object[] }) => group.settings ?? [])
  const setting = (id: string) => all.find((s: { id?: string }) => s.id === id)
  const values = (id: string) => setting(id).options.map((o: { value: string }) => o.value)
  const variables = read('base-theme/snippets/css-variables.liquid')
  // Sections that aren't a band of the page: bars, the header, fetched dialogs and the Merchant's own Liquid.
  const unspaced = ['announcement-bar', 'custom-liquid', 'header', 'predictive-search', 'quick-add']

  it('spaces sections 48, 80 or 112px on desktop and half that on mobile, from a density that is normal by default', () => {
    expect(values('density')).toEqual(['compact', 'normal', 'airy'])
    expect(setting('density').default).toBe('normal')
    expect(variables).toMatch(/case settings\.density\s+when 'compact'\s+assign section_spacing = 48\s[\s\S]*when 'airy'\s+assign section_spacing = 112\s[\s\S]*else\s+assign section_spacing = 80\s/)
    expect(variables).toContain('--section-spacing-theme: {{ section_spacing | divided_by: 32.0 }}rem;')
    expect(variables).toMatch(/@media \(min-width: 750px\) {\s*:root {[^}]*--section-spacing-theme: {{ section_spacing \| divided_by: 16\.0 }}rem;/)
  })

  it('widens the grid gaps with the density', () => {
    expect(variables).toMatch(/when 'compact'\s+assign section_spacing = \d+\s+assign grid_gap = 16\s+when 'airy'\s+assign section_spacing = \d+\s+assign grid_gap = 32\s+else\s+assign section_spacing = \d+\s+assign grid_gap = 24\s/)
    expect(variables).toMatch(/@media \(min-width: 750px\) {\s*:root {[^@]*--grid-gap: {{ grid_gap \| divided_by: 16\.0 }}rem;/)
    expect(variables).toContain('--grid-row-gap: calc(var(--grid-gap) * 1.5);')
  })

  it.each(readdirSync(path.join(skillDir, 'catalog/sections')).filter((file) => file.endsWith('.liquid') && !unspaced.includes(file.slice(0, -7))))(
    'pads the %s section with the section spacing',
    (file) => {
      expect(read(`catalog/sections/${file}`)).toMatch(/var\(--section-spacing(-start)?\)|class="[^"]*\bbasic-page\b/)
    },
  )

  it.each([
    'catalog/sections/blog-posts.liquid',
    'catalog/sections/collection-list.liquid',
    'catalog/sections/featured-collection.liquid',
    'catalog/sections/image-gallery.liquid',
    'catalog/sections/main-blog.liquid',
    'catalog/sections/main-collection.liquid',
    'catalog/sections/main-list-collections.liquid',
    'catalog/sections/main-search.liquid',
    'catalog/sections/multicolumn.liquid',
    'catalog/sections/related-products.liquid',
    'catalog/sections/testimonials.liquid',
    'base-theme/sections/blog.liquid',
    'base-theme/sections/search.liquid',
  ])('spaces the grid in %s with the grid gap', (file) => {
    expect(read(file)).toMatch(/gap: (var\(--grid-row-gap\) )?var\(--grid-gap\);/)
  })

  it('sets the page width to narrow, normal or wide, normal by default, instead of a width in rem', () => {
    expect(values('page_width')).toEqual(['narrow', 'normal', 'wide'])
    expect(setting('page_width').default).toBe('normal')
    expect(setting('max_page_width')).toBeUndefined()
    expect(variables).toMatch(/case settings\.page_width/)
    expect(variables).not.toContain('max_page_width')
  })

  it('labels the density and page width with translation keys the schema locale has', () => {
    const locale = JSON.parse(read('base-theme/locales/en.default.schema.json'))
    const keys = ['density', 'page_width'].flatMap((id) => [setting(id).label, ...setting(id).options.map((o: { label: string }) => o.label)])
    for (const key of keys) {
      expect(key).toMatch(/^t:/)
      expect(key.slice(2).split('.').reduce((node: Record<string, unknown>, part: string) => node?.[part] as Record<string, unknown>, locale), key).toBeTypeOf('string')
    }
  })
})

describe('Section spacing', () => {
  const skillDir = path.join(projectDir, 'skills/shopify-theme-builder')
  const read = (file: string) => readFileSync(path.join(skillDir, file), 'utf8')
  const variables = read('base-theme/snippets/css-variables.liquid')
  const critical = read('base-theme/assets/critical.css')
  const unspaced = ['announcement-bar', 'custom-liquid', 'header', 'predictive-search', 'quick-add']
  const spaced = readdirSync(path.join(skillDir, 'catalog/sections'))
    .filter((file) => file.endsWith('.liquid') && !unspaced.includes(file.slice(0, -7)))
    .map((file) => file.slice(0, -7))
  // Sections whose spacing pads their content inside the media, which reaches the section's edges.
  const mediaEdged = ['hero', 'slideshow']

  it.each(spaced)('lets the Merchant set the %s section spacing: none, tight, the theme default or loose', (name) => {
    const source = read(`catalog/sections/${name}.liquid`)
    const schema = JSON.parse(source.match(/{% schema %}([\s\S]*){% endschema %}/)![1])
    expect(schema.settings).toContainEqual({
      type: 'select',
      id: 'spacing',
      label: 't:labels.section_spacing',
      options: ['none', 'tight', 'theme', 'loose'].map((value) => ({ value, label: `t:options.spacing.${value}` })),
      default: 'theme',
    })
    expect(source).toMatch(/^\s*<[a-z-]+\s+class="[^"]*\bcolor-{{ section\.settings\.color_scheme }}[^"]*"[^>]*\sdata-spacing="{{ section\.settings\.spacing }}"/m)
  })

  it('scales the theme spacing by 0, 0.5, 1 or 1.5 on the section', () => {
    expect(variables).toContain('--section-spacing: var(--section-spacing-theme);')
    expect(critical).toMatch(/\[data-spacing='none'\] {\s*--section-spacing: 0px;\s*}/)
    expect(critical).toMatch(/\[data-spacing='tight'\] {\s*--section-spacing: calc\(var\(--section-spacing-theme\) \* 0\.5\);\s*}/)
    expect(critical).toMatch(/\[data-spacing='loose'\] {\s*--section-spacing: calc\(var\(--section-spacing-theme\) \* 1\.5\);\s*}/)
    expect(critical).not.toContain("[data-spacing='theme']")
    // The top padding follows the section's own spacing, computed where the section sets it.
    expect(critical).toMatch(/\[data-spacing\] {\s*--section-spacing-start: var\(--section-spacing\);\s*}/)
    expect(variables).toContain('--section-spacing-start: var(--section-spacing);')
  })

  it('drops the top padding of a section after one on the same color scheme, unless that one ends in media or has no spacing', () => {
    const loop = variables.slice(variables.indexOf('{% for scheme in settings.color_schemes %}'), variables.indexOf('{% endfor %}', variables.indexOf('{% for scheme in settings.color_schemes %}')))
    expect(loop).toContain(
      ".shopify-section:has(> .color-{{ scheme.id }}:not(.media-edge, [data-spacing='none'])) + .shopify-section > .color-{{ scheme.id }} {\n      --section-spacing-start: 0px;\n    }",
    )
  })

  // The main product pads its top with --space-xl, under the header.
  it.each(spaced.filter((name) => ![...mediaEdged, 'main-product'].includes(name)))('pads the top of the %s section with the start spacing, so it can drop', (name) => {
    const source = read(`catalog/sections/${name}.liquid`)
    if (/class="[^"]*\bbasic-page\b/.test(source)) return
    expect(source).toContain('var(--section-spacing-start)')
    // No padding starts with the full section spacing, except inside full-bleed media.
    const css = source.match(/{% stylesheet %}([\s\S]*?){% endstylesheet %}/)![1]
    for (const [rule, selector, body] of css.matchAll(/([^{}]+){([^{}]*)}/g)) {
      if (/full_bleed/.test(selector)) continue
      expect(body, rule.trim()).not.toMatch(/padding(-block)?: var\(--section-spacing\)/)
    }
  })

  it('pads basic pages with the start spacing too', () => {
    expect(critical).toMatch(/\.basic-page {[^}]*padding-block: var\(--section-spacing-start\) var\(--section-spacing\);/)
  })

  it.each(mediaEdged)('marks the %s section as ending in media, so the next one keeps its top padding', (name) => {
    expect(read(`catalog/sections/${name}.liquid`)).toMatch(/^\s*<[a-z-]+\s+class="[^"]*\bmedia-edge\b/m)
  })

  it('marks image with text as ending in media when its image is full bleed', () => {
    expect(read('catalog/sections/image-with-text.liquid')).toContain("{% if section.settings.layout == 'full_bleed' %} media-edge{% endif %}")
  })

  it('labels the setting with translation keys the schema locale has', () => {
    const locale = JSON.parse(read('base-theme/locales/en.default.schema.json'))
    expect(locale.labels.section_spacing).toBe('Section spacing')
    expect(locale.options.spacing).toEqual({ none: 'None', tight: 'Tight', theme: 'Theme default', loose: 'Loose' })
  })
})

describe('Card and media settings', () => {
  const skillDir = path.join(projectDir, 'skills/shopify-theme-builder')
  const read = (file: string) => readFileSync(path.join(skillDir, file), 'utf8')
  const all = parseJSON(read('base-theme/config/settings_schema.json')).flatMap((group: { settings?: object[] }) => group.settings ?? [])
  const setting = (id: string) => all.find((s: { id?: string }) => s.id === id)
  const values = (id: string) => setting(id).options.map((o: { value: string }) => o.value)
  const variables = read('base-theme/snippets/css-variables.liquid')
  const critical = read('base-theme/assets/critical.css')
  const card = read('base-theme/snippets/product-card.liquid')

  it('sets the card image ratio to 1:1, 4:5 or 2:3, square by default', () => {
    expect(values('card_image_ratio')).toEqual(['1 / 1', '4 / 5', '2 / 3'])
    expect(setting('card_image_ratio').default).toBe('1 / 1')
    expect(variables).toContain('--card-image-ratio: {{ settings.card_image_ratio }};')
  })

  it('makes the card plain, bordered or on a surface, plain by default', () => {
    expect(values('card_style')).toEqual(['plain', 'bordered', 'surface'])
    expect(setting('card_style').default).toBe('plain')
    expect(variables).toMatch(/--card-border-width: {% if settings\.card_style == 'bordered' %}var\(--border-width\){% else %}0{% endif %};/)
    expect(variables).toMatch(/--card-padding: {% if settings\.card_style == 'plain' %}0{% else %}var\(--space-md\){% endif %};/)
  })

  it("puts a surface card on the media tint where the scheme's text reads on it, else on 5% of the text color", () => {
    // The surface follows each color scheme's text color, so it is set with the scheme.
    const schemes = variables.slice(variables.indexOf('{% for scheme in settings.color_schemes %}'))
    expect(schemes).toMatch(/assign card_background = 'transparent'/)
    expect(schemes).toMatch(/if settings\.card_style == 'surface'\s+assign card_background = 'rgb\(from var\(--color-foreground\) r g b \/ 0\.05\)'/)
    expect(schemes).toMatch(/assign tint_contrast = scheme\.settings\.text \| color_contrast: settings\.media_tint/)
    expect(schemes).toMatch(/if tint_contrast >= 4\.5\s+assign card_background = settings\.media_tint/)
    expect(schemes).toContain('--card-background: {{ card_background }};')
  })

  it('fills the top and sides of a bordered or surface card with its image, and pads only the text', () => {
    expect(card).toContain('<div class="product-card product-card--{{ anatomy }} product-card--{{ settings.card_style }}')
    expect(critical).toMatch(/\.product-card--bordered,\s*\.product-card--surface {[^}]*overflow: clip/)
    expect(critical).toMatch(
      /\.product-card--bordered \.product-card__image,\s*\.product-card--surface \.product-card__image {[^}]*margin: calc\(-1 \* var\(--card-padding\)\) calc\(-1 \* var\(--card-padding\)\) calc\(var\(--card-padding\) - var\(--space-xs\)\);[^}]*border-radius: 0/,
    )
    // A plain card keeps its image's own corners.
    expect(critical).toMatch(/\.product-card__image {[^}]*border-radius: var\(--style-border-radius-media\)/)
  })

  it('sets the text of minimal and detailed cards quiet, in caps or bold, quiet by default; editorial keeps its large title', () => {
    expect(values('card_text_style')).toEqual(['quiet', 'caps', 'bold'])
    expect(setting('card_text_style').default).toBe('quiet')
    expect(card).toContain("{% unless anatomy == 'editorial' %} product-card--text-{{ settings.card_text_style }}{% endunless %}")
    const rule = (selector: string) => critical.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} {([^}]*)}`))?.[1] ?? ''
    expect(rule('.product-card--text-quiet .product-card__title')).toContain('font-size: var(--font-size-small);')
    expect(rule('.product-card--text-quiet .price')).toContain('font-size: var(--font-size-label);')
    const caps = rule('.product-card--text-caps :is(.product-card__title, .price)')
    expect(caps).toContain('font-size: var(--font-size-label);')
    expect(caps).toContain('text-transform: uppercase;')
    expect(caps).toContain('letter-spacing: 0.12em;')
    expect(rule('.product-card--text-bold .product-card__title')).toContain('font-weight: 700;')
    expect(rule('.product-card--text-bold .price:not(:has(.price__sale))')).toContain('color: var(--color-foreground-muted);')
  })

  it('aligns the card text to the start, center or end', () => {
    expect(setting('card_text_alignment')).toMatchObject({ type: 'text_alignment', default: 'left' })
    expect(variables).toContain("--card-text-align: {{ settings.card_text_alignment | replace: 'left', 'start' | replace: 'right', 'end' }};")
  })

  it('shows the second image or zooms the image on hover, only on devices that hover, the second image by default', () => {
    expect(values('card_hover')).toEqual(['none', 'second_image', 'zoom'])
    expect(setting('card_hover').default).toBe('second_image')
    expect(variables).toMatch(/--card-hover-scale: {% if settings\.card_hover == 'none' %}1{% else %}1\.03{% endif %};/)
    expect(critical).toMatch(/@media \(hover: hover\) {[^@]*\.product-card:hover \.product-card__image img {[^}]*transform: scale\(var\(--card-hover-scale\)\)/)
    expect(critical).toMatch(/@media \(hover: hover\) {[^@]*\.product-card:hover \.product-card__image-secondary {[^}]*opacity: 1/)
  })

  it("stacks the product's second media over the first, with no layout shift, when the hover shows it", () => {
    expect(card).toMatch(/{% if settings\.card_hover == 'second_image' and product\.media\.size > 1 %}\s*{{\s*product\.media\[1\]\.preview_image\s*\| image_url: width: 1200\s*\| image_tag:[^}]*class: 'product-card__image-secondary'[^}]*alt: ''/)
    expect(critical).toMatch(/\.product-card__image {[^}]*position: relative/)
    expect(critical).toMatch(/\.product-card__image \.product-card__image-secondary {[^}]*position: absolute;[^}]*inset: 0;[^}]*opacity: 0/)
  })

  it('zooms the image of a card set to the second image only when its product has no second image', () => {
    expect(critical).toMatch(/\.product-card__image:has\(\.product-card__image-secondary\) {[^}]*--card-hover-scale: 1;/)
  })

  it('fills each media box edge to edge or frames the whole photo in it, full-bleed by default', () => {
    expect(values('media_treatment')).toEqual(['full_bleed', 'framed'])
    expect(setting('media_treatment').default).toBe('full_bleed')
    expect(variables).toMatch(/--media-fit: {% if framed %}contain{% else %}cover{% endif %};/)
    expect(variables).toMatch(/--media-inset: {% if framed %}5%{% else %}0{% endif %};/)
  })

  it('puts an optional tint behind the media, which the white of cut-out photos takes', () => {
    expect(setting('media_tint')).toMatchObject({ type: 'color' })
    expect(setting('media_tint').default).toBeUndefined()
    expect(variables).toContain("--media-background: {{ settings.media_tint | default: 'transparent' }};")
    expect(variables).toContain('--media-blend: {{ media_blend }};')
  })

  it('multiplies product images only with a light tint, so a dark one never turns photos black', () => {
    expect(variables).toMatch(
      /assign media_blend = 'normal'\s+if settings\.media_tint != blank\s+assign tint_brightness = settings\.media_tint \| color_brightness\s+if tint_brightness > 150\s+assign media_blend = 'multiply'\s+endif\s+endif/,
    )
  })

  it('shapes the product card image from the media settings', () => {
    expect(critical).toMatch(/\.product-card__image {[^}]*background-color: var\(--media-background\)/)
    expect(critical).toMatch(/\.product-card__image img,\s*\.product-card__placeholder {[^}]*padding: var\(--media-inset\);[^}]*object-fit: var\(--media-fit\);[^}]*mix-blend-mode: var\(--media-blend\)/)
  })

  // Framing, the tint and its blend are for product images: the product card, the product page, featured product,
  // quick add (styled in the header), product results in predictive search, and collection images, which show a
  // product's when the collection has none. The Base Theme's image snippet shows cart, product and collection images.
  const productMedia = [
    'base-theme/snippets/image.liquid',
    ...['collection-list', 'featured-product', 'header', 'main-list-collections', 'main-product', 'predictive-search'].map(
      (name) => `catalog/sections/${name}.liquid`,
    ),
  ]
  // Every other image always covers its box: no inset, no tint behind it, no blend.
  const editorialMedia = [
    'base-theme/sections/blog.liquid',
    ...[
      'blog-posts',
      'call-to-action',
      'contact-form',
      'editorial-split',
      'image-gallery',
      'image-with-text',
      'main-blog',
      'main-search',
      'multicolumn',
      'newsletter',
      'process-steps',
      'team',
      'timeline',
      'video',
    ].map((name) => `catalog/sections/${name}.liquid`),
  ]

  it('uses the --media-* framing variables only for product images', () => {
    const users = ['base-theme', 'catalog']
      .flatMap((dir) =>
        readdirSync(path.join(skillDir, dir), { recursive: true, encoding: 'utf8' })
          .filter((file) => /\.(liquid|css)$/.test(file))
          .map((file) => path.join(dir, file)),
      )
      .filter((file) => file !== 'base-theme/snippets/css-variables.liquid' && read(file).includes('var(--media-'))
    expect(users.sort()).toEqual(['base-theme/assets/critical.css', ...productMedia].sort())
  })

  it.each(productMedia)('frames and tints the product images in %s', (file) => {
    const source = read(file)
    expect(source).toContain('background-color: var(--media-background);')
    expect(source).not.toContain('object-fit: cover')
    // Thumbnails take the tint and the fit, not the inset.
    if (!/predictive-search/.test(file)) expect(source).toContain('padding: var(--media-inset);')
  })

  it.each(editorialMedia)('covers the box with each image in %s', (file) => {
    expect(read(file)).toMatch(/object-fit: cover;/)
  })

  it('labels the card and media settings with translation keys the schema locale has', () => {
    const locale = JSON.parse(read('base-theme/locales/en.default.schema.json'))
    const ids = ['card_image_ratio', 'card_style', 'card_text_alignment', 'card_text_style', 'card_hover', 'media_treatment', 'media_tint']
    const keys = ids.flatMap((id) => [setting(id).label, ...(setting(id).info ? [setting(id).info] : []), ...(setting(id).options ?? []).map((o: { label: string }) => o.label)])
    for (const key of keys) {
      expect(key).toMatch(/^t:/)
      expect(key.slice(2).split('.').reduce((node: Record<string, unknown>, part: string) => node?.[part] as Record<string, unknown>, locale), key).toBeTypeOf('string')
    }
  })
})

describe('Motion', () => {
  const skillDir = path.join(projectDir, 'skills/shopify-theme-builder')
  const read = (file: string) => readFileSync(path.join(skillDir, file), 'utf8')
  const all = parseJSON(read('base-theme/config/settings_schema.json')).flatMap((group: { settings?: object[] }) => group.settings ?? [])
  const setting = (id: string) => all.find((s: { id?: string }) => s.id === id)
  const variables = read('base-theme/snippets/css-variables.liquid')
  const critical = read('base-theme/assets/critical.css')
  const layout = read('base-theme/layout/theme.liquid')
  const reveal = read('base-theme/assets/reveal.js')
  const noPreference = (css: string) =>
    [...css.matchAll(/@media \(prefers-reduced-motion: no-preference\) {([\s\S]*?)\n}/g)].map((m) => m[1]).join('\n')

  it('offers no, subtle or expressive motion, subtle by default', () => {
    expect(setting('motion').options.map((o: { value: string }) => o.value)).toEqual(['none', 'subtle', 'expressive'])
    expect(setting('motion').default).toBe('subtle')
  })

  it('sets 0.2s hovers and 0.6s fades for subtle, 0.25s hovers, 0.8s rises and slow image zooms for expressive, and nothing for none', () => {
    expect(variables).toMatch(
      /case settings\.motion\s+when 'none'\s+assign motion_duration = '0s'\s+assign motion_duration_reveal = '0s'\s+assign motion_duration_zoom = '0s'\s+assign motion_duration_hero_zoom = '0s'\s+assign motion_easing = 'ease'\s+assign motion_rise = '0'\s+assign motion_hero_zoom = '1'\s+when 'expressive'\s+assign motion_duration = '0\.25s'\s+assign motion_duration_reveal = '0\.8s'\s+assign motion_duration_zoom = '1\.5s'\s+assign motion_duration_hero_zoom = '8s'\s+assign motion_easing = 'cubic-bezier\(0\.165, 0\.84, 0\.44, 1\)'\s+assign motion_rise = '2rem'\s+assign motion_hero_zoom = '1\.06'\s+else\s+assign motion_duration = '0\.2s'\s+assign motion_duration_reveal = '0\.6s'\s+assign motion_duration_zoom = '0\.25s'\s+assign motion_duration_hero_zoom = '0s'\s+assign motion_easing = 'ease-out'\s+assign motion_rise = '0'\s+assign motion_hero_zoom = '1'\s+endcase/,
    )
    for (const name of ['duration', 'duration-reveal', 'duration-zoom', 'duration-hero-zoom', 'easing', 'rise', 'hero-zoom']) {
      expect(variables).toContain(`--motion-${name}: {{ motion_${name.replaceAll('-', '_')} }};`)
    }
    // Entering elements decelerate hard (Material 3's emphasized decelerate), and grid items follow each other by 60ms.
    expect(variables).toContain('--motion-easing-enter: cubic-bezier(0.05, 0.7, 0.1, 1);')
    expect(variables).toContain('--motion-stagger: 60ms;')
  })

  it('turns every duration, the rise, the stagger and the hero zoom off under reduced motion', () => {
    expect(variables).toMatch(
      /@media \(prefers-reduced-motion: reduce\) {\s*:root {\s*--motion-duration: 0s;\s*--motion-duration-reveal: 0s;\s*--motion-duration-zoom: 0s;\s*--motion-duration-hero-zoom: 0s;\s*--motion-rise: 0;\s*--motion-stagger: 0s;\s*--motion-hero-zoom: 1;\s*}\s*}/,
    )
  })

  it('loads one shared reveal script, deferred, unless motion is none', () => {
    const scripts = readdirSync(path.join(skillDir, 'base-theme/assets')).filter((file) => file.endsWith('.js'))
    expect(scripts).toEqual(['reveal.js'])
    expect(layout).toMatch(/{% if settings\.motion != 'none' %}\s*<script src="{{ 'reveal\.js' \| asset_url }}" defer><\/script>\s*{% endif %}/)
  })

  it('reveals the sections that opt in with an IntersectionObserver, never under reduced motion', () => {
    expect(reveal).toMatch(/if \(!matchMedia\('\(prefers-reduced-motion: reduce\)'\)\.matches\)/)
    expect(reveal).toContain('new IntersectionObserver(')
    expect(reveal).toContain("document.querySelectorAll('main > .shopify-section:has(> [data-reveal])')")
  })

  it('never hides a section in view on load, so the first viewport, and its hero or LCP image, never animates', () => {
    // The first observation of each section only hides those out of view; later ones reveal them.
    expect(reveal).toMatch(/if \(isIntersecting\) observer\.unobserve\(target\);\s*else hide\(target\);/)
    expect(reveal).toMatch(/else if \(isIntersecting\) {\s*target\.classList\.add\('reveal--visible'\);\s*observer\.unobserve\(target\);/)
    expect(reveal).toMatch(/const hide = \(section\) => {\s*section\.classList\.add\('reveal'\);/)
  })

  it('numbers the items of a staggered grid, up to the ninth, so later ones wait longer', () => {
    expect(reveal).toMatch(/for \(const grid of section\.querySelectorAll\('\[data-reveal-stagger\]'\)\) {\s*\[\.\.\.grid\.children\]\.forEach\(\(item, index\) => item\.style\.setProperty\('--reveal-order', Math\.min\(index, 8\)\)\);/)
  })

  // Image-led sections reveal by default; type-led ones, and a marquee that already moves, only when the Merchant asks.
  const imageLed = ['blog-posts', 'collection-list', 'editorial-split', 'featured-collection', 'featured-product', 'hero', 'image-gallery', 'image-with-text', 'lookbook', 'multicolumn', 'process-steps', 'related-products', 'slideshow', 'team', 'video']
  const typeLed = ['call-to-action', 'comparison-table', 'faq', 'logo-list', 'marquee', 'newsletter', 'press-quotes', 'rich-text', 'spec-tiles', 'testimonials', 'timeline', 'type-banner']
  const schemaOf = (source: string) => JSON.parse(source.match(/{% schema %}([\s\S]*){% endschema %}/)![1])

  it.each([...imageLed.map((name) => [name, true]), ...typeLed.map((name) => [name, false])])('lets the Merchant reveal the %s section on scroll, on by default: %s', (name, on) => {
    const source = read(`catalog/sections/${name}.liquid`)
    expect(schemaOf(source).settings).toContainEqual({ type: 'checkbox', id: 'reveal', label: 't:labels.reveal', default: on })
    expect(source).toContain('data-spacing="{{ section.settings.spacing }}"{% if section.settings.reveal %} data-reveal{% endif %}')
  })

  it('offers no reveal on the sections a page opens with, the groups and custom Liquid', () => {
    const others = readdirSync(path.join(skillDir, 'catalog/sections'))
      .filter((file) => file.endsWith('.liquid'))
      .map((file) => file.slice(0, -7))
      .filter((name) => ![...imageLed, ...typeLed].includes(name))
    expect(others).toContain('main-product')
    for (const name of others) {
      const source = read(`catalog/sections/${name}.liquid`)
      expect(source, name).not.toContain('data-reveal')
      expect(schemaOf(source).settings?.map((s: { id?: string }) => s.id) ?? [], name).not.toContain('reveal')
    }
    expect(JSON.parse(read('base-theme/locales/en.default.schema.json')).labels.reveal).toBeTruthy()
  })

  it.each(['blog-posts', 'collection-list', 'featured-collection', 'image-gallery', 'multicolumn', 'related-products', 'team'])('staggers the items of the %s grid', (name) => {
    expect(read(`catalog/sections/${name}.liquid`)).toMatch(/class="[a-z-]+__grid[^"]*"\s+data-reveal-stagger/)
  })

  it('fades, and rises, the revealed sections and their staggered grid items, entering with the entering easing, and eases the card hover from the motion variables, only without reduced motion', () => {
    const css = noPreference(critical)
    expect(css).toMatch(/\.reveal,\s*\.reveal \[data-reveal-stagger\] > \* {\s*opacity: 0;\s*translate: 0 var\(--motion-rise\);\s*}/)
    expect(css).toMatch(
      /\.reveal--visible,\s*\.reveal--visible \[data-reveal-stagger\] > \* {\s*opacity: 1;\s*translate: none;\s*transition:\s*opacity var\(--motion-duration-reveal\) var\(--motion-easing-enter\),\s*translate var\(--motion-duration-reveal\) var\(--motion-easing-enter\);\s*}/,
    )
    expect(css).toMatch(/\.reveal--visible \[data-reveal-stagger\] > \* {\s*transition-delay: calc\(var\(--reveal-order, 0\) \* var\(--motion-stagger\)\);\s*}/)
    expect(css).toMatch(
      /\.product-card__image img {\s*transition:\s*transform var\(--motion-duration-zoom\) var\(--motion-easing\),\s*opacity var\(--motion-duration\) var\(--motion-easing\);\s*}/,
    )
    // Outside that block, nothing in critical.css transitions or animates.
    expect(critical.replace(/@media \(prefers-reduced-motion: no-preference\) {[\s\S]*?\n}/g, '')).not.toMatch(/transition|animation/)
  })

  it.each([
    ['hero', '.hero__media img', '.hero__media img'],
    ['slideshow', '.slideshow__slide:not([inert]) .slideshow__media img', '.slideshow__media img'],
  ])('slowly zooms the %s image to the hero zoom from its first frame, only without reduced motion', (name, zoomed, eased) => {
    const source = read(`catalog/sections/${name}.liquid`)
    const css = source.match(/{% stylesheet %}([\s\S]*?){% endstylesheet %}/)![1]
    const block = css.match(/@media \(prefers-reduced-motion: no-preference\) {([\s\S]*?)\n {2}}/)![1]
    const escape = (selector: string) => selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    expect(block).toMatch(new RegExp(`${escape(zoomed)} {[^}]*scale: var\\(--motion-hero-zoom\\);`))
    expect(block).toMatch(new RegExp(`${escape(eased)} {[^}]*transition: scale var\\(--motion-duration-hero-zoom\\) ease-out;`))
    // The zoom starts on load too: the image's first style is unzoomed.
    expect(block).toMatch(new RegExp(`@starting-style {\\s*${escape(zoomed)} {\\s*scale: 1;`))
    // The zoomed image stays inside its box, beside the text of a split layout too.
    expect(css).toMatch(new RegExp(`\\.${name}__media {\\s*position: absolute;\\s*inset: 0;\\s*overflow: hidden;`))
    expect(css.replace(/@media \(prefers-reduced-motion: no-preference\) {[\s\S]*?\n {2}}/, '')).not.toContain('--motion-hero-zoom')
  })

  it('labels the motion setting with translation keys the schema locale has', () => {
    const locale = JSON.parse(read('base-theme/locales/en.default.schema.json'))
    const group = parseJSON(read('base-theme/config/settings_schema.json')).find((g: { settings?: { id?: string }[] }) => g.settings?.some((s) => s.id === 'motion'))
    const keys = [group.name, setting('motion').label, setting('motion').info, ...setting('motion').options.map((o: { label: string }) => o.label)]
    for (const key of keys) {
      expect(key).toMatch(/^t:/)
      expect(key.slice(2).split('.').reduce((node: Record<string, unknown>, part: string) => node?.[part] as Record<string, unknown>, locale), key).toBeTypeOf('string')
    }
  })
})

describe('Buttons', () => {
  const skillDir = path.join(projectDir, 'skills/shopify-theme-builder')
  const read = (file: string) => readFileSync(path.join(skillDir, file), 'utf8')
  const files = ['base-theme', 'catalog'].flatMap((dir) =>
    readdirSync(path.join(skillDir, dir), { recursive: true, encoding: 'utf8' })
      .filter((file) => file.endsWith('.liquid'))
      .map((file) => path.join(dir, file)),
  )
  const stylesheet = (file: string) =>
    [...read(file).matchAll(/{%-? stylesheet -?%}([\s\S]*?){%-? endstylesheet -?%}/g)].map((m) => m[1]).join('\n')

  it('drives the button from variables, with colors from the scheme including the secondary button roles', () => {
    const variables = read('base-theme/snippets/css-variables.liquid')
    for (const name of ['padding-block', 'padding-inline', 'border-width', 'radius', 'text-transform', 'font-weight']) {
      expect(variables).toMatch(new RegExp(`--button-${name}:`))
    }
    expect(variables).toMatch(/--color-button-border: {{ scheme\.settings\.button }}/)
    expect(variables).toMatch(/--color-secondary-button: {{ scheme\.settings\.background }}/)
    expect(variables).toMatch(/--color-secondary-button-label: {{ scheme\.settings\.text }}/)
    expect(variables).toMatch(/--color-secondary-button-border: {{ scheme\.settings\.text }}/)
  })

  it('shares a primary and a secondary button in critical.css', () => {
    const critical = read('base-theme/assets/critical.css')
    expect(critical).toMatch(/\.button,\s*\.button--secondary {[^}]*padding: var\(--button-padding-block\) var\(--button-padding-inline\)/)
    expect(critical).toMatch(/\.button,\s*\.button--secondary {[^}]*background-color: var\(--color-primary-button\)/)
    expect(critical).toMatch(/\.button--secondary {[^}]*background-color: var\(--color-secondary-button\)/)
  })

  it('derives hover colors from the scheme: a filled button mixes toward its label, an outline one fills, the secondary one tints', () => {
    const variables = read('base-theme/snippets/css-variables.liquid')
    expect(variables).toContain(
      '--color-button-hover: {% if outline_button %}{{ scheme.settings.button }}{% else %}color-mix(in oklch, {{ scheme.settings.button }}, {{ scheme.settings.button_label }} 15%){% endif %};',
    )
    expect(variables).toContain('--color-button-hover-label: {{ scheme.settings.button_label }};')
    expect(variables).toContain('--color-button-hover-border: var(--color-button-hover);')
    expect(variables).toContain('--color-secondary-button-hover: color-mix(in oklch, {{ scheme.settings.background }}, {{ scheme.settings.text }} 10%);')
  })

  it('gives the buttons and the unbranded Buy it now a hover, eased by the motion variables, and a pressed state', () => {
    const critical = read('base-theme/assets/critical.css')
    const [, hover] = critical.match(/@media \(hover: hover\) {\s*(\.button:hover[\s\S]*?)\n}/)!
    expect(hover).toMatch(
      /\.button:hover:not\(:disabled\),\s*\.shopify-payment-button \.shopify-payment-button__button--unbranded:hover:not\(\[disabled\]\) {\s*border-color: var\(--color-button-hover-border\);\s*background-color: var\(--color-button-hover\);\s*color: var\(--color-button-hover-label\);\s*}/,
    )
    // A load more link is both .button and .button--secondary, so the secondary hover sets every color the primary one does.
    expect(hover).toMatch(
      /\.button--secondary:hover:not\(:disabled\) {\s*border-color: var\(--color-secondary-button-border\);\s*background-color: var\(--color-secondary-button-hover\);\s*color: var\(--color-secondary-button-label\);\s*}/,
    )
    // The hover rule comes after the rest rule it shares a selector with, so it wins over it.
    expect(critical.indexOf('@media (hover: hover) {\n  .button:hover')).toBeGreaterThan(critical.indexOf('.shopify-payment-button__button--unbranded:hover:not([disabled]) {'))
    expect(critical).toMatch(
      /@media \(prefers-reduced-motion: no-preference\) {\s*\.button,\s*\.button--secondary,\s*\.shopify-payment-button \.shopify-payment-button__button--unbranded {\s*transition:\s*background-color var\(--motion-duration\) var\(--motion-easing\),\s*border-color var\(--motion-duration\) var\(--motion-easing\),\s*color var\(--motion-duration\) var\(--motion-easing\),\s*scale var\(--motion-duration\) var\(--motion-easing\);\s*}\s*}/,
    )
    expect(critical).toMatch(/:is\(\.button, \.button--secondary, \.shopify-payment-button__button--unbranded\):active:not\(:disabled\) {\s*scale: 0\.98;\s*}/)
  })

  it("styles Shopify's unbranded Buy it now as the primary button, hover included, and makes Add to cart secondary beside it", () => {
    const critical = read('base-theme/assets/critical.css')
    // Shopify's own rules are .shopify-payment-button__button--unbranded and its :hover:not([disabled]): the theme's must outrank both.
    const [, body] = critical.match(
      /\.shopify-payment-button \.shopify-payment-button__button--unbranded,\s*\.shopify-payment-button \.shopify-payment-button__button--unbranded:hover:not\(\[disabled\]\) {([^}]*)}/,
    )!
    for (const declaration of [
      'padding: var(--button-padding-block) var(--button-padding-inline)',
      'border: var(--button-border-width) solid var(--color-button-border)',
      'border-radius: var(--button-radius)',
      'background-color: var(--color-primary-button)',
      'color: var(--color-primary-button-label)',
      'font: inherit',
      'font-weight: var(--button-font-weight)',
      'text-transform: var(--button-text-transform)',
      'min-block-size: var(--target-size)',
    ]) {
      expect(body).toContain(`${declaration};`)
    }
    expect(read('base-theme/blocks/_buy-buttons.liquid')).toMatch(
      /class="{% if block\.settings\.show_dynamic_checkout %}button--secondary{% else %}button{% endif %} buy-buttons__add"/,
    )
    expect(read('catalog/sections/featured-product.liquid')).toMatch(
      /class="{% if section\.settings\.show_dynamic_checkout %}button--secondary{% else %}button{% endif %} featured-product__add"/,
    )
  })

  it('gives every button with a text label, and every submit input, the shared button class', () => {
    for (const file of files) {
      for (const [, tag, content] of read(file).matchAll(/(<button\b[^>]*>)([\s\S]*?)<\/button>/g)) {
        // Icon controls (close, menu, arrows, a video cover, a product image to zoom) hold only an SVG or an image; Liquid tags show no text.
        if (!content.replace(/<svg[\s\S]*?<\/svg>|{{[\s\S]*?image_tag[\s\S]*?}}|{%[\s\S]*?%}|<[^>]+>/g, '').trim()) continue
        // A country or language is an option of a disclosure list, styled as a list item, not a button.
        if (/class="[\w-]+__disclosure-option"/.test(tag)) continue
        expect(tag, file).toMatch(/class="[^"]*\bbutton(--secondary)?\b/)
      }
      for (const [tag] of read(file).matchAll(/<input\b[^>]*type="submit"[^>]*>/g)) {
        expect(tag, file).toMatch(/class="[^"]*\bbutton(--secondary)?\b/)
      }
    }
  })

  it('leaves button colors, padding and shape out of every section, block and snippet', () => {
    // The cart count is a badge in the button colors, not a button.
    const allowed = new Set(['.header__cart-count'])
    for (const file of files) {
      for (const [, selector, body] of stylesheet(file).matchAll(/([^{}]+){([^{}]*)}/g)) {
        if (/var\(--color-(primary-|secondary-)?button/.test(body)) expect(allowed, `${file}: ${selector.trim()}`).toContain(selector.trim())
      }
      expect(read(file), file).not.toMatch(/basic-page__button/)
    }
    expect(read('base-theme/assets/critical.css')).not.toMatch(/\.basic-page :is\(button/)
  })
})

describe('Product card', () => {
  const skillDir = path.join(projectDir, 'skills/shopify-theme-builder')
  const read = (file: string) => readFileSync(path.join(skillDir, file), 'utf8')
  const sections = ['featured-collection', 'main-collection', 'main-search', 'related-products']

  it('is one Base Theme snippet with a LiquidDoc header, for a product or a placeholder', () => {
    const card = read('base-theme/snippets/product-card.liquid')
    expect(card).toMatch(/^{% doc %}/)
    expect(card).toContain('@param {product} [product]')
    expect(card).toContain('@param {number} [placeholder]')
    expect(card).toContain('@param {boolean} [show_quick_add]')
    expect(card).toContain("{{ 'product-' | append: placeholder | placeholder_svg_tag: 'placeholder product-card__placeholder' }}")
  })

  it.each(sections)('is what %s renders for each product, with no card markup or styles of its own', (name) => {
    const source = read(`catalog/sections/${name}.liquid`)
    expect(source).toContain("{% render 'product-card'")
    expect(source).not.toContain('unit_price_with_measurement')
    expect(source).not.toContain('__quick-add')
    expect(source).not.toMatch(/\.price \| money|1999 \| money/)
  })

  it("links to the product within the collection it is listed in, so the product page's breadcrumbs keep that collection", () => {
    const card = read('base-theme/snippets/product-card.liquid')
    expect(card).toContain('@param {collection} [collection]')
    expect(card).toMatch(/if collection\s+assign product_url = product\.url \| within: collection\s+endif/)
    expect(card).not.toContain('{{ product.url }}')
    expect(read('catalog/sections/main-collection.liquid')).toMatch(/{% render 'product-card', product: product, [^%]*, collection: collection[,\s]/)
    expect(read('catalog/sections/featured-collection.liquid')).toMatch(/{% render 'product-card', product: product, [^%]*, collection: featured[,\s]/)
    const breadcrumbs = read('base-theme/snippets/breadcrumbs.liquid')
    expect(breadcrumbs).toMatch(/when 'product'\s+if collection\s+assign parent_title = collection\.title\s+assign parent_url = collection\.url/)
  })

  it('takes its image ratio, text alignment, border and surface from variables', () => {
    const variables = read('base-theme/snippets/css-variables.liquid')
    for (const name of ['image-ratio', 'text-align', 'border-width', 'padding', 'background']) {
      expect(variables).toMatch(new RegExp(`--card-${name}:`))
    }
    const critical = read('base-theme/assets/critical.css')
    expect(critical).toMatch(/\.product-card {[^}]*padding: var\(--card-padding\)/)
    expect(critical).toMatch(/\.product-card {[^}]*border: var\(--card-border-width\) solid var\(--color-border\)/)
    expect(critical).toMatch(/\.product-card {[^}]*background-color: var\(--card-background\)/)
    expect(critical).toMatch(/\.product-card {[^}]*text-align: var\(--card-text-align\)/)
    expect(critical).toMatch(/\.product-card__image {[^}]*aspect-ratio: var\(--card-image-ratio\)/)
    expect(critical).toMatch(/\.product-card__quick-add-button {[^}]*align-self: var\(--card-text-align\)/)
  })
})

describe('Card anatomies', () => {
  const skillDir = path.join(projectDir, 'skills/shopify-theme-builder')
  const read = (file: string) => readFileSync(path.join(skillDir, file), 'utf8')
  const parse = (source: string) => JSON.parse(source.match(/{% schema %}([\s\S]*){% endschema %}/)![1])
  const global = parseJSON(read('base-theme/config/settings_schema.json'))
    .flatMap((group: { settings?: object[] }) => group.settings ?? [])
    .find((s: { id?: string }) => s.id === 'card_anatomy')
  const card = read('base-theme/snippets/product-card.liquid')
  const critical = read('base-theme/assets/critical.css')
  const sections = ['featured-collection', 'main-collection', 'main-search', 'related-products']

  it('offers three anatomies as a theme setting, minimal by default', () => {
    expect(global).toMatchObject({ type: 'select', label: 't:labels.card_anatomy' })
    expect(values(global)).toEqual(['minimal', 'detailed', 'editorial'])
    expect(global.default).toBe('minimal')
  })

  it('takes the anatomy a section passes, or the theme setting for the theme default', () => {
    expect(card).toContain('@param {string} [anatomy]')
    expect(card).toMatch(/if anatomy == blank or anatomy == 'theme'\s*assign anatomy = settings\.card_anatomy/)
    expect(card).toContain('<div class="product-card product-card--{{ anatomy }} ')
  })

  it.each(sections)('lets %s override the anatomy on its cards and example cards', (name) => {
    const source = read(`catalog/sections/${name}.liquid`)
    const setting = parse(source).settings.find((s: { id?: string }) => s.id === 'card_anatomy')
    expect(setting).toMatchObject({ type: 'select', label: 't:labels.card_anatomy', default: 'theme' })
    expect(values(setting)).toEqual(['theme', ...values(global)])
    const renders = source.match(/{% render 'product-card'[^%]*%}/g)!
    for (const render of renders) expect(render).toContain('anatomy: section.settings.card_anatomy')
  })

  it('shows the vendor, color swatches and a rating on the detailed card', () => {
    expect(card).toMatch(/{% if anatomy == 'detailed' and product\.vendor != blank %}\s*<p class="product-card__vendor text-small">{{ product\.vendor \| escape }}/)
    // A swatch is nil without a saved color or image, so only an option with swatches shows them.
    expect(card).toContain('option.values.first.swatch')
    expect(card).toMatch(/swatch\.image\s*\| image_url: width: \d+[^}]*\| image_tag:[^}]*sizes: /)
    expect(card).toContain('background-color: rgb({{ value.swatch.color.rgb }});')
    // The rating slot: the standard reviews metafield review apps write.
    expect(card).toContain('product.metafields.reviews.rating.value')
    expect(card).toContain("'product_card.rating' | t:")
    expect(card).toContain("'product_card.review_count' | t: count: review_count")
  })

  it('shows Sold out, or the saving of a sale, on every anatomy', () => {
    // The badge sits over the image's top start corner, out of the text's flow so titles line up, and outside
    // the aria-hidden image link so screen readers still read it. No anatomy check wraps it.
    expect(card).toMatch(
      /<\/a>\s*{% if product\.available == false %}\s*<p class="product-card__badge text-label">{{ 'product\.sold_out' \| t }}<\/p>\s*{% elsif product\.compare_at_price > product\.price %}\s*<p class="product-card__badge product-card__badge--sale text-label">\s*{%- render 'price-saving', price: product\.price, compare_at_price: product\.compare_at_price -%}\s*<\/p>\s*{% endif %}/,
    )
    expect(critical).toMatch(/\.product-card__badge {[^}]*border-radius: var\(--style-border-radius-badges\)/)
    expect(critical).toMatch(/\.product-card {[^}]*position: relative/)
    expect(critical).toMatch(/\.product-card__badge {[^}]*position: absolute;[^}]*inset-block-start: var\(--space-xs\);[^}]*inset-inline-start: var\(--space-xs\)/)
  })

  it('shows the crossed-out price of a sale, and "From" when the price varies, on every anatomy', () => {
    expect(card).not.toContain("anatomy == 'detailed' and product.compare_at_price")
    expect(card).toMatch(/assign price = product\.price \| money\s*if product\.price_varies\s*assign price = 'product_card\.from_price' \| t: price: price\s*endif/)
    expect(card).toMatch(
      /{% if product\.compare_at_price > product\.price %}\s*<p class="price">[\s\S]*<span class="price__sale">{{ price }}<\/span>[\s\S]*<s class="product-card__compare-at">{{ product\.compare_at_price \| money }}<\/s>\s*<\/p>\s*{% else %}\s*<p class="price">{{ price }}<\/p>/,
    )
    expect(JSON.parse(read('base-theme/locales/en.default.json')).product_card.from_price).toBe('From {{ price }}')
  })

  it('gives the editorial card a large title with the price under it and no button', () => {
    expect(card).toMatch(/product-card__title{% if anatomy == 'editorial' %} text-h4{% endif %}/)
    expect(card).toMatch(/{% if show_quick_add and anatomy != 'editorial' %}/)
    expect(critical).toMatch(/\.product-card--editorial \.product-card__title,[^{]*h6 {[^}]*font-family: var\(--font-heading--family\)/)
  })

  it('offers each anatomy as a named featured collection preset', () => {
    const schema = parse(read('catalog/sections/featured-collection.liquid'))
    const settings = Object.fromEntries(schema.settings.map((setting: { id?: string }) => [setting.id, setting]))
    expect(schema.presets[0]).toEqual({ name: 't:general.featured_collection' })
    expect(schema.presets.length).toBeGreaterThanOrEqual(4)
    for (const preset of schema.presets.slice(1)) {
      expect(preset.name).toMatch(/^t:general\.featured_collection_/)
      for (const [id, value] of Object.entries(preset.settings)) {
        expect(settings[id].type === 'checkbox' ? typeof value === 'boolean' : fits(settings[id], value), `${id}: ${value}`).toBe(true)
      }
    }
    expect(schema.presets.slice(1).map((preset: { settings: { card_anatomy: string } }) => preset.settings.card_anatomy)).toEqual(values(global))
  })

  it.each([
    ['main-collection', 'collection_product_grid'],
    ['main-search', 'search_results'],
    ['related-products', 'related_products'],
  ])('offers each anatomy as a named %s preset', (name, key) => {
    const presets = parse(read(`catalog/sections/${name}.liquid`)).presets
    for (const anatomy of values(global)) {
      expect(presets).toContainEqual(
        expect.objectContaining({ name: `t:general.${key}_${anatomy}`, settings: expect.objectContaining({ card_anatomy: anatomy }) }),
      )
    }
  })
})

describe('Price savings', () => {
  const skillDir = path.join(projectDir, 'skills/shopify-theme-builder')
  const read = (file: string) => readFileSync(path.join(skillDir, file), 'utf8')
  const saving = read('base-theme/snippets/price-saving.liquid')

  it('shows the amount saved or the percentage off, whichever number is larger', () => {
    // Liquid gives prices in hundredths, so the percentage in hundredths compares with the amount saved.
    expect(saving).toMatch(/assign saving = compare_at_price \| minus: price/)
    // Rounded down, so it never promises more than the saving.
    expect(saving).toMatch(/assign percent = saving \| times: 100 \| divided_by: compare_at_price/)
    expect(saving).toMatch(/assign percent_in_hundredths = percent \| times: 100\s*if percent_in_hundredths > saving\s*echo 'product\.save_percent' \| t: percent: percent\s*else\s*assign amount = saving \| money\s*echo 'product\.save_amount' \| t: amount: amount\s*endif/)
    const locale = JSON.parse(read('base-theme/locales/en.default.json'))
    expect(locale.product.save_amount).toBe('Save {{ amount }}')
    expect(locale.product.save_percent).toBe('−{{ percent }}%')
  })

  it('shows the saving on the product page beside the crossed-out price', () => {
    expect(read('base-theme/blocks/_product-price.liquid')).toMatch(
      /<s class="product-price__compare-at">{{ compare_at_price \| money }}<\/s>\s*<span class="product-price__saving text-label">\s*{%- render 'price-saving', price: price, compare_at_price: compare_at_price -%}\s*<\/span>/,
    )
  })

  it('sets every price in tabular, lining figures', () => {
    expect(read('base-theme/assets/critical.css')).toMatch(/\n\.price {\s*font-variant-numeric: tabular-nums lining-nums;\s*}/)
  })
})

describe('Tax note', () => {
  const skillDir = path.join(projectDir, 'skills/shopify-theme-builder')
  const read = (file: string) => readFileSync(path.join(skillDir, file), 'utf8')
  const note = read('base-theme/snippets/tax-note.liquid')
  const locale = JSON.parse(read('base-theme/locales/en.default.json'))

  it('says what the price includes from cart.taxes_included and cart.duties_included', () => {
    expect(note).toMatch(
      /if cart\.duties_included and cart\.taxes_included\s*echo 'taxes\.duties_and_taxes_included' \| t\s*elsif cart\.taxes_included\s*echo 'taxes\.included' \| t\s*elsif cart\.duties_included\s*echo 'taxes\.duties_included' \| t\s*endif/,
    )
    expect(locale.taxes.duties_and_taxes_included).toBe('Duties and taxes included.')
    expect(locale.taxes.included).toBe('Taxes included.')
    expect(locale.taxes.duties_included).toBe('Duties included.')
  })

  it('says what checkout adds, linking shipping to the shipping policy when the shop has one', () => {
    expect(note).toMatch(
      /if cart\.taxes_included\s*if shop\.shipping_policy\s*echo 'taxes\.shipping_at_checkout_html' \| t: link: shop\.shipping_policy\.url\s*else\s*echo 'taxes\.shipping_at_checkout' \| t\s*endif\s*elsif shop\.shipping_policy\s*echo 'taxes\.taxes_and_shipping_at_checkout_html' \| t: link: shop\.shipping_policy\.url\s*else\s*echo 'taxes\.taxes_and_shipping_at_checkout' \| t\s*endif/,
    )
    expect(locale.taxes.shipping_at_checkout).toBe('Shipping calculated at checkout.')
    expect(locale.taxes.shipping_at_checkout_html).toBe('<a href="{{ link }}">Shipping</a> calculated at checkout.')
    expect(locale.taxes.taxes_and_shipping_at_checkout).toBe('Taxes and shipping calculated at checkout.')
    expect(locale.taxes.taxes_and_shipping_at_checkout_html).toBe('Taxes and <a href="{{ link }}">shipping</a> calculated at checkout.')
    expect(locale.cart.taxes_and_shipping).toBeUndefined()
  })

  it.each(['catalog/sections/main-cart.liquid', 'base-theme/sections/cart.liquid'])(
    'shows under the subtotal of %s, which the cart drawer shows too',
    (file) => {
      expect(read(file)).toContain(`<p class="rte">{%- render 'tax-note' -%}</p>`)
    },
  )

  it('shows under the product price, from the cart too, since shop.taxes_included is deprecated', () => {
    expect(read('base-theme/blocks/_product-price.liquid')).toMatch(
      /<p class="product-price__note text-small rte">{%- render 'tax-note' -%}<\/p>\s*<\/div>/,
    )
  })
})

describe('Store decisions', () => {
  const skillDir = path.join(projectDir, 'skills/shopify-theme-builder')
  const skill = readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8')
  const brief = readFileSync(path.join(skillDir, 'references/design/brief.md'), 'utf8')
  const line = (name: string) => skill.match(new RegExp(`^   - \\*\\*${name}\\*\\*[^\\n]*`, 'm'))?.[0] ?? ''

  it("keeps a default language the Creator names, and proposes the country's only when they named none", () => {
    expect(line('Languages')).toMatch(/default language the Creator names[^\n]*kept as is/)
    expect(line('Languages')).toMatch(/only when they named none/)
  })

  it('titles the menus in that default language', () => {
    expect(line('Menus')).toMatch(/in the default language/)
  })

  it('tells the Creator to correct a previewed answer with a note, since a question with previews has no Other', () => {
    for (const text of [skill, brief]) {
      expect(text).toMatch(/no \*\*Other\*\*[^\n]*note on the option \(press `n`\)/)
    }
  })

  it('names the logo in the read-back only when one was found or given', () => {
    const readBack = brief.match(/^## Reading it back\n([\s\S]*?)(?=^## |$(?![\s\S]))/m)?.[1] ?? ''
    expect(readBack).toMatch(/logo only when[^\n]*found or given[^\n]*"no logo"/)
  })
})

describe('Catalog updates', () => {
  const skill = readFileSync(path.join(projectDir, 'skills/shopify-theme-builder/SKILL.md'), 'utf8')
  const step = skill.match(/^## 7\. Update the catalog sections\n([\s\S]*?)^## /m)?.[1] ?? ''

  it('has a skill step after Custom Sections that brings catalog fixes into a Theme', () => {
    expect(skill.match(/^## \d+\. .+$/gm)?.slice(5)).toEqual(['## 6. Custom Sections', '## 7. Update the catalog sections', '## 8. Delivery'])
    expect(step).toContain('npx skills update')
    expect(step).toContain('<skill-dir>/catalog/sections/<name>.liquid')
    expect(step).toContain('git merge-file')
    expect(step).toContain('shopify theme check --path <theme>')
  })

  it('is mentioned in the README', () => {
    expect(readFileSync(path.join(projectDir, 'README.md'), 'utf8')).toMatch(/catalog fixes/i)
  })
})

describe('Image ratio', () => {
  const skillDir = path.join(projectDir, 'skills/shopify-theme-builder')
  const read = (file: string) => readFileSync(path.join(skillDir, file), 'utf8')
  const sections = [
    'blog-posts',
    'call-to-action',
    'collection-list',
    'contact-form',
    'editorial-split',
    'featured-product',
    'image-gallery',
    'image-with-text',
    'main-404',
    'main-blog',
    'main-list-collections',
    'main-product',
    'main-search',
    'multicolumn',
    'newsletter',
    'process-steps',
    'team',
    'timeline',
  ]

  it.each(sections)('lets the Merchant pick the ratio of the %s images, following the product card ratio by default', (name) => {
    const source = read(`catalog/sections/${name}.liquid`)
    const schema = JSON.parse(source.match(/{% schema %}([\s\S]*){% endschema %}/)![1])
    expect(schema.settings).toContainEqual({
      type: 'select',
      id: 'image_ratio',
      label: 't:labels.image_ratio',
      options: ['card', 'portrait', 'square', 'landscape', 'natural'].map((value) => ({ value, label: `t:options.image_ratio.${value}` })),
      default: 'card',
    })
    expect(source).toContain("--image-ratio: {% render 'image-ratio', ratio: section.settings.image_ratio %};")
    // Every image box takes the picked ratio; a video, a 3D model or a small icon keeps its own.
    const css = source.match(/{% stylesheet %}([\s\S]*?){% endstylesheet %}/)![1]
    for (const [rule, selector, body] of css.matchAll(/([^{}]+){([^{}]*)}/g)) {
      const ratio = body.match(/aspect-ratio:\s*([^;]+);/)?.[1]
      if (!ratio || /iframe|video|model|--small/.test(selector)) continue
      expect(ratio, rule.trim()).toBe('var(--image-ratio)')
    }
    expect(css).toContain('aspect-ratio: var(--image-ratio);')
  })

  it('maps each value to a ratio in a Base Theme snippet: the card ratio, 4 / 5, 1 / 1, 4 / 3, or each image its own', () => {
    const snippet = read('base-theme/snippets/image-ratio.liquid')
    expect(snippet).toMatch(/{% doc %}[\s\S]*@param {string} ratio\b[\s\S]*{% enddoc %}/)
    const values = Object.fromEntries([...snippet.matchAll(/{%- (?:when '(\w+)'|else) -%}\s*([^{]+?)\s*(?={%)/g)].map(([, value, ratio]) => [value ?? 'card', ratio]))
    expect(values).toEqual({ portrait: '4 / 5', square: '1 / 1', landscape: '4 / 3', natural: 'auto', card: 'var(--card-image-ratio)' })
  })
})

describe('Image loading', () => {
  const skillDir = path.join(projectDir, 'skills/shopify-theme-builder')
  const read = (file: string) => readFileSync(path.join(skillDir, file), 'utf8')
  const stylesheet = (source: string) => source.match(/{% stylesheet %}([\s\S]*?){% endstylesheet %}/)?.[1] ?? ''

  // The sections a page can open with: each makes its heading the page's h1 as the first section, h2 otherwise.
  const openers = ['hero', 'slideshow', 'type-banner', 'image-with-text', 'editorial-split', 'lookbook', 'collection-list']

  it.each(openers)('makes the heading of %s the page heading only as the first section', (name) => {
    const source = read(`catalog/sections/${name}.liquid`)
    expect(source).toMatch(/assign heading_tag = 'h2'\s+if [^\n]*section\.index == 1\s+(?:assign (?!heading_tag)[^\n]+\s+)*assign heading_tag = 'h1'/)
    // The heading keeps its size whichever level it takes.
    expect(source).toMatch(/<{{ heading_tag }} class="[^"]*\btext-(?:display|h2|{{ section\.settings\.size }})[\s"]/)
    expect(source).not.toMatch(/<h[12][\s>]/)
  })

  it.each(['hero', 'slideshow', 'main-product', 'main-404', 'image-with-text', 'editorial-split', 'lookbook', 'collection-list'])('loads the first viewport image of %s first: high fetch priority, never lazy, never animated', (name) => {
    const source = read(`catalog/sections/${name}.liquid`)
    // The branch that gives the image high priority also loads it eagerly.
    expect(source).toMatch(/\n\s*if [^\n]+\n\s*assign loading = 'eager'\n\s*assign fetchpriority = 'high'\n/)
    const call = source.match(/\| image_tag:[\s\S]*?}}/)![0]
    expect(call).toContain('loading: loading')
    expect(call).toContain('fetchpriority: fetchpriority')
    expect(stylesheet(source)).not.toMatch(/animation|@keyframes/)
  })

  it('lets a product card load eagerly, which the collection and search pages ask for their first row', () => {
    const card = read('base-theme/snippets/product-card.liquid')
    expect(card).toMatch(/@param {string} \[loading\] - /)
    expect(card).toContain("assign loading = loading | default: 'lazy'")
    for (const [call] of card.matchAll(/product(?:\.featured_image|\.media\[1\]\.preview_image)\s*\| image_url[^}]*}}/g)) {
      expect(call, call).toContain('loading: loading')
    }
    for (const name of ['main-collection', 'main-search']) {
      const source = read(`catalog/sections/${name}.liquid`)
      expect(source, name).toMatch(/assign card_loading = 'lazy'\s+if forloop\.index <= section\.settings\.columns\s+assign card_loading = 'eager'/)
      expect(source, name).toMatch(/{% render 'product-card', product: (product|result), [^%]*loading: card_loading %}/)
    }
  })

  it.each([
    ['hero', 'section'],
    ['slideshow', 'block'],
  ])('lets %s take a separate mobile image, the phone source of a <picture> with its own sizes and dimensions', (name, owner) => {
    const source = read(`catalog/sections/${name}.liquid`)
    const schema = JSON.parse(source.match(/{% schema %}([\s\S]*){% endschema %}/)![1])
    const settings = (owner === 'section' ? schema.settings : schema.blocks[0].settings).map((setting: { id?: string }) => setting.id)
    // Right after the image, labelled from the schema locale.
    expect(settings[settings.indexOf('image') + 1]).toBe('image_mobile')
    expect(source).toMatch(/"type": "image_picker",\s*"id": "image_mobile",\s*"label": "t:labels\.image_mobile",\s*"info": "t:info\.hero_image_mobile"/)

    const picture = source.match(/<picture>[\s\S]*?<\/picture>/)?.[0] ?? ''
    const phone = picture.match(/<source[^>]*>/)?.[0] ?? ''
    expect(picture).toContain(`{% if ${owner}.settings.image_mobile != blank %}`)
    expect(phone).toContain('media="(max-width: 749px)"')
    expect(phone).toMatch(/srcset="[^"]*image_mobile \| image_url: width: \d+ }} \d+w/)
    expect(phone).toContain('sizes="100vw"')
    expect(phone).toContain(`width="{{ ${owner}.settings.image_mobile.width }}"`)
    expect(phone).toContain(`height="{{ ${owner}.settings.image_mobile.height }}"`)
    // The desktop image stays the <img>, with its priority and its own sizes; a mobile image alone stands in for it.
    expect(picture).toMatch(/\| image_tag:[^}]*sizes: sizes,[^}]*fetchpriority: fetchpriority/)
    expect(source).toContain(`assign image = ${owner}.settings.image | default: ${owner}.settings.image_mobile`)
    // The <picture> steps out of the layout, so the <img> still fills the media box at every height (#199).
    const media = name === 'hero' ? 'hero__media' : 'slideshow__media'
    expect(source).toMatch(new RegExp(`\\.${media} > picture {\\s*display: contents;`))
  })

  // The catalog's sections and the Base Theme snippets they render.
  const files = [
    ...readdirSync(path.join(skillDir, 'catalog/sections'))
      .filter((file) => file.endsWith('.liquid'))
      .map((file) => `catalog/sections/${file}`),
    'base-theme/snippets/product-card.liquid',
    'base-theme/snippets/image.liquid',
  ]

  it.each(files)('gives every image_tag in %s sizes and keeps its width and height, so it holds a ratio', (file) => {
    const source = read(file).replace(/{% doc %}[\s\S]*?{% enddoc %}/, '')
    for (const [call] of source.matchAll(/\| image_tag\b[^}]*}}/g)) {
      expect(call, call).toMatch(/\bsizes:/)
      expect(call, call).not.toMatch(/\b(width|height): (nil|false|'')/)
    }
    for (const [call] of source.matchAll(/{% render 'image',[^%]*%}/g)) {
      expect(call, call).toMatch(/\bsizes:/)
    }
  })

  it.each(['blog-posts', 'collection-list', 'image-gallery', 'main-blog', 'main-list-collections', 'main-search', 'multicolumn'])(
    'fits every image of the %s grid into a fixed ratio box, so mixed image ratios keep the rows even',
    (name) => {
      const css = stylesheet(read(`catalog/sections/${name}.liquid`))
      expect(css).toMatch(/aspect-ratio:/)
      // Cropped to fill, or for product images framed whole as the media treatment says: either way the box keeps its ratio.
      expect(css).toMatch(/object-fit: (var\(--media-fit\)|cover)/)
    },
  )
})

describe('Shipped template ids', () => {
  const skillDir = path.join(projectDir, 'skills/shopify-theme-builder')

  it('has no section or block id starting with _, which Shopify rejects on upload', () => {
    const files = ['base-theme/templates', 'catalog/templates', 'base-theme/sections', 'catalog/sections'].flatMap((dir) =>
      readdirSync(path.join(skillDir, dir))
        .filter((file) => file.endsWith('.json'))
        .map((file) => path.join(dir, file)),
    )
    expect(files).toContain('catalog/sections/header-group.json')
    const underscored = files.flatMap((file) => {
      const { sections } = parseJSON(readFileSync(path.join(skillDir, file), 'utf8')) as { sections: Record<string, { blocks?: object }> }
      const ids = Object.entries(sections).flatMap(([id, { blocks = {} }]) => [id, ...Object.keys(blocks)])
      return ids.filter((id) => id.startsWith('_')).map((id) => `${file}: ${id}`)
    })
    expect(underscored).toEqual([])
  })
})
