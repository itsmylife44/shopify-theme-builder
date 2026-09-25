// The Theme's live preview: the Studio runs `shopify theme dev` and reads its status from the CLI's
// output (ADR-0003). The output formats below were checked against Shopify CLI 4.8.0.
import { execFile, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { utimes } from 'node:fs/promises'
import { createServer } from 'node:net'
import path from 'node:path'
import { promisify, stripVTControlCharacters } from 'node:util'

// The oldest CLI whose output the Studio was checked against.
const minimumCliVersion = '4.8.0'
const install = 'Install it with `npm install -g @shopify/cli`, then restart the Studio.'
// The line after "Preview your theme" holds the link, or without a terminal a footnote like [1] listed after the box.
const previewItem = /Preview your theme[^\n]*\n[^\n]*?(?:\[(\d+)\]|(https?:\/\/[^\s│]+))/
// The CLI prints a login link and waits, then goes on to the preview. Only with CI set does it stop instead.
const loginPrompt = /log in to Shopify/
// The share link names the store and the development theme, whose Theme Editor the Studio links to.
const shareLink = /(https:\/\/[^\s/│]+)\/\?preview_theme_id=(\d+)/
const loginWaiting = "Log in to Shopify with the link the Shopify CLI printed in the Studio's terminal; the preview starts after."
const loginStopped = 'Run `shopify auth login` in a terminal, then restart the Studio.'
// Development stores always have a password page, and theme dev can't ask for it without a terminal.
const passwordPrompt = /Enter your store password/
const passwordMissing =
  "The store has a password page: restart the Studio with --store-password <password>, from the Shopify admin's Online Store › Preferences."
const passwordRefused =
  "The preview shows the store's password page, and the store refused the Studio's password: restart the Studio with the storefront password in --store-password <password>, from the Shopify admin's Online Store › Preferences."
// A line of theme dev's output, or a whole box it draws around a message, once its last line arrived.
const block = /^[^\n╭]*╭[\s\S]*?╰[^\n]*\n|^(?![^\n]*╭)[^\n]*\n/
// The CLI's session expired and it can't ask for a login without a terminal; a new run gets fresh credentials.
const credentialsInvalid = /credentials are invalid/
const uploadFailed = /Failed to upload file "([^"]+)" to remote theme\.(.*)/
const synced = /Synced » update (\S+)/
// Shopify refuses a template naming a section the store lacks, in the account's language (English, Italian).
const missingSection = /(?:section type|tipo di sezione) "([^"/]+)"/i


/**
 * @typedef {{ file: string, message: string }} UploadError A file theme dev failed to upload, and why.
 * @typedef {{ status: 'starting' | 'login-required' | 'reconnecting' | 'password-page' | 'error', message: string } | { status: 'running', url: string }} PreviewStatus
 * @typedef {PreviewStatus & { uploadErrors: UploadError[] }} PreviewState
 */

/**
 * Starts `shopify theme dev` for a Theme. Its output also goes to the Studio's terminal.
 * @param {{ cli: string, theme: string, store: string, storePassword?: string, onChange: (state: PreviewState) => void }} options
 */
