#!/usr/bin/env node
// Checks a page of the preview for accessibility, for the review (references/design/review.md), and prints one line
// per finding. Exits 1 when there is any. Usage:
//   node <skill-dir>/scripts/check-a11y.mjs <url> [--mobile]
// It runs axe-core's WCAG 2.2 A and AA rules on the page, then a keyboard pass through the menu drawer, the cart
// drawer and quick add: Tab until the control has focus, Enter opens its dialog with focus inside, Tab keeps focus
// there, Escape closes it and focus returns to the control. A control whose dialog doesn't open is tried once more, on
// the page opened again, and reported only when it fails both times. Both run without Shopify's cookie consent banner,
// which an EU store shows over the page; when the page shows it, axe also runs once with it first, as a first-time
// visitor meets it. It drives the browser like screenshot.mjs and stops within 90 seconds.
import { readFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { dismissConsent, findChromeOrExit, sleep, withPage } from './screenshot.mjs'

/** @typedef {{ url: string, width: number, height: number, mobile: boolean }} Options */
/** @typedef {{ id: string, impact: string, help: string, targets: string[] }} Violation */
/**
 * What the keyboard pass saw on one control. A step is left out once an earlier one makes it impossible. `retried` when
 * its dialog didn't open on the first try, so what it holds is the second try.
 * @typedef {{ name: string, selector: string, found: boolean, reached?: boolean, opened?: boolean, focusIn?: boolean, focusKept?: boolean, closed?: boolean, focusBack?: boolean, retried?: boolean }} Pass
 */

const usage = `Usage: node check-a11y.mjs <url> [--mobile]
  <url>     a page of the preview, like http://127.0.0.1:9292/products/<handle>
  --mobile  emulate a 390 by 844 phone with touch, instead of a 1440 by 900 desktop`

/**
 * The controls the keyboard pass opens and closes, each the first visible match of its selector, and the custom element
 * that makes it open its dialog: until that element is defined, Enter just follows the control's link.
 */
export const controls = [
  { name: 'menu drawer', selector: '.header__menu-button', element: 'header-menu' },
  { name: 'cart drawer', selector: 'cart-drawer .header__cart', element: 'cart-drawer' },
  { name: 'quick add', selector: '[data-quick-add]', element: 'quick-add-dialog' },
]

/**
 * The page as the keyboard pass drives it: `evaluate` runs an expression in it and gives back its value, `reload` opens
 * the checked page again.
 * @typedef {{ evaluate: (expression: string) => Promise<any>, press: (key: 'Tab' | 'Enter' | 'Escape') => Promise<void>, sleep: (ms: number) => Promise<void>, reload: () => Promise<void> }} Driver
 */

/**
 * The Tab, Enter and Escape pass on one control of the page. When its dialog doesn't open, the page is opened again and
 * the pass tried once more, so a slow fetch or a drawer not yet defined isn't reported; one that fails twice is (#231).
 * @param {Driver} driver
 * @param {{ name: string, selector: string, element: string }} control
 * @returns {Promise<Pass>}
 */
export async function keyboardPass(driver, control) {
  const first = await tryControl(driver, control)
  if (first.opened !== false) return first
  // Enter may have followed the link to another page, or left a fetch that opens the dialog later.
  await driver.reload()
  const second = await tryControl(driver, control)
  // The next control is checked on the same page, not the one this control's link led to.
  if (second.opened === false) await driver.reload()
  return { ...second, retried: true }
}

/**
 * One try of the pass on one control.
 * @param {Driver} driver
 * @param {{ name: string, selector: string, element: string }} control
 * @returns {Promise<Pass>}
 */
async function tryControl({ evaluate, press, sleep }, { name, selector, element }) {
  /** @type {Pass} */
  const pass = { name, selector, found: await evaluate(`[...document.querySelectorAll(${JSON.stringify(selector)})].some((match) => match.checkVisibility())`) }
  if (!pass.found) return pass
  // Enter before the element is defined follows the control's link instead of opening its dialog (#231).
  await evaluate(`Promise.race([customElements.whenDefined(${JSON.stringify(element)}), new Promise((resolve) => setTimeout(resolve, 5000))])`)
  // Start Tab from the top of the page, as a visitor would.
  await evaluate(`document.activeElement?.blur(); document.body.tabIndex = -1; document.body.focus(); document.body.removeAttribute('tabindex')`)
  pass.reached = false
  for (let tab = 0; tab < 500 && !pass.reached; tab++) {
    await press('Tab')
    pass.reached = await evaluate(`document.activeElement?.matches(${JSON.stringify(selector)}) ?? false`)
  }
  if (!pass.reached) return pass
  await press('Enter')
  // The cart drawer and quick add fetch their content first.
  pass.opened = false
  for (let wait = 0; wait < 25 && !pass.opened; wait++) {
    await sleep(200)
    // Throws while Enter takes the page to the control's link.
    pass.opened = await evaluate(`document.querySelector('dialog[open]') !== null`).catch(() => false)
  }
  if (!pass.opened) return pass
  await sleep(300)
  pass.focusIn = await evaluate(`(document.querySelector('dialog[open]')?.contains(document.activeElement) ?? false)`)
  pass.focusKept = true
  for (let tab = 0; tab < 10 && pass.focusKept; tab++) {
    await press('Tab')
    // Past the dialog's last control focus may leave for the browser's own controls (the body), then comes back.
    pass.focusKept = await evaluate(`[document.body, null].includes(document.activeElement) || (document.querySelector('dialog[open]')?.contains(document.activeElement) ?? false)`)
  }
  await press('Escape')
  await sleep(300)
  pass.closed = await evaluate(`document.querySelector('dialog[open]') === null`)
  if (pass.closed) pass.focusBack = await evaluate(`document.activeElement?.matches(${JSON.stringify(selector)}) ?? false`)
  else await evaluate(`document.querySelectorAll('dialog[open]').forEach((dialog) => dialog.close())`)
  return pass
}

/**
 * The check the command line asks for.
 * @param {string[]} args
 * @returns {Options}
 */
export function parseArguments(args) {
  let parsed
  try {
    parsed = parseArgs({ args, allowPositionals: true, options: { mobile: { type: 'boolean', default: false } } })
  } catch (error) {
    throw new Error(`${/** @type {Error} */ (error).message}\n${usage}`)
  }
  const { values, positionals } = parsed
  const [url] = positionals
  const mobile = values.mobile ?? false
  if (positionals.length !== 1 || !/^https?:\/\//.test(url)) throw new Error(usage)
  return mobile ? { url, width: 390, height: 844, mobile } : { url, width: 1440, height: 900, mobile }
}

/**
 * One line per axe violation and per failed step of the keyboard pass, then one per violation axe found only with
 * Shopify's consent banner open (`bannerViolations`), on the elements it didn't already report without it.
 * @param {Violation[]} violations
 * @param {Pass[]} passes
 * @param {Violation[]} [bannerViolations]
 * @returns {string[]}
 */
export function findings(violations, passes, bannerViolations = []) {
  /** @param {Violation} violation @param {string} [context] */
  const line = ({ id, impact, help, targets }, context = '') => {
    const shown = targets.slice(0, 5).join(', ')
    return `axe ${id} (${impact})${context}: ${help}: ${targets.length > 5 ? `${shown} and ${targets.length - 5} more` : shown}`
  }
  const lines = violations.map((violation) => line(violation))
  for (const pass of passes) {
    /** @type {[boolean | undefined, string][]} */
    const steps = [
      [pass.reached, `Tab never reaches ${pass.selector}`],
      [pass.opened, `Enter on ${pass.selector} opens no dialog`],
      [pass.focusIn, "focus doesn't move into the dialog when it opens"],
      [pass.focusKept, 'Tab moves focus out of the open dialog'],
      [pass.closed, "Escape doesn't close the dialog"],
      [pass.focusBack, `focus doesn't return to ${pass.selector} when the dialog closes`],
    ]
    for (const [ok, message] of steps) if (ok === false) lines.push(`keyboard ${pass.name}: ${message}`)
  }
  const reported = new Set(violations.flatMap(({ id, targets }) => targets.map((target) => `${id} ${target}`)))
  for (const violation of bannerViolations) {
    const targets = violation.targets.filter((target) => !reported.has(`${violation.id} ${target}`))
    if (targets.length > 0) lines.push(line({ ...violation, targets }, ' with the consent banner'))
  }
  return lines
}

/**
 * The keyboard pass's summary line: the controls it checked, those the page doesn't have at `width`, and those whose
 * dialog opened only on the second try, which a failure on both tries reports instead.
 * @param {Pass[]} passes
 * @param {number} width
 * @returns {string}
 */
export function keyboardSummary(passes, width) {
  const names = (/** @type {(pass: Pass) => boolean} */ keep) => passes.filter(keep).map((pass) => pass.name).join(', ')
  const checked = names((pass) => pass.found)
  const missing = names((pass) => !pass.found)
  const retried = names((pass) => pass.retried === true && pass.opened === true)
  return `Keyboard pass: ${checked || 'no control'} checked${missing ? `; not on this page at ${width}px: ${missing}` : ''}${retried ? `; opened its dialog only on the second try: ${retried}` : ''}`
}

/**
 * Runs axe and the keyboard pass on the page with the browser at `chrome`, without Shopify's consent banner, and axe
 * once more with it first when the page shows it.
 * @param {string} chrome
 * @param {Options} options
 * @returns {Promise<{ violations: Violation[], passes: Pass[], banner: boolean, bannerViolations: Violation[] }>}
 */
function check(chrome, options) {
  const axe = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8')
  return withPage(
    chrome,
    { ...options, keepConsent: true },
    async (page, open) => {
      /** @param {string} expression */
      const evaluate = async (expression) => (await page.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.value
      /** @param {'Tab' | 'Enter' | 'Escape'} key */
      const press = async (key) => {
        const common = { key, code: key, windowsVirtualKeyCode: { Tab: 9, Enter: 13, Escape: 27 }[key] }
        await page.send('Input.dispatchKeyEvent', key === 'Enter' ? { type: 'keyDown', text: '\r', ...common } : { type: 'rawKeyDown', ...common })
        await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...common })
      }
      // Evaluated as a script, so the page's CSP doesn't apply; it sets window.axe even where the page defines AMD's define.
      await page.send('Runtime.evaluate', { expression: axe })
      /** @returns {Promise<Violation[]>} */
      const audit = () =>
        evaluate(`axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })
        .then(({ violations }) => violations.map(({ id, impact, help, nodes }) => ({ id, impact, help, targets: nodes.map((node) => node.target.join(' ')) })))`)
      // The banner is what a first-time visitor meets, so axe audits it once; then it goes, or the Tab pass would stop in it.
      /** @type {boolean} */
      const banner = await evaluate(`document.querySelector('[id^="shopify-pc"]') !== null`)
      const bannerViolations = banner ? await audit() : []
      await evaluate(dismissConsent)
      const violations = await audit()

      /** @type {Pass[]} */
      const passes = []
      const reload = async () => {
        await open(options.url)
        await evaluate(dismissConsent)
      }
      for (const control of controls) passes.push(await keyboardPass({ evaluate, press, sleep, reload }, control))
      return { violations, passes, banner, bannerViolations }
    },
    75,
  )
}

// Real paths on both sides: npx skills add installs the skill as a symlink, and import.meta.url is the real path.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  /** @type {Options} */
  let options
  try {
    options = parseArguments(process.argv.slice(2))
  } catch (error) {
    console.error(/** @type {Error} */ (error).message)
    process.exit(2)
  }
  const chrome = findChromeOrExit()
  // The last resort, should cleaning up after the check's own 75-second deadline hang too.
  setTimeout(() => {
    console.error(`No accessibility check of ${options.url} within 90 seconds.`)
    process.exit(1)
  }, 88_000).unref()
  try {
    const { violations, passes, banner, bannerViolations } = await check(chrome, options)
    const lines = findings(violations, passes, bannerViolations)
    for (const line of lines) console.log(line)
    console.log(keyboardSummary(passes, options.width))
    console.log(banner ? "Shopify's cookie consent banner: axe ran once with it, then without it" : "Shopify's cookie consent banner: not on this page")
    console.log(`Accessibility check of ${options.url} at ${options.width}px${options.mobile ? ', mobile' : ''}: ${lines.length} finding${lines.length === 1 ? '' : 's'}`)
    process.exit(lines.length > 0 ? 1 : 0)
  } catch (error) {
    console.error(/** @type {Error} */ (error).message)
    process.exit(1)
  }
}
