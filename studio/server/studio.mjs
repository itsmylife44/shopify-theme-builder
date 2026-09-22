// The Studio server: Vite serves the React UI from studio/, and the studioApi
// plugin adds the Node file API over the Theme folder on disk.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Severity, check, parseJSON } from '@shopify/theme-check-node'
import { createServer } from 'vite'

const studioDir = fileURLToPath(new URL('..', import.meta.url))
const defaultCatalog = fileURLToPath(new URL('../../catalog', import.meta.url))

/**
 * Starts the Studio for a Theme folder. Nothing is written into the Theme.
 * @param {{ theme: string, catalog?: string, port?: number }} options
 */
export async function startStudio({ theme, catalog = defaultCatalog, port }) {
  theme = path.resolve(theme)
  for (const file of ['layout/theme.liquid', 'templates/index.json']) {
    if (!existsSync(path.join(theme, file))) throw new Error(`${theme} is not a Shopify theme: ${file} is missing.`)
  }
  const server = await createServer({
    root: studioDir,
    configFile: path.join(studioDir, 'vite.config.ts'),
    server: { port },
    plugins: [studioApi(theme, catalog)],
  })
  return server.listen()
}

/**
 * @param {string} theme
 * @param {string} catalog
 * @returns {import('vite').Plugin}
 */
function studioApi(theme, catalog) {
  return {
    name: 'studio-api',
    configureServer(server) {
      server.middlewares.use('/api/theme', (req, res, next) => {
        if (req.method !== 'GET') return next()
        readThemeState(theme, catalog)
          .then((state) => {
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(state))
          })
          .catch((/** @type {Error} */ error) => {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: error.message }))
          })
      })
    },
  }
}

/**
 * @typedef {{ file: string, line: number, severity: 'error' | 'warning', check: string, message: string }} Offense
 * @typedef {{ id: string, type: string }} TemplateSection
 * @typedef {{ home: TemplateSection[], catalog: string[], validation: Offense[] }} ThemeState
 */

/**
 * @param {string} theme
 * @param {string} catalog
 * @returns {Promise<ThemeState>}
 */
async function readThemeState(theme, catalog) {
  return { home: readTemplate(theme, 'index'), catalog: listSections(catalog), validation: await validate(theme) }
}

/**
 * The sections of a JSON template, in page order.
 * @param {string} theme
 * @param {string} name
 * @returns {TemplateSection[]}
 */
function readTemplate(theme, name) {
  const file = `templates/${name}.json`
  // Shopify writes a comment header into JSON templates; Theme Check's parser accepts it.
  const template = parseJSON(readFileSync(path.join(theme, file), 'utf8'))
  if (template instanceof Error) throw new Error(`${file}: ${template.message}`)
  return template.order.map((/** @type {string} */ id) => ({ id, type: template.sections[id].type }))
}

/** @param {string} dir */
function listSections(dir) {
  return readdirSync(path.join(dir, 'sections'))
    .filter((file) => file.endsWith('.liquid'))
    .map((file) => file.slice(0, -'.liquid'.length))
    .sort()
}

/**
 * Runs Theme Check on a Theme.
 * @param {string} theme
 * @returns {Promise<Offense[]>}
 */
export async function validate(theme) {
  // ponytail: full Theme Check on every read; cache the result once writes and file watching exist (#5, #7).
  const offenses = await check(theme)
  return offenses.map((offense) => ({
    file: path.relative(theme, fileURLToPath(offense.uri)),
    // Theme Check lines are 0-indexed.
    line: offense.start.line + 1,
    severity: offense.severity === Severity.ERROR ? 'error' : 'warning',
    check: offense.check,
    message: offense.message,
  }))
}
