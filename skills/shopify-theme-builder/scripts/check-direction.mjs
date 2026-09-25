#!/usr/bin/env node
// Checks a Theme against the tells of references/design/tells.md and its DIRECTION.md, and prints one line per
// finding. Exits 1 when there is any. Usage: node <skill-dir>/scripts/check-direction.mjs <theme>
import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseJSON } from '@shopify/theme-check-node'

/** @typedef {{ check: string, file: string, message: string }} Finding */

const settingsData = 'config/settings_data.json'
const directionFile = 'DIRECTION.md'

// The copy tells of tells.md: filler words, vague headlines, performative labels, and em dashes.
const filler = [
  'elevat\\w*',
  'curated',
  'seamless\\w*',
  'unleash\\w*',
  'timeless',
  'crafted with care',
  'welcome to',
  'discover our collection',
  'quality you can trust',
  'field notes',
  'quietly trusted by',
  'on our shelves',
].map((word) => new RegExp(`\\b${word}\\b`, 'i'))
// Text that looks like a to-do left for later: TODO or TBD in capitals (Spanish "todo" is a word), bracketed text,
// lorem ipsum, "to be completed".
const todo = [
  /\b(TODO|TBD)\b/,
  /\[[^\]]*[a-z][^\]]*\]|\blorem ipsum\b|\b(da (completare|definire|inserire|confermare)|to be (completed|confirmed|added|defined|determined))\b/i,
]
// Liquid code, which isn't text shoppers see.
const liquid = /{{[\s\S]*?}}|{%[\s\S]*?%}/g
// A link or a handle (like a collection's), which the storefront doesn't show as text.
const notCopy = /^(\/|shopify:\/\/|https?:\/\/)|^[a-z0-9]+(-[a-z0-9]+)+$/

// The pairs a scheme keeps readable (WCAG AA): text at 4.5:1 (muted text as css-variables.liquid derives it, and the
// sale badge's text, the background on the accent), and the border and a button against the page at 3:1.
const contrastPairs = /** @type {const} */ ([
  ['text', 'background', 4.5],
  ['muted_text', 'background', 4.5],
  ['button_label', 'button', 4.5],
  ['accent', 'background', 4.5],
  ['border', 'background', 3],
  ['button', 'background', 3],
])

/**
 * Every finding on the Theme in `theme`.
 * @param {string} theme
 * @returns {Finding[]}
 */
export function checkDirection(theme) {
  const settings = readSettings(theme)
  const groups = readPages(theme, 'sections', (name) => name.endsWith('-group.json'))
  const pages = readPages(theme, 'templates', (name) => name.endsWith('.json'))
  const home = pages.filter((page) => page.file === 'templates/index.json')
  const direction = existsSync(path.join(theme, directionFile)) ? readFileSync(path.join(theme, directionFile), 'utf8') : ''
  const language = shopLanguage(theme, direction)
  // The home page, and each Direction's home, with the settings of the Direction's preset and its name.
  const listed = listFiles(theme, 'listings', () => true).flatMap((dir) =>
    readPages(theme, `${dir}/templates`, (name) => name === 'index.json').map((page) => {
      const preset = Object.keys(settings.presets).find((name) => listingName(name) === path.basename(dir))
      return { page, values: preset ? settings.presets[preset] : settings.values, name: preset ?? path.basename(dir) }
    }),
  )
  const homes = [...home.map((page) => ({ page, values: settings.values, name: chosen(direction, settings.preset) })), ...listed]
  // Every page the Theme shows: its templates, and each Direction's home.
  const shown = [...pages, ...listed.map(({ page }) => page)]
  // Each look the Theme ships: its presets (the Directions), or its current settings when it has none.
  /** @type {[string, Record<string, any>][]} */
  const looks = Object.keys(settings.presets).length > 0 ? Object.entries(settings.presets) : [['The Theme', settings.values]]
  return [
    ...checkContrast(settings),
    ...checkFonts(theme, settings),
    ...looks.flatMap(([name, values]) => checkHierarchy(name, values)),
    ...looks.flatMap(([name, values]) => checkMediaTint(name, values)),
    ...checkDistinct(settings.presets, listed),
    ...checkRadii(theme),
    ...pages.flatMap(checkRepeats),
    ...pages.flatMap(checkCallsToAction),
    ...pages.flatMap(checkEyebrows),
    ...pages.flatMap((page) => checkRatios(theme, settings, page)),
    ...home.flatMap(checkPlaceholders),
    ...homes.flatMap(({ page, values }) => checkHome(values, page)),
    ...homes.flatMap(({ page, name }) => checkStrategy(directionPart(direction, name), page)),
    ...[...groups, ...pages].flatMap(checkCopy),
    ...pages.filter((page) => /^templates\/product(\.|$)/.test(page.file)).flatMap((page) => checkDefaultText(page)),
    ...groups.flatMap((page) => checkDefaultText(page, language)),
    ...shown.flatMap(checkCenteredHero),
    ...shown.flatMap((page) => checkH1(theme, page)),
  ]
}

