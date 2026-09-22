// The Studio server: Vite serves the React UI from studio/, and the studioApi
// plugin adds the Node file API over the Theme folder on disk.
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { buffer, json } from 'node:stream/consumers'
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
      /**
       * @param {string} url
       * @param {string} method
       * @param {(req: import('node:http').IncomingMessage) => Promise<unknown>} handle
       */
      function route(url, method, handle) {
        server.middlewares.use(url, (req, res, next) => {
          // Connect matches path prefixes; a route only answers its exact path.
          if (req.method !== method || new URL(req.url ?? '/', 'http://studio').pathname !== '/') return next()
          handle(req)
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
      route('/api/theme', 'GET', () => readThemeState(theme, catalog))
      route('/api/brand', 'PUT', async (req) => {
        const brand = await json(req).catch(() => {
          throw new BadRequest('The request body is not JSON.')
        })
        setBrand(theme, brand)
        return readThemeState(theme, catalog)
      })
      route('/api/brand/logo', 'GET', async () => readLogo(theme))
      route('/api/brand/logo', 'PUT', async (req) => {
        uploadLogo(theme, req.headers['content-type'] ?? '', await buffer(req))
        return readThemeState(theme, catalog)
      })
      route('/api/brand/logo', 'DELETE', async () => {
        removeLogo(theme)
        return readThemeState(theme, catalog)
      })
    },
  }
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
 * @typedef {{ id: string, type: string }} TemplateSection
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
 * @returns {Promise<ThemeState>}
 */
async function readThemeState(theme, catalog) {
  return {
    home: readTemplate(theme, 'index'),
    catalog: listSections(catalog),
    brand: readBrand(theme),
    validation: await validate(theme),
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
  const file = path.join(theme, settingsData)
  const raw = readFileSync(file, 'utf8')
  const data = parseThemeJSON(raw, settingsData)
  data.current = currentSettings(data)
  change(data.current)
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
 * @param {string} name
 * @returns {TemplateSection[]}
 */
function readTemplate(theme, name) {
  const template = readJSON(theme, `templates/${name}.json`)
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
  // ponytail: full Theme Check on every read and write; cache the result once file watching exists (#7).
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
