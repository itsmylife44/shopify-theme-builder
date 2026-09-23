import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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

  it('is copied into every new Theme by the skill', () => {
    const skill = readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8')
    expect(skill).toContain('<skill-dir>/catalog/sections/main-cart.liquid')
    expect(skill).toContain('<skill-dir>/catalog/templates/cart.json')
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

  it('is copied into every new Theme by the skill', () => {
    const skill = readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8')
    expect(skill).toContain('<skill-dir>/catalog/sections/main-search.liquid')
    expect(skill).toContain('<skill-dir>/catalog/templates/search.json')
  })
})

describe('Unit prices', () => {
  const sections = path.join(projectDir, 'skills/shopify-theme-builder/catalog/sections')
  const read = (name: string) => readFileSync(path.join(sections, `${name}.liquid`), 'utf8')

  it('shows the variant unit price inside the product info, so it updates with the variant', () => {
    const source = read('main-product')
    const info = source.slice(source.indexOf('<product-info'), source.indexOf('</product-info>'))
    expect(info).toContain('{% if current_variant.unit_price_measurement %}')
    expect(info).toContain('current_variant.unit_price | unit_price_with_measurement: current_variant.unit_price_measurement')
    expect(info).toContain("'product.unit_price' | t")
  })

  it.each(['featured-collection', 'main-collection', 'main-search', 'related-products'])('shows the unit price on %s cards', (name) => {
    const source = read(name)
    expect(source).toContain('.selected_or_first_available_variant %}')
    expect(source).toContain('unit_variant.unit_price | unit_price_with_measurement: unit_variant.unit_price_measurement')
    expect(source).toContain("'product.unit_price' | t")
  })
})