/** @typedef {{ id: string, type: string, settings: Record<string, any>, schema: any[], blocks: { type: string, settings: Record<string, any>, schema: any[] }[] }} Section */
/** @typedef {{ file: string, sections: Section[] }} Page */

/**
 * The JSON templates or section groups in `dir` that `pick` takes, each with its enabled sections in order,
 * their settings and blocks over the defaults of the section's schema, as the storefront shows them.
 * @param {string} theme
 * @param {string} dir
 * @param {(name: string) => boolean} pick
 * @returns {Page[]}
 */
function readPages(theme, dir, pick) {
  return listFiles(theme, dir, pick).map((file) => {
    const template = readJSON(theme, file)
    const sections = (template.order ?? []).flatMap((/** @type {string} */ id) => {
      const section = template.sections?.[id]
      if (!section || section.disabled) return []
      const schema = readSchema(theme, 'sections', section.type)
      const blocks = (section.block_order ?? Object.keys(section.blocks ?? {})).flatMap((/** @type {string} */ blockId) => {
        const block = section.blocks?.[blockId]
        if (!block || block.disabled) return []
        // A section's own block has its settings in the section's schema; a theme block, in its blocks/ file.
        const own = schema.blocks?.find((/** @type {any} */ other) => other.type === block.type && other.settings)
        const blockSettings = (own ?? readSchema(theme, 'blocks', block.type)).settings ?? []
        return [{ type: block.type, settings: { ...defaults(blockSettings), ...block.settings }, schema: blockSettings }]
      })
      return [{ id, type: section.type, settings: { ...defaults(schema.settings), ...section.settings }, schema: schema.settings ?? [], blocks }]
    })
    return { file, sections }
  })
}

/**
 * A section's or theme block's schema, or an empty one when the Theme lacks its file.
 * @param {string} theme
 * @param {'sections' | 'blocks'} dir
 * @param {string} type
 * @returns {any}
 */
function readSchema(theme, dir, type) {
  const file = path.join(theme, dir, `${type}.liquid`)
  if (!existsSync(file)) return {}
  const schema = readFileSync(file, 'utf8').match(/{%-?\s*schema\s*-?%}([\s\S]*?){%-?\s*endschema\s*-?%}/)?.[1]
  const data = schema ? parseJSON(schema) : {}
  return data instanceof Error ? {} : data
}

/** @param {any[] | undefined} settings */
function defaults(settings = []) {
  return Object.fromEntries(settings.filter((setting) => setting.id && 'default' in setting).map((setting) => [setting.id, setting.default]))
}

/**
 * A section type the page shows more than once: the same layout family repeated.
 * @param {Page} page
 * @returns {Finding[]}
 */
function checkRepeats({ file, sections }) {
  return [...groupBy(sections, (section) => section.type)].flatMap(([type, same]) =>
    same.length > 1 ? [finding('repeated-section', file, `${type} is on the page ${same.length} times: ${same.map((section) => section.id).join(', ')}.`)] : [],
  )
}

/**
 * The filler words and em dashes, and the to-dos, in the text of each section and block of a page.
 * @param {Page} page
 * @returns {Finding[]}
 */
function checkCopy({ file, sections }) {
  return sections.flatMap(owners).flatMap(({ owner, settings }) =>
    Object.entries(settings).flatMap(([id, value]) => {
      if (typeof value !== 'string' || notCopy.test(value)) return []
      const text = value.replace(/<[^>]*>/g, ' ')
      const words = filler.flatMap((word) => text.match(word)?.[0].toLowerCase() ?? [])
      if (text.includes('—')) words.push('—')
      const shown = text.replace(liquid, ' ')
      const left = todo.map((pattern) => shown.match(pattern)?.[0]).find(Boolean)
      return [
        ...(words.length > 0 ? [finding('copy', file, `${owner}, ${id}: ${words.map((word) => `"${word}"`).join(', ')}.`)] : []),
        ...(left ? [finding('todo', file, `${owner}, ${id}: "${left}". Write the fact, or leave it out and tell the Creator.`)] : []),
      ]
    }),
  )
}

// The setting types of running text, whose catalog default is example copy, not a label like a heading.
const runningText = new Set(['richtext', 'inline_richtext', 'textarea'])

/**
 * A section or block showing its catalog default running text, like an example shipping policy or a guidance
 * sentence: text shoppers read as the shop's fact. Given the shop's language, when it isn't English, its default
 * labels too (headings, button labels): the catalog's English.
 * @param {Page} page
 * @param {string} [language]
 * @returns {Finding[]}
 */