export function startPreview({ cli, theme, store, storePassword, onChange }) {
  /** @type {Map<string, string>} The files whose latest upload failed, until theme dev syncs them. */
  const uploadErrors = new Map()
  /** @type {Map<string, Set<string>>} Each section file touched because the store lacked it: the templates to touch once it syncs. */
  const resyncing = new Map()
  /** @type {Map<string, Set<string>>} Each template refused for want of a section: the sections touched for it, once each. */
  const retried = new Map()
  /** @type {PreviewState} */
  let state = { status: 'starting', message: 'Starting `shopify theme dev`…', uploadErrors: [] }
  /** @type {import('node:child_process').ChildProcess | undefined} */
  let child
  let stopped = false
  /** @type {string | undefined} */
  let editor
  /** @type {string | undefined} theme dev's preview URL, once it printed it. */
  let url
  /** @type {Promise<PreviewStatus['status']> | undefined} */
  let checking
  // ponytail: theme dev's session drops at no signal it prints, so the preview is checked on a timer too.
  const checker = setInterval(() => check(), 30_000).unref()

  /** @param {PreviewStatus} next */
  function set(next) {
    if (stopped) return
    state = { ...next, uploadErrors: [...uploadErrors].map(([file, message]) => ({ file, message })) }
    onChange(state)
  }

  // ponytail: one restart a minute at most per cause; a session lost again right away isn't one a restart fixes.
  let reconnected = 0
  let reauthenticated = 0

  /**
   * Replaces theme dev with a new run. The new run uploads every file that differs from the store, so the
   * failed uploads are forgotten.
   * @param {string} message
   */
  function restart(message) {
    // ponytail: the new run's first sync reports failed uploads only on theme dev's error page, not in its output.
    uploadErrors.clear()
    resyncing.clear()
    retried.clear()
    set({ status: 'reconnecting', message })
    const previous = child
    child = undefined
    // The new run waits for the old one to free the preview port, so it takes the same port again.
    if (previous && previous.exitCode === null && previous.signalCode === null) previous.once('exit', run).kill()
    else run()
  }

  /**
   * Reads one line or box of theme dev's output: failed and synced uploads, and expired credentials.
   * @param {string} text
   */
  function read(text) {
    const flat = unbox(text)
    const [, failed, reason] = flat.match(uploadFailed) ?? []
    const [, updated] = flat.match(synced) ?? []
    if (failed) {
      uploadErrors.set(failed, reason.trim().slice(0, 500))
      resync(failed, reason)
    }
    if (updated) {
      uploadErrors.delete(updated)
      retried.delete(updated)
      for (const template of resyncing.get(updated) ?? []) touch(template)
      resyncing.delete(updated)
    }
    if (credentialsInvalid.test(flat)) {
      if (Date.now() - reauthenticated < 60_000) {
        set({ status: 'login-required', message: loginStopped })
        // theme dev can't upload anything more: it stops, and its last words don't change the status.
        child?.kill()
        child = undefined
        return
      }
      reauthenticated = Date.now()
      return restart('Restarting `shopify theme dev`, whose Shopify CLI credentials expired…')
    }
    if (failed || updated) set(state)
  }

  /**
   * theme dev's watcher can miss a file the Studio wrote, most often during its first sync (#222): when Shopify
   * refuses a template for want of a section the Theme has, touches that section so theme dev uploads it, then
   * the template once it synced. Once per template and section, so a refusal that isn't about the upload can't loop.
   * @param {string} template
   * @param {string} reason
   */
  function resync(template, reason) {
    const [, type] = reason.match(missingSection) ?? []
    const section = type && `sections/${type}.liquid`
    const touched = retried.get(template) ?? new Set()
    if (!section || touched.has(section) || !existsSync(path.join(theme, section))) return
    retried.set(template, touched.add(section))
    resyncing.set(section, (resyncing.get(section) ?? new Set()).add(template))
    touch(section)
  }

  /**
   * Marks a Theme file changed, so theme dev uploads it again.
   * @param {string} file
   */
  function touch(file) {
    const now = new Date()
    utimes(path.join(theme, file), now, now).catch(() => {})
  }

  /**
   * Brings the preview past the store's password page, where theme dev sends every client once its storefront
   * session drops (#223): posts the store password to theme dev, which brings the session back for every client,
   * cookie or not. When that doesn't help, restarts theme dev (#113), else the status is `password-page`.
   * Resolves the status after the check.
   * @returns {Promise<PreviewStatus['status']>}
   */
  function check() {
    checking ??= (async () => {
      const at = url
      if (!at || (state.status !== 'running' && state.status !== 'password-page')) return state.status
      let locked = await passwordPage(at)
      if (locked && storePassword) {
        await submitPassword(at, storePassword)
        locked = await passwordPage(at)
      }
      // A restart while checking says nothing about the new run.
      if (at !== url || (state.status !== 'running' && state.status !== 'password-page')) return state.status
      if (locked && state.status === 'running' && !reconnect()) {
        set({ status: 'password-page', message: storePassword ? passwordRefused : passwordMissing })
      }
      if (!locked && state.status === 'password-page') set({ status: 'running', url: at })
      return state.status
    })().finally(() => (checking = undefined))
    return checking
  }

  /**
   * Restarts theme dev when its storefront session expired, since a new run logs in to the storefront again.
   * Returns false and does nothing while theme dev isn't running, or when it restarted less than a minute ago.
   */
  function reconnect() {
    if (state.status !== 'running' || Date.now() - reconnected < 60_000) return false
    reconnected = Date.now()
    restart('Reconnecting to the store, whose storefront session expired…')
    return true
  }

  function run() {
    freePort(themePort(theme)).then((port) => {
      if (stopped) return
      const args = ['theme', 'dev', '--path', theme, '--store', store, '--port', String(port)]
      // No stdin: theme dev must not take over the Studio's terminal with its own prompts and keys.
      // The password goes in the CLI's environment variable, where other processes can't list it.
      const env = storePassword ? { ...process.env, SHOPIFY_FLAG_STORE_PASSWORD: storePassword } : process.env
      const current = spawn(cli, args, { stdio: ['ignore', 'pipe', 'pipe'], env })
      child = current
      let output = ''
      /**
       * Echoes the CLI's output to the Studio's terminal, where the Creator logs in, and reads the status from it.
       * @param {NodeJS.WriteStream} terminal
       */
      const echoAndRead = (terminal) => {
        // Each stream's own unread text, so a box on one never takes in a line of the other.
        let unread = ''
        return (/** @type {Buffer} */ chunk) => {
          terminal.write(chunk)
          const text = stripVTControlCharacters(chunk.toString())
          // ponytail: keeps the last 4 KB only, enough for the status lines and the final error box.
          output = (output + text).slice(-4096)
          editor ??= editorUrl(output)
          // A run that restart() replaced says nothing more about the preview.
          unread += text
          for (let match; current === child && (match = unread.match(block)); ) {
            unread = unread.slice(match[0].length)
            read(match[0])
          }
          // ponytail: a box that never closes is dropped after 16 KB; its lines are then read one by one.
          unread = unread.slice(-16384)
          if (current !== child || state.status === 'running' || state.status === 'password-page') return
          url = previewUrl(output)
          if (url) {
            set({ status: 'running', url })
            check()
          } else if (state.status === 'starting' && loginPrompt.test(output)) {
            set({ status: 'login-required', message: loginWaiting })
          }
        }
      }
      current.stdout?.on('data', echoAndRead(process.stdout))
      current.stderr?.on('data', echoAndRead(process.stderr))
      current.on('error', (error) => set({ status: 'error', message: `Could not run the Shopify CLI: ${error.message}` }))
      current.on('exit', (code) => {
        // A run that restart() replaced, or that lost its credentials, ends quietly.
        if (current !== child) return
        if (state.status === 'login-required') return set({ status: 'login-required', message: loginStopped })
        if (passwordPrompt.test(output)) return set({ status: 'error', message: passwordMissing })
        set({ status: 'error', message: `shopify theme dev stopped (exit code ${code}). ${lastLines(output)}`.trim() })
      })
    })
  }

  checkCli(cli).then(run, (/** @type {Error} */ error) => set({ status: 'error', message: error.message }))

  return {
    get state() {
      return state
    },
    /** The Theme Editor of theme dev's development theme, once theme dev printed its share link. */
    get editor() {
      return editor
    },
    check,
    reconnect,
    stop() {
      stopped = true
      clearInterval(checker)
      child?.kill()
    },
  }
}

