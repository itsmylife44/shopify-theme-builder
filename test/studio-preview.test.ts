import { existsSync } from 'node:fs'
import { createServer as createHttpServer } from 'node:http'
import { createServer } from 'node:net'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { startStudio } from '../skills/shopify-theme-builder/studio/server/studio.mjs'
import { cleanup, tempDir, fixtureTheme, fixtureCatalog, fakeShopify, fakeRun, openStudio } from './helpers/studio.js'

describe('Studio: live preview', () => {
  // How Shopify CLI 4.8.0 prints a running theme dev without a terminal: links become footnotes.
  const running =
    '╭─ success ────────────────────────────────────────────────────────────────────╮\n' +
    '│  Preview your theme (t)                                                      │\n' +
    '│    • [1]                                                                     │\n' +
    '│  Next steps                                                                  │\n' +
    '│    • Share your theme preview (p) [2] https://theme-builder-dev-ou5grn62.my  │\n' +
    '│      shopify.com/?preview_theme_id=207592816979                              │\n' +
    '╰──────────────────────────────────────────────────────────────────────────────╯\n' +
    '[1] http://127.0.0.1:9292\n' +
    '[2] https://theme-builder-dev-ou5grn62.myshopify.com/?preview_theme_id=207592816979\n'

  it('starts theme dev for the Theme and shows its preview URL', async () => {
    const theme = fixtureTheme()
    const cli = fakeShopify({ output: '\u001b[1mSyncing theme…\u001b[22m\n' + running })
    const studio = await openStudio(theme, { cli, store: 'example.myshopify.com' })
    expect((await fakeRun(cli)).args).toEqual([
      'theme',
      'dev',
      '--path',
      theme,
      '--store',
      'example.myshopify.com',
      '--port',
      expect.stringMatching(/^\d+$/),
    ])
    await expect.poll(() => studio.readPreview()).toMatchObject({ status: 'running', url: 'http://127.0.0.1:9292' })
  })

  it('refuses to start without a store, so theme dev never runs on the store the CLI used last', async () => {
    const cli = fakeShopify()
    // @ts-expect-error: store is required.
    await expect(startStudio({ theme: fixtureTheme(), catalog: fixtureCatalog(), port: 0, cli })).rejects.toThrow(
      'needs a store',
    )
    expect(existsSync(path.join(path.dirname(cli), 'run.json'))).toBe(false)
  })

  it("serves the preview to the Studio's iframe, without x-frame-options and with the selection script", async () => {
    const themeDev = createHttpServer((req, res) => {
      if (req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'X-Frame-Options': 'DENY' })
        res.end('<html><body><p>Shop</p></body></html>')
      } else if (req.url?.startsWith('/sitemap_')) {
        // Shopify's sitemaps list absolute URLs on the shop's domain; the blogs one lists each blog, then its articles.
        const shop = 'https://example.myshopify.com'
        const paths = req.url === '/sitemap_pages_1.xml' ? ['/pages/about-us', '/pages/faq'] : ['/blogs/news', '/blogs/news/hello-world']
        res.writeHead(200, { 'Content-Type': 'application/xml' })
        res.end(`<urlset>${paths.map((p) => `<url><loc>${shop}${p}</loc><lastmod>2026-09-23</lastmod></url>`).join('')}</urlset>`)
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end('{"products":[{"handle":"clay-mug"}]}')
      }
    })
    await new Promise<void>((resolve) => themeDev.listen(0, '127.0.0.1', resolve))
    cleanup.push(() => new Promise((resolve) => themeDev.close(() => resolve())))
    const themeDevUrl = `http://127.0.0.1:${(themeDev.address() as import('node:net').AddressInfo).port}`
    const studio = await openStudio(fixtureTheme(), { cli: fakeShopify({ output: running.replace('http://127.0.0.1:9292', themeDevUrl) }) })
    await expect.poll(() => studio.readPreview()).toMatchObject({ status: 'running', url: themeDevUrl })
    const { status, body } = await studio.send('GET', 'api/frame')
    expect(status).toBe(200)
    expect(body.paths).toEqual({
      home: '/',
      product: '/products/clay-mug',
      collection: '/collections/all',
      page: '/pages/about-us',
      contact: '/pages/about-us?view=contact',
      cart: '/cart',
      search: '/search?q=',
      blog: '/blogs/news',
      article: '/blogs/news/hello-world',
      404: '/studio-page-not-found',
      collections: '/collections',
    })
    // The Theme Editor on theme dev's development theme, from the share link theme dev printed.
    const editor = 'https://theme-builder-dev-ou5grn62.myshopify.com/admin/themes/207592816979/editor'
    expect(body.editor).toMatchObject({
      home: `${editor}?template=index`,
      product: `${editor}?template=product`,
      collection: `${editor}?template=collection`,
      contact: `${editor}?template=page.contact`,
      collections: `${editor}?template=list-collections`,
    })
    const page = await fetch(`${body.url}/`)
    expect(page.headers.get('x-frame-options')).toBeNull()
    expect(page.headers.get('access-control-allow-origin')).toBeNull()
    const html = await page.text()
    expect(html).toContain('<p>Shop</p>')
    expect(html).toMatch(/<script>[\s\S]*studio:select[\s\S]*<\/script><\/body>/)
    expect(await (await fetch(`${body.url}/products.json`)).text()).toBe('{"products":[{"handle":"clay-mug"}]}')
  })

  // theme dev's storefront session can expire (#113): the store then answers 401, or redirects to its password page.
  it.each([
    ['a 401', (res: import('node:http').ServerResponse) => res.writeHead(401).end()],
    ['a redirect to the password page', (res: import('node:http').ServerResponse) => res.writeHead(302, { Location: '/password' }).end()],
  ])('restarts theme dev when its storefront session expires with %s, then serves the preview again', async (_, expire) => {
    let expired = true
    const themeDev = createHttpServer((req, res) => {
      if (expired) return expire(res)
      res.writeHead(200, { 'Content-Type': 'text/html' }).end('<html><body><p>Shop</p></body></html>')
    })
    await new Promise<void>((resolve) => themeDev.listen(0, '127.0.0.1', resolve))
    cleanup.push(() => new Promise((resolve) => themeDev.close(() => resolve())))
    const themeDevUrl = `http://127.0.0.1:${(themeDev.address() as import('node:net').AddressInfo).port}`
    // Every run prints its preview link half a second after it starts, long enough to see the reconnection.
    const cli = fakeShopify({ later: running.replace('http://127.0.0.1:9292', themeDevUrl) })
    const studio = await openStudio(fixtureTheme(), { cli, storePassword: 'secret' })
    await expect.poll(() => studio.readPreview()).toMatchObject({ status: 'running', url: themeDevUrl })
    const { pid } = await fakeRun(cli)
    const { body } = await studio.send('GET', 'api/frame')

    // The Creator's preview never lands on the password page: the proxy answers while theme dev restarts.
    const lost = await fetch(`${body.url}/`, { redirect: 'manual' })
    expect(lost.status).toBe(503)
    expect(await studio.readPreview()).toMatchObject({ status: 'reconnecting', message: expect.stringContaining('Reconnecting') })
    await expect.poll(() => isRunning(pid)).toBe(false)
    expired = false
    await expect.poll(() => studio.readPreview()).toMatchObject({ status: 'running', url: themeDevUrl })
    expect((await fakeRun(cli)).pid).not.toBe(pid)
    expect(await (await fetch(`${body.url}/`)).text()).toContain('<p>Shop</p>')

    // A session lost again right away isn't fixed by restarting: no restart loop, the answer goes through.
    expired = true
    const again = await fetch(`${body.url}/`, { redirect: 'manual' })
    expect(again.status).not.toBe(503)
    expect((await studio.readPreview()).status).toBe('running')
  })

  // How Shopify CLI 4.8 reports an upload that failed because its credentials expired (#153).
  const credentialsExpired =
    '╭─ error ──────────────────────────────────────────────────────────────────────╮\n' +
    '│                                                                              │\n' +
    '│  Failed to upload file "sections/related-products.liquid" to remote theme.   │\n' +
    '│  The currently available CLI credentials are invalid.                        │\n' +
    '│                                                                              │\n' +
    '│  The CLI is currently unable to prompt for reauthentication.                 │\n' +
    '│                                                                              │\n' +
    '│  What to try                                                                 │\n' +
    '│    • Restart the CLI process you were running. If in an interactive          │\n' +
    '│      terminal, you will be prompted to reauthenticate.                       │\n' +
    '│                                                                              │\n' +
    '╰──────────────────────────────────────────────────────────────────────────────╯\n'

  it('restarts theme dev when its CLI credentials expire, and the new run uploads the failed files again', async () => {
    // Only the first run loses its credentials; a new run gets fresh ones.
    const cli = fakeShopify({ output: running, later: [credentialsExpired, ''] })
    const studio = await openStudio(fixtureTheme(), { cli })
    const first = await fakeRun(cli)
    await expect.poll(async () => (await fakeRun(cli)).runs).toBe(2)
    await expect.poll(() => isRunning(first.pid)).toBe(false)
    // A new run uploads every file that differs from the store, the failed one included.
    await expect.poll(() => studio.readPreview()).toEqual({ status: 'running', url: 'http://127.0.0.1:9292', uploadErrors: [] })
  })

  it('asks for `shopify auth login` when the credentials expire again right after a restart', async () => {
    const cli = fakeShopify({ output: running, later: credentialsExpired })
    const studio = await openStudio(fixtureTheme(), { cli })
    await expect
      .poll(() => studio.readPreview())
      .toMatchObject({ status: 'login-required', message: expect.stringContaining('shopify auth login') })
    const second = await fakeRun(cli)
    expect(second.runs).toBe(2)
    await expect.poll(() => isRunning(second.pid)).toBe(false)
  })

  it('shows the uploads Shopify refused in the preview and in validation, until theme dev syncs the file', async () => {
    const refused =
      '╭─ error ──────────────────────────────────────────────╮\n' +
      '│                                                      │\n' +
      '│  Failed to upload file "templates/product.json" to   │\n' +
      '│  remote theme.                                       │\n' +
      '│                                                      │\n' +
      '│  Section type "related-products" does not refer to   │\n' +
      '│  an existing section file                            │\n' +
      '│                                                      │\n' +
      '╰──────────────────────────────────────────────────────╯\n'
    const cli = fakeShopify({
      output: running,
      later: refused,
      onSignal: '• 17:12:04  Synced » update templates/product.json\n',
    })
    const studio = await openStudio(fixtureTheme(), { cli })
    const uploadError = {
      file: 'templates/product.json',
      message: 'Section type "related-products" does not refer to an existing section file',
    }
    await expect
      .poll(() => studio.readPreview())
      .toEqual({ status: 'running', url: 'http://127.0.0.1:9292', uploadErrors: [uploadError] })
    expect((await studio.readTheme()).validation).toContainEqual(expect.objectContaining({ ...uploadError, severity: 'error' }))

    process.kill((await fakeRun(cli)).pid, 'SIGUSR2')
    await expect.poll(async () => (await studio.readPreview()).uploadErrors).toEqual([])
    expect((await studio.readTheme()).validation).not.toContainEqual(expect.objectContaining({ file: 'templates/product.json' }))
  })

  const loginPrompt =
    'To run this command, log in to Shopify.\n' +
    'User verification code: ABCD-EFGH\n' +
    '👉 Open this link to start the auth process: https://accounts.shopify.com/activate-with-code?device_code%5Buser_code%5D=ABCD-EFGH\n'

  it('shows that a login is required while the CLI waits for one in the terminal', async () => {
    const studio = await openStudio(fixtureTheme(), { cli: fakeShopify({ output: loginPrompt }) })
    await expect
      .poll(() => studio.readPreview())
      .toMatchObject({ status: 'login-required', message: expect.stringContaining("Studio's terminal") })
  })

  it('shows the preview URL once the Creator logged in', async () => {
    const studio = await openStudio(fixtureTheme(), { cli: fakeShopify({ output: loginPrompt, later: running }) })
    await expect.poll(() => studio.readPreview()).toMatchObject({ status: 'running', url: 'http://127.0.0.1:9292' })
  })

  it('asks for `shopify auth login` when the CLI stops for want of a login', async () => {
    const cli = fakeShopify({
      output:
        'To run this command, log in to Shopify.\n' +
        'Authorization is required to continue, but the current environment does not support interactive prompts.\n',
      exitCode: 1,
    })
    const studio = await openStudio(fixtureTheme(), { cli })
    await expect
      .poll(() => studio.readPreview())
      .toMatchObject({ status: 'login-required', message: expect.stringContaining('shopify auth login') })
  })

  it('shows the CLI error when theme dev stops', async () => {
    const cli = fakeShopify({
      output:
        '╭─ error ───────────────────────────────────────╮\n' +
        '│  A store is required                          │\n' +
        '╰───────────────────────────────────────────────╯\n',
      exitCode: 1,
    })
    const studio = await openStudio(fixtureTheme(), { cli })
    await expect
      .poll(() => studio.readPreview())
      .toMatchObject({ status: 'error', message: expect.stringContaining('A store is required') })
  })

  it('hands the storefront password to theme dev without putting it in the arguments', async () => {
    const cli = fakeShopify()
    await openStudio(fixtureTheme(), { cli, storePassword: 'secret' })
    const run = await fakeRun(cli)
    expect(run.storePassword).toBe('secret')
    expect(run.args).not.toContain('secret')
  })

  it('asks for the storefront password when the store has a password page', async () => {
    const cli = fakeShopify({
      output:
        '╭─ error ───────────────────────────────────────╮\n' +
        '│  Failed to prompt:                            │\n' +
        '│  Enter your store password                    │\n' +
        '╰───────────────────────────────────────────────╯\n',
      exitCode: 1,
    })
    const studio = await openStudio(fixtureTheme(), { cli })
    await expect
      .poll(() => studio.readPreview())
      .toMatchObject({ status: 'error', message: expect.stringContaining('--store-password') })
  })

  it('explains a missing Shopify CLI', async () => {
    const studio = await openStudio(fixtureTheme(), { cli: path.join(tempDir('empty-'), 'shopify') })
    await expect
      .poll(() => studio.readPreview())
      .toMatchObject({ status: 'error', message: expect.stringContaining('npm install -g @shopify/cli') })
  })

  it('explains a Shopify CLI below the required version', async () => {
    const cli = fakeShopify({ version: '4.7.9' })
    const studio = await openStudio(fixtureTheme(), { cli })
    await expect
      .poll(() => studio.readPreview())
      .toMatchObject({ status: 'error', message: expect.stringMatching(/4\.7\.9.*4\.8\.0/) })
    expect(existsSync(path.join(path.dirname(cli), 'run.json'))).toBe(false)
  })

  it('runs theme dev on another port when 9292 is taken, as by a theme dev for another Theme', async () => {
    const taken = createServer()
    // Another process may hold 9292 already; either way it is taken.
    await new Promise((resolve) => taken.once('error', resolve).listen(9292, '127.0.0.1', () => resolve(undefined)))
    cleanup.push(() => new Promise((resolve) => taken.close(() => resolve())))
    const cli = fakeShopify()
    await openStudio(fixtureTheme(), { cli })
    const { args } = await fakeRun(cli)
    expect(args.slice(-2)).toEqual(['--port', expect.stringMatching(/^\d+$/)])
    expect(args.at(-1)).not.toBe('9292')
  })

  it('keeps the preview on the same port when the Studio restarts, even with 9292 taken', async () => {
    const taken = createServer()
    await new Promise((resolve) => taken.once('error', resolve).listen(9292, '127.0.0.1', () => resolve(undefined)))
    cleanup.push(() => new Promise((resolve) => taken.close(() => resolve())))
    const theme = fixtureTheme()
    const first = fakeShopify()
    const studio = await openStudio(theme, { cli: first })
    const port = (await fakeRun(first)).args.at(-1)
    await studio.close()
    const second = fakeShopify()
    await openStudio(theme, { cli: second })
    expect((await fakeRun(second)).args.at(-1)).toBe(port)
  })

  it('stops theme dev when the Studio closes', async () => {
    const cli = fakeShopify({ output: running })
    const studio = await openStudio(fixtureTheme(), { cli })
    const { pid } = await fakeRun(cli)
    await studio.close()
    await expect.poll(() => isRunning(pid)).toBe(false)
  })
})

function isRunning(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
