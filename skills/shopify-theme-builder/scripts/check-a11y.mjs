#!/usr/bin/env node
// Checks a page of the preview for accessibility, for the review (references/design/review.md), and prints one line
// per finding. Exits 1 when there is any. Usage:
//   node <skill-dir>/scripts/check-a11y.mjs <url> [--mobile]
// It runs axe-core's WCAG 2.2 A and AA rules on the page, then a keyboard pass through the menu drawer, the cart
// drawer and quick add: Tab until the control has focus, Enter opens its dialog with focus inside, Tab keeps focus
// there, Escape closes it and focus returns to the control. It drives the browser like screenshot.mjs and stops
// within 90 seconds.
import { readFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { findChromeOrExit, sleep, withPage } from './screenshot.mjs'

/** @typedef {{ url: string, width: number, height: number, mobile: boolean }} Options */
/** @typedef {{ id: string, impact: string, help: string, targets: string[] }} Violation */
/**
 * What the keyboard pass saw on one control. A step is left out once an earlier one makes it impossible.
 * @typedef {{ name: string, selector: string, found: boolean, reached?: boolean, opened?: boolean, focusIn?: boolean, focusKept?: boolean, closed?: boolean, focusBack?: boolean }} Pass
 */

const usage = `Usage: node check-a11y.mjs <url> [--mobile]
  <url>     a page of the preview, like http://127.0.0.1:9292/products/<handle>
  --mobile  emulate a 390 by 844 phone with touch, instead of a 1440 by 900 desktop`

/** The controls the keyboard pass opens and closes, each the first visible match of its selector. */
export const controls = [
  { name: 'menu drawer', selector: '.header__menu-button' },
  { name: 'cart drawer', selector: 'cart-drawer .header__cart' },
  { name: 'quick add', selector: '[data-quick-add]' },
]

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
 * One line per axe violation and per failed step of the keyboard pass.
 * @param {Violation[]} violations
 * @param {Pass[]} passes
 * @returns {string[]}
 */
export function findings(violations, passes) {
  const lines = violations.map(({ id, impact, help, targets }) => {
    const shown = targets.slice(0, 5).join(', ')
    return `axe ${id} (${impact}): ${help}: ${targets.length > 5 ? `${shown} and ${targets.length - 5} more` : shown}`
  })
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
  return lines
}

/**
 * Runs axe and the keyboard pass on the page with the browser at `chrome`.
 * @param {string} chrome
 * @param {Options} options
 * @returns {Promise<{ violations: Violation[], passes: Pass[] }>}
 */
function check(chrome, options) {
  const axe = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8')
  return withPage(
    chrome,
    options,
    async (page) => {
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
      /** @type {Violation[]} */
      const violations = await evaluate(`axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })
        .then(({ violations }) => violations.map(({ id, impact, help, nodes }) => ({ id, impact, help, targets: nodes.map((node) => node.target.join(' ')) })))`)

      /** @type {Pass[]} */
      const passes = []
      for (const { name, selector } of controls) {
        /** @type {Pass} */
        const pass = { name, selector, found: await evaluate(`[...document.querySelectorAll(${JSON.stringify(selector)})].some((match) => match.checkVisibility())`) }
        passes.push(pass)
        if (!pass.found) continue
        // Start Tab from the top of the page, as a visitor would.
        await evaluate(`document.activeElement?.blur(); document.body.tabIndex = -1; document.body.focus(); document.body.removeAttribute('tabindex')`)
        pass.reached = false
        for (let tab = 0; tab < 500 && !pass.reached; tab++) {
          await press('Tab')
          pass.reached = await evaluate(`document.activeElement?.matches(${JSON.stringify(selector)}) ?? false`)
        }
        if (!pass.reached) continue
        await press('Enter')
        // The cart drawer and quick add fetch their content first.
        pass.opened = false
        for (let wait = 0; wait < 25 && !pass.opened; wait++) {
          await sleep(200)
          pass.opened = await evaluate(`document.querySelector('dialog[open]') !== null`)
        }
        if (!pass.opened) continue
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
      }
      return { violations, passes }
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
    const { violations, passes } = await check(chrome, options)
    const lines = findings(violations, passes)
    for (const line of lines) console.log(line)
    const missing = passes.filter((pass) => !pass.found).map((pass) => pass.name)
    const checked = passes.filter((pass) => pass.found).map((pass) => pass.name)
    console.log(`Keyboard pass: ${checked.join(', ') || 'no control'} checked${missing.length ? `; not on this page at ${options.width}px: ${missing.join(', ')}` : ''}`)
    console.log(`Accessibility check of ${options.url} at ${options.width}px${options.mobile ? ', mobile' : ''}: ${lines.length} finding${lines.length === 1 ? '' : 's'}`)
    process.exit(lines.length > 0 ? 1 : 0)
  } catch (error) {
    console.error(/** @type {Error} */ (error).message)
    process.exit(1)
  }
}
