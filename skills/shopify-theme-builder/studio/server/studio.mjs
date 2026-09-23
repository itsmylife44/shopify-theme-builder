// The Studio server: Vite serves the React UI from studio/, and the studioApi
// plugin adds the Node file API over the Theme folder on disk.
import { execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, watch, writeFileSync } from 'node:fs'
import path from 'node:path'
import { buffer, json } from 'node:stream/consumers'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { Severity, check, parseJSON } from '@shopify/theme-check-node'
import { createServer } from 'vite'
import { pagePaths, startFrameProxy } from './frame.mjs'
import { startPreview } from './preview.mjs'

const studioDir = fileURLToPath(new URL('..', import.meta.url))
const defaultCatalog = fileURLToPath(new URL('../../catalog', import.meta.url))
const baseTheme = fileURLToPath(new URL('../../base-theme', import.meta.url))

/**
 * Starts the Studio for a Theme folder, with `shopify theme dev` on `store` for its preview. Nothing is written into the Theme.
 * @param {{ theme: string, store: string, catalog?: string, port?: number, cli?: string, storePassword?: string }} options
 */
export async function startStudio({ theme, catalog = defaultCatalog, port, cli = 'shopify', store, storePassword }) {
  // Without a store theme dev would use the store the CLI used last, maybe another Theme's development theme.
  if (!store) throw new Error('The Studio needs a store (<shop>.myshopify.com) for the preview.')
  theme = path.resolve(theme)
  for (const file of ['layout/theme.liquid', ...Object.values(pages), ...Object.values(groups)]) {
    if (!existsSync(path.join(theme, file))) throw new Error(`${theme} is not a Shopify theme: ${file} is missing.`)
  }
  const server = await createServer({
    root: studioDir,
    configFile: path.join(studioDir, 'vite.config.ts'),
    // No CORS: only the Studio's own page may call its API.
    server: { port, cors: false },
    plugins: [studioApi(theme, catalog, { cli, store, storePassword })],
  })
  return server.listen()
}

/**
 * @param {string} theme
 * @param {string} catalog
 * @param {{ cli: string, store: string, storePassword?: string }} preview
 * @returns {import('vite').Plugin}
 */
function studioApi(theme, catalog, { cli, store, storePassword }) {
  return {
    name: 'studio-api',
    async configureServer(server) {
      /** @type {Promise<Offense[]> | null} The latest Theme Check result, until a file changes. */
      let validation = null
      let validatedAt = 0
      const steps = history(theme)
      const readState = async () => ({ ...(await readThemeState(theme, catalog, (validation ??= validateOnce()))), history: steps.state() })
      function validateOnce() {
        validatedAt = Date.now()
        const result = validate(theme)
        result.catch(() => {
          if (validation === result) validation = null
        })
        return result
      }
      /** The Theme state after a Studio write, validated again. */
      function readStateAfterWrite() {
        validation = null
        return readState()
      }
      /**
       * Runs a Studio write as one undo step.
       * @param {() => void} change
       */
      function write(change) {
        steps.record(change)
        return readStateAfterWrite()
      }

      // The agent, the Theme Editor (pulled) or anything else may change the Theme: re-validate and tell the UI.
      /** @type {NodeJS.Timeout | undefined} */
      let notify
      const watcher = watch(theme, { recursive: true }, (_, file) => {
        if (file?.split(path.sep)[0] === '.git') return
        // A file written before the latest Theme Check started, like the Studio's own writes, is already in it.
        const mtime = file ? statSync(path.join(theme, file), { throwIfNoEntry: false })?.mtimeMs : undefined
        if (validation && mtime !== undefined && mtime < validatedAt) return
        validation = null
        clearTimeout(notify)
        notify = setTimeout(() => server.ws.send('studio:theme'), 100)
      })

      const preview = startPreview({
        cli,
        theme,
        store,
        storePassword,
        onChange: (state) => server.ws.send('studio:preview', state),
      })
      const frame = await startFrameProxy(
        () => (preview.state.status === 'running' ? preview.state.url : undefined),
        () => preview.reconnect(),
      )
      const stop = () => preview.stop()
      process.on('exit', stop)
      server.httpServer?.once('close', () => {
        watcher.close()
        frame.close()
        clearTimeout(notify)
        stop()
        process.off('exit', stop)
      })

      /** @type {{ method: string, pattern: RegExp }[]} Every call the routes answer, for the fallback's 404 and 405. */
      const calls = []
      /**
       * A route answers its exact path, where each :param stands for one path segment; the handler gets
       * those segments in order.
       * @param {string} url
       * @param {string} method
       * @param {(req: import('node:http').IncomingMessage, ...ids: string[]) => Promise<unknown>} handle
       */
      function route(url, method, handle) {
        calls.push({ method, pattern: new RegExp(`^${url.replace(/:\w+/g, '[^/]+')}$`) })
        const prefix = url.split('/:')[0]
        const pattern = new RegExp(`^${url.slice(prefix.length).replace(/:\w+/g, '([^/]+)') || '/'}$`)
        server.middlewares.use(prefix, (req, res, next) => {
          // Connect matches path prefixes and strips them from req.url.
          const ids = new URL(req.url ?? '/', 'http://studio').pathname.match(pattern)?.slice(1)
          if (req.method !== method || ids === undefined) return next()
          // A browser names the page behind a request in Origin. Only the Studio's own page may write: not a
          // script in the preview (served from the proxy's port) nor another website.
          if (method !== 'GET' && req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) {
            res.statusCode = 403
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'Only the Studio itself may change the Theme.' }))
            return
          }
          Promise.resolve()
            .then(() => handle(req, ...ids.map(decodeId)))
            .then((body) => {
              if (body instanceof File) {
                res.setHeader('Content-Type', body.type)
                res.setHeader('Cache-Control', 'no-store')
                // An uploaded SVG opened directly must not run scripts on the Studio's origin.
                res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox")
                res.setHeader('X-Content-Type-Options', 'nosniff')
                return body.bytes().then((bytes) => res.end(bytes))
              }
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify(body))
            })
            .catch((/** @type {Error} */ error) => {
              res.statusCode = error instanceof HttpError ? error.status : 500
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: error.message }))
            })
        })
      }
      route('/api/theme', 'GET', readState)
      /**
       * Undoes or redoes a step. A refused one leaves the history changed, so the UI reads the Theme again.
       * @param {() => void} move
       */
      function travel(move) {
        try {
          move()
        } catch (error) {
          server.ws.send('studio:theme')
          throw error
        }
        return readStateAfterWrite()
      }
      route('/api/undo', 'POST', async () => travel(steps.undo))
      route('/api/redo', 'POST', async () => travel(steps.redo))
      route('/api/preview', 'GET', async () => preview.state)
      route('/api/frame', 'GET', async () => {
        const { state } = preview
        if (state.status !== 'running') throw new Conflict('The preview is not running yet.')
        const { editor } = preview
        // ponytail: opens the page's template only; Shopify's editor link has no documented way to select a section.
        const editors = editor ? perPage((file) => `${editor}?template=${path.basename(file, '.json')}`) : null
        return { url: frame.url, paths: await pagePaths(state.url), editor: editors }
      })
      const storeResources = storeReader(cli, store)
      route('/api/store', 'GET', storeResources)
      route('/api/brand', 'PUT', async (req) => {
        const change = await readBody(req)
        return write(() => setBrand(theme, change))
      })
      route('/api/brand/logo', 'GET', async () => readLogo(theme))
      route('/api/brand/logo', 'PUT', async (req) => {
        const file = await buffer(req)
        return write(() => uploadLogo(theme, req.headers['content-type'] ?? '', file))
      })
      route('/api/brand/logo', 'DELETE', async () => write(() => removeLogo(theme)))
      for (const [page, template] of Object.entries(pages)) {
        route(`/api/${page}/sections`, 'POST', async (req) => {
          const body = await readBody(req)
          return write(() => addSection(theme, catalog, template, body))
        })
        route(`/api/${page}/sections/:id`, 'DELETE', async (_, id) => write(() => removeSection(theme, template, id)))
        route(`/api/${page}/order`, 'PUT', async (req) => {
          const body = await readBody(req)
          return write(() => reorderSections(theme, template, body))
        })
      }
      // The header and footer groups' sections are edited like a page's, but not added, removed or reordered.
      for (const [name, template] of Object.entries({ ...pages, ...groups })) {
        route(`/api/${name}/sections/:id`, 'GET', async (_, id) => readSection(theme, template, id))
        route(`/api/${name}/sections/:id`, 'PATCH', async (req, id) => {
          const body = await readBody(req)
          return write(() => updateSection(theme, template, id, body))
        })
        route(`/api/${name}/sections/:id/blocks`, 'POST', async (req, id) => {
          const body = await readBody(req)
          return write(() => addBlock(theme, template, id, body))
        })
        route(`/api/${name}/sections/:id/blocks/:block`, 'DELETE', async (_, id, block) => write(() => removeBlock(theme, template, id, block)))
        route(`/api/${name}/sections/:id/order`, 'PUT', async (req, id) => {
          const body = await readBody(req)
          return write(() => reorderBlocks(theme, template, id, body))
        })
      }
      // Any other /api call gets a JSON error, not Vite's fallback to the Studio page.
      server.middlewares.use('/api', (req, res) => {
        const method = req.method ?? 'GET'
        const url = new URL(req.originalUrl ?? '/api', 'http://studio').pathname
        /** @param {string} path */
        const methods = (path) => calls.filter((call) => call.pattern.test(path)).map((call) => call.method)
        const allowed = methods(url)
        res.setHeader('Content-Type', 'application/json')
        if (allowed.length) {
          res.statusCode = 405
          res.setHeader('Allow', allowed.join(', '))
          res.end(JSON.stringify({ error: `No such call: ${method} ${url}. It takes ${allowed.join(', ')}.` }))
          return
        }
        // The likely slip: a section's path without /sections/.
        const sections = url.replace(/^\/api\/([^/]+)\//, '/api/$1/sections/')
        const hint = methods(sections).includes(method) ? `Did you mean ${method} ${sections}?` : 'SKILL.md lists the calls.'
        res.statusCode = 404
        res.end(JSON.stringify({ error: `No such call: ${method} ${url}. ${hint}` }))
      })
    },
  }
}

