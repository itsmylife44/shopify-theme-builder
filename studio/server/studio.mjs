// The Studio server: Vite serves the React UI from studio/, and the studioApi
// plugin adds the Node file API over the Theme folder on disk.
import { randomBytes } from 'node:crypto'
import { copyFileSync, existsSync, readFileSync, readdirSync, rmSync, watch, writeFileSync } from 'node:fs'
import path from 'node:path'
import { buffer, json } from 'node:stream/consumers'
import { fileURLToPath } from 'node:url'
import { Severity, check, parseJSON } from '@shopify/theme-check-node'
import { createServer } from 'vite'
import { startPreview } from './preview.mjs'

const studioDir = fileURLToPath(new URL('..', import.meta.url))
const defaultCatalog = fileURLToPath(new URL('../../catalog', import.meta.url))

/**
 * Starts the Studio for a Theme folder, with `shopify theme dev` for its preview. Nothing is written into the Theme.
 * @param {{ theme: string, catalog?: string, port?: number, cli?: string, store?: string }} options
 */
export async function startStudio({ theme, catalog = defaultCatalog, port, cli = 'shopify', store }) {
  theme = path.resolve(theme)
  for (const file of ['layout/theme.liquid', 'templates/index.json']) {
    if (!existsSync(path.join(theme, file))) throw new Error(`${theme} is not a Shopify theme: ${file} is missing.`)
  }
  const server = await createServer({
    root: studioDir,
    configFile: path.join(studioDir, 'vite.config.ts'),
    server: { port },
    plugins: [studioApi(theme, catalog, { cli, store })],
  })
  return server.listen()
}

/**
 * @param {string} theme
 * @param {string} catalog
 * @param {{ cli: string, store?: string }} preview
 * @returns {import('vite').Plugin}
 */
