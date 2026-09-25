#!/usr/bin/env node
// Takes a full-page screenshot of a page of the preview, for the review (references/design/review.md). Usage:
//   node <skill-dir>/scripts/screenshot.mjs <url> <out.png> [--width 1440] [--mobile] [--parts | --part-height <px> | --hover <selector>]
// It drives the system's Google Chrome (or Chromium, or Microsoft Edge; CHROME_PATH names another) headless over the
// DevTools Protocol, with reduced motion so reveal.js hides no section, waits a fixed few seconds rather than for the
// network (theme dev's hot reload never goes idle), prints the page's scrollWidth, and stops within 60 seconds.
// With --parts it also writes the page in parts, <out>-1.png, <out>-2.png, …, each small enough for a model to read.
// With --hover it moves the mouse over the first visible element the selector matches, and captures the viewport
// around it instead, to show its hover state.
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

/** @typedef {{ url: string, out: string, width: number, height: number, mobile: boolean, partHeight: number | undefined, hover: string | undefined }} Options */

const usage = `Usage: node screenshot.mjs <url> <out.png> [--width 1440] [--mobile] [--parts | --part-height <px> | --hover <selector>]
  <url>          a page of the preview, like http://127.0.0.1:9292/products/<handle>
  --width        the viewport's width in pixels (default 1440, 390 with --mobile)
  --mobile       emulate a 390 by 844 phone with touch
  --parts        also write the page top to bottom in parts, <out>-1.png, <out>-2.png, …, twice the viewport tall
  --part-height  the same, with parts this many pixels tall
  --hover        hover the first visible element this CSS selector matches, like .product-card or .button, and
                 capture the viewport around it instead of the full page`

/**
 * The capture the command line asks for.
 * @param {string[]} args
 * @returns {Options}
 */
