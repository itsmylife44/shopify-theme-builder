import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseJSON } from '@shopify/theme-check-node'
import { fixtureTheme, openStudio, readSettingsData, errors } from './helpers/studio.js'

describe('Studio API: set Brand', () => {
  it('reads the Base Theme Brand from settings data, falling back to schema defaults', async () => {
    const state = await (await openStudio(fixtureTheme())).readTheme()
    expect(state.brand).toEqual({
      colorSchemes: {
        'scheme-1': { background: '#FFFFFF', text: '#333333', button: '#333333', button_label: '#FFFFFF', accent: '#333333', border: '#8A8A8A' },
        'scheme-2': { background: '#333333', text: '#FFFFFF', button: '#FFFFFF', button_label: '#333333', accent: '#FFFFFF', border: '#858585' },
      },
      colorFields: ['background', 'text', 'button', 'button_label', 'accent', 'border'],
      gradientFields: ['background_gradient'],
      headingFont: 'work_sans_n4',
      bodyFont: 'work_sans_n4',
      accentFont: 'work_sans_n4',
      logo: null,
      logoAsset: null,
    })
  })

  it('writes color schemes, fonts and logo into settings data and returns a clean validation', async () => {
    const theme = fixtureTheme()
    const studio = await openStudio(theme)
    const { status, body } = await studio.setBrand({
      colorSchemes: {
        'scheme-1': { background: '#FAF7F2', text: '#1F1A17', accent: '#8C2F1B', background_gradient: 'linear-gradient(180deg, #FAF7F2, #EFE6D8 100%)' },
        'scheme-3': { background: '#0A3D62' },
      },
      headingFont: 'playfair_display_n7',
      bodyFont: 'assistant_n4',
      accentFont: 'space_mono_n4',
      logo: 'shopify://shop_images/logo.png',
    })
    expect(status).toBe(200)
    const current = readSettingsData(theme).current
    expect(current.color_schemes['scheme-1'].settings).toEqual({
      background: '#FAF7F2',
      background_gradient: 'linear-gradient(180deg, #FAF7F2, #EFE6D8 100%)',
      text: '#1F1A17',
      button: '#333333',
      button_label: '#FFFFFF',
      accent: '#8C2F1B',
      border: '#8A8A8A',
    })
    // A new scheme starts from the schema's default colors.
    expect(current.color_schemes['scheme-3'].settings).toEqual({
      background: '#0A3D62',
      text: '#333333',
      button: '#333333',
      button_label: '#FFFFFF',
      accent: '#333333',
      border: '#8A8A8A',
    })
    expect(current.type_heading_font).toBe('playfair_display_n7')
    expect(current.type_body_font).toBe('assistant_n4')
    expect(current.type_accent_font).toBe('space_mono_n4')
    expect(current.logo).toBe('shopify://shop_images/logo.png')
    expect(body.brand.headingFont).toBe('playfair_display_n7')
    expect(body.brand.colorSchemes['scheme-1'].background).toBe('#FAF7F2')
    expect(errors(body.validation)).toEqual([])
  })

  it('preserves settings, unknown keys and Theme Editor changes it does not own', async () => {
    const theme = fixtureTheme()
    const header = '/*\n * Written by the Theme Editor\n */\n'
    const original = {
      current: {
        max_page_width: '110rem',
        some_unknown_key: { nested: true },
        color_schemes: {
          'scheme-1': { settings: { background: '#FFFFFF', text: '#000000', background_gradient: 'linear-gradient(#fff, #eee)' } },
          'scheme-2': { settings: { background: '#000000', text: '#FFFFFF' } },
        },
        sections: { header: { type: 'header', settings: { menu: 'main-menu' } } },
      },
      presets: { Default: { max_page_width: '90rem' } },
    }
    writeFileSync(path.join(theme, 'config/settings_data.json'), header + JSON.stringify(original, null, 2))
    const { status } = await (await openStudio(theme)).setBrand({
      colorSchemes: { 'scheme-1': { text: '#222222' } },
      bodyFont: 'assistant_n4',
    })
    expect(status).toBe(200)
    const raw = readFileSync(path.join(theme, 'config/settings_data.json'), 'utf8')
    expect(raw.startsWith(header)).toBe(true)
    const data = parseJSON(raw)
    expect(data).toEqual({
      current: {
        ...original.current,
        color_schemes: {
          'scheme-1': { settings: { background: '#FFFFFF', text: '#222222', background_gradient: 'linear-gradient(#fff, #eee)' } },
          'scheme-2': { settings: { background: '#000000', text: '#FFFFFF' } },
        },
        type_body_font: 'assistant_n4',
      },
      presets: original.presets,
    })
  })

  it('fills a scheme color the settings data lacks with the schema default', async () => {
    const theme = fixtureTheme()
    writeFileSync(
      path.join(theme, 'config/settings_data.json'),
      JSON.stringify({ current: { color_schemes: { 'scheme-1': { settings: { background: '#FFFFFF', text: '#000000' } } } } }),
    )
    const state = await (await openStudio(theme)).readTheme()
    expect(state.brand.colorSchemes['scheme-1']).toEqual({
      background: '#FFFFFF',
      text: '#000000',
      button: '#333333',
      button_label: '#FFFFFF',
      accent: '#333333',
      border: '#8A8A8A',
    })
  })

  it('reads a background gradient and clears it with an empty string', async () => {
    const theme = fixtureTheme()
    const studio = await openStudio(theme)
    const gradient = 'radial-gradient(rgba(255, 255, 255, 1), rgba(238, 238, 238, 1) 100%)'
    const { body } = await studio.setBrand({ colorSchemes: { 'scheme-2': { background_gradient: gradient } } })
    expect(body.brand.colorSchemes['scheme-2'].background_gradient).toBe(gradient)
    const cleared = await studio.setBrand({ colorSchemes: { 'scheme-2': { background_gradient: '' } } })
    expect(readSettingsData(theme).current.color_schemes['scheme-2'].settings).not.toHaveProperty('background_gradient')
    expect(cleared.body.brand.colorSchemes['scheme-2']).not.toHaveProperty('background_gradient')
  })

  it('clears the logo with null', async () => {
    const theme = fixtureTheme()
    const studio = await openStudio(theme)
    await studio.setBrand({ logo: 'shopify://shop_images/logo.png' })
    const { body } = await studio.setBrand({ logo: null })
    expect(readSettingsData(theme).current).not.toHaveProperty('logo')
    expect(body.brand.logo).toBe(null)
  })

  it.each([
    ['a color that is not hex', { colorSchemes: { 'scheme-1': { background: 'red' } } }],
    ['a color the scheme does not define', { colorSchemes: { 'scheme-1': { shadow: '#000000' } } }],
    ['a gradient that is a hex color', { colorSchemes: { 'scheme-1': { background_gradient: '#FFFFFF' } } }],
    ['a gradient that breaks out of its CSS rule', { colorSchemes: { 'scheme-1': { background_gradient: 'linear-gradient(red, blue); } body { display: none' } } }],
    ['a font that is not a font handle', { headingFont: 'Playfair Display' }],
    ['a font handle that is not in Shopify\'s font library', { bodyFont: 'comic_sans_n4' }],
    ['a logo that is not a shop image', { logo: 'https://example.com/logo.png' }],
    ['an unknown field', { tagline: 'Hi' }],
  ])('rejects %s and leaves settings data untouched', async (_, brand) => {
    const theme = fixtureTheme()
    const before = readFileSync(path.join(theme, 'config/settings_data.json'), 'utf8')
    const { status, body } = await (await openStudio(theme)).setBrand(brand)
    expect(status).toBe(400)
    expect(body.error).toEqual(expect.any(String))
    expect(readFileSync(path.join(theme, 'config/settings_data.json'), 'utf8')).toBe(before)
  })
})

