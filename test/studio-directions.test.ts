import { spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkDirection } from '../skills/shopify-theme-builder/scripts/check-direction.mjs'
import { projectDir, cleanup, fixtureTheme, catalogHero, openStudio, home, readTemplate, readSettingsData, errors } from './helpers/studio.js'

describe('Studio API: Directions', () => {
  const heroHome = { sections: { hero: { type: 'hero', settings: { color_scheme: 'scheme-2' } } }, order: ['hero'] }

  it('writes a Direction as a preset of the Theme settings with its style, and its home template as a listing', async () => {
    const theme = fixtureTheme()
    const studio = await openStudio(theme)
    await studio.setBrand({ headingFont: 'work_sans_n7' })
    await studio.setStyle({ density: 'airy' })
    const { status, body } = await studio.send('PUT', `api/directions/${encodeURIComponent('Olive Press')}`, {
      settings: { shape_family: 'square', motion: 'none' },
      template: heroHome,
    })
    expect(status).toBe(200)
    const data = readSettingsData(theme)
    const preset = data.presets['Olive Press']
    // The Brand comes along; the style is the Direction's own, and a style setting it leaves out takes its default.
    expect(preset).toMatchObject({ type_heading_font: 'work_sans_n7', shape_family: 'square', motion: 'none' })
    expect(preset).not.toHaveProperty('density')
    expect(Object.keys(preset.color_schemes)).toEqual(['scheme-1', 'scheme-2'])
    // Writing a Direction doesn't switch to it.
    expect(data.current.density).toBe('airy')
    expect(readTemplate(theme, 'listings/olive-press/templates/index.json')).toEqual(heroHome)
    // The catalog section the template names is copied into the Theme.
    expect(readFileSync(path.join(theme, 'sections/hero.liquid'), 'utf8')).toBe(catalogHero)
    expect(readTemplate(theme)).toMatchObject({ order: ['main'] })
    expect(errors(body.validation)).toEqual([])
  })

  it('switches to a Direction as Shopify applies a preset and its listing, keeping the logo, in one undo step', async () => {
    const theme = fixtureTheme()
    const settingsBefore = readFileSync(path.join(theme, 'config/settings_data.json'), 'utf8')
    const homeBefore = readFileSync(path.join(theme, home), 'utf8')
    const studio = await openStudio(theme)
    await studio.send('PUT', 'api/directions/Quiet', { settings: { shape_family: 'square', card_text_alignment: 'center' }, template: heroHome })
    await studio.send('PUT', 'api/directions/Loud', { settings: { shape_family: 'round' }, template: { sections: { main: { type: 'hello-world' } }, order: ['main'] } })
    // A logo added after the Directions were written, and a style change: switching keeps the one and not the other.
    await studio.uploadLogo(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2]), 'image/png')
    await studio.setStyle({ shape_family: 'soft' })
    const settingsWritten = readFileSync(path.join(theme, 'config/settings_data.json'), 'utf8')

    const { status, body } = await studio.send('PUT', 'api/directions/current', { name: 'Quiet' })
    expect(status).toBe(200)
    const data = readSettingsData(theme)
    expect(data.current).toBe('Quiet')
    expect(data.presets.Quiet).toMatchObject({ shape_family: 'square', card_text_alignment: 'center', logo_asset: 'studio-logo.png' })
    expect(readTemplate(theme)).toEqual(heroHome)
    // The preview reads the preset's values and the listing's home.
    const shape = body.style.flatMap((group: { settings: { id: string; value: unknown }[] }) => group.settings).find((setting: { id: string }) => setting.id === 'shape_family')
    expect(shape.value).toBe('square')
    expect(body.home).toEqual([{ id: 'hero', type: 'hero', colorScheme: 'scheme-2' }])
    expect(body.brand.logoAsset).toBe('studio-logo.png')
    expect(errors(body.validation)).toEqual([])

    // Rewriting the chosen Direction changes the home page with it.
    await studio.send('PUT', 'api/directions/Quiet', { settings: { shape_family: 'square' }, template: { sections: { main: { type: 'hello-world' } }, order: ['main'] } })
    expect(readTemplate(theme)).toMatchObject({ order: ['main'] })
    await studio.send('POST', 'api/undo')

    await studio.send('POST', 'api/undo')
    expect(readFileSync(path.join(theme, 'config/settings_data.json'), 'utf8')).toBe(settingsWritten)
    expect(readFileSync(path.join(theme, home), 'utf8')).toBe(homeBefore)
    for (let step = 0; step < 4; step++) await studio.send('POST', 'api/undo')
    expect(readFileSync(path.join(theme, 'config/settings_data.json'), 'utf8')).toBe(settingsBefore)
    expect(existsSync(path.join(theme, 'listings/quiet/templates/index.json'))).toBe(false)
  })

  it('leaves the Direction just written for check-direction to check its contrast, without switching to it (SKILL.md step 4.3.2)', async () => {
    const theme = fixtureTheme()
    const studio = await openStudio(theme)
    const contrast = () => checkDirection(theme).filter(({ check }) => check === 'contrast')
    await studio.setBrand({ colorSchemes: { 'scheme-1': { background: '#FFFFFF', text: '#999999' } } })
    await studio.send('PUT', 'api/directions/Quiet', { template: heroHome })
    expect(contrast().map(({ message }) => message)).toContain('scheme-1: text on background is 2.8:1, needs 4.5:1.')

    await studio.setBrand({ colorSchemes: { 'scheme-1': { background: '#FFFFFF', text: '#222222' } } })
    await studio.send('PUT', 'api/directions/Loud', { template: heroHome })
    expect(contrast().filter(({ message }) => message.startsWith('scheme-1: text'))).toEqual([])
  })

  it('keeps the same color scheme ids in every preset when one Direction adds a scheme, as Shopify requires to upload them', async () => {
    const theme = fixtureTheme()
    const studio = await openStudio(theme)
    await studio.setBrand({ colorSchemes: { 'scheme-1': { background: '#F5F0E8', text: '#222222' } } })
    await studio.send('PUT', 'api/directions/Quiet', { template: heroHome })
    await studio.setBrand({ colorSchemes: { 'scheme-1': { background: '#FFFFFF', text: '#111111' } } })
    await studio.send('PUT', 'api/directions/Loud', { template: heroHome })

    // The third Direction has one more scheme than the others.
    await studio.setBrand({ colorSchemes: { 'scheme-3': { background: '#8C2F1B', text: '#FFFFFF' } } })
    const { status, body } = await studio.send('PUT', 'api/directions/Bold', { template: { sections: { hero: { type: 'hero', settings: { color_scheme: 'scheme-3' } } }, order: ['hero'] } })
    expect(status).toBe(200)
    const data = readSettingsData(theme)
    expect(Object.keys(data.presets.Bold.color_schemes)).toEqual(['scheme-1', 'scheme-2', 'scheme-3'])
    expect(data.presets.Bold.color_schemes['scheme-3'].settings).toMatchObject({ background: '#8C2F1B' })
    // The others get it as a copy of their own scheme-1, so they look the same.
    expect(data.presets.Quiet.color_schemes['scheme-3']).toEqual(data.presets.Quiet.color_schemes['scheme-1'])
    expect(data.presets.Quiet.color_schemes['scheme-1'].settings).toMatchObject({ background: '#F5F0E8' })
    expect(data.presets.Loud.color_schemes['scheme-3']).toEqual(data.presets.Loud.color_schemes['scheme-1'])
    expect(errors(body.validation)).toEqual([])
  })

  it.each([
    ['a name of three words', 'Very Quiet Press', { template: heroHome }],
    ['a name of 30 characters', 'A'.repeat(30), { template: heroHome }],
    ['a name with punctuation', 'Quiet!', { template: heroHome }],
    ['no template', 'Quiet', { settings: {} }],
    ['a template without sections', 'Quiet', { template: { sections: {}, order: [] } }],
    ['an order missing a section', 'Quiet', { template: { ...heroHome, order: [] } }],
    ['a section neither the Theme nor the catalog has', 'Quiet', { template: { sections: { a: { type: 'nope' } }, order: ['a'] } }],
    ['a section id starting with _, which Shopify rejects', 'Quiet', { template: { sections: { _hero: heroHome.sections.hero }, order: ['_hero'] } }],
    ['a block id starting with _, which Shopify rejects', 'Quiet', { template: { sections: { hero: { type: 'hero', blocks: { _note: { type: 'note' } }, block_order: ['_note'] } }, order: ['hero'] } }],
    ['a setting that is not a style setting', 'Quiet', { settings: { cart_type: 'page' }, template: heroHome }],
    ['a style value off its options', 'Quiet', { settings: { shape_family: 'blob' }, template: heroHome }],
    ['an unknown field', 'Quiet', { template: heroHome, thesis: 'Calm' }],
  ])('rejects %s and writes nothing', async (_, name, direction) => {
    const theme = fixtureTheme()
    const before = readFileSync(path.join(theme, 'config/settings_data.json'), 'utf8')
    const { status, body } = await (await openStudio(theme)).send('PUT', `api/directions/${encodeURIComponent(name)}`, direction)
    // A missing section is a 404, as when adding one to a page.
    expect([400, 404]).toContain(status)
    expect(body.error).toEqual(expect.any(String))
    expect(readFileSync(path.join(theme, 'config/settings_data.json'), 'utf8')).toBe(before)
    expect(existsSync(path.join(theme, 'listings'))).toBe(false)
    expect(existsSync(path.join(theme, 'sections/hero.liquid'))).toBe(false)
  })

  it("takes images from the shop's Files in its home template's sections and blocks, and refuses other image values", async () => {
    const theme = fixtureTheme()
    const studio = await openStudio(theme, { catalog: path.join(projectDir, 'skills/shopify-theme-builder/catalog') })
    const home = (image: unknown, tile: unknown) => ({
      sections: {
        hero: { type: 'hero', settings: { image } },
        gallery: { type: 'image-gallery', blocks: { tile: { type: 'image', settings: { image: tile } } }, block_order: ['tile'] },
      },
      order: ['hero', 'gallery'],
    })
    const placed = home('shopify://shop_images/cover.jpg', 'shopify://shop_images/tile.png')
    expect((await studio.send('PUT', 'api/directions/Quiet', { template: placed })).status).toBe(200)
    expect(readTemplate(theme, 'listings/quiet/templates/index.json')).toEqual(placed)

    const before = readFileSync(path.join(theme, 'listings/quiet/templates/index.json'), 'utf8')
    for (const template of [home('https://cdn.shopify.com/cover.jpg', ''), home('', '/Users/me/tile.png')]) {
      const { status, body } = await studio.send('PUT', 'api/directions/Quiet', { template })
      expect(status).toBe(400)
      expect(body.error).toContain('shopify://shop_images/')
    }
    expect(readFileSync(path.join(theme, 'listings/quiet/templates/index.json'), 'utf8')).toBe(before)
  })

  it("checks every setting of its home template's sections and blocks as a PATCH does, naming the setting", async () => {
    const theme = fixtureTheme()
    const studio = await openStudio(theme, { catalog: path.join(projectDir, 'skills/shopify-theme-builder/catalog') })
    const home = (hero: object, tile: object = {}) => ({
      sections: {
        hero: { type: 'hero', settings: { color_scheme: 'scheme-2', ...hero } },
        gallery: { type: 'image-gallery', blocks: { tile: { type: 'image', settings: tile } }, block_order: ['tile'] },
      },
      order: ['hero', 'gallery'],
    })
    const placed = home({ overlay_opacity: 40, height: 'large', reveal: true, video: 'shopify://files/videos/intro.mp4' })
    expect((await studio.send('PUT', 'api/directions/Quiet', { template: placed })).status).toBe(200)
    expect(readTemplate(theme, 'listings/quiet/templates/index.json')).toEqual(placed)

    const before = readFileSync(path.join(theme, 'listings/quiet/templates/index.json'), 'utf8')
    for (const [template, message] of [
      [home({ overlay_opacity: 45 }), 'overlay_opacity must be a number from 0 to 90 in steps of 10.'],
      [home({ height: 'huge' }), 'height must be one of: small, medium, large, full_screen.'],
      [home({ reveal: 'yes' }), 'reveal must be true or false.'],
      [home({ glow: 3 }), 'glow is not a setting of the hero section.'],
      [home({ color_scheme: 'scheme-9' }), 'color_scheme must be one of the Brand\'s color schemes: scheme-1, scheme-2.'],
      [home({}, { mood: 'calm' }), 'mood is not a setting of the image block.'],
    ] as const) {
      const { status, body } = await studio.send('PUT', 'api/directions/Quiet', { template })
      expect(status).toBe(400)
      expect(body.error).toContain(message)
    }
    expect(readFileSync(path.join(theme, 'listings/quiet/templates/index.json'), 'utf8')).toBe(before)
  })

  it('holds at most three Directions, refuses a name whose folder another has, and switches only to one it has', async () => {
    const theme = fixtureTheme()
    const studio = await openStudio(theme)
    for (const name of ['One', 'Two', 'Three']) expect((await studio.send('PUT', `api/directions/${name}`, { template: heroHome })).status).toBe(200)
    const fourth = await studio.send('PUT', 'api/directions/Four', { template: heroHome })
    expect(fourth.status).toBe(400)
    expect(fourth.body.error).toContain('at most 3 Directions: One, Two, Three')
    expect((await studio.send('PUT', 'api/directions/Two', { template: heroHome })).status).toBe(200)
    expect((await studio.send('PUT', 'api/directions/two', { template: heroHome })).body.error).toContain('Direction Two already')
    const unknown = await studio.send('PUT', 'api/directions/current', { name: 'Four' })
    expect(unknown.status).toBe(400)
    expect(unknown.body.error).toContain('One, Two, Three')
    expect(readSettingsData(theme).current).not.toEqual(expect.any(String))
  })

  const contract = [
    '# Directions',
    '',
    '## Quiet',
    '',
    'A calm shop that lets',
    'the olive oil speak.',
    '',
    '- Serif headings, tight tracking',
    '- Square shapes',
    '',
    '### Rules',
    '',
    '- Do: leave space. Don\'t: fill it.',
    '',
    '## Loud',
    '',
    'Big type, bold color.',
    '',
  ].join('\n')

  it("lists the Theme's Directions with the thesis and key choices DIRECTION.md gives them, and the one in the preview", async () => {
    const theme = fixtureTheme()
    const studio = await openStudio(theme)
    expect((await studio.readTheme()).directions).toEqual([])
    await studio.send('PUT', 'api/directions/Quiet', { template: heroHome })
    await studio.send('PUT', 'api/directions/Loud', { template: heroHome })
    await studio.send('PUT', 'api/directions/Plain', { template: heroHome })
    writeFileSync(path.join(theme, 'DIRECTION.md'), contract)
    const { body } = await studio.send('PUT', 'api/directions/current', { name: 'Loud' })
    expect(body.directions).toEqual([
      { name: 'Quiet', thesis: 'A calm shop that lets the olive oil speak.', choices: ['Serif headings, tight tracking', 'Square shapes'], showing: false, chosen: false },
      { name: 'Loud', thesis: 'Big type, bold color.', choices: [], showing: true, chosen: false },
      // A Direction DIRECTION.md doesn't describe shows by name.
      { name: 'Plain', thesis: '', choices: [], showing: false, chosen: false },
    ])
    expect(errors(body.validation)).toEqual([])
  })

  it('chooses a Direction: the preview shows it and DIRECTION.md names it, in one undo step', async () => {
    const theme = fixtureTheme()
    const studio = await openStudio(theme)
    await studio.send('PUT', 'api/directions/Quiet', { settings: { shape_family: 'square' }, template: heroHome })
    await studio.send('PUT', 'api/directions/Loud', { template: heroHome })
    writeFileSync(path.join(theme, 'DIRECTION.md'), contract)

    const { status, body } = await studio.send('PUT', 'api/directions/chosen', { name: 'Quiet' })
    expect(status).toBe(200)
    expect(readSettingsData(theme).current).toBe('Quiet')
    expect(readFileSync(path.join(theme, 'DIRECTION.md'), 'utf8')).toBe(contract.replace('# Directions\n\n', '# Directions\n\nChosen: Quiet\n\n'))
    expect(body.directions.map(({ name, showing, chosen }: { name: string; showing: boolean; chosen: boolean }) => ({ name, showing, chosen }))).toEqual([
      { name: 'Quiet', showing: true, chosen: true },
      { name: 'Loud', showing: false, chosen: false },
    ])
    expect(errors(body.validation)).toEqual([])

    // Tuned after choosing, it stays chosen; choosing another replaces the mark.
    expect((await studio.setStyle({ shape_family: 'round' })).body.directions[0]).toMatchObject({ showing: false, chosen: true })
    await studio.send('PUT', 'api/directions/chosen', { name: 'Loud' })
    expect(readFileSync(path.join(theme, 'DIRECTION.md'), 'utf8')).toContain('Chosen: Loud\n\n## Quiet')
    await studio.send('POST', 'api/undo')
    expect(readFileSync(path.join(theme, 'DIRECTION.md'), 'utf8')).toContain('Chosen: Quiet\n')
    expect(readSettingsData(theme).current).toMatchObject({ shape_family: 'round' })
  })

  it("keeps the chosen Direction's listing identical to the home page through every home edit, in the same undo step", async () => {
    const theme = fixtureTheme()
    const studio = await openStudio(theme)
    await studio.send('PUT', 'api/directions/Quiet', { template: heroHome })
    await studio.send('PUT', 'api/directions/Loud', { template: heroHome })
    const listing = path.join(theme, 'listings/quiet/templates/index.json')
    const read = (file: string) => readFileSync(file, 'utf8')
    const inSync = () => expect(read(listing)).toBe(read(path.join(theme, home)))

    // Before the choice, a home edit leaves the listings alone.
    await studio.send('PUT', 'api/directions/current', { name: 'Quiet' })
    await studio.setColorScheme('hero', 'scheme-1')
    expect(readTemplate(theme, 'listings/quiet/templates/index.json')).toEqual(heroHome)

    await studio.send('PUT', 'api/directions/chosen', { name: 'Quiet' })
    inSync()
    const chosen = read(listing)
    await studio.setColorScheme('hero', 'scheme-2')
    inSync()
    expect(readTemplate(theme, 'listings/quiet/templates/index.json').sections.hero.settings.color_scheme).toBe('scheme-2')
    const { body: added } = await studio.addSection('hello-world')
    inSync()
    const id = added.home.at(-1).id
    await studio.reorderSections([id, 'hero'])
    inSync()
    // Tuned after the choice, the preview still shows its home.
    await studio.setStyle({ shape_family: 'round' })
    await studio.removeSection(id)
    inSync()

    // Undo reverts both files in each step.
    await studio.send('POST', 'api/undo')
    await studio.send('POST', 'api/undo')
    inSync()
    await studio.send('POST', 'api/undo')
    await studio.send('POST', 'api/undo')
    inSync()
    await studio.send('POST', 'api/undo')
    expect(read(listing)).toBe(chosen)
    inSync()
  })

  it("leaves the chosen Direction's listing alone while another Direction is in the preview", async () => {
    const theme = fixtureTheme()
    const studio = await openStudio(theme)
    await studio.send('PUT', 'api/directions/Quiet', { template: heroHome })
    await studio.send('PUT', 'api/directions/Loud', { template: heroHome })
    await studio.send('PUT', 'api/directions/chosen', { name: 'Quiet' })
    const chosen = readFileSync(path.join(theme, 'listings/quiet/templates/index.json'), 'utf8')

    await studio.send('PUT', 'api/directions/current', { name: 'Loud' })
    await studio.setColorScheme('hero', 'scheme-1')
    expect(readFileSync(path.join(theme, 'listings/quiet/templates/index.json'), 'utf8')).toBe(chosen)
    expect(readTemplate(theme, 'listings/loud/templates/index.json')).toEqual(heroHome)
  })

  it('writes DIRECTION.md when the Theme has none, and chooses only a Direction it has', async () => {
    const theme = fixtureTheme()
    const studio = await openStudio(theme)
    await studio.send('PUT', 'api/directions/Quiet', { template: heroHome })
    const unknown = await studio.send('PUT', 'api/directions/chosen', { name: 'Loud' })
    expect(unknown.status).toBe(400)
    expect(unknown.body.error).toContain('Quiet')
    expect(existsSync(path.join(theme, 'DIRECTION.md'))).toBe(false)
    await studio.send('PUT', 'api/directions/chosen', { name: 'Quiet' })
    expect(readFileSync(path.join(theme, 'DIRECTION.md'), 'utf8')).toBe('Chosen: Quiet\n')
  })

  it("reads a DIRECTION.md written from the skill's template: the card's thesis and choices, never its sketch or rules", async () => {
    const template = readFileSync(path.join(projectDir, 'skills/shopify-theme-builder/references/design/direction-template.md'), 'utf8')
    const theme = fixtureTheme()
    const studio = await openStudio(theme)
    await studio.send('PUT', 'api/directions/Quiet', { template: heroHome })
    writeFileSync(path.join(theme, 'DIRECTION.md'), template.replaceAll('<Direction name>', 'Quiet'))

    const { body } = await studio.send('PUT', 'api/directions/chosen', { name: 'Quiet' })
    const [quiet] = body.directions
    expect(quiet).toMatchObject({ name: 'Quiet', chosen: true })
    expect(quiet.thesis).toMatch(/^<Thesis/)
    // One line per axis of the card, in its order.
    expect(quiet.choices.map((choice: string) => choice.split(':')[0])).toEqual(['Type', 'Color', 'Shape', 'Spacing', 'Cards', 'Media', 'Motion', 'Signature', 'Footer', 'Rejects'])
    expect(readFileSync(path.join(theme, 'DIRECTION.md'), 'utf8')).toMatch(/^# .+\n\nChosen: Quiet\n\n/)
  })

  describe('wait-for-choice command (SKILL.md step 4.4)', () => {
    /** Runs the waiter without blocking, so the Studio in this process keeps answering it. */
    function waitForChoice(...args: string[]) {
      const child = spawn('node', [path.join(projectDir, 'skills/shopify-theme-builder/studio/bin/wait-for-choice.mjs'), ...args])
      cleanup.push(() => void child.kill())
      let stdout = ''
      let stderr = ''
      child.stdout.on('data', (chunk) => (stdout += chunk))
      child.stderr.on('data', (chunk) => (stderr += chunk))
      return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) =>
        child.on('close', (code) => resolve({ code, stdout, stderr })),
      )
    }

    it('exits with the Direction the Creator chooses', async () => {
      const studio = await openStudio(fixtureTheme())
      await studio.send('PUT', 'api/directions/Quiet', { template: heroHome })
      await studio.send('PUT', 'api/directions/Loud', { template: heroHome })
      const waiting = waitForChoice('--port', new URL(studio.url).port, '--interval', '0.1')
      // Polls a few times before the choice.
      await new Promise((resolve) => setTimeout(resolve, 500))
      await studio.send('PUT', 'api/directions/chosen', { name: 'Loud' })
      const { code, stdout } = await waiting
      expect(code).toBe(0)
      expect(stdout.trim()).toBe('Loud')
    })

    it('gives up with a message after its timeout', async () => {
      const studio = await openStudio(fixtureTheme())
      const { code, stdout, stderr } = await waitForChoice('--port', new URL(studio.url).port, '--timeout', '0.3', '--interval', '0.1')
      expect(code).toBe(1)
      expect(stdout).toBe('')
      expect(stderr).toContain('No Direction chosen after 0.3 seconds')
    })

    it('stops with a message when the Studio stops', async () => {
      const studio = await openStudio(fixtureTheme())
      const waiting = waitForChoice('--port', new URL(studio.url).port, '--interval', '0.1')
      await new Promise((resolve) => setTimeout(resolve, 300))
      await studio.close()
      const { code, stderr } = await waiting
      expect(code).toBe(1)
      expect(stderr).toContain(`No Studio answers on port ${new URL(studio.url).port}`)
    })
  })

  it('names only reference files the skill has', () => {
    const skillDir = path.join(projectDir, 'skills/shopify-theme-builder')
    const named = readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8').match(/references\/[\w/.-]+\.md/g) ?? []
    expect(named).toContain('references/design/brief.md')
    for (const file of named) expect(existsSync(path.join(skillDir, file)), file).toBe(true)
  })
})