export function parseArguments(args) {
  let parsed
  try {
    parsed = parseArgs({ args, allowPositionals: true, options: { width: { type: 'string' }, mobile: { type: 'boolean', default: false }, parts: { type: 'boolean', default: false }, 'part-height': { type: 'string' }, hover: { type: 'string' } } })
  } catch (error) {
    throw new Error(`${/** @type {Error} */ (error).message}\n${usage}`)
  }
  const { values, positionals } = parsed
  const [url, out] = positionals
  const mobile = values.mobile ?? false
  const width = Number(values.width ?? (mobile ? 390 : 1440))
  const height = mobile ? 844 : 900
  const partHeight = values['part-height'] !== undefined ? Number(values['part-height']) : values.parts ? 2 * height : undefined
  if (positionals.length !== 2 || !/^https?:\/\//.test(url) || !Number.isInteger(width) || width <= 0) throw new Error(usage)
  if (partHeight !== undefined && (!Number.isInteger(partHeight) || partHeight <= 0)) throw new Error(usage)
  const hover = values.hover
  if (hover !== undefined && (!hover.trim() || partHeight !== undefined)) throw new Error(usage)
  return { url, out, width, height, mobile, partHeight, hover }
}

/**
 * The parts that cover a page `pageHeight` pixels tall, top to bottom, each `partHeight` tall but the last, and the
 * file each goes to: `<out>-1.png`, `<out>-2.png`, ….
 * @param {number} pageHeight
 * @param {number} partHeight
 * @param {string} out
 * @returns {{ out: string, y: number, height: number }[]}
 */
export function partClips(pageHeight, partHeight, out) {
  const extension = path.extname(out)
  const stem = out.slice(0, out.length - extension.length)
  return Array.from({ length: Math.ceil(pageHeight / partHeight) }, (_, index) => {
    const y = index * partHeight
    return { out: `${stem}-${index + 1}${extension}`, y, height: Math.min(partHeight, pageHeight - y) }
  })
}

/**
 * The executable of the first browser installed: CHROME_PATH when it's set, else Google Chrome, Chromium or
 * Microsoft Edge, in their usual places.
 * @param {{ platform?: NodeJS.Platform, env?: NodeJS.ProcessEnv, exists?: (file: string) => boolean }} [system]
 * @returns {string | undefined}
 */
export function findChrome({ platform = process.platform, env = process.env, exists = existsSync } = {}) {
  if (env.CHROME_PATH) return exists(env.CHROME_PATH) ? env.CHROME_PATH : undefined
  return candidates(platform, env).find((file) => exists(file))
}

/**
 * The browser from findChrome, or exits 1 with what to install.
 * @returns {string}
 */
export function findChromeOrExit() {
  const chrome = findChrome()
  if (chrome) return chrome
  console.error(
    process.env.CHROME_PATH
      ? `No Google Chrome, Chromium or Microsoft Edge found at CHROME_PATH (${process.env.CHROME_PATH}).`
      : 'No Google Chrome, Chromium or Microsoft Edge found. Install Google Chrome, or set CHROME_PATH to its executable, and run this again.',
  )
  process.exit(1)
}

/**
 * @param {NodeJS.Platform} platform
 * @param {NodeJS.ProcessEnv} env
 */
function candidates(platform, env) {
  if (platform === 'darwin') return ['Google Chrome', 'Chromium', 'Microsoft Edge'].map((app) => `/Applications/${app}.app/Contents/MacOS/${app}`)
  if (platform === 'win32') {
    const dirs = [env.PROGRAMFILES, env['PROGRAMFILES(X86)'], env.LOCALAPPDATA].filter((dir) => dir !== undefined)
    return ['Google\\Chrome\\Application\\chrome.exe', 'Chromium\\Application\\chrome.exe', 'Microsoft\\Edge\\Application\\msedge.exe'].flatMap((exe) =>
      dirs.map((dir) => path.win32.join(dir, exe)),
    )
  }
  const dirs = (env.PATH ?? '').split(':').filter(Boolean)
  return ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge'].flatMap((name) => dirs.map((dir) => path.posix.join(dir, name)))
}

/**
 * Opens `url` in the browser at `chrome`, headless, in a viewport `width` by `height` (a touch phone when `mobile`), with
 * reduced motion so reveal.js hides no section, waits a fixed few seconds rather than for the network (theme dev's hot
 * reload never goes idle), loads lazy images, and hands the page's DevTools session to `run`. Chrome is killed after
 * `seconds` whatever hangs, and when `run` is done.
 * @template T
 * @param {string} chrome
 * @param {{ url: string, width: number, height: number, mobile: boolean }} viewport
 * @param {(page: { send: (method: string, params?: object) => Promise<any> }) => Promise<T>} run
 * @param {number} [seconds]
 * @returns {Promise<T>}
 */
export async function withPage(chrome, { url, width, height, mobile }, run, seconds = 45) {
  const profile = mkdtempSync(path.join(tmpdir(), 'screenshot-chrome-'))
  const browser = spawn(
    chrome,
    ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--mute-audio', 'about:blank'],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  )
  const exited = new Promise((resolve) => browser.once('exit', resolve))
  // Whatever hangs (the preview never answering, Chrome stuck), kill Chrome: every pending step then fails.
  let timedOut = false
  const deadline = setTimeout(() => {
    timedOut = true
    browser.kill('SIGKILL')
  }, seconds * 1000)
  try {
    const page = await connect(await pageSocket(browser))
    try {
      await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile })
      if (mobile) await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
      await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
      const { errorText } = await page.send('Page.navigate', { url })
      if (errorText) throw new Error(`Chrome couldn't open ${url}: ${errorText}`)
      await sleep(3000)
      // A screenshot doesn't scroll, so images loading lazily below the fold would stay blank.
      await page.send('Runtime.evaluate', { expression: `document.querySelectorAll('img[loading="lazy"]').forEach((img) => { img.loading = 'eager' })` })
      await sleep(2000)
      return await run(page)
    } finally {
      page.close()
    }
  } catch (error) {
    throw timedOut ? new Error(`Nothing from ${url} within ${seconds} seconds: is the preview running?`) : error
  } finally {
    clearTimeout(deadline)
    browser.kill()
    await Promise.race([exited, sleep(5000)])
    browser.kill('SIGKILL')
    rmSync(profile, { recursive: true, force: true })
  }
}

/**
 * Captures the page with the browser at `chrome` and writes the PNG to `out`.
 * @param {string} chrome
 * @param {Options} options
 * @returns {Promise<{ scrollWidth: number, parts: string[] }>}
 */
