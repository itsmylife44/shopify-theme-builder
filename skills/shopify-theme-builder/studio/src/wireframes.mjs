// The section picker's wireframe thumbnails: one short description per catalog section preset, laid out into
// grey shapes in a 160 × 100 frame, with as many items as the preset adds blocks. The Theme never sees them.
//
// A description is rows, top to bottom, split by ` / `; a row starting with `N*` is N times as tall as a plain one.
// A row is columns of equal width, split by ` | `. A column is a stack of parts, centred top to bottom:
//   image      an image; the images of a column share the height its other parts leave
//   image@bl   an image filling the column, with the column's other parts over it at a position:
//              t(op), m(iddle) or b(ottom), then l(eft), c(entre) or r(ight)
//   display (oversized type), heading, title, text (two lines), line, button, input, icon, logo, rule,
//   thumbs (a thumbnail strip), dots, _ (a gap)
// and modifiers: `center` centres the parts, `panel` puts them on a panel, `x3` repeats the column three times.

/**
 * @typedef {'image' | 'strong' | 'text' | 'outline' | 'panel'} Tone
 * @typedef {{ tone: Tone, x: number, y: number, width: number, height: number }} Shape
 */

const frame = { width: 160, height: 100, padding: 8, gap: 6 }
const stackGap = 3
const panelPadding = 4

/**
 * The fixed parts: their height, and their lines as a share of the column's width (or a width, when above 1) and tone.
 * @type {Record<string, { height: number, lines: { width: number, height: number, tone: Tone }[] }>}
 */
const parts = {
  display: { height: 12, lines: [{ width: 0.85, height: 12, tone: 'strong' }] },
  heading: { height: 5, lines: [{ width: 0.6, height: 5, tone: 'strong' }] },
  title: { height: 3.5, lines: [{ width: 0.45, height: 3.5, tone: 'strong' }] },
  text: {
    height: 7,
    lines: [
      { width: 0.9, height: 2.5, tone: 'text' },
      { width: 0.65, height: 2.5, tone: 'text' },
    ],
  },
  line: { height: 2.5, lines: [{ width: 0.5, height: 2.5, tone: 'text' }] },
  button: { height: 6, lines: [{ width: 22, height: 6, tone: 'strong' }] },
  input: { height: 7, lines: [{ width: 1, height: 7, tone: 'outline' }] },
  icon: { height: 6, lines: [{ width: 6, height: 6, tone: 'strong' }] },
  logo: { height: 5, lines: [{ width: 18, height: 5, tone: 'text' }] },
  rule: { height: 0.8, lines: [{ width: 1, height: 0.8, tone: 'text' }] },
  dots: { height: 2, lines: [{ width: 10, height: 2, tone: 'text' }] },
  thumbs: { height: 9, lines: [] },
  _: { height: 4, lines: [] },
}
const positions = /^image@([tmb])([lcr])$/

/** @param {number} value */
const round = (value) => Math.round(value * 10) / 10

/**
 * @param {Tone} tone
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 * @returns {Shape}
 */
const shape = (tone, x, y, width, height) => ({ tone, x: round(x), y: round(y), width: round(width), height: round(height) })

/**
 * Lays out a wireframe description into shapes, back to front.
 * @param {string} description
 * @returns {Shape[]}
 */
export function layoutWireframe(description) {
  const rows = description.split(' / ').map((row) => {
    const weight = row.match(/^(\d+(?:\.\d+)?)\*\s+/)
    const columns = row
      .slice(weight?.[0].length ?? 0)
      .split(' | ')
      .flatMap((column) => {
        const tokens = column.trim().split(/\s+/)
        const repeat = tokens.at(-1)?.match(/^x(\d+)$/)
        const parts = repeat ? tokens.slice(0, -1) : tokens
        return Array.from({ length: repeat ? Number(repeat[1]) : 1 }, () => parts)
      })
    return { weight: weight ? Number(weight[1]) : 1, columns }
  })
  const inner = frame.height - 2 * frame.padding - frame.gap * (rows.length - 1)
  const total = rows.reduce((sum, row) => sum + row.weight, 0)
  /** @type {Shape[]} */
  const shapes = []
  let y = frame.padding
  for (const row of rows) {
    const height = (inner * row.weight) / total
    const width = (frame.width - 2 * frame.padding - frame.gap * (row.columns.length - 1)) / row.columns.length
    row.columns.forEach((tokens, index) => {
      shapes.push(...layoutColumn(tokens, frame.padding + index * (width + frame.gap), y, width, height))
    })
    y += height + frame.gap
  }
  return shapes
}