/** @param {string} id */
function decodeId(id) {
  try {
    return decodeURIComponent(id)
  } catch {
    throw new BadRequest(`Malformed id in the URL: ${id}.`)
  }
}

/** @param {import('node:http').IncomingMessage} req */
function readBody(req) {
  return json(req).catch(() => {
    throw new BadRequest('The request body is not JSON.')
  })
}

class HttpError extends Error {
  status = 500
}
class BadRequest extends HttpError {
  status = 400
}
class NotFound extends HttpError {
  status = 404
}
class Conflict extends HttpError {
  status = 409
}

/** @type {Map<string, Buffer | null> | null} While a Studio write runs: each file it touched, as it was before (null: absent). */
let touched = null

/**
 * Writes a Theme file, remembering its content before for undo.
 * @param {string} file
 * @param {string | Buffer} data
 */
function writeFile(file, data) {
  remember(file)
  writeFileSync(file, data)
}

/** @param {string} file */
function removeFile(file) {
  remember(file)
  rmSync(file, { force: true })
}

/** @param {string} file */
function remember(file) {
  if (touched && !touched.has(file)) touched.set(file, readIfExists(file))
}

/** @param {string} file */
function readIfExists(file) {
  return existsSync(file) ? readFileSync(file) : null
}

/**
 * @param {Buffer | null} a
 * @param {Buffer | null} b
 */
function same(a, b) {
  return a === null || b === null ? a === b : a.equals(b)
}

const maxSteps = 50

/**
 * The Studio's undo history, in memory only: a step holds each file one write changed, before and after it.
 * Undo and redo refuse a step whose files changed since, so edits made outside the Studio are never undone.
 * @param {string} theme
 */
function history(theme) {
  /** @typedef {{ file: string, before: Buffer | null, after: Buffer | null }[]} Step */
  /** @type {Step[]} */
  const undo = []
  /** @type {Step[]} */
  const redo = []

  /**
   * Moves the latest step of `from` onto `to`, putting its files back to `restore`.
   * @param {Step[]} from
   * @param {Step[]} to
   * @param {'before' | 'after'} restore
   * @param {string} what
   */
  function move(from, to, restore, what) {
    const step = from.pop()
    if (!step) throw new Conflict(`Nothing to ${what}.`)
    const expected = restore === 'before' ? 'after' : 'before'
    const changed = step.filter((entry) => !same(readIfExists(entry.file), entry[expected]))
    if (changed.length > 0) {
      const files = changed.map((entry) => path.relative(theme, entry.file)).join(', ')
      throw new Conflict(`Can't ${what}: ${files} changed outside the Studio since, and the Studio leaves those edits alone. This step is dropped.`)
    }
    for (const entry of step) {
      const data = entry[restore]
      if (data === null) rmSync(entry.file, { force: true })
      else writeFileSync(entry.file, data)
    }
    to.push(step)
  }

  return {
    state: () => ({ undo: undo.length > 0, redo: redo.length > 0 }),
    /**
     * Runs a Studio write and records the files it changed as one step; a new step clears redo.
     * @param {() => void} write
     */
    record(write) {
      touched = new Map()
      try {
        write()
      } finally {
        const step = [...touched]
          .map(([file, before]) => ({ file, before, after: readIfExists(file) }))
          .filter((entry) => !same(entry.before, entry.after))
        touched = null
        if (step.length > 0) {
          undo.push(step)
          if (undo.length > maxSteps) undo.shift()
          redo.length = 0
        }
      }
    },
    undo: () => move(undo, redo, 'before', 'undo'),
    redo: () => move(redo, undo, 'after', 'redo'),
  }
}