function checkDefaultText({ file, sections }, language = 'en') {
  const english = /^en\b/i.test(language)
  return sections.flatMap(owners).flatMap(({ owner, settings, schema }) =>
    schema
      .filter((setting) => (runningText.has(setting.type) || (!english && setting.type === 'text')) && setting.default?.trim() && settings[setting.id] === setting.default)
      .map((setting) =>
        finding(
          'default-text',
          file,
          `${owner}, ${setting.id}: ${
            runningText.has(setting.type)
              ? "the catalog's default text, not the shop's. Write the shop's own fact, or clear it."
              : `the catalog's English default, not the shop's language (${language}). Write it in the shop's language.`
          }`,
        ),
      ),
  )
}

/**
 * The shop's default language: the first code on the `- Languages:` line of DIRECTION.md's brief, or else the
 * Theme's default locale file's.
 * @param {string} theme
 * @param {string} direction DIRECTION.md
 */
function shopLanguage(theme, direction) {
  const locale = listFiles(theme, 'locales', (name) => /^[^.]+\.default\.json$/.test(name))[0]
  return direction.match(/^- Languages?: *([a-z]{2,3}(?:-[a-z]+)?)/im)?.[1] ?? locale?.slice('locales/'.length).split('.')[0] ?? 'en'
}

/**
 * A link a page gives more than one label: one intent, many labels. A label setting pairs with the link setting of
 * its name (`button_label` with `button_link`, `link_label` with `link`); a store link counts as its path.
 * @param {Page} page
 * @returns {Finding[]}
 */
function checkCallsToAction({ file, sections }) {
  const actions = sections.flatMap(owners).flatMap(({ owner, settings }) =>
    Object.entries(settings).flatMap(([id, label]) => {
      if (!id.endsWith('_label') || typeof label !== 'string' || !label.trim()) return []
      const link = settings[id.replace(/_label$/, '_link')] ?? settings[id.replace(/_label$/, '')]
      if (typeof link !== 'string' || !link.trim()) return []
      const intent = link.trim().toLowerCase().replace(/^shopify:\/\/(\w+)\//, '/$1/').replace(/(.)\/$/, '$1')
      return [{ owner, label: label.trim(), intent }]
    }),
  )
  return [...groupBy(actions, (action) => action.intent)].flatMap(([intent, same]) => {
    const labels = [...groupBy(same, (action) => action.label)]
    if (labels.length < 2) return []
    const list = labels.map(([label, uses]) => `"${label}" (${uses.map((use) => use.owner).join(', ')})`).join(', ')
    return [finding('cta-labels', file, `${intent} has ${labels.length} labels: ${list}. Give one intent one label.`)]
  })
}

// An aspect-ratio declaration, and the rules whose ratio isn't a photo's (a small icon's, like multicolumn's).
const aspectRatio = /(?<![-\w])aspect-ratio\s*:\s*([^;}]+)/g
const notImage = /iframe|video|model|--small/

// The ratio each `image_ratio` value gives a section's images, as the Base Theme's `image-ratio` snippet does; `card`
// is the product card's, and `natural` (each image's own) isn't counted.
/** @type {Record<string, string>} */
const imageRatios = { portrait: '4 / 5', square: '1 / 1', landscape: '4 / 3' }

/**
 * A page showing images in more than two ratios: the product card's ratio for a section that renders product cards,
 * the ratio a section's `image_ratio` setting picks, and each fixed aspect-ratio a section's stylesheet gives an image.
 * @param {string} theme
 * @param {ReturnType<typeof readSettings>} settings
 * @param {Page} page
 * @returns {Finding[]}
 */
function checkRatios(theme, { values }, { file, sections }) {
  const images = sections.flatMap((section) => {
    const source = path.join(theme, 'sections', `${section.type}.liquid`)
    if (!existsSync(source)) return []
    const text = readFileSync(source, 'utf8')
    const ratios = [...text.matchAll(aspectRatio)].flatMap((match) => {
      const before = text.slice(0, match.index)
      const open = before.lastIndexOf('{')
      const selector = before.slice(before.lastIndexOf('}', open) + 1, open)
      const value = match[1].trim()
      return notImage.test(selector) || /var\(|\{\{/.test(value) ? [] : [value]
    })
    const setting = section.settings.image_ratio
    if ((productCard.test(text) || setting === 'card') && values.card_image_ratio) ratios.push(values.card_image_ratio)
    if (imageRatios[setting]) ratios.push(imageRatios[setting])
    return [...new Set(ratios.map(normalRatio))].map((ratio) => ({ ratio, id: section.id }))
  })
  const ratios = groupBy(images, (image) => image.ratio)
  if (ratios.size <= 2) return []
  const list = [...ratios].map(([ratio, same]) => `${ratio} (${same.map((image) => image.id).join(', ')})`).join(', ')
  const card = values.card_image_ratio && normalRatio(values.card_image_ratio)
  const notCard = sections
    .filter((section) => imageRatios[section.settings.image_ratio] && normalRatio(imageRatios[section.settings.image_ratio]) !== card)
    .map((section) => section.id)
  const fix = notCard.length ? `: set image_ratio to card on ${notCard.join(', ')}` : ''
  return [finding('image-ratios', file, `${ratios.size} image ratios: ${list}. Keep a page to two at most, the card ratio among them${fix}.`)]
}

const productCard = /render\s+'product-card'/

/**
 * A ratio as `<width> / <height>`, like `1 / 1` for `1`.
 * @param {string} ratio
 */
function normalRatio(ratio) {
  const [width, height = '1'] = ratio.split('/').map((part) => part.trim())
  return `${width} / ${height}`
}

// The catalog sections whose layout shows an `image` setting, as a placeholder drawing when it's blank: the
// section's own, or each block's. Their other image settings (a video's cover, a testimonial's portrait) show nothing.
/** @type {Record<string, (settings: Record<string, any>) => 'section' | 'blocks' | undefined>} */
const shownImages = {
  hero: (settings) => (settings.video ? undefined : 'section'),
  'image-with-text': () => 'section',
  'editorial-split': () => 'section',
  lookbook: () => 'section',
  newsletter: (settings) => (settings.layout === 'split' ? 'section' : undefined),
  slideshow: () => 'blocks',
  'process-steps': () => 'blocks',
  'image-gallery': () => 'blocks',
  'logo-list': () => 'blocks',
  multicolumn: (settings) => (settings.layout === 'numbered' ? undefined : 'blocks'),
}
const fix = 'Set a photo (POST /api/files), or use a section or layout that needs none.'

/**
 * An image setting left blank in a section whose layout shows it, which the storefront renders as a placeholder
 * drawing.
 * @param {Page} page
 * @returns {Finding[]}
 */
function checkPlaceholders({ file, sections }) {
  return sections.flatMap((section) => {
    const shown = shownImages[section.type]?.(section.settings)
    if (shown === 'section') {
      return section.settings.image ? [] : [finding('placeholder', file, `${section.id}, image: blank, so it shows a placeholder drawing. ${fix}`)]
    }
    if (shown !== 'blocks') return []
    const blank = groupBy(
      section.blocks.filter((block) => !block.settings.image),
      (block) => block.type,
    )
    return [...blank].map(([type, same]) => {
      const [blocks, shows] = same.length === 1 ? ['block', 'it shows a placeholder drawing'] : ['blocks', 'they show placeholder drawings']
      return finding('placeholder', file, `${section.id}, ${same.length} ${type} ${blocks}, image: blank, so ${shows}. ${fix}`)
    })
  })
}

// What moves on a home page, on a phone too: these sections, and `motion: expressive`. Card hover doesn't count:
// phones can't hover.
/** @type {Record<string, (settings: Record<string, any>) => boolean>} */
const movingSections = {
  slideshow: () => true,
  marquee: () => true,
  testimonials: (settings) => settings.layout === 'carousel',
  'collection-list': (settings) => settings.layout === 'carousel',
}
// The sections that show only type when no image setting is set.
const typeOnlySections = ['rich-text', 'type-banner', 'newsletter', 'spec-tiles']
// The sections that show the catalog: what a shopper infers the shop sells from.
const merchandiseSections = ['featured-collection', 'collection-list', 'featured-product']

/**
 * A home page where nothing moves, of fewer than 6 sections, with type-only sections next to each other, or with no
 * products or collections in its first three sections.
 * @param {Record<string, any>} values the global settings the home shows with
 * @param {Page} page
 * @returns {Finding[]}
 */
function checkHome(values, { file, sections }) {
  const first = sections.slice(0, 3)
  const moves = values.motion === 'expressive' || sections.some((section) => movingSections[section.type]?.(section.settings))
  // The runs of type-only sections next to each other.
  /** @type {Section[][]} */
  const runs = [[]]
  for (const section of sections) {
    if (typeOnlySections.includes(section.type) && !section.settings.image) runs[runs.length - 1].push(section)
    else if (runs[runs.length - 1].length > 0) runs.push([])
  }
  return [
    ...(moves
      ? []
      : [
          finding(
            'movement',
            file,
            'No section moves: add a slideshow, a marquee, a testimonials or collection list carousel, or set motion to expressive.',
          ),
        ]),
    ...(sections.length < 6 ? [finding('section-count', file, `${sections.length} sections: a home has 6 to 8, alternating image-led and type-led.`)] : []),
    ...runs
      .filter((run) => run.length > 1)
      .map((run) =>
        finding('type-only', file, `${run.map((section) => section.id).join(', ')}: type-only sections in a row. Put an image-led section between them, or set an image.`),
      ),
    ...(first.length > 0 && !first.some((section) => merchandiseSections.includes(section.type))
      ? [
          finding(
            'merchandise',
            file,
            `${first.map((section) => section.id).join(', ')}: no featured collection, collection list or featured product in the first three sections, so shoppers see nothing to buy. Move one up, or add one.`,
          ),
        ]
      : []),
  ]
}

/**
 * A hero with its content in the middle center: the centered hero of tells.md.
 * @param {Page} page
 * @returns {Finding[]}
 */
function checkCenteredHero({ file, sections }) {
  return sections
    .filter((section) => section.type === 'hero' && section.settings.content_position === 'middle_center')
    .map((section) =>
      finding(
        'centered-hero',
        file,
        `${section.id}: content_position is middle_center, the centered hero of every template. Place the content where the Direction's home sketch puts it, like bottom_left.`,
      ),
    )
}