/**
 * Whether the preview's home page sends a client without cookies to the store's password page.
 * @param {string} url
 */
async function passwordPage(url) {
  try {
    const response = await fetch(new URL('/', url), { redirect: 'manual', signal: AbortSignal.timeout(5000) })
    await response.body?.cancel()
    const location = response.headers.get('location')
    return location !== null && URL.parse(location, url)?.pathname === '/password'
  } catch {
    // theme dev not answering is not the password page.
    return false
  }
}

/**
 * Posts the storefront password to the preview's password page, as the page's own form does.
 * @param {string} url
 * @param {string} password
 */
async function submitPassword(url, password) {
  try {
    const body = new URLSearchParams({ form_type: 'storefront_password', utf8: '✓', password })
    const response = await fetch(new URL('/password', url), { method: 'POST', body, redirect: 'manual', signal: AbortSignal.timeout(10_000) })
    await response.body?.cancel()
  } catch {}
}

/**
 * Rejects with a message for the Creator when the CLI is missing or too old.
 * @param {string} cli
 */
async function checkCli(cli) {
  /** @type {string} */
  let output
  try {
    output = (await promisify(execFile)(cli, ['version'], { timeout: 60_000 })).stdout
  } catch (error) {
    const { code, message } = /** @type {NodeJS.ErrnoException} */ (error)
    if (code === 'ENOENT') throw new Error(`The Shopify CLI is not installed. ${install}`)
    throw new Error(`\`shopify version\` failed: ${message}`)
  }
  // `shopify version` may print release notes first; the version is the last one printed.
  const version = output.match(/\d+\.\d+\.\d+/g)?.at(-1)
  if (!version) throw new Error(`\`shopify version\` printed no version: ${output.trim()}`)
  const [have, need] = [version, minimumCliVersion].map((v) => v.split('.').map(Number))
  const index = have.findIndex((part, i) => part !== need[i])
  if (index !== -1 && have[index] < need[index]) {
    throw new Error(`The Shopify CLI is ${version}; the Studio needs ${minimumCliVersion} or newer. ${install}`)
  }
}