/**
 * @typedef {{ file: string, line: number, severity: 'error' | 'warning', check: string, message: string }} Offense
 * @typedef {{ id: string, type: string, colorScheme?: string | null }} TemplateSection A section on a page; colorScheme is absent when its schema has no color scheme setting.
 * @typedef {{
 *   colorSchemes: Record<string, Record<string, string>>,
 *   colorFields: string[],
 *   gradientFields: string[],
 *   headingFont: string,
 *   bodyFont: string,
 *   logo: string | null,
 *   logoAsset: string | null,
 * }} Brand
 * @typedef {keyof typeof pages} Page
 * @typedef {keyof typeof groups} Group
 * @typedef {Record<Page | Group, TemplateSection[]> & { catalog: Record<Page, string[]>, custom: Record<Page, string[]>, sectionInfo: Record<string, { name: string, description: string }>, brand: Brand, validation: Offense[] }} ThemeFiles
 * @typedef {ThemeFiles & { history: { undo: boolean, redo: boolean } }} ThemeState The Theme's files, and whether the Studio can undo or redo a write.
 * @typedef {Partial<Pick<Brand, 'colorSchemes' | 'headingFont' | 'bodyFont' | 'logo'>>} BrandChange
 */

/**
 * @param {string} theme
 * @param {string} catalog
 * @param {Promise<Offense[]>} validation
 * @returns {Promise<ThemeFiles>}
 */
async function readThemeState(theme, catalog, validation) {
  return {
    ...perPage((file) => readTemplate(theme, file)),
    header: readTemplate(theme, groups.header),
    footer: readTemplate(theme, groups.footer),
    catalog: perPage((file) => listSections(catalog, file)),
    custom: perPage((file) => listCustomSections(theme, catalog, file)),
    sectionInfo: readSectionInfo(theme, catalog),
    brand: readBrand(theme),
    validation: await validation,
  }
}

/**
 * Reads a Theme JSON file. Shopify writes a comment header into some; Theme Check's parser accepts it.
 * @param {string} theme
 * @param {string} file
 */
function readJSON(theme, file) {
  return parseThemeJSON(readFileSync(path.join(theme, file), 'utf8'), file)
}

/**
 * @param {string} text
 * @param {string} file
 */
function parseThemeJSON(text, file) {
  const data = parseJSON(text)
  if (data instanceof Error) throw new Error(`${file}: ${data.message}`)
  return data
}

/**
 * The Brand settings the Studio edits, keyed by their id in config/settings_schema.json.
 * @param {string} theme
 */
function readBrandSchema(theme) {
  /** @type {Record<string, any>} */
  const settings = {}
  for (const group of readJSON(theme, 'config/settings_schema.json')) {
    for (const setting of group.settings ?? []) if (setting.id) settings[setting.id] = setting
  }
  const group = settings.color_schemes
  /** @type {Record<string, string>} Default color per color field of a scheme. */
  const colors = {}
  /** @type {string[]} The scheme's background gradient fields, a CSS gradient or none. */
  const gradients = []
  for (const field of group?.definition ?? []) {
    if (field.type === 'color') colors[field.id] = field.default
    if (field.type === 'color_background') gradients.push(field.id)
  }
  return { colors, gradients, headingFont: settings.type_heading_font?.default, bodyFont: settings.type_body_font?.default }
}

/**
 * The values of config/settings_data.json that apply, resolving a preset name the way Shopify does.
 * @param {any} data
 */
function currentSettings(data) {
  return typeof data.current === 'string' ? structuredClone(data.presets?.[data.current] ?? {}) : (data.current ?? {})
}

/**
 * @param {string} theme
 * @returns {Brand}
 */
function readBrand(theme) {
  const schema = readBrandSchema(theme)
  const current = currentSettings(readJSON(theme, settingsData))
  /** @type {Record<string, Record<string, string>>} */
  const colorSchemes = {}
  for (const [id, scheme] of Object.entries(current.color_schemes ?? {})) {
    // Shopify shows a color the scheme lacks in its schema default.
    colorSchemes[id] = Object.fromEntries([
      ...Object.entries(schema.colors).map(([field, color]) => [field, scheme.settings?.[field] ?? color]),
      ...schema.gradients.flatMap((field) => (scheme.settings?.[field] ? [[field, scheme.settings[field]]] : [])),
    ])
  }
  return {
    colorSchemes,
    colorFields: Object.keys(schema.colors),
    gradientFields: schema.gradients,
    headingFont: current.type_heading_font ?? schema.headingFont,
    bodyFont: current.type_body_font ?? schema.bodyFont,
    logo: current.logo ?? null,
    logoAsset: current.logo_asset || null,
  }
}

const settingsData = 'config/settings_data.json'
const hexColor = /^#[0-9a-f]{6}$/i
// The value lands in a CSS rule, so nothing that could end it: no semicolon, brace or angle bracket.
const cssGradient = /^(repeating-)?(linear|radial|conic)-gradient\([^;{}<>]*\)$/i
/** @type {{ families: { family: string, handles: string[] }[] }} */
const fontLibrary = JSON.parse(readFileSync(new URL('shopify-fonts.json', import.meta.url), 'utf8'))
const fontHandles = new Set(fontLibrary.families.flatMap((family) => family.handles))
const shopImage = /^shopify:\/\/shop_images\/[^/\s]+$/
const schemeId = /^[a-z0-9_-]+$/i

/**
 * Writes Brand changes into config/settings_data.json. Only the given fields change; everything
 * else in the file, including settings the Studio doesn't know about, is kept as is.
 * @param {string} theme
 * @param {unknown} change
 */
function setBrand(theme, change) {
  const schema = readBrandSchema(theme)
  const brand = validateBrand(change, Object.keys(schema.colors), schema.gradients)

  updateSettings(theme, (current) => {
    for (const [id, colors] of Object.entries(brand.colorSchemes ?? {})) {
      current.color_schemes ??= {}
      const scheme = (current.color_schemes[id] ??= { settings: { ...schema.colors } })
      scheme.settings = { ...scheme.settings, ...colors }
      // An empty gradient clears it, back to the plain background color.
      for (const field of schema.gradients) if (scheme.settings[field] === '') delete scheme.settings[field]
    }
    if (brand.headingFont) current.type_heading_font = brand.headingFont
    if (brand.bodyFont) current.type_body_font = brand.bodyFont
    if (brand.logo) current.logo = brand.logo
    else if (brand.logo === null) delete current.logo
  })
}

/**
 * Changes the current values in config/settings_data.json, keeping the rest of the file.
 * @param {string} theme
 * @param {(current: Record<string, any>) => void} change
 */
function updateSettings(theme, change) {
  updateJSON(theme, settingsData, (data) => {
    data.current = currentSettings(data)
    change(data.current)
  })
}

/**
 * Changes a Theme JSON file in place, keeping everything the change doesn't touch.
 * @param {string} theme
 * @param {string} name
 * @param {(data: any) => void | boolean} change Returning false leaves the file as it was.
 */
function updateJSON(theme, name, change) {
  const file = path.join(theme, name)
  const raw = readFileSync(file, 'utf8')
  const data = parseThemeJSON(raw, name)
  if (change(data) === false) return
  // Keep the comment header Shopify writes at the top of the file.
  const header = raw.match(/^\s*\/\*[\s\S]*?\*\/\s*/)?.[0] ?? ''
  writeFile(file, header + JSON.stringify(data, null, 2) + '\n')
}