/**
 * @param {string[]} tokens
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 * @returns {Shape[]}
 */
function layoutColumn(tokens, x, y, width, height) {
  const center = tokens.includes('center')
  const panel = tokens.includes('panel')
  const stack = tokens.filter((token) => token !== 'center' && token !== 'panel')
  for (const token of stack) {
    if (token !== 'image' && !positions.test(token) && !(token in parts)) throw new Error(`Unknown wireframe part: ${token}.`)
  }
  const overlay = stack.map((token) => token.match(positions)).find(Boolean)
  if (overlay) {
    // The parts over the image take half its width, inset from its edges.
    const rest = stack.filter((token) => !positions.test(token))
    const boxWidth = overlay[2] === 'c' ? width * 0.6 : width * 0.5
    const boxHeight = stackHeight(rest) + (panel ? 2 * panelPadding : 0)
    const inset = 6
    const boxX = { l: x + inset, c: x + (width - boxWidth) / 2, r: x + width - inset - boxWidth }[overlay[2]] ?? x
    const boxY = { t: y + inset, m: y + (height - boxHeight) / 2, b: y + height - inset - boxHeight }[overlay[1]] ?? y
    return [
      shape('image', x, y, width, height),
      ...(panel ? [shape('panel', boxX, boxY, boxWidth, boxHeight)] : []),
      ...layoutStack(rest, boxX, boxY, boxWidth, boxHeight, overlay[2] === 'c', panel ? panelPadding : 0),
    ]
  }
  return [...(panel ? [shape('panel', x, y, width, height)] : []), ...layoutStack(stack, x, y, width, height, center, panel ? panelPadding : 0)]
}

/** @param {string[]} stack The column's fixed parts. */
function stackHeight(stack) {
  return stack.reduce((sum, token) => sum + (parts[token]?.height ?? 0), 0) + stackGap * Math.max(0, stack.length - 1)
}

/**
 * Stacks parts in a box: the images share what the fixed parts leave; with no image, the parts sit in the middle.
 * @param {string[]} stack
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 * @param {boolean} center
 * @param {number} padding
 * @returns {Shape[]}
 */
function layoutStack(stack, x, y, width, height, center, padding) {
  x += padding
  y += padding
  width -= 2 * padding
  height -= 2 * padding
  const images = stack.filter((token) => token === 'image').length
  const fixed = stack.filter((token) => token !== 'image')
  const fixedHeight = fixed.reduce((sum, token) => sum + parts[token].height, 0)
  const imageHeight = images ? (height - fixedHeight - stackGap * (stack.length - 1)) / images : 0
  let top = images ? y : y + (height - stackHeight(fixed)) / 2
  /** @type {Shape[]} */
  const shapes = []
  for (const token of stack) {
    if (token === 'image') {
      shapes.push(shape('image', x, top, width, Math.max(imageHeight, 0)))
      top += imageHeight + stackGap
      continue
    }
    const part = parts[token]
    if (token === 'thumbs') {
      const size = Math.min(part.height, (width - 3 * 2) / 4)
      for (let i = 0; i < 4; i++) shapes.push(shape('image', x + i * (size + 2), top, size, size))
    }
    let lineTop = top
    for (const line of part.lines) {
      const lineWidth = Math.min(line.width > 1 ? line.width : width * line.width, width)
      shapes.push(shape(line.tone, center ? x + (width - lineWidth) / 2 : x, lineTop, lineWidth, line.height))
      lineTop += line.height + 2
    }
    top += part.height + stackGap
  }
  return shapes
}

/**
 * Each catalog section's presets, by type and by the preset's name as its schema writes it.
 * @type {Record<string, Record<string, string>>}
 */