function capture(chrome, options) {
  const { url, out, width, partHeight, hover } = options
  return withPage(chrome, options, async (page) => {
    const { result } = await page.send('Runtime.evaluate', { expression: 'document.documentElement.scrollWidth', returnByValue: true })
    if (hover !== undefined) {
      const { result: center } = await page.send('Runtime.evaluate', {
        expression: `(() => {
          const element = [...document.querySelectorAll(${JSON.stringify(hover)})].find((match) => match.checkVisibility())
          if (!element) return null
          element.scrollIntoView({ block: 'center' })
          const box = element.getBoundingClientRect()
          return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
        })()`,
        returnByValue: true,
      })
      if (!center.value) throw new Error(`Nothing visible on ${url} matches ${hover}`)
      await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...center.value })
      await sleep(1000)
      const { data } = await page.send('Page.captureScreenshot', { format: 'png' })
      writeFileSync(out, Buffer.from(data, 'base64'))
      return { scrollWidth: result.value, parts: [] }
    }
    const { cssContentSize } = await page.send('Page.getLayoutMetrics')
    const pageHeight = Math.ceil(cssContentSize.height)
    /** @param {string} file @param {number} y @param {number} clipHeight */
    const shoot = async (file, y, clipHeight) => {
      const { data } = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y, width, height: clipHeight, scale: 1 } })
      writeFileSync(file, Buffer.from(data, 'base64'))
    }
    await shoot(out, 0, pageHeight)
    const parts = partHeight === undefined ? [] : partClips(pageHeight, partHeight, out)
    for (const part of parts) await shoot(part.out, part.y, part.height)
    return { scrollWidth: result.value, parts: parts.map((part) => part.out) }
  })
}

/**
 * The DevTools WebSocket of the browser's blank page, once Chrome prints where it listens.
 * @param {import('node:child_process').ChildProcessByStdio<null, null, import('node:stream').Readable>} browser
 * @returns {Promise<string>}
 */
async function pageSocket(browser) {
  const endpoint = await new Promise((resolve, reject) => {
    let log = ''
    browser.stderr.on('data', (chunk) => {
      log += chunk
      const match = /DevTools listening on ws:\/\/([^/\s]+)/.exec(log)
      if (match) resolve(match[1])
    })
    browser.once('error', reject)
    browser.once('exit', () => reject(new Error(`Chrome stopped before it opened:\n${log.trim()}`)))
  })
  /** @type {{ type: string, webSocketDebuggerUrl: string }[]} */
  const targets = await (await fetch(`http://${endpoint}/json/list`)).json()
  const page = targets.find((target) => target.type === 'page')
  if (!page) throw new Error('Chrome opened no page')
  return page.webSocketDebuggerUrl
}

/**
 * A DevTools Protocol session over Node's built-in WebSocket.
 * @param {string} url
 * @returns {Promise<{ send: (method: string, params?: object) => Promise<any>, close: () => void }>}
 */
function connect(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url)
    /** @type {Map<number, { resolve: (result: any) => void, reject: (error: Error) => void }>} */
    const pending = new Map()
    let id = 0
    socket.addEventListener('message', ({ data }) => {
      const message = JSON.parse(String(data))
      const call = pending.get(message.id)
      if (!call) return
      pending.delete(message.id)
      if (message.error) call.reject(new Error(message.error.message))
      else call.resolve(message.result)
    })
    socket.addEventListener('error', () => reject(new Error(`Can't reach Chrome's DevTools at ${url}`)))
    socket.addEventListener('close', () => {
      for (const call of pending.values()) call.reject(new Error('Chrome closed its DevTools connection'))
      pending.clear()
    })
    socket.addEventListener('open', () =>
      resolve({
        send: (method, params = {}) =>
          new Promise((resolve, reject) => {
            pending.set(++id, { resolve, reject })
            socket.send(JSON.stringify({ id, method, params }))
          }),
        close: () => socket.close(),
      }),
    )
  })
}

/** @param {number} ms */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
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
  // The last resort, should cleaning up after the capture's own 45-second deadline hang too: it takes about 6 seconds.
  setTimeout(() => {
    console.error(`No screenshot of ${options.url} within 60 seconds.`)
    process.exit(1)
  }, 58_000).unref()
  try {
    const { scrollWidth, parts } = await capture(chrome, options)
    const overflow = scrollWidth > options.width ? `, wider than the ${options.width}px viewport: something overflows horizontally` : ''
    console.log(`${options.out}: ${options.width}px wide${options.mobile ? ', mobile' : ''}; scrollWidth ${scrollWidth}${overflow}`)
    for (const part of parts) console.log(part)
    process.exit(0)
  } catch (error) {
    console.error(/** @type {Error} */ (error).message)
    process.exit(1)
  }
}