// The Studio's logo lives in the Theme's assets, since only the Admin API can add images to the
// shop's Files (ADR-0004). The logo_asset setting names it; a Theme Editor logo takes precedence.
// The studio-logo name keeps it apart from assets the Merchant adds, which the Studio never touches.
/** @type {Record<string, { extension: string, matches: (file: Buffer) => boolean }>} */
const logoTypes = {
  'image/png': { extension: 'png', matches: (file) => file.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])) },
  'image/jpeg': { extension: 'jpg', matches: (file) => file.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) },
  'image/webp': {
    extension: 'webp',
    matches: (file) => file.toString('latin1', 0, 4) === 'RIFF' && file.toString('latin1', 8, 12) === 'WEBP',
  },
  'image/svg+xml': { extension: 'svg', matches: (file) => file.toString('utf8', 0, 1024).includes('<svg') },
}
const maxLogoBytes = 2 * 1024 * 1024

/**
 * @param {string | null} name
 * @returns {name is string}
 */
function isStudioLogo(name) {
  return Object.values(logoTypes).some(({ extension }) => name === `studio-logo.${extension}`)
}

/**
 * @param {string} theme
 * @param {string} contentType
 * @param {Buffer} file
 */
function uploadLogo(theme, contentType, file) {
  const type = logoTypes[contentType.split(';')[0].trim()]
  if (!type) throw new BadRequest('The logo must be a PNG, JPEG, WebP or SVG image.')
  if (!type.matches(file)) throw new BadRequest(`The file is not a ${type.extension.toUpperCase()} image.`)
  if (file.length > maxLogoBytes) throw new BadRequest('The logo must be at most 2 MB.')
  const name = `studio-logo.${type.extension}`
  const previous = readLogoAsset(theme)
  writeFile(path.join(theme, 'assets', name), file)
  if (previous !== name && isStudioLogo(previous)) removeFile(path.join(theme, 'assets', previous))
  updateSettings(theme, (current) => {
    current.logo_asset = name
  })
}

/**
 * Clears the logo_asset setting, and deletes the file only when the Studio wrote it.
 * @param {string} theme
 */
function removeLogo(theme) {
  const previous = readLogoAsset(theme)
  if (isStudioLogo(previous)) removeFile(path.join(theme, 'assets', previous))
  updateSettings(theme, (current) => {
    delete current.logo_asset
  })
}

/**
 * The logo file logo_asset names, for the Brand panel's preview.
 * @param {string} theme
 */
function readLogo(theme) {
  const name = readLogoAsset(theme)
  const type = Object.keys(logoTypes).find((type) => name?.endsWith(`.${logoTypes[type].extension}`))
  // logo_asset is a plain text setting: only serve a file name inside assets/.
  const file = name && path.basename(name) === name ? path.join(theme, 'assets', name) : null
  if (!name || !file || !type || !existsSync(file)) throw new NotFound('The Theme has no logo file.')
  return new File([readFileSync(file)], name, { type })
}

/**
 * @param {string} theme
 * @returns {string | null}
 */
function readLogoAsset(theme) {
  return currentSettings(readJSON(theme, settingsData)).logo_asset || null
}

/**
 * Checks a Brand change from the Studio UI or an agent before anything is written.
 * @param {unknown} change
 * @param {string[]} colorFields
 * @param {string[]} gradientFields
 * @returns {BrandChange}
 */
function validateBrand(change, colorFields, gradientFields) {
  if (typeof change !== 'object' || change === null || Array.isArray(change)) {
    throw new BadRequest('The Brand must be an object.')
  }
  const { colorSchemes, headingFont, bodyFont, logo, ...unknown } = /** @type {Record<string, unknown>} */ (change)
  const extra = Object.keys(unknown)
  if (extra.length > 0) throw new BadRequest(`Unknown Brand field: ${extra.join(', ')}.`)

  if (colorSchemes !== undefined) {
    if (typeof colorSchemes !== 'object' || colorSchemes === null) throw new BadRequest('colorSchemes must be an object.')
    for (const [id, colors] of Object.entries(colorSchemes)) {
      if (!schemeId.test(id)) throw new BadRequest(`Invalid color scheme id: ${id}.`)
      if (typeof colors !== 'object' || colors === null) throw new BadRequest(`Color scheme ${id} must be an object.`)
      for (const [field, value] of Object.entries(colors)) {
        if (gradientFields.includes(field)) {
          if (typeof value !== 'string' || (value !== '' && !cssGradient.test(value))) {
            throw new BadRequest(`${id}.${field} must be a CSS gradient like linear-gradient(180deg, #FFFFFF, #EEEEEE), or empty.`)
          }
          continue
        }
        if (!colorFields.includes(field)) {
          throw new BadRequest(`Color schemes have no ${field} color; they have ${[...colorFields, ...gradientFields].join(', ')}.`)
        }
        if (typeof value !== 'string' || !hexColor.test(value)) {
          throw new BadRequest(`${id}.${field} must be a hex color like #1A2B3C.`)
        }
      }
    }
  }
  for (const [name, font] of Object.entries({ headingFont, bodyFont })) {
    if (font !== undefined && (typeof font !== 'string' || !fontHandles.has(font))) {
      throw new BadRequest(`${name} must be a font handle from Shopify's font library, like work_sans_n4.`)
    }
  }
  if (logo !== undefined && logo !== null && (typeof logo !== 'string' || !shopImage.test(logo))) {
    throw new BadRequest('logo must be a shop image like shopify://shop_images/logo.png, or null.')
  }
  return /** @type {BrandChange} */ (change)
}

/**
 * The sections of a JSON template, in page order.
 * @param {string} theme
 * @param {string} file
 * @returns {TemplateSection[]}
 */
function readTemplate(theme, file) {
  const template = readJSON(theme, file)
  return template.order.map((/** @type {string} */ id) => {
    const { type, settings } = template.sections[id]
    const setting = colorSchemeSetting(theme, type)
    if (!setting) return { id, type }
    return { id, type, colorScheme: settings?.[setting.id] ?? setting.default ?? null }
  })
}

// The pages the Studio composes, and their JSON template.
const pages = /** @type {const} */ ({
  home: 'templates/index.json',
  product: 'templates/product.json',
  collection: 'templates/collection.json',
  page: 'templates/page.json',
  contact: 'templates/page.contact.json',
  cart: 'templates/cart.json',
  search: 'templates/search.json',
  blog: 'templates/blog.json',
  article: 'templates/article.json',
  '404': 'templates/404.json',
  collections: 'templates/list-collections.json',
})

// The section groups every page shares, whose sections the Studio edits.
const groups = /** @type {const} */ ({
  header: 'sections/header-group.json',
  footer: 'sections/footer-group.json',
})

/**
 * @template T
 * @param {(file: string) => T} read Reads one page from its JSON template.
 * @returns {Record<Page, T>}
 */
function perPage(read) {
  return /** @type {Record<Page, T>} */ (Object.fromEntries(Object.entries(pages).map(([page, file]) => [page, read(file)])))
}

const sectionName = /^[a-z0-9_-]+$/i
// Shopify's limit per JSON template.
const maxSections = 25

/**
 * Adds a section at the end of a page. A catalog section the Theme doesn't have yet is copied
 * into it first; a section file already in the Theme is never overwritten (copy-once).
 * @param {string} theme
 * @param {string} catalog
 * @param {string} file The page's JSON template.
 * @param {unknown} body
 */