export const wireframes = {
  'blog-posts': { 't:general.blog_posts': 'heading / 3* image title text x3' },
  'collection-list': { 't:general.collection_list': 'heading / 3* image title x3' },
  'comparison-table': { 't:general.comparison_table': 'center heading / line x3 / rule / line x3 / rule / line x3' },
  'contact-form': { 't:general.contact_form': 'heading / input | input / 2* input button' },
  'custom-liquid': { 't:general.custom_liquid': 'panel line text line' },
  'editorial-split': {
    't:general.editorial_split': 'image | heading text text text',
    't:general.editorial_split_right': 'heading text text text | image',
  },
  faq: { 't:general.faq': 'center heading / 3* rule line rule line rule line rule' },
  'featured-collection': {
    't:general.featured_collection': 'heading / 3* image title line x4',
    't:general.featured_collection_minimal': 'heading / 3* image line x4',
    't:general.featured_collection_detailed': 'heading / 2* image title line button x4 / 2* image title line button x4',
    't:general.featured_collection_editorial': 'heading / 4* image title x3',
  },
  'featured-product': { 't:general.featured_product': 'image | heading line button text' },
  hero: {
    't:general.hero': 'image@ml panel heading text button',
    't:general.hero_full_screen': 'image@mc heading text button',
    't:general.hero_split': 'image | heading text button',
    't:general.hero_text_on_image': 'image@bl heading text button',
    't:general.hero_small_banner': '2* image@ml heading button / _',
  },
  'image-gallery': { 't:general.image_gallery': 'image x3' },
  'image-with-text': {
    't:general.image_with_text': 'image | heading text button',
    't:general.image_with_text_right': 'heading text button | image',
  },
  'logo-list': { 't:general.logo_list': 'center heading / logo x4' },
  lookbook: { 't:general.lookbook': 'image@mr icon _ icon' },
  'main-404': { 't:general.main_404': 'center heading text input button' },
  'main-article': { 't:general.main_article': '3* image / center heading line / 2* text text' },
  'main-blog': { 't:general.main_blog': 'heading line / 3* image title line x3' },
  'main-cart': { 't:general.main_cart': 'heading / 2* image | title line | line / 2* image | title line | line / button' },
  'main-collection': { 't:general.collection_product_grid': 'heading / 4* line line line | image title line x3' },
  'main-list-collections': { 't:general.main_list_collections': 'heading / 3* image title x4' },
  'main-product': {
    't:general.main_product': 'image image | image image | title line button text',
    't:general.main_product_stacked': 'image image | title line button text',
    't:general.main_product_thumbnails': 'image thumbs | title line button text',
    't:general.main_product_carousel': 'image dots | title line button text',
  },
  'main-search': { 't:general.search_results': 'center input / 4* line line line | image title line x3' },
  marquee: { 't:general.marquee': 'rule / line x4 / rule' },
  multicolumn: { 't:general.multicolumn': 'center heading / 3* center icon title text x3' },
  newsletter: { 't:general.newsletter': 'center heading text input button' },
  'press-quotes': {
    't:general.press_quotes': 'center logo text x3',
    't:general.press_quotes_wall': 'panel logo text x2 / panel logo text | _',
  },
  'process-steps': { 't:general.process_steps': 'heading / 3* image icon title text x3' },
  'related-products': {
    't:general.related_products': 'heading / 3* image title line x4',
    't:general.complementary_products': 'heading / 2* image | title line / 2* image | title line',
  },
  'rich-text': { 't:general.rich_text': 'center heading text button' },
  slideshow: {
    't:general.slideshow': '6* image@ml panel heading text button / center dots',
    't:general.slideshow_full_screen': '6* image@mc heading text button / center dots',
    't:general.slideshow_split': '6* image | heading text button / center dots',
    't:general.slideshow_text_on_image': '6* image@bl heading text button / center dots',
  },
  'spec-tiles': { 't:general.spec_tiles': 'heading / 2* rule heading line x2 / 2* rule heading line x2' },
  testimonials: { 't:general.testimonials': 'center heading / 3* panel text line x3' },
  timeline: { 't:general.timeline': 'heading / rule / 3* icon line title text x3' },
  'type-banner': { 't:general.type_banner': 'display display line' },
  video: { 't:general.video': 'center heading / 4* image@mc icon' },
}
