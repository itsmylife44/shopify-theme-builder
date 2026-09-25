// The HTML the inspector's rich text editor saves. A richtext setting holds paragraphs of text with bold, italic, links
// and line breaks; an inline_richtext setting the same text without paragraphs or line breaks. Anything else a
// contenteditable or a stored value holds is dropped and its text kept, except scripts and styles, dropped whole.

// The inline elements kept, by the name they're saved as.
/** @type {Record<string, string>} */
const inlineTags = { strong: 'strong', b: 'strong', em: 'em', i: 'em', a: 'a' }
// The elements that start a new paragraph.
const blockTags = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'ul', 'ol', 'blockquote'])
const hidden = /<(script|style|template)\b[\s\S]*?<\/\1\s*>/gi
const tag = /<(\/?)([a-z][a-z0-9]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>|<!--[\s\S]*?-->/gi
const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/i
// The links kept: a store path, an anchor, a web, mail or phone link, or a shopify:// link to a store resource.
export const richtextLink = /^(\/|#|https?:\/\/|mailto:|tel:|shopify:\/\/)/i

/** @param {string} html */
const visible = (html) => html.replace(/<[^>]*>/g, '').replace(/&nbsp;|\s/g, '') !== ''
/** @param {string} text */
const escapeText = (text) => text.replaceAll('<', '&lt;').replaceAll('>', '&gt;')

/**
 * Keeps only what Shopify's richtext setting takes: `<p>`, `<strong>`, `<em>`, `<a href>` and `<br>`, or for an
 * inline_richtext setting `<strong>`, `<em>` and `<a href>`. Paragraphs are never nested nor empty, and every tag is closed.
 * @param {string} html
 * @param {boolean} [inline] For an inline_richtext setting.
 * @returns {string}
 */
export function sanitizeRichtext(html, inline = false) {
  /** @type {string[]} */
  const paragraphs = []
  // The paragraph being built, and the inline elements open in it, outermost first.
  let current = ''
  /** @type {{ name: string, open: string, close: string }[]} */
  const open = []

  function breakParagraph() {
    if (inline) {
      if (current !== '' && !/\s$/.test(current)) current += ' '
      return
    }
    // An element open across paragraphs closes at the end of one and opens again in the next.
    paragraphs.push(current + open.toReversed().map((element) => element.close).join(''))
    current = open.map((element) => element.open).join('')
  }

  /** @param {string} name */
  function close(name) {
    const index = open.findLastIndex((element) => element.name === name)
    if (index === -1) return
    const above = open.splice(index)
    current += above.toReversed().map((element) => element.close).join('')
    // The elements opened inside it stay open.
    above.shift()
    open.push(...above)
    current += above.map((element) => element.open).join('')
  }

  let last = 0
  const source = html.replace(hidden, '')
  for (const match of source.matchAll(tag)) {
    current += escapeText(source.slice(last, match.index))
    last = match.index + match[0].length
    const [, closing, rawName = '', attributes = ''] = match
    const name = rawName.toLowerCase()
    if (blockTags.has(name)) {
      breakParagraph()
    } else if (name === 'br') {
      if (inline) breakParagraph()
      else if (visible(current)) current += '<br>'
    } else if (Object.hasOwn(inlineTags, name)) {
      const saved = inlineTags[name]
      if (closing) {
        close(saved)
      } else if (saved === 'a') {
        const [, double, single] = attributes.match(href) ?? []
        const url = (double ?? single ?? '').trim()
        // A link to somewhere unknown, like javascript:, keeps its text only.
        const element = richtextLink.test(url) ? { name: 'a', open: `<a href="${url.replaceAll('"', '&quot;')}">`, close: '</a>' } : { name: 'a', open: '', close: '' }
        open.push(element)
        current += element.open
      } else {
        open.push({ name: saved, open: `<${saved}>`, close: `</${saved}>` })
        current += `<${saved}>`
      }
    }
  }
  current += escapeText(source.slice(last)) + open.toReversed().map((element) => element.close).join('')
  if (inline) return current.trim()
  paragraphs.push(current)
  return paragraphs
    .filter(visible)
    .map((paragraph) => `<p>${paragraph.trim().replace(/(?:<br>|\s)+((?:<\/(?:strong|em|a)>)*)$/, '$1')}</p>`)
    .join('')
}
