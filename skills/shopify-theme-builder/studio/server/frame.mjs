// The preview inside the Studio: `shopify theme dev` answers `x-frame-options: DENY`, so the Studio shows it
// through this proxy on its own port. The proxy drops that header and adds a script to each HTML page that
// tells the Studio which section the Creator clicks, and outlines the section the Studio selects.
import { createServer, request } from 'node:http'

// Sections render as <div id="shopify-section-template--123__hero_ab12cd">; the id after `__` is the one in
// the page's JSON template. Group sections (header, footer) end in their own id the same way.
const selectionScript = `<script>
(() => {
  const sectionOf = (el) => el && el.closest && el.closest('[id^="shopify-section-"]')
  const idOf = (el) => el.id.slice('shopify-section-'.length).split('__').pop()
  const style = document.createElement('style')
  style.textContent = '[data-studio-hover]{outline:2px dashed #2563eb;outline-offset:-2px;cursor:pointer}' +
    '[data-studio-selected]{outline:2px solid #2563eb!important;outline-offset:-2px}'
  document.head.append(style)
  let hovered = null
  addEventListener('mouseover', (event) => {
    const section = sectionOf(event.target)
    if (section === hovered) return
    hovered?.removeAttribute('data-studio-hover')
    hovered = section
    section?.setAttribute('data-studio-hover', '')
  })
  // A click selects the section instead of following links or submitting forms.
  addEventListener('click', (event) => {
    const section = sectionOf(event.target)
    if (!section) return
    event.preventDefault()
    event.stopPropagation()
    parent.postMessage({ type: 'studio:select', id: idOf(section) }, '*')
  }, true)
  let selected = null
  const outline = () => {
    const section = [...document.querySelectorAll('[id^="shopify-section-"]')].find((el) => idOf(el) === selected)
    for (const el of document.querySelectorAll('[data-studio-selected]')) if (el !== section) el.removeAttribute('data-studio-selected')
    if (section && !section.hasAttribute('data-studio-selected')) section.setAttribute('data-studio-selected', '')
    return section
  }
  addEventListener('message', (event) => {
    if (event.source !== parent || event.data?.type !== 'studio:selected') return
    selected = event.data.id
    const section = outline()
    if (event.data.scroll) section?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
  // theme dev may swap a changed section's HTML without reloading the page: outline the new element.
  new MutationObserver(() => {
    if (hovered && !hovered.isConnected) hovered = null
    if (selected) outline()
  }).observe(document.body, { childList: true, subtree: true })
  parent.postMessage({ type: 'studio:loaded' }, '*')
})()
</script>`

/**
 * Starts the proxy on a free port of 127.0.0.1. `target()` is theme dev's URL, undefined while it isn't running.
 * @param {() => string | undefined} target
 * @returns {Promise<{ url: string, close: () => void }>}
 */
export function startFrameProxy(target) {
  const server = createServer((req, res) => {
    const base = target()
    if (!base) {
      res.writeHead(503, { 'Content-Type': 'text/plain' }).end('The preview is not running yet.')
      return
    }
    const upstream = new URL(req.url ?? '/', base)
    const headers = { ...req.headers, host: upstream.host }
    // An uncompressed answer, so the script can be added to the HTML.
    delete headers['accept-encoding']
    const proxied = request(upstream, { method: req.method, headers }, (answer) => {
      /** @type {import('node:http').OutgoingHttpHeaders} */
      const out = { ...answer.headers }
      delete out['x-frame-options']
      // Only the frame-ancestors directive stops the iframe; the rest of the policy stays.
      const policy = answer.headers['content-security-policy']
      if (policy) {
        const kept = String(policy).split(';').filter((/** @type {string} */ directive) => !/^\s*frame-ancestors\b/i.test(directive)).join(';')
        if (kept.trim()) out['content-security-policy'] = kept
        else delete out['content-security-policy']
      }
      // A redirect to theme dev's own address would leave the proxy, whose page the iframe can't show.
      const location = answer.headers.location
      if (location?.startsWith(upstream.origin)) out.location = location.slice(upstream.origin.length) || '/'
      if (!String(answer.headers['content-type']).startsWith('text/html')) {
        // Streamed as it comes, like theme dev's hot reload events.
        res.writeHead(answer.statusCode ?? 502, out)
        answer.pipe(res)
        return
      }
      const chunks = /** @type {Buffer[]} */ ([])
      answer.on('data', (chunk) => chunks.push(chunk))
      answer.on('end', () => {
        const html = Buffer.concat(chunks).toString('utf8')
        const at = html.lastIndexOf('</body>')
        delete out['content-length']
        delete out['transfer-encoding']
        res.writeHead(answer.statusCode ?? 502, out)
        res.end(at === -1 ? html : html.slice(0, at) + selectionScript + html.slice(at))
      })
    })
    proxied.on('error', (error) => {
      if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain' })
      res.end(error.message)
    })
    req.pipe(proxied)
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = /** @type {import('node:net').AddressInfo} */ (server.address())
      resolve({ url: `http://127.0.0.1:${port}`, close: () => server.close() })
    })
  })
}

/**
 * The paths of the pages the Studio composes, on the store behind theme dev. The product page shows the
 * store's first product; `/products` alone would be a 404.
 * @param {string} previewUrl
 */
export async function pagePaths(previewUrl) {
  const product = await fetch(new URL('/products.json?limit=1', previewUrl))
    .then((response) => response.json())
    .then((body) => body.products?.[0]?.handle)
    .catch(() => undefined)
  return { home: '/', product: product ? `/products/${product}` : '/collections/all', collection: '/collections/all' }
}
