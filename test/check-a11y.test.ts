import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { controls, findings, keyboardPass, keyboardSummary, parseArguments } from '../skills/shopify-theme-builder/scripts/check-a11y.mjs'

// The check itself needs a browser, so it stays out of CI: the arguments, the findings, the controls it presses and the
// keyboard pass on a fake page are tested.
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

    it("reports what axe finds only with Shopify's consent banner open, once", () => {
      expect(
        findings(
          [{ id: 'color-contrast', impact: 'serious', help: 'Elements must have sufficient color contrast', targets: ['.hero h1'] }],
          [],
          [
            { id: 'color-contrast', impact: 'serious', help: 'Elements must have sufficient color contrast', targets: ['.hero h1', '#shopify-pc__banner button'] },
            { id: 'region', impact: 'moderate', help: 'All page content should be contained by landmarks', targets: ['#shopify-pc__banner'] },
            { id: 'image-alt', impact: 'critical', help: 'Images must have alternative text', targets: [] },
          ],
        ),
      ).toEqual([
        'axe color-contrast (serious): Elements must have sufficient color contrast: .hero h1',
        'axe color-contrast (serious) with the consent banner: Elements must have sufficient color contrast: #shopify-pc__banner button',
        'axe region (moderate) with the consent banner: All page content should be contained by landmarks: #shopify-pc__banner',
      ])
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

  describe('keyboard pass', () => {
    /**
     * A page whose control opens its dialog `pollsToOpen` checks after Enter, on the attempts in `opensOn` (1 is the
     * first, 2 the retry). It logs the keys pressed, the reloads and the custom elements awaited.
     */
    function fakePage({ opensOn = [1], pollsToOpen = 1 }: { opensOn?: number[]; pollsToOpen?: number } = {}) {
      const log: string[] = []
      let attempt = 0
      let open = false
      let polls = 0
      return {
        log,
        sleep: async () => {
          if (polls > 0 && --polls === 0) open = true
        },
        press: async (key: string) => {
          log.push(key)
          if (key === 'Enter' && opensOn.includes(++attempt)) polls = pollsToOpen
          if (key === 'Escape') open = false
        },
        reload: async () => {
          log.push('reload')
          open = false
          polls = 0
        },
        evaluate: async (expression: string) => {
          const awaited = /whenDefined\("([^"]+)"\)/.exec(expression)
          if (awaited) {
            log.push(`whenDefined ${awaited[1]}`)
            return true
          }
          if (expression.includes('checkVisibility')) return true
          if (expression.includes("dialog[open]') !== null")) return open
          if (expression.includes("dialog[open]') === null")) return !open
          if (expression.includes('dialog[open]') || expression.includes('activeElement?.matches')) return true
          return undefined
        },
      }
    }

    const cart = { name: 'cart drawer', selector: 'cart-drawer .header__cart', element: 'cart-drawer' }

    it('waits for the control\'s custom element before pressing Enter', async () => {
      const page = fakePage()
      await keyboardPass(page, cart)
      expect(page.log.indexOf('whenDefined cart-drawer')).toBeGreaterThanOrEqual(0)
      expect(page.log.indexOf('whenDefined cart-drawer')).toBeLessThan(page.log.indexOf('Enter'))
    })

    it('waits a few seconds for a drawer that fetches its content before it opens', async () => {
      const pass = await keyboardPass(fakePage({ pollsToOpen: 20 }), cart)
      expect(pass).toMatchObject({ opened: true, focusBack: true })
      expect(pass.retried).toBeUndefined()
    })

    it("reloads the page and tries once more when the dialog doesn't open, and says so when it then does", async () => {
      const page = fakePage({ opensOn: [2] })
      const pass = await keyboardPass(page, cart)
      expect(page.log.filter((entry) => entry === 'Enter' || entry === 'reload')).toEqual(['Enter', 'reload', 'Enter'])
      expect(pass).toMatchObject({ opened: true, closed: true, focusBack: true, retried: true })
      expect(findings([], [pass])).toEqual([])
    })

    it('says on the summary line which control opened only on the second try, and which the page does not have', () => {
      const clean = { found: true, reached: true, opened: true, focusIn: true, focusKept: true, closed: true, focusBack: true }
      expect(
        keyboardSummary(
          [
            { name: 'menu drawer', selector: '.header__menu-button', ...clean },
            { name: 'cart drawer', selector: 'cart-drawer .header__cart', ...clean, retried: true },
            { name: 'quick add', selector: '[data-quick-add]', found: false },
          ],
          1440,
        ),
      ).toBe('Keyboard pass: menu drawer, cart drawer checked; not on this page at 1440px: quick add; opened its dialog only on the second try: cart drawer')
      expect(keyboardSummary([{ name: 'cart drawer', selector: 'cart-drawer .header__cart', found: true, reached: true, opened: false, retried: true }], 390)).toBe(
        'Keyboard pass: cart drawer checked',
      )
    })

    it('still reports a drawer that opens on neither try', async () => {
      const page = fakePage({ opensOn: [] })
      const pass = await keyboardPass(page, cart)
      // Opened again after the second try too, so the next control is checked on this page, not on /cart.
      expect(page.log.filter((entry) => entry === 'Enter' || entry === 'reload')).toEqual(['Enter', 'reload', 'Enter', 'reload'])
      expect(findings([], [pass])).toEqual(['keyboard cart drawer: Enter on cart-drawer .header__cart opens no dialog'])
    })
  })

  it('presses the menu drawer, cart drawer and quick add the catalog renders, once their elements are defined', () => {
    expect(controls).toEqual([
      { name: 'menu drawer', selector: '.header__menu-button', element: 'header-menu' },
      { name: 'cart drawer', selector: 'cart-drawer .header__cart', element: 'cart-drawer' },
      { name: 'quick add', selector: '[data-quick-add]', element: 'quick-add-dialog' },
    ])
    const header = readFileSync(path.join(skillDir, 'catalog/sections/header.liquid'), 'utf8')
    const card = readFileSync(path.join(skillDir, 'base-theme/snippets/product-card.liquid'), 'utf8')
    expect(header).toMatch(/class="header__menu-button"[^>]*aria-haspopup="dialog"/)
    expect(header).toMatch(/<cart-drawer[\s\S]*{{ cart_link }}[\s\S]*<\/cart-drawer>/)
    expect(header).toContain('<a class="header__cart"')
    expect(card).toMatch(/aria-haspopup="dialog"[^>]*data-quick-add\b/)
    for (const { element } of controls) expect(header).toContain(`customElements.define('${element}'`)
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