function addSection(theme, catalog, file, body) {
  const { type } = /** @type {{ type?: unknown }} */ (body ?? {})
  if (typeof type !== 'string' || !sectionName.test(type)) throw new BadRequest('type must be a section name, like hero.')
  const own = path.join(theme, 'sections', `${type}.liquid`)
  const source = path.join(catalog, 'sections', `${type}.liquid`)
  const placed = existsSync(own) ? own : source
  if (!existsSync(placed)) throw new NotFound(`Neither the Theme nor the Section Catalog has a ${type} section.`)
  if (!goesOn(placed, file)) throw new BadRequest(`The ${type} section can't go on ${file}.`)
  const { limit, presets } = readSchema(placed) ?? {}
  updateJSON(theme, file, (template) => {
    if (template.order.length >= maxSections) throw new BadRequest(`A page holds at most ${maxSections} sections.`)
    const count = Object.values(template.sections).filter((/** @type {{ type: string }} */ section) => section.type === type).length
    if (typeof limit === 'number' && count >= limit) throw new BadRequest(`A page holds at most ${limit} ${type} section${limit === 1 ? '' : 's'}.`)
    const id = newId(type, template.sections)
    template.sections[id] = fromPreset(type, presets?.[0])
    template.order.push(id)
    if (!existsSync(own)) {
      addMissingFromBaseTheme(theme)
      writeFile(own, readFileSync(source))
    }
  })
}

/**
 * A new section's template entry: the settings and blocks of its first preset, as the Theme Editor adds it,
 * so a section like testimonials starts with its example blocks.
 * @param {string} type
 * @param {{ settings?: object, blocks?: unknown } | undefined} preset
 */
function fromPreset(type, preset) {
  /** @type {{ type: string, settings: object, blocks?: Record<string, { type: string, settings: object }>, block_order?: string[] }} */
  const section = { type, settings: structuredClone(preset?.settings ?? {}) }
  // ponytail: section blocks as a list only, the form the Section Catalog uses; theme blocks keyed by id are left out.
  if (Array.isArray(preset?.blocks) && preset.blocks.length) {
    section.blocks = {}
    section.block_order = []
    for (const block of /** @type {{ type: string, settings?: object }[]} */ (preset.blocks)) {
      const blockId = newId(block.type, section.blocks)
      section.blocks[blockId] = { type: block.type, settings: structuredClone(block.settings ?? {}) }
      section.block_order.push(blockId)
    }
  }
  return section
}

/**
 * A new id for a section or block of this type, like hero_1a2b3c, that `taken` doesn't hold.
 * @param {string} type
 * @param {object} taken
 */
function newId(type, taken) {
  let id
  do id = `${type}_${randomBytes(3).toString('hex')}`
  while (id in taken)
  return id
}

/**
 * Adds the locale keys, theme settings, theme blocks and snippets of the Base Theme that a Theme made from
 * an older one lacks, since catalog sections use them. Nothing the Theme already has changes. The shop's
 * language gets the English text, so Theme Check's MatchingTranslations still passes until it's translated.
 * @param {string} theme
 */
function addMissingFromBaseTheme(theme) {
  for (const dir of ['blocks', 'snippets']) {
    mkdirSync(path.join(theme, dir), { recursive: true })
    for (const name of readdirSync(path.join(baseTheme, dir))) {
      const own = path.join(theme, dir, name)
      if (!existsSync(own)) writeFile(own, readFileSync(path.join(baseTheme, dir, name)))
    }
  }
  const storefront = readJSON(baseTheme, 'locales/en.default.json')
  const schema = readJSON(baseTheme, 'locales/en.default.schema.json')
  for (const name of readdirSync(path.join(theme, 'locales'))) {
    if (!name.endsWith('.json')) continue
    const base = name.endsWith('.schema.json') ? schema : storefront
    updateJSON(theme, `locales/${name}`, (locale) => addMissingKeys(locale, base))
  }
  const baseGroups = readJSON(baseTheme, 'config/settings_schema.json')
  updateJSON(theme, 'config/settings_schema.json', (groups) => addMissingSettings(groups, baseGroups))
}

/**
 * Adds the settings of `baseGroups` whose id no group in `groups` has, into the group of the same name
 * or, when there is none, as a new group. Returns whether it added any.
 * @param {{ name: string, settings?: { id?: string }[] }[]} groups
 * @param {{ name: string, settings?: { id?: string }[] }[]} baseGroups
 */
function addMissingSettings(groups, baseGroups) {
  // Matched by id across all groups, so a setting the Creator moved or a renamed group isn't added twice.
  const ids = new Set(groups.flatMap((group) => (group.settings ?? []).map((setting) => setting.id)))
  let added = false
  for (const baseGroup of baseGroups) {
    const missing = (baseGroup.settings ?? []).filter((setting) => setting.id && !ids.has(setting.id))
    if (missing.length === 0) continue
    const group = groups.find((other) => other.name === baseGroup.name)
    if (group) {
      group.settings = [...(group.settings ?? []), ...missing]
    } else {
      groups.push({ ...baseGroup, settings: (baseGroup.settings ?? []).filter((setting) => !setting.id || !ids.has(setting.id)) })
    }
    added = true
  }
  return added
}

/**
 * Copies the keys of `base` that `target` lacks, at any depth. Returns whether it added any.
 * @param {Record<string, any>} target
 * @param {Record<string, any>} base
 * @returns {boolean}
 */
function addMissingKeys(target, base) {
  let added = false
  for (const [key, value] of Object.entries(base)) {
    if (!(key in target)) {
      target[key] = value
      added = true
    } else if (isObject(value) && isObject(target[key])) {
      added = addMissingKeys(target[key], value) || added
    }
  }
  return added
}

/** @param {unknown} value */
function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Removes a section from a page. Its file stays in the Theme.
 * @param {string} theme
 * @param {string} file The page's JSON template.
 * @param {string} id
 */
function removeSection(theme, file, id) {
  updateJSON(theme, file, (template) => {
    findSection(template, file, id)
    // Shopify rejects a JSON template without sections.
    if (template.order.length === 1) throw new BadRequest(`${file} needs at least one section.`)
    delete template.sections[id]
    template.order = template.order.filter((/** @type {string} */ other) => other !== id)
  })
}

/**
 * Puts a page's sections in a new order, which must list each of them exactly once.
 * @param {string} theme
 * @param {string} file The page's JSON template.
 * @param {unknown} body
 */
function reorderSections(theme, file, body) {
  updateJSON(theme, file, (template) => {
    template.order = checkOrder(body, template.order, `each section id of ${file}`)
  })
}

/**
 * The `order` of a request body, when it lists each of `ids` exactly once.
 * @param {unknown} body
 * @param {string[]} ids
 * @param {string} what Names the ids in the error.
 * @returns {string[]}
 */
function checkOrder(body, ids, what) {
  const { order } = /** @type {{ order?: unknown }} */ (body ?? {})
  const current = new Set(ids)
  if (!Array.isArray(order) || order.length !== current.size || new Set(order).size !== order.length || !order.every((id) => current.has(id))) {
    throw new BadRequest(`order must list ${what} exactly once.`)
  }
  return order
}

// Shopify's most blocks in a section, and its max_blocks when the schema sets none.
const maxBlocks = 50

