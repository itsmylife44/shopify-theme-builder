import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { controls, findings, parseArguments } from '../skills/shopify-theme-builder/scripts/check-a11y.mjs'

// The check itself needs a browser, so it stays out of CI: only the arguments, the findings and the controls it presses are tested.
const skillDir = fileURLToPath(new URL('../skills/shopify-theme-builder/', import.meta.url))
const command = path.join(skillDir, 'scripts/check-a11y.mjs')

describe('accessibility check (review.md step 2)', () => {
  describe('arguments', () => {
    it('checks a desktop page at 1440 by default, and a 390 by 844 phone with --mobile', () => {
      expect(parseArguments(['http://127.0.0.1:9292/'])).toEqual({ url: 'http://127.0.0.1:9292/', width: 1440, height: 900, mobile: false })
      expect(parseArguments(['http://127.0.0.1:9292/', '--mobile'])).toEqual({ url: 'http://127.0.0.1:9292/', width: 390, height: 844, mobile: true })
    })

    it.each([
      ['no URL', []],
      ['a URL that is not http', ['127.0.0.1:9292']],
      ['an output file, as it writes none', ['http://127.0.0.1:9292/', 'home.png']],
      ['an unknown option', ['http://127.0.0.1:9292/', '--parts']],
    ])('rejects %s with the usage', (_, args) => {
      expect(() => parseArguments(args)).toThrow(/Usage: node check-a11y\.mjs <url>/)
    })
  })

  describe('findings', () => {
    it('reports each axe violation with its impact and the elements, five at most', () => {
      const targets = ['.a', '.b', '.c', '.d', '.e', '.f', '.g']
      expect(
        findings(
          [
            { id: 'color-contrast', impact: 'serious', help: 'Elements must meet minimum color contrast ratio thresholds', targets },
            { id: 'image-alt', impact: 'critical', help: 'Images must have alternative text', targets: ['.hero img'] },
          ],
          [],
        ),
      ).toEqual([
        'axe color-contrast (serious): Elements must meet minimum color contrast ratio thresholds: .a, .b, .c, .d, .e and 2 more',
        'axe image-alt (critical): Images must have alternative text: .hero img',
      ])
    })

    it('reports each step of the Tab, Enter and Escape pass that failed', () => {
      expect(
        findings(
          [],
          [
            { name: 'menu drawer', selector: '.header__menu-button', found: true, reached: true, opened: true, focusIn: false, focusKept: true, closed: true, focusBack: false },
            { name: 'cart drawer', selector: 'cart-drawer .header__cart', found: true, reached: true, opened: false },
            { name: 'quick add', selector: '[data-quick-add]', found: true, reached: false },
          ],
        ),
      ).toEqual([
        "keyboard menu drawer: focus doesn't move into the dialog when it opens",
        "keyboard menu drawer: focus doesn't return to .header__menu-button when the dialog closes",
        'keyboard cart drawer: Enter on cart-drawer .header__cart opens no dialog',
        'keyboard quick add: Tab never reaches [data-quick-add]',
      ])
    })

    it('reports focus leaving an open dialog and a dialog that Escape leaves open', () => {
      expect(
        findings([], [{ name: 'quick add', selector: '[data-quick-add]', found: true, reached: true, opened: true, focusIn: true, focusKept: false, closed: false }]),
      ).toEqual(['keyboard quick add: Tab moves focus out of the open dialog', "keyboard quick add: Escape doesn't close the dialog"])
    })

    it('finds nothing in a clean pass, or for a control the page does not have', () => {
      expect(
        findings(
          [],
          [
            { name: 'menu drawer', selector: '.header__menu-button', found: true, reached: true, opened: true, focusIn: true, focusKept: true, closed: true, focusBack: true },
            { name: 'quick add', selector: '[data-quick-add]', found: false },
          ],
        ),
      ).toEqual([])
    })
  })

  it('presses the menu drawer, cart drawer and quick add the catalog renders', () => {
    expect(controls).toEqual([
      { name: 'menu drawer', selector: '.header__menu-button' },
      { name: 'cart drawer', selector: 'cart-drawer .header__cart' },
      { name: 'quick add', selector: '[data-quick-add]' },
    ])
    const header = readFileSync(path.join(skillDir, 'catalog/sections/header.liquid'), 'utf8')
    const card = readFileSync(path.join(skillDir, 'base-theme/snippets/product-card.liquid'), 'utf8')
    expect(header).toMatch(/class="header__menu-button"[^>]*aria-haspopup="dialog"/)
    expect(header).toMatch(/<cart-drawer[\s\S]*{{ cart_link }}[\s\S]*<\/cart-drawer>/)
    expect(header).toContain('<a class="header__cart"')
    expect(card).toMatch(/aria-haspopup="dialog"[^>]*data-quick-add\b/)
  })

  it('exits with a clear message when no Chrome is found', () => {
    const run = spawnSync(process.execPath, [command, 'http://127.0.0.1:9/'], {
      encoding: 'utf8',
      env: { ...process.env, CHROME_PATH: path.join(tmpdir(), 'no-such-chrome') },
    })
    expect(run.status).toBe(1)
    expect(run.stderr).toMatch(/No Google Chrome, Chromium or Microsoft Edge found/)
  })
})
