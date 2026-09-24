import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { fixtureTheme, catalogHero, openStudio, home, readTemplate, readSettingsData, errors } from './helpers/studio.js'

describe('Studio API: undo and redo', () => {
  it('undoes and redoes adding a section, restoring every file it touched, with a Theme Check each time', async () => {
    const theme = fixtureTheme()
    const before = readFileSync(path.join(theme, home), 'utf8')
    const studio = await openStudio(theme)
    expect((await studio.readTheme()).history).toEqual({ undo: false, redo: false })
    await studio.addSection('hero')
    const added = readFileSync(path.join(theme, home), 'utf8')

    const undone = await studio.send('POST', 'api/undo')
    expect(undone.status).toBe(200)
    expect(readFileSync(path.join(theme, home), 'utf8')).toBe(before)
    expect(existsSync(path.join(theme, 'sections/hero.liquid'))).toBe(false)
    expect(undone.body.home).toEqual([{ id: 'main', type: 'hello-world' }])
    expect(undone.body.history).toEqual({ undo: false, redo: true })
    expect(errors(undone.body.validation)).toEqual([])

    const redone = await studio.send('POST', 'api/redo')
    expect(redone.status).toBe(200)
    expect(readFileSync(path.join(theme, home), 'utf8')).toBe(added)
    expect(readFileSync(path.join(theme, 'sections/hero.liquid'), 'utf8')).toBe(catalogHero)
    expect(redone.body.history).toEqual({ undo: true, redo: false })
    expect(errors(redone.body.validation)).toEqual([])
  })

  it('undoes a logo upload and a Brand change, one step each, back to the Theme as it was', async () => {
    const theme = fixtureTheme()
    const settings = readFileSync(path.join(theme, 'config/settings_data.json'), 'utf8')
    const studio = await openStudio(theme)
    await studio.uploadLogo(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2]), 'image/png')
    await studio.setBrand({ headingFont: 'work_sans_n4' })

    await studio.send('POST', 'api/undo')
    expect(readSettingsData(theme).current.logo_asset).toBe('studio-logo.png')
    expect(readSettingsData(theme).current.type_heading_font).not.toBe('work_sans_n4')
    const { body } = await studio.send('POST', 'api/undo')
    expect(readFileSync(path.join(theme, 'config/settings_data.json'), 'utf8')).toBe(settings)
    expect(existsSync(path.join(theme, 'assets/studio-logo.png'))).toBe(false)
    expect(body.history).toEqual({ undo: false, redo: true })
  })

  /** A Studio on a fresh Theme, with a live edit from one Studio field. */
  async function liveEdits() {
    const theme = fixtureTheme()
    const studio = await openStudio(theme)
    async function edit(field: string, brand: object) {
      const response = await fetch(new URL('api/brand', studio.url), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Studio-Field': field },
        body: JSON.stringify(brand),
      })
      expect(response.status).toBe(200)
    }
    const text = (color: string) => ({ colorSchemes: { 'scheme-1': { text: color } } })
    const textColor = () => readSettingsData(theme).current.color_schemes['scheme-1'].settings.text
    return { theme, studio, edit, text, textColor }
  }

  it('records the live edits of one Studio field in a row as one step, ended by a write from another field or an undo', async () => {
    const { theme, studio, edit, text, textColor } = await liveEdits()
    const settings = readFileSync(path.join(theme, 'config/settings_data.json'), 'utf8')

    await edit('brand/scheme-1/text', text('#111111'))
    await edit('brand/scheme-1/text', text('#222222'))
    const { body } = await studio.send('POST', 'api/undo')
    expect(body.history).toEqual({ undo: false, redo: true })
    expect(readFileSync(path.join(theme, 'config/settings_data.json'), 'utf8')).toBe(settings)
    await studio.send('POST', 'api/redo')
    expect(textColor()).toBe('#222222')

    await edit('brand/scheme-1/text', text('#333333'))
    await edit('brand/body-font', { bodyFont: 'work_sans_n7' })
    await edit('brand/scheme-1/text', text('#444444'))
    await studio.send('POST', 'api/undo')
    expect(textColor()).toBe('#333333')
    await studio.send('POST', 'api/undo')
    await studio.send('POST', 'api/undo')
    expect(textColor()).toBe('#222222')
  })

  it('keeps two live edits of one field apart when an edit made outside the Studio comes between them, so undo never takes it back', async () => {
    const { theme, studio, edit, text, textColor } = await liveEdits()
    await edit('brand/scheme-1/text', text('#555555'))
    const data = readSettingsData(theme)
    data.current.social_instagram = 'https://instagram.com/shop'
    writeFileSync(path.join(theme, 'config/settings_data.json'), JSON.stringify(data, null, 2))
    await edit('brand/scheme-1/text', text('#666666'))
    await studio.send('POST', 'api/undo')
    expect(textColor()).toBe('#555555')
    expect(readSettingsData(theme).current.social_instagram).toBe('https://instagram.com/shop')
  })

  it('refuses with 409 when there is nothing to undo or redo', async () => {
    const studio = await openStudio(fixtureTheme())
    const undo = await studio.send('POST', 'api/undo')
    expect(undo.status).toBe(409)
    expect(undo.body.error).toBe('Nothing to undo.')
    expect((await studio.send('POST', 'api/redo')).status).toBe(409)
  })

  it('clears redo on a new write, and records nothing for a refused write', async () => {
    const studio = await openStudio(fixtureTheme())
    await studio.addSection('hero')
    await studio.send('POST', 'api/undo')
    expect((await studio.addSection('nope')).status).toBe(404)
    expect((await studio.readTheme()).history).toEqual({ undo: false, redo: true })
    const { body } = await studio.addSection('hero')
    expect(body.history).toEqual({ undo: true, redo: false })
  })

  it('keeps at most 50 steps', async () => {
    const theme = fixtureTheme()
    const studio = await openStudio(theme)
    const fonts = ['work_sans_n4', 'work_sans_n7']
    for (let step = 0; step < 51; step++) await studio.setBrand({ bodyFont: fonts[step % 2] })
    for (let step = 0; step < 50; step++) expect((await studio.send('POST', 'api/undo')).status).toBe(200)
    expect((await studio.send('POST', 'api/undo')).status).toBe(409)
    // The first write's step fell off: the Theme keeps its body font.
    expect(readSettingsData(theme).current.type_body_font).toBe('work_sans_n4')
  })

  it('never undoes an edit made outside the Studio: it refuses, names the file and drops the step', async () => {
    const theme = fixtureTheme()
    const studio = await openStudio(theme)
    await studio.addSection('hero')
    await studio.setBrand({ bodyFont: 'work_sans_n7' })
    const edited = readFileSync(path.join(theme, 'config/settings_data.json'), 'utf8').replace('work_sans_n7', 'work_sans_n4')
    writeFileSync(path.join(theme, 'config/settings_data.json'), edited)

    const { status, body } = await studio.send('POST', 'api/undo')
    expect(status).toBe(409)
    expect(body.error).toContain('config/settings_data.json changed outside the Studio')
    expect(readFileSync(path.join(theme, 'config/settings_data.json'), 'utf8')).toBe(edited)
    // The step before, on other files, still undoes.
    expect((await studio.send('POST', 'api/undo')).status).toBe(200)
    expect(readTemplate(theme).order).toEqual(['main'])
  })
})