/**
 * The block types a section's schema lets a page add: its own blocks, not app or theme blocks.
 * Only its own blocks have a name; `@app`, `@theme` and a theme block's type, like custom-liquid, don't.
 * @param {{ blocks?: { type: string, name?: string, limit?: number }[] }} schema
 */
function blockTypes(schema) {
  return (schema.blocks ?? []).filter((block) => block.name)
}

/**
 * A section's blocks in order: block_order, or the key order of blocks when a template has no block_order.
 * @param {{ blocks?: Record<string, { type: string }>, block_order?: string[] }} section
 */
function blockOrder(section) {
  return section.block_order ?? Object.keys(section.blocks ?? {})
}

/**
 * Adds a block at the end of a section, within its schema's max_blocks and the block type's limit.
 * @param {string} theme
 * @param {string} file The page's JSON template or section group.
 * @param {string} id
 * @param {unknown} body `{ type }`
 */
function addBlock(theme, file, id, body) {
  const { type } = /** @type {{ type?: unknown }} */ (body ?? {})
  if (typeof type !== 'string') throw new BadRequest('type must be a block type, like testimonial.')
  updateJSON(theme, file, (template) => {
    const section = findSection(template, file, id)
    const schema = readSchema(path.join(theme, 'sections', `${section.type}.liquid`)) ?? {}
    const types = blockTypes(schema)
    const blockType = types.find((candidate) => candidate.type === type)
    if (!blockType) {
      throw new BadRequest(`The ${section.type} section has no ${type} block; it takes ${types.map((t) => t.type).join(', ') || 'none'}.`)
    }
    const order = blockOrder(section)
    const limit = schema.max_blocks ?? maxBlocks
    if (order.length >= limit) throw new BadRequest(`The ${section.type} section holds at most ${limit} blocks.`)
    const count = order.filter((blockId) => section.blocks[blockId]?.type === type).length
    if (typeof blockType.limit === 'number' && count >= blockType.limit) {
      throw new BadRequest(`The ${section.type} section holds at most ${blockType.limit} ${type} block${blockType.limit === 1 ? '' : 's'}.`)
    }
    section.blocks ??= {}
    const blockId = newId(type, section.blocks)
    section.blocks[blockId] = { type, settings: {} }
    section.block_order = [...order, blockId]
  })
}

/**
 * Removes a block from a section. A section may be left with none.
 * @param {string} theme
 * @param {string} file The page's JSON template or section group.
 * @param {string} id
 * @param {string} blockId
 */
function removeBlock(theme, file, id, blockId) {
  updateJSON(theme, file, (template) => {
    const section = findSection(template, file, id)
    if (!Object.hasOwn(section.blocks ?? {}, blockId)) throw new NotFound(`The ${id} section has no block ${blockId}.`)
    section.block_order = blockOrder(section).filter((other) => other !== blockId)
    delete section.blocks[blockId]
  })
}

/**
 * Puts a section's blocks in a new order, which must list each of them exactly once.
 * @param {string} theme
 * @param {string} file The page's JSON template or section group.
 * @param {string} id
 * @param {unknown} body `{ order }`
 */
function reorderBlocks(theme, file, id, body) {
  updateJSON(theme, file, (template) => {
    const section = findSection(template, file, id)
    section.block_order = checkOrder(body, blockOrder(section), `each block id of the ${id} section`)
  })
}

/**
 * Changes a page's section: its color scheme, its settings and its blocks' settings.
 * @param {string} theme
 * @param {string} file The page's JSON template or section group.
 * @param {string} id
 * @param {unknown} body `{ colorScheme?, settings?: { <setting id>: value }, blocks?: { <block id>: { <setting id>: value } } }`
 */
function updateSection(theme, file, id, body) {
  const { colorScheme, settings, blocks, ...unknown } = /** @type {Record<string, unknown>} */ (body ?? {})
  const extra = Object.keys(unknown)
  if (extra.length > 0) throw new BadRequest(`Unknown section field: ${extra.join(', ')}.`)
  if (colorScheme === undefined && settings === undefined && blocks === undefined) {
    throw new BadRequest('Send colorScheme, settings or blocks.')
  }
  const schemes = Object.keys(readBrand(theme).colorSchemes)
  if (colorScheme !== undefined && (typeof colorScheme !== 'string' || !schemes.includes(colorScheme))) {
    throw new BadRequest(`colorScheme must be one of the Brand's color schemes: ${schemes.join(', ')}.`)
  }
  if (settings !== undefined && !isObject(settings)) throw new BadRequest('settings must be an object.')
  if (blocks !== undefined && (!isObject(blocks) || !Object.values(/** @type {object} */ (blocks)).every(isObject))) {
    throw new BadRequest('blocks must map block ids to objects of settings.')
  }
  updateJSON(theme, file, (template) => {
    const section = findSection(template, file, id)
    const schema = readSchema(path.join(theme, 'sections', `${section.type}.liquid`)) ?? {}
    if (colorScheme !== undefined) {
      const setting = colorSchemeSetting(theme, section.type)
      if (!setting) throw new BadRequest(`The ${section.type} section has no color scheme setting.`)
      section.settings = { ...section.settings, [setting.id]: colorScheme }
    }
    if (settings) setValues(section, settings, schema.settings, `the ${section.type} section`)
    for (const [blockId, values] of Object.entries(/** @type {Record<string, object>} */ (blocks ?? {}))) {
      const block = section.blocks?.[blockId]
      if (!Object.hasOwn(section.blocks ?? {}, blockId)) throw new BadRequest(`The ${id} section has no block ${blockId}.`)
      const blockSchema = schema.blocks?.find((/** @type {{ type: string }} */ candidate) => candidate.type === block.type)
      setValues(block, values, blockSchema?.settings, `the ${block.type} block`)
    }
  })
}

// The setting types the Studio edits as text. richtext holds HTML paragraphs, inline_richtext inline HTML.
const textTypes = new Set(['text', 'inline_richtext', 'richtext'])
// Settings that name a store resource by its handle, and the lists of handles.
const handleTypes = new Set(['collection', 'product', 'link_list'])
const listTypes = new Set(['collection_list', 'product_list'])
// Settings that pick one of their schema's options.
const optionTypes = new Set(['select', 'radio'])
const editableTypes = new Set([...textTypes, ...handleTypes, ...listTypes, ...optionTypes, 'url', 'checkbox', 'range', 'number'])
// Image and video settings, which the Studio only lists: they are picked in the Theme Editor (no Admin API, ADR-0004).
const mediaTypes = new Set(['image_picker', 'video', 'video_url'])
const handle = /^[^\s/]+$/
// The links a url setting takes: a store path, a web or mail link, or a shopify:// link to a store resource.
const link = /^(\/|https?:\/\/|mailto:|tel:|shopify:\/\/)\S*$/
// Shopify's most items in a collection_list or product_list.
const maxListItems = 50

/**
 * Checks values against a schema's settings, then writes them into a section's or block's settings. An empty
 * link, handle or list, or a null number, removes the setting, as the Theme Editor does.
 * @param {{ settings?: Record<string, unknown> }} target
 * @param {object} values
 * @param {SchemaSetting[] | undefined} schemaSettings
 * @param {string} owner Names the section or block in errors.
 */
