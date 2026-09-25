import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'
import { dismissConsent, findChrome, parseArguments, partClips } from '../skills/shopify-theme-builder/scripts/screenshot.mjs'

// The capture itself needs a browser, so it stays out of CI: only the arguments, the parts' geometry and the Chrome lookup are tested.
const command = fileURLToPath(new URL('../skills/shopify-theme-builder/scripts/screenshot.mjs', import.meta.url))

describe('screenshot script (review.md step 2)', () => {
  describe('arguments', () => {
    it('captures a desktop page at 1440 by default', () => {
      expect(parseArguments(['http://127.0.0.1:9292/', 'home-1440.png'])).toEqual({
        pages: [{ url: 'http://127.0.0.1:9292/', out: 'home-1440.png' }],
        width: 1440,
        height: 900,
        mobile: false,
        partHeight: undefined,
        hover: undefined,
        keepConsent: false,
      })
    })

    it("keeps Shopify's cookie consent banner with --keep-consent, to review the banner itself", () => {
      expect(parseArguments(['http://127.0.0.1:9292/', 'home.png', '--keep-consent'])).toMatchObject({ keepConsent: true })
    })

    it('captures several pages in one run with --pages, each to <out-dir>/<page-slug>-<width>.png', () => {
      expect(parseArguments(['http://127.0.0.1:9292', 'shots', '--pages', '/', '/products/olive-oil', '/collections/all', '--parts'])).toMatchObject({
        pages: [
          { url: 'http://127.0.0.1:9292/', out: path.join('shots', 'home-1440.png') },
          { url: 'http://127.0.0.1:9292/products/olive-oil', out: path.join('shots', 'products-olive-oil-1440.png') },
          { url: 'http://127.0.0.1:9292/collections/all', out: path.join('shots', 'collections-all-1440.png') },
        ],
        partHeight: 1800,
      })
      expect(parseArguments(['http://127.0.0.1:9292/', 'shots', '--mobile', '--pages', '/', '/collections/all']).pages.map(({ out }) => out)).toEqual([
        path.join('shots', 'home-390.png'),
        path.join('shots', 'collections-all-390.png'),
      ])
    })

    it('hovers the first visible element a selector matches with --hover, for a capture of the viewport around it', () => {
      expect(parseArguments(['http://127.0.0.1:9292/', 'card-hover.png', '--hover', '.product-card'])).toMatchObject({ hover: '.product-card', partHeight: undefined })
    })

    it('splits into parts twice the viewport tall with --parts, or --part-height tall', () => {
      expect(parseArguments(['http://127.0.0.1:9292/', 'home.png', '--parts'])).toMatchObject({ partHeight: 1800 })
      expect(parseArguments(['http://127.0.0.1:9292/', 'home.png', '--parts', '--mobile'])).toMatchObject({ partHeight: 1688 })
      expect(parseArguments(['http://127.0.0.1:9292/', 'home.png', '--part-height', '1200'])).toMatchObject({ partHeight: 1200 })
    })

    it('emulates a 390 by 844 phone with --mobile', () => {
      expect(parseArguments(['http://127.0.0.1:9292/', 'home-390.png', '--mobile'])).toMatchObject({ width: 390, height: 844, mobile: true })
      expect(parseArguments(['http://127.0.0.1:9292/', 'home.png', '--width', '390'])).toMatchObject({ width: 390, mobile: false })
    })

    it.each([
      ['no output file', ['http://127.0.0.1:9292/']],
      ['a URL that is not http', ['127.0.0.1:9292', 'home.png']],
      ['a width that is not a number', ['http://127.0.0.1:9292/', 'home.png', '--width', 'wide']],
      ['an unknown option', ['http://127.0.0.1:9292/', 'home.png', '--full']],
      ['a part height that is not a number', ['http://127.0.0.1:9292/', 'home.png', '--part-height', 'tall']],
      ['a part height of zero', ['http://127.0.0.1:9292/', 'home.png', '--part-height', '0']],
      ['an empty hover selector', ['http://127.0.0.1:9292/', 'home.png', '--hover', '']],
      ['a hover with parts, as a hover capture is one viewport', ['http://127.0.0.1:9292/', 'home.png', '--hover', '.button', '--parts']],
      ['--pages with no page', ['http://127.0.0.1:9292/', 'shots', '--pages']],
      ['--pages with a page that is not a path', ['http://127.0.0.1:9292/', 'shots', '--pages', 'products/oil']],
      ['--pages with --hover, as a hover capture is one page', ['http://127.0.0.1:9292/', 'shots', '--pages', '/', '--hover', '.button']],
    ])('rejects %s with the usage', (_, args) => {
      expect(() => parseArguments(args)).toThrow(/Usage: node screenshot\.mjs <url> <out\.png>/)
    })
  })

  describe('parts', () => {
    it('covers the page top to bottom in consecutive parts, the last one shorter', () => {
      expect(partClips(4000, 1800, 'home-1440.png')).toEqual([
        { out: 'home-1440-1.png', y: 0, height: 1800 },
        { out: 'home-1440-2.png', y: 1800, height: 1800 },
        { out: 'home-1440-3.png', y: 3600, height: 400 },
      ])
    })

    it('makes one part of a page shorter than a part, and no empty last part', () => {
      expect(partClips(900, 1800, 'shots/home.png')).toEqual([{ out: 'shots/home-1.png', y: 0, height: 900 }])
      expect(partClips(3600, 1800, 'home.png').map(({ height }) => height)).toEqual([1800, 1800])
    })
  })

  describe('consent banner', () => {
    it("accepts every kind of tracking and removes Shopify's consent banner", () => {
      const setTrackingConsent = vi.fn()
      const banner = { remove: vi.fn() }
      const querySelectorAll = vi.fn(() => [banner])
      runInNewContext(dismissConsent, { window: { Shopify: { customerPrivacy: { setTrackingConsent } } }, document: { querySelectorAll } })
      expect(setTrackingConsent).toHaveBeenCalledWith({ analytics: true, marketing: true, preferences: true, sale_of_data: true }, expect.any(Function))
      expect(querySelectorAll).toHaveBeenCalledWith('[id^="shopify-pc"]')
      expect(banner.remove).toHaveBeenCalled()
    })

    it('does nothing on a store without the banner', () => {
      expect(() => runInNewContext(dismissConsent, { window: {}, document: { querySelectorAll: () => [] } })).not.toThrow()
      expect(() => runInNewContext(dismissConsent, { window: { Shopify: {} }, document: { querySelectorAll: () => [] } })).not.toThrow()
    })
  })

  describe('Chrome lookup', () => {
    const mac = {
      chrome: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      edge: '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    }
    const on = (platform: NodeJS.Platform, installed: string[], env: NodeJS.ProcessEnv = {}) => findChrome({ platform, env, exists: (file) => installed.includes(file) })

    it('prefers Google Chrome, then Chromium or Edge, on macOS', () => {
      expect(on('darwin', [mac.edge, mac.chrome])).toBe(mac.chrome)
      expect(on('darwin', [mac.edge])).toBe(mac.edge)
    })

    it('searches the PATH on Linux', () => {
      expect(on('linux', ['/snap/bin/chromium'], { PATH: '/usr/local/bin:/snap/bin' })).toBe('/snap/bin/chromium')
      expect(on('linux', ['/usr/bin/google-chrome-stable', '/usr/bin/chromium'], { PATH: '/usr/bin' })).toBe('/usr/bin/google-chrome-stable')
    })

    it('looks under Program Files on Windows', () => {
      const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
      expect(on('win32', [edge], { PROGRAMFILES: 'C:\\Program Files', 'PROGRAMFILES(X86)': 'C:\\Program Files (x86)' })).toBe(edge)
    })

    it('takes CHROME_PATH first, and only it when it is set', () => {
      expect(on('darwin', ['/opt/chrome', mac.chrome], { CHROME_PATH: '/opt/chrome' })).toBe('/opt/chrome')
      expect(on('darwin', [mac.chrome], { CHROME_PATH: '/opt/chrome' })).toBeUndefined()
    })

    it('finds none when no browser is installed', () => {
      expect(on('darwin', [])).toBeUndefined()
      expect(on('linux', [], { PATH: '/usr/bin' })).toBeUndefined()
    })

    it('exits with a clear message when no Chrome is found', () => {
      const run = spawnSync(process.execPath, [command, 'http://127.0.0.1:9/', path.join(tmpdir(), 'none.png')], {
        encoding: 'utf8',
        env: { ...process.env, CHROME_PATH: path.join(tmpdir(), 'no-such-chrome') },
      })
      expect(run.status).toBe(1)
      expect(run.stderr).toMatch(/No Google Chrome, Chromium or Microsoft Edge found/)
    })

    it('runs through a symlinked copy of the skill, as npx skills add installs it', () => {
      const dir = mkdtempSync(path.join(tmpdir(), 'skill-link-'))
      symlinkSync(path.dirname(path.dirname(command)), path.join(dir, 'shopify-theme-builder'))
      const run = spawnSync(process.execPath, [path.join(dir, 'shopify-theme-builder/scripts/screenshot.mjs'), 'http://127.0.0.1:9/', path.join(tmpdir(), 'none.png')], {
        encoding: 'utf8',
        env: { ...process.env, CHROME_PATH: path.join(tmpdir(), 'no-such-chrome') },
      })
      rmSync(dir, { recursive: true, force: true })
      expect(run.status).toBe(1)
      expect(run.stderr).toMatch(/No Google Chrome, Chromium or Microsoft Edge found/)
    })
  })
})
