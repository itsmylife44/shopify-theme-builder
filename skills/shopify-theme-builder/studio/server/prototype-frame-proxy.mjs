// PROTOTYPE (branch prototype/studio-editor, throwaway): a proxy in front of `shopify theme dev` so the
// Studio can show the preview in an iframe. theme dev answers `x-frame-options: DENY`; the proxy drops it,
// lets the Studio fetch through it (CORS), and injects a script that reports the section the Creator clicks.
import { createServer, request } from 'node:http'

const selectScript = `<script>
(() => {
  const sectionOf = (el) => el && el.closest && el.closest('[id^="shopify-section-"]')
  const idOf = (el) => el.id.replace(/^shopify-section-/, '').split('__').pop()
  let hovered = null
  const style = document.createElement('style')
  style.textContent = '[data-studio-hover]{outline:2px dashed #2563eb;outline-offset:-2px;cursor:pointer}' +
    '[data-studio-selected]{outline:2px solid #2563eb !important;outline-offset:-2px}'
  document.head.append(style)
  addEventListener('mouseover', (e) => {
    const s = sectionOf(e.target)
    if (s === hovered) return
    hovered?.removeAttribute('data-studio-hover')
    hovered = s
    s?.setAttribute('data-studio-hover', '')
  })
  addEventListener('click', (e) => {
    const s = sectionOf(e.target)
    if (!s) return
    e.preventDefault()
    e.stopPropagation()
    parent.postMessage({ type: 'studio:select', id: idOf(s) }, '*')
  }, true)
  addEventListener('message', (e) => {
    if (e.data?.type !== 'studio:selected') return
    document.querySelectorAll('[data-studio-selected]').forEach((el) => el.removeAttribute('data-studio-selected'))
    const s = [...document.querySelectorAll('[id^="shopify-section-"]')].find((el) => idOf(el) === e.data.id)
    if (!s) return
    s.setAttribute('data-studio-selected', '')
    if (e.data.scroll) s.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
  parent.postMessage({ type: 'studio:loaded', path: location.pathname }, '*')
})()
</script>`

/**
 * Starts the proxy on a free port. `target()` gives theme dev's URL, or undefined while it isn't running.
 * @param {() => string | undefined} target
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
    // Plain bodies, so the script can go into the HTML.
    delete headers['accept-encoding']
    const proxied = request(upstream, { method: req.method, headers }, (answer) => {
      /** @type {Record<string, string | string[] | undefined>} */
      const out = { ...answer.headers, 'access-control-allow-origin': '*' }
      delete out['x-frame-options']
      delete out['content-security-policy']
      const html = String(answer.headers['content-type'] ?? '').startsWith('text/html')
      if (!html) {
        res.writeHead(answer.statusCode ?? 502, out)
        answer.pipe(res)
        return
      }
      const chunks = /** @type {Buffer[]} */ ([])
      answer.on('data', (chunk) => chunks.push(chunk))
      answer.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8').replace('</body>', `${selectScript}</body>`)
        delete out['content-length']
        delete out['transfer-encoding']
        res.writeHead(answer.statusCode ?? 502, out).end(body)
      })
    })
    proxied.on('error', (error) => res.writeHead(502, { 'Content-Type': 'text/plain' }).end(error.message))
    req.pipe(proxied)
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = /** @type {import('node:net').AddressInfo} */ (server.address())
      resolve({ url: `http://127.0.0.1:${port}`, close: () => server.close() })
    })
  })
}