// The main color scheme and its inverse; a section on any other is on an accent's.
const mainSchemes = ['scheme-1', 'scheme-2']

/**
 * A home of a Committed or Full Direction with no section on an accent scheme: the color doesn't own a region, so the
 * accents scatter (tells.md).
 * @param {string | undefined} part the Direction's part of DIRECTION.md
 * @param {Page} page its home
 * @returns {Finding[]}
 */
function checkStrategy(part, { file, sections }) {
  const strategy = part?.match(/^- Color: *(committed|full)\b/im)?.[1].toLowerCase()
  if (!part || !strategy || sections.some((section) => section.settings.color_scheme && !mainSchemes.includes(section.settings.color_scheme))) return []
  const name = part.split('\n')[0].trim()
  return [
    finding('strategy', file, `${name}'s color strategy is ${strategy}, but no section of its home is on an accent scheme: put the sections the color owns on scheme-3.`),
  ]
}

// An h1 tag in a section's or block's Liquid, and the heading tag a section a page can open with (a hero, slideshow,
// type banner, image with text, editorial split, lookbook or collection list) makes an h1 when it's the page's first.
const h1 = /<h1[\s>]/g
const firstH1 = /assign heading_tag = 'h1'/

/**
 * A page without exactly one h1 (WCAG 1.3.1): each section counts the h1 tags in its Liquid and in its theme blocks'
 * (like the product title), and the first section the one it makes of its heading.
 * @param {string} theme
 * @param {Page} page
 * @returns {Finding[]}
 */