describe('Product page requirements', () => {
  const source = readFileSync(path.join(projectDir, 'skills/shopify-theme-builder/catalog/sections/main-product.liquid'), 'utf8')
  const schema = JSON.parse(source.match(/{% schema %}([\s\S]*){% endschema %}/)![1])
  const info = source.slice(source.indexOf('<product-info'), source.indexOf('</product-info>'))
  const form = source.slice(source.indexOf("{% form 'product'"), source.indexOf('{% endform %}'))

  it('shows the vendor, with a setting to hide it', () => {
    expect(schema.settings).toContainEqual({ type: 'checkbox', id: 'show_vendor', label: 't:labels.show_vendor', default: true })
    expect(info).toContain('{% if section.settings.show_vendor and product.vendor != blank %}')
    expect(info).toContain('product.vendor | escape')
  })

  it('shows pickup availability of the current variant inside the product info, so it updates with the variant', () => {
    expect(info).toContain("current_variant.store_availabilities | where: 'pick_up_enabled', true")
    expect(info).toContain('.pick_up_time')
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
    expect(source).toContain('assign selling_plan_allocation = current_variant.selected_selling_plan_allocation')
    expect(info).toContain('selling_plan_allocation.per_delivery_price')
    expect(info).toContain('selling_plan_allocation.selling_plan.description')
    expect(source).toContain("event.target.name !== 'selling_plan'")
    expect(source).toContain("params.set('selling_plan', sellingPlan)")
  })

  it('lets the customer send a gift card to a recipient, with labelled and validated fields', () => {
    const recipient = form.slice(form.indexOf('{% if product.gift_card? %}'))
    const fields = recipient.slice(recipient.indexOf('<fieldset'), recipient.indexOf('</fieldset>'))
    expect(recipient).toMatch(/<fieldset[^>]*class="main-product__recipient-fields"[^>]*hidden\s+disabled/)
    expect(fields).toMatch(/type="hidden"\s+name="properties\[__shopify_send_gift_card_to_recipient\]"\s+value="true"/)
    expect(fields).toMatch(/type="email"\s+name="properties\[Recipient email\]"\s+required/)
    expect(recipient).toMatch(/name="properties\[Recipient name\]"\s+maxlength="255"/)
    expect(recipient).toMatch(/name="properties\[Message\]"\s+maxlength="200"/)
    expect(recipient).toMatch(/type="date"\s+name="properties\[Send on\]"\s+min="{{ today }}"\s+max="{{ latest_send_date }}"/)
    expect(recipient).toContain('name="properties[__shopify_offset]"')
    for (const key of ['send_to_recipient', 'email', 'name', 'message', 'message_info', 'send_on', 'send_on_info']) {
      expect(recipient).toContain(`'product.recipient.${key}' | t`)
    }
    expect(source).toContain('fields.hidden = fields.disabled = !checkbox.checked')
    expect(source).toContain('new Date().getTimezoneOffset()')
  })

  it('keeps what the customer typed for the recipient when the variant changes', () => {
    expect(source).toMatch(/this\.querySelector\('\.main-product__recipient'\)\?\.replaceWith\(recipient\)/)
  })

  it('shows color and image swatches in the variant picker, falling back to the text pill', () => {
    const picker = source.slice(source.indexOf('class="main-product__options"'), source.indexOf('</fieldset>'))
    expect(picker).toContain('{% if option_value.swatch.image %}')
    expect(picker).toContain('option_value.swatch.image | image_url')
    expect(picker).toContain('{% elsif option_value.swatch.color %}')
    expect(picker).toContain('option_value.swatch.color')
    expect(picker).toMatch(/{% else %}\s*{{- option_value \| escape -}}/)
    expect(picker).toContain('<span class="visually-hidden">{{ option_value | escape }}</span>')
  })

  it('links option values of combined listings to their sibling product, swatches included', () => {
    const picker = source.slice(source.indexOf('class="main-product__options"'), source.indexOf('</fieldset>'))
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
    expect(css).toMatch(/\n:focus-visible {\s*outline: 2px solid var\(--color-foreground\);\s*outline-offset: 2px;\s*}/)
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
    const skill = readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8')
    expect(skill).toContain('<skill-dir>/catalog/sections/predictive-search.liquid')
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

  it('opens the menu in a dialog drawer from a menu button on mobile', () => {
    expect(source).toMatch(/<button[^>]*class="header__menu-button"[^>]*aria-controls="HeaderDrawer"/)
    expect(source).toMatch(/<dialog[^>]*id="HeaderDrawer"/)
    expect(source).toContain('.showModal()')
    expect(source).toMatch(/<form method="dialog">/)
    expect(locale.header.menu).toBeTruthy()
    expect(locale.header.close_menu).toBeTruthy()
  })
})

describe('Country and language selector', () => {
  const catalog = path.join(projectDir, 'skills/shopify-theme-builder/catalog/sections')
  const header = readFileSync(path.join(catalog, 'header.liquid'), 'utf8')
  const headerSchema = JSON.parse(header.match(/{% schema %}([\s\S]*){% endschema %}/)![1])

  it.each(['footer', 'header'])('lets customers pick a country and a language in the %s, without JavaScript', (name) => {
    const source = readFileSync(path.join(catalog, `${name}.liquid`), 'utf8')
    const form = source.slice(source.indexOf("{% form 'localization'"), source.indexOf('{% endform %}', source.indexOf("{% form 'localization'")))
    expect(form).toMatch(/{%-? if localization\.available_countries\.size > 1 -?%}\s*<label[^>]*>[^<]*<\/label>\s*<select[^>]*name="country_code"/)
    expect(form).toContain('{{ country.name }} ({{ country.currency.iso_code }} {{ country.currency.symbol }})')
    expect(form).toMatch(/{%-? if localization\.available_languages\.size > 1 -?%}\s*<label[^>]*>[^<]*<\/label>\s*<select[^>]*name="language_code"/)
    expect(form).toContain('lang="{{ language.iso_code }}"')
    expect(form).toContain('{{ language.endonym_name | capitalize }}')
    expect(form).toMatch(/<button type="submit"/)
    // Both sections can render the form on one page, so each needs its own id instead of the default localization_form.
    expect(source).toContain(`{% form 'localization', id: '${name[0].toUpperCase()}${name.slice(1)}Localization'`)
    expect(form).not.toMatch(/<script|\son[a-z]+=/)
  })

  it('shows the selector in the header only when the Merchant turns it on', () => {
    expect(header).toMatch(/{%-? if section\.settings\.show_localization -?%}\s*{%-? if localization\.available_countries\.size > 1 or localization\.available_languages\.size > 1 -?%}\s*{% form 'localization'/)
    expect(headerSchema.settings).toContainEqual(expect.objectContaining({ id: 'show_localization', type: 'checkbox', default: false }))
  })
})

describe('Announcement bar', () => {
  const skillDir = path.join(projectDir, 'skills/shopify-theme-builder')
  const source = readFileSync(path.join(skillDir, 'catalog/sections/announcement-bar.liquid'), 'utf8')
  const schema = JSON.parse(source.match(/{% schema %}([\s\S]*){% endschema %}/)![1])

  it('sits once in the header group, with a color scheme and a preset', () => {
    expect(schema.enabled_on).toEqual({ groups: ['header'] })
    expect(schema.limit).toBe(1)
    expect(schema.presets).toHaveLength(1)
    expect(source).toContain('class="announcement-bar full-width color-{{ section.settings.color_scheme }}"')
  })

  it('rotates or stacks several messages, each with an optional link', () => {
    expect(schema.settings).toContainEqual(expect.objectContaining({ id: 'layout', type: 'select', default: 'rotate' }))
    expect(schema.blocks[0].settings).toContainEqual(expect.objectContaining({ id: 'link', type: 'url' }))
    expect(source).toMatch(/{% if block\.settings\.link != blank %}\s*<a href="{{ block\.settings\.link }}">/)
    expect(source).toMatch(/{% if rotate and forloop\.first == false %}\s*hidden/)
  })

  it('lets customers step through rotating messages, and stops rotating on hover, focus or reduced motion', () => {
    expect(source).toContain(`aria-label="{{ 'announcement_bar.previous' | t }}"`)
    expect(source).toContain(`aria-label="{{ 'announcement_bar.next' | t }}"`)
    expect(source).toContain("this.matches(':hover, :focus-within')")
    expect(source).toContain("matchMedia('(prefers-reduced-motion: reduce)')")
  })

  it('is in the header group of every new Theme, above the header', () => {
    const group = JSON.parse(readFileSync(path.join(skillDir, 'catalog/sections/header-group.json'), 'utf8'))
    expect(group.order).toEqual(['announcement-bar', 'header'])
    expect(group.sections['announcement-bar'].type).toBe('announcement-bar')
    const skill = readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8')
    expect(skill).toContain('<skill-dir>/catalog/sections/announcement-bar.liquid')
    expect(skill).toContain('<skill-dir>/catalog/sections/header-group.json')
  })
})

describe('Collection list', () => {
  const source = readFileSync(path.join(projectDir, 'skills/shopify-theme-builder/catalog/sections/collection-list.liquid'), 'utf8')
  const schema = JSON.parse(source.match(/{% schema %}([\s\S]*){% endschema %}/)![1])

  it('is a catalog section with a description, a color scheme and a preset', () => {
    expect(source).toMatch(/^{% comment %}.+{% endcomment %}\n/)
    expect(source).toContain('class="collection-list full-width color-{{ section.settings.color_scheme }}"')
    expect(schema.settings).toContainEqual({ type: 'color_scheme', id: 'color_scheme', label: 't:labels.color_scheme', default: 'scheme-1' })
    expect(schema.presets).toEqual([{ name: 't:general.collection_list' }])
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
    expect(source).toContain('class="featured-product full-width color-{{ section.settings.color_scheme }}"')
    expect(schema.settings).toContainEqual({ type: 'color_scheme', id: 'color_scheme', label: 't:labels.color_scheme', default: 'scheme-1' })
    expect(schema.presets).toEqual([{ name: 't:general.featured_product' }])
    expect(schema.enabled_on).toBeUndefined()
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

describe('Slideshow', () => {
  const source = readFileSync(path.join(projectDir, 'skills/shopify-theme-builder/catalog/sections/slideshow.liquid'), 'utf8')
  const schema = JSON.parse(source.match(/{% schema %}([\s\S]*){% endschema %}/)![1])

  it('is a catalog section with a description, a color scheme and a preset with slides', () => {
    expect(source).toMatch(/^{% comment %}.+{% endcomment %}\n/)
    expect(source).toContain('class="slideshow full-width color-{{ section.settings.color_scheme }}"')
    expect(schema.settings).toContainEqual({ type: 'color_scheme', id: 'color_scheme', label: 't:labels.color_scheme', default: 'scheme-1' })
    expect(schema.presets).toEqual([{ name: 't:general.slideshow', blocks: [{ type: 'slide' }, { type: 'slide' }] }])
    expect(schema.enabled_on).toBeUndefined()
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
})

describe('Multicolumn', () => {
  const source = readFileSync(path.join(projectDir, 'skills/shopify-theme-builder/catalog/sections/multicolumn.liquid'), 'utf8')
  const schema = JSON.parse(source.match(/{% schema %}([\s\S]*){% endschema %}/)![1])

  it('is a catalog section with a description, a color scheme and a preset with columns', () => {
    expect(source).toMatch(/^{% comment %}.+{% endcomment %}\n/)
    expect(source).toContain('class="multicolumn full-width color-{{ section.settings.color_scheme }}"')
    expect(schema.settings).toContainEqual({ type: 'color_scheme', id: 'color_scheme', label: 't:labels.color_scheme', default: 'scheme-1' })
    expect(schema.presets).toEqual([{ name: 't:general.multicolumn', blocks: [{ type: 'column' }, { type: 'column' }, { type: 'column' }] }])
    expect(schema.enabled_on).toBeUndefined()
  })

  it('shows columns, each with an icon or image, a heading and text, and a placeholder without an image', () => {
    const ids = schema.blocks[0].settings.map((setting: { id?: string }) => setting.id)
    expect(ids).toEqual(expect.arrayContaining(['image', 'heading', 'text']))
    expect(source).toContain('{% for block in section.blocks %}')
    expect(source).toContain('{{ block.shopify_attributes }}')
    expect(source).toContain("{{ 'image' | placeholder_svg_tag")
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