function studioApi(theme, catalog, { cli, store }) {
  return {
    name: 'studio-api',
    configureServer(server) {
      /** @type {Promise<Offense[]> | null} The latest Theme Check result, until a file changes. */
      let validation = null
      const readState = () => readThemeState(theme, catalog, (validation ??= validateOnce()))
      function validateOnce() {
        const result = validate(theme)
        result.catch(() => {
          if (validation === result) validation = null
        })
        return result
      }
      /** The Theme state after a Studio write, validated again. */
      function written() {
        validation = null
        return readState()
      }

      // The agent, the Theme Editor (pulled) or anything else may change the Theme: re-validate and tell the UI.
      /** @type {NodeJS.Timeout | undefined} */
      let notify
      const watcher = watch(theme, { recursive: true }, (_, file) => {
        if (file?.split(path.sep)[0] === '.git') return
        validation = null
        clearTimeout(notify)
        notify = setTimeout(() => server.ws.send('studio:theme'), 100)
      })

      const preview = startPreview({ cli, theme, store, onChange: (state) => server.ws.send('studio:preview', state) })
      const stop = () => preview.stop()
      process.on('exit', stop)
      server.httpServer?.once('close', () => {
        watcher.close()
        clearTimeout(notify)
        stop()
        process.off('exit', stop)
      })

      /**
       * A route answers its exact path; one ending in /:id also answers a single path segment after
       * that prefix, and hands it to the handler.
       * @param {string} url
       * @param {string} method
       * @param {(req: import('node:http').IncomingMessage, id: string) => Promise<unknown>} handle
       */
      function route(url, method, handle) {
        const [prefix, param] = url.split('/:')
        server.middlewares.use(prefix, (req, res, next) => {
          // Connect matches path prefixes and strips them from req.url.
          const rest = new URL(req.url ?? '/', 'http://studio').pathname
          const id = param ? rest.match(/^\/([^/]+)$/)?.[1] : rest === '/' ? '' : undefined
          if (req.method !== method || id === undefined) return next()
          Promise.resolve()
            .then(() => handle(req, decodeId(id)))
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
      route('/api/preview', 'GET', async () => preview.state)
      route('/api/brand', 'PUT', async (req) => {
        setBrand(theme, await readBody(req))
        return written()
      })
      route('/api/brand/logo', 'GET', async () => readLogo(theme))
      route('/api/brand/logo', 'PUT', async (req) => {
        uploadLogo(theme, req.headers['content-type'] ?? '', await buffer(req))
        return written()
      })
      route('/api/brand/logo', 'DELETE', async () => {
        removeLogo(theme)
        return written()
      })
      route('/api/home/sections', 'POST', async (req) => {
        addSection(theme, catalog, await readBody(req))
        return written()
      })
      route('/api/home/sections/:id', 'DELETE', async (_, id) => {
        removeSection(theme, id)
        return written()
      })
      route('/api/home/sections/:id', 'PATCH', async (req, id) => {
        setColorScheme(theme, id, await readBody(req))
        return written()
      })
      route('/api/home/order', 'PUT', async (req) => {
        reorderSections(theme, await readBody(req))
        return written()
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

/**
 * @typedef {{ file: string, line: number, severity: 'error' | 'warning', check: string, message: string }} Offense
 * @typedef {{ id: string, type: string, colorScheme?: string | null }} TemplateSection A section on a page; colorScheme is absent when its schema has no color scheme setting.
 * @typedef {{
 *   colorSchemes: Record<string, Record<string, string>>,
 *   colorFields: string[],
 *   headingFont: string,
 *   bodyFont: string,
 *   logo: string | null,
 *   logoAsset: string | null,
 * }} Brand
 * @typedef {{ home: TemplateSection[], catalog: string[], brand: Brand, validation: Offense[] }} ThemeState
 * @typedef {Partial<Pick<Brand, 'colorSchemes' | 'headingFont' | 'bodyFont' | 'logo'>>} BrandChange
 */

/**
 * @param {string} theme
 * @param {string} catalog
 * @param {Promise<Offense[]>} validation
 * @returns {Promise<ThemeState>}
 */
async function readThemeState(theme, catalog, validation) {
  return {
    home: readTemplate(theme, home),
    catalog: listSections(catalog),
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
  for (const field of group?.definition ?? []) if (field.type === 'color') colors[field.id] = field.default
  return { colors, headingFont: settings.type_heading_font?.default, bodyFont: settings.type_body_font?.default }
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
    colorSchemes[id] = Object.fromEntries(Object.keys(schema.colors).map((field) => [field, scheme.settings?.[field]]))
  }
  return {
    colorSchemes,
    colorFields: Object.keys(schema.colors),
    headingFont: current.type_heading_font ?? schema.headingFont,
    bodyFont: current.type_body_font ?? schema.bodyFont,
    logo: current.logo ?? null,
    logoAsset: current.logo_asset || null,
  }
}

const settingsData = 'config/settings_data.json'
const hexColor = /^#[0-9a-f]{6}$/i
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
  const brand = validateBrand(change, Object.keys(schema.colors))

  updateSettings(theme, (current) => {
    for (const [id, colors] of Object.entries(brand.colorSchemes ?? {})) {
      current.color_schemes ??= {}
      const scheme = (current.color_schemes[id] ??= { settings: { ...schema.colors } })
      scheme.settings = { ...scheme.settings, ...colors }
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
 * @param {(data: Record<string, any>) => void} change
 */
function updateJSON(theme, name, change) {
  const file = path.join(theme, name)
  const raw = readFileSync(file, 'utf8')
  const data = parseThemeJSON(raw, name)
  change(data)
  // Keep the comment header Shopify writes at the top of the file.
  const header = raw.match(/^\s*\/\*[\s\S]*?\*\/\s*/)?.[0] ?? ''
  writeFileSync(file, header + JSON.stringify(data, null, 2) + '\n')
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
  writeFileSync(path.join(theme, 'assets', name), file)
  if (previous !== name && isStudioLogo(previous)) rmSync(path.join(theme, 'assets', previous), { force: true })
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
  if (isStudioLogo(previous)) rmSync(path.join(theme, 'assets', previous), { force: true })
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
 * @returns {BrandChange}
 */
function validateBrand(change, colorFields) {
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
        if (!colorFields.includes(field)) {
          throw new BadRequest(`Color schemes have no ${field} color; they have ${colorFields.join(', ')}.`)
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

const home = 'templates/index.json'
const sectionName = /^[a-z0-9_-]+$/i
// Shopify's limit per JSON template.
const maxSections = 25

/**
 * Adds a section at the end of the home page. A catalog section the Theme doesn't have yet is copied
 * into it first; a section file already in the Theme is never overwritten (copy-once).
 * @param {string} theme
 * @param {string} catalog
 * @param {unknown} body
 */
function addSection(theme, catalog, body) {
  const { type } = /** @type {{ type?: unknown }} */ (body ?? {})
  if (typeof type !== 'string' || !sectionName.test(type)) throw new BadRequest('type must be a section name, like hero.')
  const file = path.join(theme, 'sections', `${type}.liquid`)
  const source = path.join(catalog, 'sections', `${type}.liquid`)
  if (!existsSync(file) && !existsSync(source)) throw new NotFound(`Neither the Theme nor the Section Catalog has a ${type} section.`)
  updateJSON(theme, home, (template) => {
    if (template.order.length >= maxSections) throw new BadRequest(`A page holds at most ${maxSections} sections.`)
    let id
    do id = `${type}_${randomBytes(3).toString('hex')}`
    while (id in template.sections)
    template.sections[id] = { type, settings: {} }
    template.order.push(id)
    if (!existsSync(file)) copyFileSync(source, file)
  })
}

/**
 * Removes a section from the home page. Its file stays in the Theme.
 * @param {string} theme
 * @param {string} id
 */
function removeSection(theme, id) {
  updateJSON(theme, home, (template) => {
    findHomeSection(template, id)
    // Shopify rejects a JSON template without sections.
    if (template.order.length === 1) throw new BadRequest('The home page needs at least one section.')
    delete template.sections[id]
    template.order = template.order.filter((/** @type {string} */ other) => other !== id)
  })
}

/**
 * Puts the home sections in a new order, which must list each of them exactly once.
 * @param {string} theme
 * @param {unknown} body
 */
function reorderSections(theme, body) {
  const { order } = /** @type {{ order?: unknown }} */ (body ?? {})
  updateJSON(theme, home, (template) => {
    const current = new Set(template.order)
    if (
      !Array.isArray(order) ||
      order.length !== current.size ||
      new Set(order).size !== order.length ||
      !order.every((id) => current.has(id))
    ) {
      throw new BadRequest('order must list each home section id exactly once.')
    }
    template.order = order
  })
}

/**
 * Sets the color scheme of a home section whose schema has a color scheme setting.
 * @param {string} theme
 * @param {string} id
 * @param {unknown} body
 */
function setColorScheme(theme, id, body) {
  const { colorScheme, ...unknown } = /** @type {Record<string, unknown>} */ (body ?? {})
  const extra = Object.keys(unknown)
  if (extra.length > 0) throw new BadRequest(`Unknown section field: ${extra.join(', ')}.`)
  const schemes = Object.keys(readBrand(theme).colorSchemes)
  if (typeof colorScheme !== 'string' || !schemes.includes(colorScheme)) {
    throw new BadRequest(`colorScheme must be one of the Brand's color schemes: ${schemes.join(', ')}.`)
  }
  updateJSON(theme, home, (template) => {
    const section = findHomeSection(template, id)
    const setting = colorSchemeSetting(theme, section.type)
    if (!setting) throw new BadRequest(`The ${section.type} section has no color scheme setting.`)
    section.settings = { ...section.settings, [setting.id]: colorScheme }
  })
}

/**
 * The home section with this id; a 404 when the home page has none.
 * @param {Record<string, any>} template
 * @param {string} id
 */
function findHomeSection(template, id) {
  if (!Object.hasOwn(template.sections, id)) throw new NotFound(`The home page has no section ${id}.`)
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
  const schema = readFileSync(file, 'utf8').match(/{%-?\s*schema\s*-?%}([\s\S]*?){%-?\s*endschema\s*-?%}/)?.[1]
  const data = schema ? parseJSON(schema) : undefined
  if (!data || data instanceof Error) return undefined
  return data.settings?.find((/** @type {{ type: string }} */ setting) => setting.type === 'color_scheme')
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
