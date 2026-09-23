// The Studio server: Vite serves the React UI from studio/, and the studioApi
// plugin adds the Node file API over the Theme folder on disk.
import { randomBytes } from 'node:crypto'
import { copyFileSync, existsSync, readFileSync, readdirSync, rmSync, statSync, watch, writeFileSync } from 'node:fs'
import path from 'node:path'
import { buffer, json } from 'node:stream/consumers'
import { fileURLToPath } from 'node:url'
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
  for (const file of ['layout/theme.liquid', ...Object.values(pages)]) {
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
      const readState = () => readThemeState(theme, catalog, (validation ??= validateOnce()))
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
      const frame = await startFrameProxy(() => (preview.state.status === 'running' ? preview.state.url : undefined))
      const stop = () => preview.stop()
      process.on('exit', stop)
      server.httpServer?.once('close', () => {
        watcher.close()
        frame.close()
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
          // A browser names the page behind a request in Origin. Only the Studio's own page may write: not a
          // script in the preview (served from the proxy's port) nor another website.
          if (method !== 'GET' && req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) {
            res.statusCode = 403
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'Only the Studio itself may change the Theme.' }))
            return
          }
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
      route('/api/frame', 'GET', async () => {
        const { state } = preview
        if (state.status !== 'running') throw new Conflict('The preview is not running yet.')
        return { url: frame.url, paths: await pagePaths(state.url) }
      })
      route('/api/brand', 'PUT', async (req) => {
        setBrand(theme, await readBody(req))
        return readStateAfterWrite()
      })
      route('/api/brand/logo', 'GET', async () => readLogo(theme))
      route('/api/brand/logo', 'PUT', async (req) => {
        uploadLogo(theme, req.headers['content-type'] ?? '', await buffer(req))
        return readStateAfterWrite()
      })
      route('/api/brand/logo', 'DELETE', async () => {
        removeLogo(theme)
        return readStateAfterWrite()
      })
      for (const [page, template] of Object.entries(pages)) {
        route(`/api/${page}/sections`, 'POST', async (req) => {
          addSection(theme, catalog, template, await readBody(req))
          return readStateAfterWrite()
        })
        route(`/api/${page}/sections/:id`, 'DELETE', async (_, id) => {
          removeSection(theme, template, id)
          return readStateAfterWrite()
        })
        route(`/api/${page}/sections/:id`, 'GET', async (_, id) => readSection(theme, template, id))
        route(`/api/${page}/sections/:id`, 'PATCH', async (req, id) => {
          updateSection(theme, template, id, await readBody(req))
          return readStateAfterWrite()
        })
        route(`/api/${page}/order`, 'PUT', async (req) => {
          reorderSections(theme, template, await readBody(req))
          return readStateAfterWrite()
        })
      }
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
 * @typedef {keyof typeof pages} Page
 * @typedef {Record<Page, TemplateSection[]> & { catalog: Record<Page, string[]>, custom: Record<Page, string[]>, sectionInfo: Record<string, { name: string, description: string }>, brand: Brand, validation: Offense[] }} ThemeState
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
    ...perPage((file) => readTemplate(theme, file)),
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
 * @param {(data: any) => void | boolean} change Returning false leaves the file as it was.
 */
function updateJSON(theme, name, change) {
  const file = path.join(theme, name)
  const raw = readFileSync(file, 'utf8')
  const data = parseThemeJSON(raw, name)
  if (change(data) === false) return
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

// The pages the Studio composes, and their JSON template.
const pages = /** @type {const} */ ({
  home: 'templates/index.json',
  product: 'templates/product.json',
  collection: 'templates/collection.json',
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
    let id
    do id = `${type}_${randomBytes(3).toString('hex')}`
    while (id in template.sections)
    template.sections[id] = fromPreset(type, presets?.[0])
    template.order.push(id)
    if (!existsSync(own)) {
      addMissingFromBaseTheme(theme)
      copyFileSync(source, own)
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
      let blockId
      do blockId = `${block.type}_${randomBytes(3).toString('hex')}`
      while (blockId in section.blocks)
      section.blocks[blockId] = { type: block.type, settings: structuredClone(block.settings ?? {}) }
      section.block_order.push(blockId)
    }
  }
  return section
}

/**
 * Adds the locale keys and theme settings of the Base Theme that a Theme made from an older one lacks,
 * since catalog sections use them. Nothing the Theme already has changes. The shop's language gets the
 * English text, so Theme Check's MatchingTranslations still passes until it's translated.
 * @param {string} theme
 */
function addMissingFromBaseTheme(theme) {
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
  const { order } = /** @type {{ order?: unknown }} */ (body ?? {})
  updateJSON(theme, file, (template) => {
    const current = new Set(template.order)
    if (
      !Array.isArray(order) ||
      order.length !== current.size ||
      new Set(order).size !== order.length ||
      !order.every((id) => current.has(id))
    ) {
      throw new BadRequest(`order must list each section id of ${file} exactly once.`)
    }
    template.order = order
  })
}

/**
 * Changes a page's section: its color scheme, its text settings and its blocks' text settings.
 * @param {string} theme
 * @param {string} file The page's JSON template.
 * @param {string} id
 * @param {unknown} body `{ colorScheme?, settings?: { <setting id>: string }, blocks?: { <block id>: { <setting id>: string } } }`
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
    if (settings) section.settings = { ...section.settings, ...textValues(settings, schema.settings, `the ${section.type} section`) }
    for (const [blockId, values] of Object.entries(/** @type {Record<string, object>} */ (blocks ?? {}))) {
      const block = section.blocks?.[blockId]
      if (!Object.hasOwn(section.blocks ?? {}, blockId)) throw new BadRequest(`The ${id} section has no block ${blockId}.`)
      const blockSchema = schema.blocks?.find((/** @type {{ type: string }} */ candidate) => candidate.type === block.type)
      block.settings = { ...block.settings, ...textValues(values, blockSchema?.settings, `the ${block.type} block`) }
    }
  })
}