describe('Studio API: style settings', () => {
  it('reads the style settings grouped like the Theme Editor, with labels, values and choices', async () => {
    const state = await (await openStudio(fixtureTheme())).readTheme()
    expect(state.style.map((group: { name: string }) => group.name)).toEqual(['Type', 'Shape', 'Buttons', 'Spacing', 'Cards', 'Media', 'Motion'])
    const settings = Object.fromEntries(state.style.flatMap((group: { settings: { id: string }[] }) => group.settings.map((setting) => [setting.id, setting])))
    expect(Object.keys(settings)).toEqual([
      'type_body_size',
      'type_scale_ratio',
      'type_display_size',
      'type_heading_weight',
      'type_heading_case',
      'type_heading_tracking',
      'shape_family',
      'border_width',
      'button_primary_style',
      'button_text_case',
      'button_font_weight',
      'density',
      'page_width',
      'card_anatomy',
      'card_image_ratio',
      'card_style',
      'card_text_alignment',
      'card_text_style',
      'card_hover',
      'media_treatment',
      'media_tint',
      'motion',
    ])
    expect(settings.type_body_size).toEqual({ id: 'type_body_size', type: 'range', label: 'Body size', value: 16, min: 14, max: 18, step: 1, unit: 'px' })
    expect(settings.shape_family).toEqual({
      id: 'shape_family',
      type: 'select',
      label: 'Shape',
      value: 'soft',
      options: [
        { value: 'square', label: 'Square' },
        { value: 'soft', label: 'Soft' },
        { value: 'round', label: 'Round' },
      ],
    })
    expect(settings.card_text_alignment).toEqual({
      id: 'card_text_alignment',
      type: 'select',
      label: 'Text alignment',
      value: 'left',
      options: [
        { value: 'left', label: 'Left' },
        { value: 'center', label: 'Center' },
        { value: 'right', label: 'Right' },
      ],
    })
    expect(settings.media_tint).toEqual({ id: 'media_tint', type: 'color', label: 'Tint behind images', value: '' })
  })

  it('writes style settings into settings data with a clean Theme Check, one undo step, and clears a color with an empty string', async () => {
    const theme = fixtureTheme()
    const before = readFileSync(path.join(theme, 'config/settings_data.json'), 'utf8')
    const studio = await openStudio(theme)
    const { status, body } = await studio.setStyle({
      type_body_size: 17,
      shape_family: 'round',
      card_text_alignment: 'center',
      media_tint: '#F4EFE8',
      motion: 'expressive',
    })
    expect(status).toBe(200)
    const current = readSettingsData(theme).current
    expect(current).toMatchObject({ type_body_size: 17, shape_family: 'round', card_text_alignment: 'center', media_tint: '#F4EFE8', motion: 'expressive' })
    // The Brand's color schemes stay.
    expect(Object.keys(current.color_schemes)).toEqual(['scheme-1', 'scheme-2'])
    const read = (state: { style: { settings: { id: string; value: unknown }[] }[] }, id: string) =>
      state.style.flatMap((group) => group.settings).find((setting) => setting.id === id)?.value
    expect(read(body, 'shape_family')).toBe('round')
    expect(read(body, 'media_tint')).toBe('#F4EFE8')
    expect(errors(body.validation)).toEqual([])

    const cleared = await studio.setStyle({ media_tint: '' })
    expect(readSettingsData(theme).current).not.toHaveProperty('media_tint')
    expect(read(cleared.body, 'media_tint')).toBe('')

    await studio.send('POST', 'api/undo')
    const { body: undone } = await studio.send('POST', 'api/undo')
    expect(readFileSync(path.join(theme, 'config/settings_data.json'), 'utf8')).toBe(before)
    expect(undone.history).toEqual({ undo: false, redo: true })
  })

  it("writes and clears the social media links the footer's social block shows, one undo step each (SKILL.md step 4.6)", async () => {
    const theme = fixtureTheme()
    const before = readFileSync(path.join(theme, 'config/settings_data.json'), 'utf8')
    const studio = await openStudio(theme)
    const { status, body } = await studio.setStyle({ social_instagram: 'https://instagram.com/acme', social_tiktok: 'https://www.tiktok.com/@acme' })
    expect(status).toBe(200)
    expect(readSettingsData(theme).current).toMatchObject({ social_instagram: 'https://instagram.com/acme', social_tiktok: 'https://www.tiktok.com/@acme' })
    expect(errors(body.validation)).toEqual([])
    const written = readFileSync(path.join(theme, 'config/settings_data.json'), 'utf8')

    await studio.setStyle({ social_tiktok: '' })
    expect(readSettingsData(theme).current).not.toHaveProperty('social_tiktok')
    expect(readSettingsData(theme).current.social_instagram).toBe('https://instagram.com/acme')

    await studio.send('POST', 'api/undo')
    expect(readFileSync(path.join(theme, 'config/settings_data.json'), 'utf8')).toBe(written)
    const { body: undone } = await studio.send('POST', 'api/undo')
    expect(readFileSync(path.join(theme, 'config/settings_data.json'), 'utf8')).toBe(before)
    expect(undone.history).toEqual({ undo: false, redo: true })
  })

  it("writes and clears the free-shipping threshold the cart and shipping note show, from the Creator's buying facts (SKILL.md step 4.6)", async () => {
    const theme = fixtureTheme()
    const studio = await openStudio(theme)
    const { status, body } = await studio.setStyle({ free_shipping_threshold: 60 })
    expect(status).toBe(200)
    expect(readSettingsData(theme).current.free_shipping_threshold).toBe(60)
    expect(errors(body.validation)).toEqual([])

    await studio.setStyle({ free_shipping_threshold: null })
    expect(readSettingsData(theme).current).not.toHaveProperty('free_shipping_threshold')
  })

  it('writes the social media links into the current Direction, which keeps them when the preview switches Directions', async () => {
    const theme = fixtureTheme()
    const studio = await openStudio(theme)
    const template = { sections: { main: { type: 'hello-world' } }, order: ['main'] }
    await studio.send('PUT', 'api/directions/Quiet', { template })
    await studio.send('PUT', 'api/directions/Loud', { template })
    await studio.send('PUT', 'api/directions/chosen', { name: 'Quiet' })
    await studio.setStyle({ social_instagram: 'https://instagram.com/acme' })
    await studio.send('PUT', 'api/directions/current', { name: 'Loud' })
    const data = readSettingsData(theme)
    expect(data.current).toBe('Loud')
    expect(data.presets.Loud.social_instagram).toBe('https://instagram.com/acme')
  })

  it.each([
    ['a social link that is not https', { social_instagram: 'http://instagram.com/acme' }],
    ['a social link that is a store path', { social_facebook: '/pages/about' }],
    ['a social link that is not a string', { social_x: null }],
    ['a free-shipping threshold that is not a number', { free_shipping_threshold: '60' }],
    ['a range value off its step', { type_scale_ratio: 132 }],
    ['a range value out of bounds', { type_body_size: 20 }],
    ['an option the setting does not have', { shape_family: 'blob' }],
    ['an alignment that is not left, center or right', { card_text_alignment: 'justify' }],
    ['a color that is not hex', { media_tint: 'beige' }],
    ['a setting that is not a style setting', { cart_type: 'page' }],
    ['a list instead of an object', ['round']],
  ])('rejects %s and leaves settings data untouched', async (_, style) => {
    const theme = fixtureTheme()
    const before = readFileSync(path.join(theme, 'config/settings_data.json'), 'utf8')
    const { status, body } = await (await openStudio(theme)).setStyle(style)
    expect(status).toBe(400)
    expect(body.error).toEqual(expect.any(String))
    expect(readFileSync(path.join(theme, 'config/settings_data.json'), 'utf8')).toBe(before)
  })
})