function checkH1(theme, { file, sections }) {
  /** @param {'sections' | 'blocks'} dir @param {string} type */
  const source = (dir, type) => {
    const liquid = path.join(theme, dir, `${type}.liquid`)
    return existsSync(liquid) ? readFileSync(liquid, 'utf8') : ''
  }
  // ponytail: counts tags in the source, not the rendered page; an h1 in a snippet or behind a setting isn't seen.
  const counts = sections.map((section, index) => {
    const text = source('sections', section.type)
    const count =
      (text.match(h1)?.length ?? 0) +
      (index === 0 && firstH1.test(text) ? 1 : 0) +
      section.blocks.reduce((sum, block) => sum + (source('blocks', block.type).match(h1)?.length ?? 0), 0)
    return { id: section.id, count }
  })
  const total = counts.reduce((sum, { count }) => sum + count, 0)
  if (total === 1) return []
  if (total === 0) {
    return [finding('h1', file, 'No h1: a page has exactly one, its main heading. Open the page with a hero, slideshow, type banner, image with text, editorial split, lookbook or collection list, whose heading is then the h1.')]
  }
  const ids = counts.flatMap(({ id, count }) => (count > 0 ? [id] : [])).join(', ')
  return [
    finding('h1', file, `${total} h1 headings (${ids}): a page has exactly one, its main heading. Keep one: a hero, slideshow, type banner, image with text, editorial split, lookbook or collection list has one only as the first section.`),
  ]
}

// A section setting that holds a small label above the heading.
const eyebrow = /eyebrow|kicker|overline|subheading|subtitle|tagline|pretitle/

/**
 * Eyebrow labels on more than one section in three of a page.
 * @param {Page} page
 * @returns {Finding[]}
 */
function checkEyebrows({ file, sections }) {
  const labelled = sections.filter((section) =>
    Object.entries(section.settings).some(([id, value]) => eyebrow.test(id) && typeof value === 'string' && value.trim()),
  )
  if (labelled.length * 3 <= sections.length) return []
  const ids = labelled.map((section) => section.id).join(', ')
  return [finding('eyebrows', file, `${labelled.length} of ${sections.length} sections carry an eyebrow label (${ids}); at most one in three should.`)]
}

/**
 * A section's settings and each of its blocks' settings, with who owns them.
 * @param {Section} section
 */
