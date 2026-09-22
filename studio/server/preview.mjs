// The Theme's live preview: the Studio runs `shopify theme dev` and reads its status from the CLI's
// output (ADR-0003). The output formats below were checked against Shopify CLI 4.8.0.
import { execFile, spawn } from 'node:child_process'
import { promisify, stripVTControlCharacters } from 'node:util'

export const minimumCliVersion = '4.0.0'
const install = 'Install it with `npm install -g @shopify/cli`, then restart the Studio.'
const previewUrl = /Preview your theme[\s\S]*?(https?:\/\/[^\s│]+)/
const loginPrompt = /log in to Shopify/
// Without a terminal to prompt in, the CLI stops and asks for a login instead.
const loginMessage = 'Run `shopify auth login` in a terminal, then restart the Studio.'

/**
 * @typedef {{ status: 'starting' | 'login-required' | 'error', message: string } | { status: 'running', url: string }} PreviewState
 */

/**
 * Starts `shopify theme dev` for a Theme. Its output also goes to the Studio's terminal.
 * @param {{ cli: string, theme: string, store?: string, onChange: (state: PreviewState) => void }} options
 */
export function startPreview({ cli, theme, store, onChange }) {
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

  checkCli(cli).then(
    () => {
      if (stopped) return
      const args = ['theme', 'dev', '--path', theme, ...(store ? ['--store', store] : [])]
      // No stdin: theme dev must not take over the Studio's terminal with its own prompts and keys.
      child = spawn(cli, args, { stdio: ['ignore', 'pipe', 'pipe'] })
      let output = ''
      /** @param {NodeJS.WriteStream} terminal */
      const read = (terminal) => (/** @type {Buffer} */ chunk) => {
        terminal.write(chunk)
        // ponytail: keeps the last 4 KB only, enough for the status lines and the final error box.
        output = (output + stripVTControlCharacters(chunk.toString())).slice(-4096)
        if (state.status !== 'starting') return
        const url = output.match(previewUrl)?.[1]
        if (url) set({ status: 'running', url })
        else if (loginPrompt.test(output)) set({ status: 'login-required', message: loginMessage })
      }
      child.stdout?.on('data', read(process.stdout))
      child.stderr?.on('data', read(process.stderr))
      child.on('error', (error) => set({ status: 'error', message: `Could not run the Shopify CLI: ${error.message}` }))
      child.on('exit', (code) => {
        if (state.status === 'login-required') return
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
 * The CLI's last words, without the box it draws around errors.
 * @param {string} output
 */
function lastLines(output) {
  return output.replace(/[│╭╮╰╯─]/g, ' ').replace(/\s+/g, ' ').trim().slice(-500)
}