describe('Studio API: logo', () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
  const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"/>')

  it('stores an uploaded logo in the Theme assets and points the logo_asset setting at it', async () => {
    const theme = fixtureTheme()
    const studio = await openStudio(theme)
    const { status, body } = await studio.uploadLogo(png, 'image/png')
    expect(status).toBe(200)
    expect(new Uint8Array(readFileSync(path.join(theme, 'assets/studio-logo.png')))).toEqual(png)
    expect(readSettingsData(theme).current.logo_asset).toBe('studio-logo.png')
    expect(body.brand.logoAsset).toBe('studio-logo.png')
    expect(errors(body.validation)).toEqual([])

    const served = await studio.fetchLogo()
    expect(served.headers.get('content-type')).toBe('image/png')
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(png)
  })

  it('replaces the previous logo file on a new upload', async () => {
    const theme = fixtureTheme()
    const studio = await openStudio(theme)
    await studio.uploadLogo(png, 'image/png')
    const { status } = await studio.uploadLogo(svg, 'image/svg+xml')
    expect(status).toBe(200)
    expect(existsSync(path.join(theme, 'assets/studio-logo.png'))).toBe(false)
    expect(readFileSync(path.join(theme, 'assets/studio-logo.svg'), 'utf8')).toContain('<svg')
    expect(readSettingsData(theme).current.logo_asset).toBe('studio-logo.svg')
  })

  it('never deletes or overwrites a logo asset the Studio did not write', async () => {
    const theme = fixtureTheme()
    writeFileSync(path.join(theme, 'assets/logo.png'), png)
    writeFileSync(
      path.join(theme, 'config/settings_data.json'),
      JSON.stringify({ current: { ...readSettingsData(theme).current, logo_asset: 'logo.png' } }),
    )
    const studio = await openStudio(theme)
    await studio.uploadLogo(svg, 'image/svg+xml')
    expect(existsSync(path.join(theme, 'assets/logo.png'))).toBe(true)
    await studio.removeLogo()
    expect(existsSync(path.join(theme, 'assets/studio-logo.svg'))).toBe(false)

    writeFileSync(
      path.join(theme, 'config/settings_data.json'),
      JSON.stringify({ current: { ...readSettingsData(theme).current, logo_asset: 'logo.png' } }),
    )
    await studio.removeLogo()
    expect(existsSync(path.join(theme, 'assets/logo.png'))).toBe(true)
    expect(readSettingsData(theme).current).not.toHaveProperty('logo_asset')
  })

  it('serves the logo so an SVG cannot run scripts on the Studio', async () => {
    const studio = await openStudio(fixtureTheme())
    await studio.uploadLogo(svg, 'image/svg+xml')
    const served = await studio.fetchLogo()
    expect(served.headers.get('content-security-policy')).toContain('sandbox')
  })

  it('removes the logo file and the setting', async () => {
    const theme = fixtureTheme()
    const studio = await openStudio(theme)
    await studio.uploadLogo(png, 'image/png')
    const { status, body } = await studio.removeLogo()
    expect(status).toBe(200)
    expect(existsSync(path.join(theme, 'assets/studio-logo.png'))).toBe(false)
    expect(readSettingsData(theme).current).not.toHaveProperty('logo_asset')
    expect(body.brand.logoAsset).toBe(null)
    expect((await studio.fetchLogo()).status).toBe(404)
  })

  it.each([
    ['a file that is not an image', new TextEncoder().encode('hello'), 'text/plain'],
    ['a file whose bytes are not the declared type', new TextEncoder().encode('hello'), 'image/png'],
    ['an image over 2 MB', Uint8Array.from({ length: 2 * 1024 * 1024 + 1 }, (_, i) => [0x89, 0x50, 0x4e, 0x47][i] ?? 0), 'image/png'],
  ])('refuses %s and writes nothing', async (_, file, type) => {
    const theme = fixtureTheme()
    const before = readFileSync(path.join(theme, 'config/settings_data.json'), 'utf8')
    const { status, body } = await (await openStudio(theme)).uploadLogo(file, type)
    expect(status).toBe(400)
    expect(body.error).toEqual(expect.any(String))
    expect(existsSync(path.join(theme, 'assets/studio-logo.png'))).toBe(false)
    expect(readFileSync(path.join(theme, 'config/settings_data.json'), 'utf8')).toBe(before)
  })
})