function owners(section) {
  return [
    { owner: section.id, settings: section.settings, schema: section.schema },
    ...section.blocks.map((block) => ({ owner: `${section.id}, ${block.type} block`, settings: block.settings, schema: block.schema })),
  ]
}

/**
 * A display under three times the body: the timid hierarchy of tells.md.
 * @param {string} name the preset's name
 * @param {Record<string, any>} values
 * @returns {Finding[]}
 */
function checkHierarchy(name, { type_display_size: display, type_body_size: body }) {
  if (!display || !body || display >= 3 * body) return []
  // Rounded down, so a failing ratio never shows as 3×.
  const shown = Math.floor((display / body) * 10) / 10
  return [
    finding(
      'hierarchy',
      settingsData,
      `${name}: the display (${display}px) is ${shown}× the body (${body}px). Set type_display_size to ${3 * body} or more (the best themes run 4× to 13×), or give the flat scale a reason in DIRECTION.md.`,
    ),
  ]
}

/**
 * Framed product images on a dark tint: css-variables.liquid multiplies an image only with a light tint (Liquid's
 * color_brightness over 150), so on a dark one the white box of a cut-out photo shows.
 * @param {string} name
 * @param {Record<string, any>} values
 * @returns {Finding[]}
 */
function checkMediaTint(name, { media_treatment: treatment, media_tint: tint }) {
  if (treatment !== 'framed' || !/^#[0-9a-f]{6}$/i.test(tint ?? '')) return []
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(tint.slice(i, i + 2), 16))
  if ((r * 299 + g * 587 + b * 114) / 1000 > 150) return []
  return [
    finding(
      'media',
      settingsData,
      `${name}: media_tint ${tint} is dark, so framed product photos sit on it unblended and their white box shows. Set a light tint (brightness over 150), or media_treatment full_bleed.`,
    ),
  ]
}

// The axes of directions.md the checker can read, by the style settings that decide them; composition is the home's
// opening section, and the signature isn't a setting.
/** @type {Record<string, RegExp>} */
const axes = {
  type: /^type_/,
  color: /^color_schemes$/,
  shape: /^(shape_family|border_width|button_)/,
  spacing: /^(density|page_width)$/,
  cards: /^card_/,
  media: /^media_/,
  motion: /^motion$/,
}

/**
 * Two Directions (presets) that differ in kind on fewer than three axes, and Directions that all use subtle motion. A
 * number differs in kind by a quarter or more (56px against 60px is one step); a choice, by any change.
 * @param {Record<string, Record<string, any>>} presets
 * @param {{ page: Page, name: string }[]} listed each Direction's home
 * @returns {Finding[]}
 */
function checkDistinct(presets, listed) {
  const names = Object.keys(presets)
  /** @param {any} a @param {any} b */
  const differ = (a, b) => (typeof a === 'number' && typeof b === 'number' ? Math.max(a, b) >= 1.25 * Math.min(a, b) : JSON.stringify(a) !== JSON.stringify(b))
  /** @param {string} name */
  const opening = (name) => listed.find((home) => home.name === name)?.page.sections[0]?.type
  const pairs = names.flatMap((a, index) =>
    names.slice(index + 1).flatMap((b) => {
      const ids = [...new Set([...Object.keys(presets[a]), ...Object.keys(presets[b])])]
      const differing = Object.keys(axes).filter((axis) => ids.some((id) => axes[axis].test(id) && differ(presets[a][id], presets[b][id])))
      if (opening(a) && opening(b) && opening(a) !== opening(b)) differing.push('composition')
      if (differing.length >= 3) return []
      const count = `${differing.length} ${differing.length === 1 ? 'axis' : 'axes'}${differing.length ? ` (${differing.join(', ')})` : ''}`
      return [
        finding(
          'distinct',
          settingsData,
          `${a} and ${b} differ on ${count}: make them differ in kind on at least 3 of type, color, shape, spacing, cards, media, motion and composition.`,
        ),
      ]
    }),
  )
  const subtle = names.length > 1 && names.every((name) => presets[name].motion === 'subtle')
  return [
    ...pairs,
    ...(subtle ? [finding('distinct', settingsData, 'Every Direction uses subtle motion: give at least one expressive motion, when its thesis allows.')] : []),
  ]
}

/**
 * The folder a preset's home lives in, `listings/<name>/`, as the Studio names it.
 * @param {string} preset
 */
function listingName(preset) {
  return preset.toLowerCase().replace(' ', '-')
}

/**
 * The global settings that apply, resolving a preset name the way Shopify does, over their schema defaults; the
 * color schemes' default colors; the name of the preset the Theme shows, when it shows one; and each preset's
 * settings over the schema defaults, by its name.
 * @param {string} theme
 * @returns {{ values: Record<string, any>, schemeDefaults: Record<string, string>, preset: string | undefined, presets: Record<string, Record<string, any>> }}
 */
