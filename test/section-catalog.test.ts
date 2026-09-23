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

describe('App blocks', () => {
  it('lets apps add blocks to the main product info column', () => {
    const source = readFileSync(path.join(projectDir, 'skills/shopify-theme-builder/catalog/sections/main-product.liquid'), 'utf8')
    const schema = JSON.parse(source.match(/{% schema %}([\s\S]*){% endschema %}/)![1])
    expect(schema.blocks).toContainEqual({ type: '@app' })
    const details = source.slice(source.indexOf('class="main-product__details"'), source.indexOf('</product-info>'))
    expect(details).toContain('{% render block %}')
    expect(details).toContain('block.shopify_attributes')
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

  it.each(['featured-collection', 'main-collection', 'related-products'])('shows the unit price on %s cards', (name) => {
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

  it('shows color and image swatches in the variant picker, falling back to the text pill', () => {
    const picker = source.slice(source.indexOf('class="main-product__options"'), source.indexOf('</fieldset>'))
    expect(picker).toContain('{% if option_value.swatch.image %}')
    expect(picker).toContain('option_value.swatch.image | image_url')
    expect(picker).toContain('{% elsif option_value.swatch.color %}')
    expect(picker).toContain('option_value.swatch.color')
    expect(picker).toMatch(/{% else %}\s*{{- option_value \| escape -}}/)
    expect(picker).toContain('<span class="visually-hidden">{{ option_value | escape }}</span>')
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

describe('Header search', () => {
  const source = readFileSync(path.join(projectDir, 'skills/shopify-theme-builder/catalog/sections/header.liquid'), 'utf8')
  const schema = JSON.parse(source.match(/{% schema %}([\s\S]*){% endschema %}/)![1])

  it('links to the search page from the header icons, with an accessible label and a setting to hide it', () => {
    const icons = source.slice(source.indexOf('class="header__icons"'), source.indexOf('class="header__cart"'))
    expect(icons).toMatch(/{%-? if section\.settings\.show_search -?%}\s*<a class="header__search" href="{{ routes\.search_url }}" aria-label="{{ 'header\.search' \| t }}">/)
    expect(schema.settings).toContainEqual(expect.objectContaining({ id: 'show_search', type: 'checkbox', default: true }))
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
