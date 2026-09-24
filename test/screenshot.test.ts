import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { findChrome, parseArguments } from '../skills/shopify-theme-builder/scripts/screenshot.mjs'

// The capture itself needs a browser, so it stays out of CI: only the arguments and the Chrome lookup are tested.
const command = fileURLToPath(new URL('../skills/shopify-theme-builder/scripts/screenshot.mjs', import.meta.url))

describe('screenshot script (review.md step 2)', () => {
  describe('arguments', () => {
    it('captures a desktop page at 1440 by default', () => {
      expect(parseArguments(['http://127.0.0.1:9292/', 'home-1440.png'])).toEqual({
        url: 'http://127.0.0.1:9292/',
        out: 'home-1440.png',
        width: 1440,
        height: 900,
        mobile: false,
      })
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
    ])('rejects %s with the usage', (_, args) => {
      expect(() => parseArguments(args)).toThrow(/Usage: node screenshot\.mjs <url> <out\.png>/)
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
  })
})