function readSettings(theme) {
  const data = readJSON(theme, settingsData)
  const preset = typeof data.current === 'string' ? data.current : undefined
  /** @type {Record<string, any>} */
  const values = {}
  /** @type {Record<string, string>} */
  let schemeDefaults = {}
  for (const group of readJSON(theme, 'config/settings_schema.json')) {
    for (const setting of group.settings ?? []) {
      if (setting.id && 'default' in setting) values[setting.id] = setting.default
      if (setting.id === 'color_schemes') schemeDefaults = defaults(setting.definition)
    }
  }
  const presets = Object.fromEntries(Object.entries(data.presets ?? {}).map(([name, presetValues]) => [name, { ...values, ...presetValues }]))
  return { values: { ...values, ...(preset ? data.presets?.[preset] : data.current) }, schemeDefaults, preset, presets }
}

/**
 * The Direction DIRECTION.md's `Chosen:` line names, or else the preset the Theme shows.
 * @param {string} text DIRECTION.md
 * @param {string | undefined} preset
 */
function chosen(text, preset) {
  return text.match(/^Chosen: *(.*?) *$/m)?.[1] ?? preset
}

/**
 * The `## <name>` part of DIRECTION.md, its heading line first, for a Direction's name or its listings/ folder.
 * @param {string} text DIRECTION.md
 * @param {string | undefined} name
 */