function setValues(target, values, schemaSettings, owner) {
  for (const [key, value] of Object.entries(values)) {
    const setting = schemaSettings?.find((candidate) => candidate.id === key)
    if (!setting || !editableTypes.has(setting.type)) throw new BadRequest(`${key} is not a setting the Studio edits in ${owner}.`)
    if (setting.type === 'checkbox') {
      if (typeof value !== 'boolean') throw new BadRequest(`${key} must be true or false.`)
    } else if (setting.type === 'number') {
      if (value !== null && typeof value !== 'number') throw new BadRequest(`${key} must be a number, or null to clear it.`)
    } else if (setting.type === 'range') {
      const { min = 0, max = 0, step = 1 } = setting
      const steps = (Number(value) - min) / step
      if (typeof value !== 'number' || value < min || value > max || Math.abs(steps - Math.round(steps)) > 1e-9) {
        throw new BadRequest(`${key} must be a number from ${min} to ${max} in steps of ${step}.`)
      }
    } else if (optionTypes.has(setting.type)) {
      const options = (setting.options ?? []).map((option) => option.value)
      if (typeof value !== 'string' || !options.includes(value)) throw new BadRequest(`${key} must be one of: ${options.join(', ')}.`)
    } else if (listTypes.has(setting.type)) {
      const limit = setting.limit ?? maxListItems
      if (!Array.isArray(value) || !value.every((item) => typeof item === 'string' && handle.test(item)) || value.length > limit) {
        throw new BadRequest(`${key} must be a list of at most ${limit} handles, like ["summer-sale"].`)
      }
    } else if (typeof value !== 'string') {
      throw new BadRequest(`${key} must be a string.`)
    } else if (handleTypes.has(setting.type) && value !== '' && !handle.test(value)) {
      throw new BadRequest(`${key} must be a ${setting.type.replace('_', ' ')} handle, like summer-sale.`)
    } else if (setting.type === 'url' && value !== '' && !link.test(value)) {
      throw new BadRequest(`${key} must be a link like /collections/all, https://… or shopify://collections/<handle>.`)
    } else if (setting.type === 'richtext' && value.trim() !== '' && !/^\s*<(p|ul|ol|h[1-6])[\s>]/.test(value)) {
      // Shopify stores richtext as block HTML and refuses a value that doesn't start with a block element.
      throw new BadRequest(`${key} is rich text: HTML paragraphs like <p>…</p>.`)
    }
    target.settings ??= {}
    if (value === null || (!textTypes.has(setting.type) && value.length === 0)) delete target.settings[key]
    else target.settings[key] = value
  }
}

/**
 * @typedef {{ id?: string, type: string, label?: string, default?: unknown, limit?: number, min?: number, max?: number, step?: number, unit?: string, options?: { value: string, label: string }[] }} SchemaSetting
 * @typedef {{ id: string, type: string, label: string, value: string | string[] | boolean | number | null, min?: number, max?: number, step?: number, unit?: string, options?: { value: string, label: string }[] }} Setting
 *   A list setting's value is a list of handles, a checkbox's a boolean, a range's a number, a number's a number or null. A range
 *   has its bounds and step, a select or radio its options.
 * @typedef {{ id: string, type: string, label: string, set: boolean }} MediaSetting An image or video setting, and whether it holds one.
 * @typedef {{
 *   id: string, type: string, name: string, colorScheme?: string | null, settings: Setting[], media: MediaSetting[],
 *   blocks: { id: string, type: string, name: string, settings: Setting[], media: MediaSetting[] }[], blockTypes: { type: string, name: string }[], maxBlocks: number,
 * }} SectionDetails blockTypes are the blocks the section can add, up to maxBlocks in all.
 */

/**
 * A page's section with the settings the Studio edits and its blocks', labelled in the Theme's schema language.
 * @param {string} theme
 * @param {string} file The page's JSON template or section group.
 * @param {string} id
 * @returns {SectionDetails}
 */
function readSection(theme, file, id) {
  const section = findSection(readJSON(theme, file), file, id)
  const schema = readSchema(path.join(theme, 'sections', `${section.type}.liquid`)) ?? {}
  const translate = schemaTranslator(theme)
  /** @param {SchemaSetting[] | undefined} schemaSettings @param {Record<string, unknown> | undefined} values @returns {Setting[]} */
  const texts = (schemaSettings, values) =>
    (schemaSettings ?? []).flatMap(/** @returns {Setting[]} */ (setting) => {
      if (!setting.id || !editableTypes.has(setting.type)) return []
      const value = values?.[setting.id] ?? setting.default
      const read = { id: setting.id, type: setting.type, label: translate(setting.label ?? setting.id) }
      if (setting.type === 'checkbox') return [{ ...read, value: value === true }]
      if (setting.type === 'number') return [{ ...read, value: typeof value === 'number' ? value : null }]
      if (setting.type === 'range') {
        const { min = 0, max = 0, step = 1, unit } = setting
        return [{ ...read, value: Number(value ?? min), min, max, step, ...(unit ? { unit: translate(unit) } : {}) }]
      }
      if (optionTypes.has(setting.type)) {
        const options = (setting.options ?? []).map((option) => ({ value: option.value, label: translate(option.label ?? option.value) }))
        return [{ ...read, value: String(value ?? ''), options }]
      }
      return [{ ...read, value: listTypes.has(setting.type) ? (Array.isArray(value) ? value.map(String) : []) : String(value ?? '') }]
    })
  /** @param {SchemaSetting[] | undefined} schemaSettings @param {Record<string, unknown> | undefined} values @returns {MediaSetting[]} */
  const media = (schemaSettings, values) =>
    (schemaSettings ?? [])
      .filter((setting) => setting.id && mediaTypes.has(setting.type))
      .map((setting) => {
        const id = /** @type {string} */ (setting.id)
        return { id, type: setting.type, label: translate(setting.label ?? id), set: Boolean(values?.[id] ?? setting.default) }
      })
  const color = colorSchemeSetting(theme, section.type)
  const blocks = section.blocks ?? {}
  return {
    id,
    type: section.type,
    name: translate(schema.name ?? section.type),
    ...(color ? { colorScheme: section.settings?.[color.id] ?? color.default ?? null } : {}),
    settings: texts(schema.settings, section.settings),
    media: media(schema.settings, section.settings),
    blocks: blockOrder(section).map((blockId) => {
      const block = blocks[blockId]
      const blockSchema = schema.blocks?.find((/** @type {{ type: string }} */ candidate) => candidate.type === block.type)
      return {
        id: blockId,
        type: block.type,
        name: translate(blockSchema?.name ?? block.type),
        settings: texts(blockSchema?.settings, block.settings),
        media: media(blockSchema?.settings, block.settings),
      }
    }),
    blockTypes: blockTypes(schema).map((block) => ({ type: block.type, name: translate(block.name ?? block.type) })),
    maxBlocks: schema.max_blocks ?? maxBlocks,
  }
}

/**
 * Resolves a schema's `t:` keys: from the Theme's default schema locale (`<code>.default.schema.json`), then
 * from English, then from the Base Theme (whose keys a newly copied catalog section may use).
 * @param {string} theme
 * @returns {(text: string) => string}
 */