// The setting types the Studio edits as text. richtext holds HTML paragraphs, inline_richtext inline HTML.
const textTypes = new Set(['text', 'inline_richtext', 'richtext'])

/**
 * The values, checked against a schema's settings: each must name a text setting and be a string.
 * @param {object} values
 * @param {{ id?: string, type: string }[] | undefined} schemaSettings
 * @param {string} owner Names the section or block in errors.
 */
function textValues(values, schemaSettings, owner) {
  for (const [key, value] of Object.entries(values)) {
    const setting = schemaSettings?.find((candidate) => candidate.id === key)
    if (!setting || !textTypes.has(setting.type)) throw new BadRequest(`${key} is not a text setting of ${owner}.`)
    if (typeof value !== 'string') throw new BadRequest(`${key} must be a string.`)
    // Shopify stores richtext as block HTML and refuses a value that doesn't start with a block element.
    if (setting.type === 'richtext' && value.trim() !== '' && !/^\s*<(p|ul|ol|h[1-6])[\s>]/.test(value)) {
      throw new BadRequest(`${key} is rich text: HTML paragraphs like <p>…</p>.`)
    }
  }
  return values
}

/**
 * @typedef {{ id: string, type: string, label: string, value: string }} TextSetting
 * @typedef {{ id: string, type: string, name: string, colorScheme?: string | null, settings: TextSetting[], blocks: { id: string, type: string, name: string, settings: TextSetting[] }[] }} SectionDetails
 */

/**
 * A page's section with its text settings and its blocks', labelled in the Theme's schema language.
 * @param {string} theme
 * @param {string} file The page's JSON template.
 * @param {string} id
 * @returns {SectionDetails}
 */
function readSection(theme, file, id) {
  const section = findSection(readJSON(theme, file), file, id)
  const schema = readSchema(path.join(theme, 'sections', `${section.type}.liquid`)) ?? {}
  const translate = schemaTranslator(theme)
  /** @param {{ id?: string, type: string, label?: string, default?: string }[] | undefined} schemaSettings @param {Record<string, unknown> | undefined} values */
  const texts = (schemaSettings, values) =>
    (schemaSettings ?? []).flatMap((setting) =>
      setting.id && textTypes.has(setting.type)
        ? [{ id: setting.id, type: setting.type, label: translate(setting.label ?? setting.id), value: String(values?.[setting.id] ?? setting.default ?? '') }]
        : [],
    )
  const color = colorSchemeSetting(theme, section.type)
  const blocks = section.blocks ?? {}
  return {
    id,
    type: section.type,
    name: translate(schema.name ?? section.type),
    ...(color ? { colorScheme: section.settings?.[color.id] ?? color.default ?? null } : {}),
    settings: texts(schema.settings, section.settings),
    blocks: (section.block_order ?? Object.keys(blocks)).map((/** @type {string} */ blockId) => {
      const block = blocks[blockId]
      const blockSchema = schema.blocks?.find((/** @type {{ type: string }} */ candidate) => candidate.type === block.type)
      return { id: blockId, type: block.type, name: translate(blockSchema?.name ?? block.type), settings: texts(blockSchema?.settings, block.settings) }
    }),
  }
}

/**
 * Resolves a schema's `t:` keys: from the shop language's schema locale when the Theme has one, else from
 * English, then from the Base Theme (whose keys a newly copied catalog section may use).
 * @param {string} theme
 * @returns {(text: string) => string}
 */
function schemaTranslator(theme) {
  const names = readdirSync(path.join(theme, 'locales')).filter((name) => name.endsWith('.schema.json'))
  const shopLanguage = names.find((name) => !name.startsWith('en.default.'))
  const locales = [
    ...[shopLanguage, 'en.default.schema.json'].flatMap((name) => (name && names.includes(name) ? [readJSON(theme, `locales/${name}`)] : [])),
    readJSON(baseTheme, 'locales/en.default.schema.json'),
  ]
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
 * @param {string} file The page's JSON template.
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
  const type = path.basename(template, '.json')
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