function directionPart(text, name) {
  return text.split(/^## /m).find((other) => name && listingName(other.split('\n')[0].trim()) === listingName(name))
}

const fontRoles = /** @type {const} */ ([
  ['type_heading_font', 'heading'],
  ['type_body_font', 'body'],
  ['type_accent_font', 'accent'],
])

/**
 * A font of the Theme that DIRECTION.md gives no reason for: in the chosen Direction's part (or the one the Theme
 * shows, or anywhere when neither has a part), no clause names its handle with a "because".
 * @param {string} theme
 * @param {ReturnType<typeof readSettings>} settings
 * @returns {Finding[]}
 */
function checkFonts(theme, { values, preset }) {
  const file = path.join(theme, directionFile)
  if (!existsSync(file)) {
    return [finding('fonts', directionFile, 'The Theme has no DIRECTION.md, so no font has a reason: write it as references/design/directions.md says.')]
  }
  const text = readFileSync(file, 'utf8')
  const part = directionPart(text, chosen(text, preset))
  const clauses = (part ?? text).split(/[;\n]/).filter((clause) => /\bbecause\b/i.test(clause))
  const where = part ? `under ## ${part.split('\n')[0].trim()}` : 'in DIRECTION.md'
  const fonts = groupBy(
    fontRoles.flatMap(([id, role]) => (values[id] ? [{ handle: String(values[id]), role }] : [])),
    (font) => font.handle,
  )
  return [...fonts].flatMap(([handle, roles]) =>
    clauses.some((clause) => clause.includes(handle))
      ? []
      : [
          finding(
            'fonts',
            directionFile,
            `${handle} (${roles.map((font) => font.role).join(', ')}) has no reason ${where}: write "${handle}, because <a reason from the brief>" on its Type line.`,
          ),
        ],
  )
}

// A corner radius declaration, and the values that aren't a radius of their own.
const radius = /(?<![-\w])(border(?:-[a-z]+)*-radius)\s*:\s*([^;}]+)/g
const noRadius = /var\(|\{\{|^(0|0px|inherit|initial|unset)$/

/**
 * A radius of its own in the Theme's sections, blocks, snippets or stylesheets: a second radius family beside the
 * one the Theme's shape setting gives through the --style-border-radius-* variables.
 * @param {string} theme
 * @returns {Finding[]}
 */
function checkRadii(theme) {
  const files = [
    ...['sections', 'blocks', 'snippets'].flatMap((dir) => listFiles(theme, dir, (name) => name.endsWith('.liquid'))),
    ...listFiles(theme, 'assets', (name) => /\.(css|css\.liquid)$/.test(name)),
  ]
  return files.flatMap((file) =>
    readFileSync(path.join(theme, file), 'utf8')
      .split('\n')
      .flatMap((line, index) =>
        [...line.matchAll(radius)].flatMap(([, property, value]) =>
          noRadius.test(value.trim())
            ? []
            : [finding('radius', file, `line ${index + 1}: ${property}: ${value.trim()} is a second radius family. Use the shape family's var(--style-border-radius-*).`)],
        ),
      ),
  )
}

/**
 * The files in the Theme's `dir` that `pick` takes, relative to the Theme, sorted.
 * @param {string} theme
 * @param {string} dir
 * @param {(name: string) => boolean} pick
 */
function listFiles(theme, dir, pick) {
  if (!existsSync(path.join(theme, dir))) return []
  return readdirSync(path.join(theme, dir)).filter(pick).sort().map((name) => `${dir}/${name}`)
}

/**
 * Each color pair of a scheme below its contrast minimum.
 * @param {ReturnType<typeof readSettings>} settings
 * @returns {Finding[]}
 */
function checkContrast({ values, schemeDefaults }) {
  return Object.entries(values.color_schemes ?? {}).flatMap(([id, scheme]) => {
    const colors = { ...schemeDefaults, .../** @type {any} */ (scheme).settings }
    if (colors.text && colors.background) colors.muted_text = mutedText(colors.text, colors.background)
    /** @param {string} color @param {string} on @param {string} onName @param {number} minimum */
    const check = (color, on, onName, minimum) => {
      const ratio = contrastRatio(colors[color], on)
      // Rounded down, so a failing ratio never shows as the minimum.
      const shown = Math.floor(ratio * 10) / 10
      return ratio < minimum ? [finding('contrast', settingsData, `${id}: ${color.replace('_', ' ')} on ${onName} is ${shown}:1, needs ${minimum}:1.`)] : []
    }
    // Text and muted text on each stop of the background gradient, a translucent stop over the background.
    const stops = colors.background ? String(colors.background_gradient ?? '').match(/rgba?\([^)]*\)|#[0-9a-f]{6}\b/gi) ?? [] : []
    return [
      ...contrastPairs.flatMap(([color, on, minimum]) => (colors[color] && colors[on] ? check(color, colors[on], on, minimum) : [])),
      ...stops.flatMap((stop) =>
        (/** @type {const} */ (['text', 'muted_text'])).flatMap((color) =>
          colors[color] ? check(color, overBackground(stop, colors.background), `the background gradient stop ${stop}`, 4.5) : [],
        ),
      ),
    ]
  })
}

/**
 * A gradient stop, `#rrggbb` or `rgb(a)(r, g, b[, a])`, as hex over an opaque background.
 * @param {string} stop
 * @param {string} background
 */
function overBackground(stop, background) {
  if (stop.startsWith('#')) return stop
  const [r, g, b, alpha = 1] = stop.slice(stop.indexOf('(') + 1, -1).split(/[\s,/]+/).filter(Boolean).map(Number)
  return mix(toHex([r, g, b]), background, alpha)
}

/**
 * Muted text as snippets/css-variables.liquid derives it: the text mixed toward the background (70% text, then 75%,
 * and so on) until it reads at 4.6:1, a margin over 4.5:1 for Liquid's color_contrast, which rounds; the text itself
 * when no mix does.
 * @param {string} text
 * @param {string} background
 */
function mutedText(text, background) {
  for (let share = 70; share < 100; share += 5) {
    const muted = mix(text, background, share / 100)
    if (contrastRatio(muted, background) >= 4.6) return muted
  }
  return text
}

/**
 * Two hex colors mixed channel by channel, `share` of the first, as Liquid's color_mix does.
 * @param {string} a
 * @param {string} b
 * @param {number} share
 */
function mix(a, b, share) {
  return toHex([1, 3, 5].map((i) => share * parseInt(a.slice(i, i + 2), 16) + (1 - share) * parseInt(b.slice(i, i + 2), 16)))
}

/** @param {number[]} channels */
function toHex(channels) {
  return `#${channels.map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`
}

/** @param {string} hex */
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * @param {string} a
 * @param {string} b
 */
function contrastRatio(a, b) {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * @template T
 * @param {T[]} items
 * @param {(item: T) => string} key
 * @returns {Map<string, T[]>}
 */
function groupBy(items, key) {
  /** @type {Map<string, T[]>} */
  const groups = new Map()
  for (const item of items) groups.set(key(item), [...(groups.get(key(item)) ?? []), item])
  return groups
}

/**
 * @param {string} check
 * @param {string} file
 * @param {string} message
 * @returns {Finding}
 */
function finding(check, file, message) {
  return { check, file, message }
}

/**
 * @param {string} theme
 * @param {string} file
 */
function readJSON(theme, file) {
  const data = parseJSON(readFileSync(path.join(theme, file), 'utf8'))
  if (data instanceof Error) throw new Error(`${file}: ${data.message}`)
  return /** @type {any} */ (data)
}

// Real paths on both sides: npx skills add installs the skill as a symlink, and import.meta.url is the real path.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const theme = process.argv[2]
  if (!theme) {
    console.error('Usage: node check-direction.mjs <theme>')
    process.exit(2)
  }
  const findings = checkDirection(path.resolve(theme))
  for (const { check, file, message } of findings) console.log(`${file} ${check}: ${message}`)
  console.log(`Direction check: ${findings.length} finding${findings.length === 1 ? '' : 's'}`)
  process.exitCode = findings.length > 0 ? 1 : 0
}