function schemaTranslator(theme) {
  const names = readdirSync(path.join(theme, 'locales')).filter((name) => name.endsWith('.schema.json'))
  const shopDefault = names.find((name) => name.endsWith('.default.schema.json'))
  const locales = [shopDefault, 'en.default.schema.json', 'en.schema.json']
    .filter((name) => name && names.includes(name))
    .map((name) => readJSON(theme, `locales/${name}`))
  locales.push(readJSON(baseTheme, 'locales/en.default.schema.json'))
  return (text) => {
    if (!text.startsWith('t:')) return text
    const keys = text.slice(2).split('.')
    for (const locale of locales) {
      const value = keys.reduce((/** @type {any} */ node, key) => (isObject(node) ? node[key] : undefined), locale)
      if (typeof value === 'string') return value
    }
    return text
  }
}

/**
 * The name and description of every section in the Theme and the catalog, keyed by type. The description is
 * the `{% comment %}` a section file starts with.
 * @param {string} theme
 * @param {string} catalog
 * @returns {Record<string, { name: string, description: string }>}
 */
function readSectionInfo(theme, catalog) {
  const translate = schemaTranslator(theme)
  /** @type {Record<string, { name: string, description: string }>} */
  const info = {}
  // The Theme's own copy wins over the catalog's.
  for (const dir of [catalog, theme]) {
    for (const file of readdirSync(path.join(dir, 'sections'))) {
      if (!file.endsWith('.liquid')) continue
      const source = readFileSync(path.join(dir, 'sections', file), 'utf8')
      const type = file.slice(0, -'.liquid'.length)
      info[type] = {
        name: translate(readSchema(path.join(dir, 'sections', file))?.name ?? type),
        // A Theme copy made before the catalog section had a description keeps the catalog's.
        description:
          source.match(/^\s*{%-?\s*comment\s*-?%}([\s\S]*?){%-?\s*endcomment\s*-?%}/)?.[1].trim().replace(/\s+/g, ' ') ||
          info[type]?.description ||
          '',
      }
    }
  }
  return info
}

/**
 * The section with this id; a 404 when the page has none.
 * @param {Record<string, any>} template
 * @param {string} file The page's JSON template or section group.
 * @param {string} id
 */
function findSection(template, file, id) {
  if (!Object.hasOwn(template.sections, id)) throw new NotFound(`${file} has no section ${id}.`)
  return template.sections[id]
}

/**
 * The color scheme setting in a Theme section's schema, if it has one.
 * @param {string} theme
 * @param {string} type
 * @returns {{ id: string, default?: string } | undefined}
 */
function colorSchemeSetting(theme, type) {
  const file = path.join(theme, 'sections', `${type}.liquid`)
  if (!sectionName.test(type) || !existsSync(file)) return undefined
  return readSchema(file)?.settings?.find((/** @type {{ type: string }} */ setting) => setting.type === 'color_scheme')
}

/**
 * The parsed `{% schema %}` of a section file, if it has a valid one.
 * @param {string} file
 */
function readSchema(file) {
  const schema = readFileSync(file, 'utf8').match(/{%-?\s*schema\s*-?%}([\s\S]*?){%-?\s*endschema\s*-?%}/)?.[1]
  const data = schema ? parseJSON(schema) : undefined
  return !data || data instanceof Error ? undefined : data
}

/**
 * Whether a section may go on a page: `enabled_on` limits a section like the header to its section group,
 * or the main product to product templates.
 * @param {string} sectionFile
 * @param {string} template The page's JSON template.
 */
function goesOn(sectionFile, template) {
  const enabledOn = readSchema(sectionFile)?.enabled_on
  // An alternate template like page.contact takes the sections of its type.
  const type = path.basename(template, '.json').split('.')[0]
  return !enabledOn || (enabledOn.templates ?? []).some((/** @type {string} */ other) => other === '*' || other === type)
}

/**
 * The sections in a folder laid out like a theme that a page can take.
 * @param {string} dir
 * @param {string} template The page's JSON template.
 */
function listSections(dir, template) {
  return readdirSync(path.join(dir, 'sections'))
    .filter((file) => file.endsWith('.liquid') && goesOn(path.join(dir, 'sections', file), template))
    .map((file) => file.slice(0, -'.liquid'.length))
    .sort()
}

/**
 * The Custom Sections a page can take: the Theme's sections that neither the Base Theme nor the catalog has.
 * @param {string} theme
 * @param {string} catalog
 * @param {string} template The page's JSON template.
 */
function listCustomSections(theme, catalog, template) {
  return listSections(theme, template).filter(
    (type) => ![baseTheme, catalog].some((dir) => existsSync(path.join(dir, 'sections', `${type}.liquid`))),
  )
}

// Needs read_products for collections and products, read_online_store_navigation for menus.
const storeScopes = 'read_products,read_online_store_navigation'
const storeQuery = `{
  collections(first: 250, sortKey: TITLE) { nodes { handle title } }
  products(first: 250, sortKey: TITLE) { nodes { handle title } }
  menus(first: 250) { nodes { handle title } }
}`

/**
 * @typedef {{ handle: string, title: string }} StoreResource
 * @typedef {{ collections: StoreResource[], products: StoreResource[], menus: StoreResource[] }} StoreResources
 */

/**
 * Reads the store's collections, products and menus with the Admin API, through `shopify store execute` and the
 * auth `shopify store auth` stored (ADR-0006). The answer is kept a minute, so the inspector opens fast.
 * @param {string} cli
 * @param {string} store
 * @returns {() => Promise<StoreResources>}
 */
function storeReader(cli, store) {
  /** @type {{ at: number, resources: Promise<StoreResources> } | null} */
  let cached = null
  return () => {
    if (cached && Date.now() - cached.at < 60_000) return cached.resources
    const resources = readStore(cli, store)
    const entry = { at: Date.now(), resources }
    cached = entry
    resources.catch(() => {
      if (cached === entry) cached = null
    })
    return resources
  }
}

/**
 * @param {string} cli
 * @param {string} store
 * @returns {Promise<StoreResources>}
 */
async function readStore(cli, store) {
  /** @type {string} */
  let output
  try {
    // ponytail: the first 250 of each; a search field querying the store is the upgrade for bigger shops.
    // No --allow-mutations: the CLI refuses anything but a query.
    output = (await promisify(execFile)(cli, ['store', 'execute', '--store', store, '--query', storeQuery, '--json'], { timeout: 60_000 })).stdout
  } catch (error) {
    const { stderr, message } = /** @type {{ stderr?: string, message: string }} */ (error)
    throw new Conflict(
      `The Studio lists the store's collections, products and menus through the Shopify CLI. ` +
        `Run \`shopify store auth --store ${store} --scopes ${storeScopes}\` in a terminal, then try again. ` +
        `The CLI said: ${(stderr || message).replace(/[│╭╮╰╯─]/g, ' ').replace(/\s+/g, ' ').trim().slice(-300)}`,
    )
  }
  const data = JSON.parse(output.slice(output.indexOf('{')))
  /** @param {{ nodes?: StoreResource[] } | undefined} connection */
  const list = (connection) => (connection?.nodes ?? []).map(({ handle, title }) => ({ handle, title }))
  return { collections: list(data.collections), products: list(data.products), menus: list(data.menus) }
}

/**
 * Runs Theme Check on a Theme.
 * @param {string} theme
 * @returns {Promise<Offense[]>}
 */
export async function validate(theme) {
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