/**
 * The local preview link in theme dev's output, once it printed it.
 * @param {string} output
 */
function previewUrl(output) {
  const [, footnote, url] = output.match(previewItem) ?? []
  return url ?? (footnote ? output.match(new RegExp(`^\\[${footnote}\\] (\\S+)`, 'm'))?.[1] : undefined)
}

/**
 * The Theme Editor link of the development theme in theme dev's share link, once it printed it.
 * @param {string} output
 */
function editorUrl(output) {
  const [, store, themeId] = output.match(shareLink) ?? []
  return store ? `${store}/admin/themes/${themeId}/editor` : undefined
}

/**
 * The preview port of a Theme: the same on every Studio start, so the Creator's preview link keeps working,
 * and different per Theme folder, so it rarely meets another project's theme dev (which defaults to 9292).
 * @param {string} theme
 */
function themePort(theme) {
  // ponytail: two Themes may hash to the same port; the second then gets a random one, as when it's taken.
  return 9293 + (createHash('sha256').update(theme).digest().readUInt32BE() % 700)
}

/**
 * `port`, or a free one when another process (another project's theme dev, say) holds it.
 * @param {number} port
 * @returns {Promise<number>}
 */
function freePort(port) {
  return new Promise((resolve) => {
    const server = createServer()
    server.once('error', () => resolve(freePort(0)))
    server.listen(port, '127.0.0.1', () => {
      const { port } = /** @type {import('node:net').AddressInfo} */ (server.address())
      server.close(() => resolve(port))
    })
  })
}

/**
 * The CLI's last words, without the box it draws around errors.
 * @param {string} output
 */
function lastLines(output) {
  return unbox(output).slice(-500)
}

/**
 * The CLI's output on one line, without the box it draws around messages.
 * @param {string} output
 */
function unbox(output) {
  return output.replace(/[│╭╮╰╯─]/g, ' ').replace(/\s+/g, ' ').trim()
}
