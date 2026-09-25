import { existsSync, statSync, utimesSync, writeFileSync } from 'node:fs'
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

  // theme dev's storefront session can expire (#113): the store then answers 401.
  it('restarts theme dev when the store refuses its storefront session, then serves the preview again', async () => {
    let expired = true
    const themeDev = createHttpServer((req, res) => {
      if (expired) return res.writeHead(401).end()
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

  /**
   * A theme dev that sends every client to the password page until the store password is posted to it, which
   * brings its storefront session back for every client, cookie or not, as Shopify CLI 4.8.2 does (#223).
   */
  async function lockedThemeDev(password: string) {
    const themeDev = {
      locked: true,
      posted: [] as string[],
      url: '',
    }
    const server = createHttpServer((req, res) => {
      if (req.method === 'POST' && req.url === '/password') {
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', () => {
          themeDev.posted.push(body)
          const form = new URLSearchParams(body)
          if (form.get('form_type') === 'storefront_password' && form.get('password') === password) themeDev.locked = false
          res.writeHead(302, { Location: themeDev.locked ? '/password' : '/' }).end()
        })
        return
      }
      if (req.url === '/password') return res.writeHead(200, { 'Content-Type': 'text/html' }).end('<html><body><p>Password</p></body></html>')
      if (themeDev.locked) return res.writeHead(302, { Location: `${themeDev.url}/password` }).end()
      res.writeHead(200, { 'Content-Type': 'text/html' }).end('<html><body><p>Shop</p></body></html>')
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    cleanup.push(() => new Promise((resolve) => server.close(() => resolve())))
    themeDev.url = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`
    return themeDev
  }

  it('posts the store password when the preview sends clients to the password page, so every client gets the storefront', async () => {
    const themeDev = await lockedThemeDev('secret')
    const cli = fakeShopify({ output: running.replace('http://127.0.0.1:9292', themeDev.url) })
    const studio = await openStudio(fixtureTheme(), { cli, storePassword: 'secret' })
    await expect.poll(() => studio.readPreview()).toMatchObject({ status: 'running', url: themeDev.url })
    expect(themeDev.locked).toBe(false)
    // Screenshots, axe and Lighthouse open the preview in a fresh browser, with no cookie.
    expect(await (await fetch(`${themeDev.url}/`)).text()).toContain('<p>Shop</p>')

    // The session drops again: the Studio's iframe gets the storefront all the same, with no restart.
    const { pid } = await fakeRun(cli)
    const { body } = await studio.send('GET', 'api/frame')
    themeDev.locked = true
    const page = await fetch(`${body.url}/`, { redirect: 'manual' })
    expect(page.status).toBe(200)
    expect(await page.text()).toContain('<p>Shop</p>')
    expect((await fakeRun(cli)).pid).toBe(pid)
    expect(themeDev.posted.length).toBe(2)
  })

  it('restarts theme dev once, then reports the password page, when the store refuses the password', async () => {
    const themeDev = await lockedThemeDev('secret')
    const cli = fakeShopify({ output: running.replace('http://127.0.0.1:9292', themeDev.url) })
    const studio = await openStudio(fixtureTheme(), { cli, storePassword: 'wrong' })
    await expect
      .poll(() => studio.readPreview())
      .toMatchObject({ status: 'password-page', message: expect.stringContaining('--store-password') })
    expect((await fakeRun(cli)).runs).toBe(2)
    // The iframe gets no password page, and a refused password is no reason for a restart loop.
    expect((await studio.send('GET', 'api/frame')).status).toBe(409)
    expect((await studio.readPreview()).status).toBe('password-page')
    expect((await fakeRun(cli)).runs).toBe(2)
    // Once the preview serves the storefront again, it is running again.
    themeDev.locked = false
    await expect.poll(() => studio.readPreview()).toMatchObject({ status: 'running', url: themeDev.url })
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

  // theme dev's watcher can miss a section the Studio copied in (#222); Shopify words the refusal in the account's language.
  it.each([
    ['English', 'Section type "hero" does not refer to an existing section file'],
    ['Italian', 'Il tipo di sezione "hero" non fa riferimento a un file sezione esistente'],
  ])('touches a section missing on the store, then the template that names it (%s)', async (_, reason) => {
    const theme = fixtureTheme()
    const [section, template] = ['sections/hero.liquid', 'templates/index.json'].map((file) => path.join(theme, file))
    writeFileSync(section, '<div>Hero</div>')
    const long = new Date('2026-01-01')
    for (const file of [section, template]) utimesSync(file, long, long)
    const modified = (file: string) => statSync(file).mtimeMs > long.getTime()
    const cli = fakeShopify({
      output: running,
      later: `Failed to upload file "templates/index.json" to remote theme. ${reason}\n`,
      onSignal: '• 10:02:11  Synced » update sections/hero.liquid\n',
    })
    await openStudio(theme, { cli })

    await expect.poll(() => modified(section)).toBe(true)
    // The template waits for the section to reach the store.
    expect(modified(template)).toBe(false)
    process.kill((await fakeRun(cli)).pid, 'SIGUSR2')
    await expect.poll(() => modified(template)).toBe(true)
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
