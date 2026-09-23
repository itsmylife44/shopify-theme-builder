// The Theme's live preview: the Studio runs `shopify theme dev` and reads its status from the CLI's
// output (ADR-0003). The output formats below were checked against Shopify CLI 4.8.0.
import { execFile, spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { promisify, stripVTControlCharacters } from 'node:util'

// The oldest CLI whose output the Studio was checked against.
const minimumCliVersion = '4.8.0'
const install = 'Install it with `npm install -g @shopify/cli`, then restart the Studio.'
// The line after "Preview your theme" holds the link, or without a terminal a footnote like [1] listed after the box.
const previewItem = /Preview your theme[^\n]*\n[^\n]*?(?:\[(\d+)\]|(https?:\/\/[^\s│]+))/
// The CLI prints a login link and waits, then goes on to the preview. Only with CI set does it stop instead.
const loginPrompt = /log in to Shopify/
const loginWaiting = "Log in to Shopify with the link the Shopify CLI printed in the Studio's terminal; the preview starts after."
const loginStopped = 'Run `shopify auth login` in a terminal, then restart the Studio.'
// Development stores always have a password page, and theme dev can't ask for it without a terminal.
const passwordPrompt = /Enter your store password/
const passwordMissing =
  "The store has a password page: restart the Studio with --store-password <password>, from the Shopify admin's Online Store › Preferences."


/**
 * @typedef {{ status: 'starting' | 'login-required' | 'error', message: string } | { status: 'running', url: string }} PreviewState
 */

/**
 * Starts `shopify theme dev` for a Theme. Its output also goes to the Studio's terminal.
 * @param {{ cli: string, theme: string, store: string, storePassword?: string, onChange: (state: PreviewState) => void }} options
 */
export function startPreview({ cli, theme, store, storePassword, onChange }) {
  /** @type {PreviewState} */
  let state = { status: 'starting', message: 'Starting `shopify theme dev`…' }
  /** @type {import('node:child_process').ChildProcess | undefined} */
  let child
  let stopped = false

  /** @param {PreviewState} next */
  function set(next) {
    if (stopped) return
    state = next
    onChange(state)
  }

  checkCli(cli).then(() => freePort()).then(
    (port) => {
      if (stopped) return
      const args = ['theme', 'dev', '--path', theme, '--store', store, '--port', String(port)]
      // No stdin: theme dev must not take over the Studio's terminal with its own prompts and keys.
      // The password goes in the CLI's environment variable, where other processes can't list it.
      const env = storePassword ? { ...process.env, SHOPIFY_FLAG_STORE_PASSWORD: storePassword } : process.env
      child = spawn(cli, args, { stdio: ['ignore', 'pipe', 'pipe'], env })
      let output = ''
      /**
       * Echoes the CLI's output to the Studio's terminal, where the Creator logs in, and reads the status from it.
       * @param {NodeJS.WriteStream} terminal
       */
      const echoAndRead = (terminal) => (/** @type {Buffer} */ chunk) => {
        terminal.write(chunk)
        // ponytail: keeps the last 4 KB only, enough for the status lines and the final error box.
        output = (output + stripVTControlCharacters(chunk.toString())).slice(-4096)
        if (state.status === 'running') return
        const url = previewUrl(output)
        if (url) set({ status: 'running', url })
        else if (state.status === 'starting' && loginPrompt.test(output)) {
          set({ status: 'login-required', message: loginWaiting })
        }
      }
      child.stdout?.on('data', echoAndRead(process.stdout))
      child.stderr?.on('data', echoAndRead(process.stderr))
      child.on('error', (error) => set({ status: 'error', message: `Could not run the Shopify CLI: ${error.message}` }))
      child.on('exit', (code) => {
        if (state.status === 'login-required') return set({ status: 'login-required', message: loginStopped })
        if (passwordPrompt.test(output)) return set({ status: 'error', message: passwordMissing })
        set({ status: 'error', message: `shopify theme dev stopped (exit code ${code}). ${lastLines(output)}`.trim() })
      })
    },
    (/** @type {Error} */ error) => set({ status: 'error', message: error.message }),
  )

  return {
    get state() {
      return state
    },
    stop() {
      stopped = true
      child?.kill()
    },
  }
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
 * 9292, theme dev's usual port, or a free one when another theme dev (for another Theme, say) holds it.
 * @param {number} port
 * @returns {Promise<number>}
 */
function freePort(port = 9292) {
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
  return output.replace(/[│╭╮╰╯─]/g, ' ').replace(/\s+/g, ' ').trim().slice(-500)
}
