import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer as createHttpServer } from 'node:http'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { projectDir, cleanup, tempDir, fixtureTheme, fakeShopify, openStudio, home, readTemplate, errors } from './helpers/studio.js'

describe('Studio API: store resource settings', () => {
  const realCatalog = path.join(projectDir, 'skills/shopify-theme-builder/catalog')
  const picks =
    '<div></div>\n{% schema %}{"name": "Picks", "settings": [' +
    '{"type": "product_list", "id": "products", "label": "Products", "limit": 2},' +
    '{"type": "collection_list", "id": "collections", "label": "Collections"},' +
    '{"type": "link_list", "id": "menu", "label": "Menu", "default": "main-menu"},' +
    '{"type": "product", "id": "product", "label": "Product"},' +
    '{"type": "page", "id": "page", "label": "Page"}' +
    '], "presets": [{"name": "Picks"}]}{% endschema %}\n'

  async function withSection(type: string) {
    const theme = fixtureTheme()
    writeFileSync(path.join(theme, 'sections/picks.liquid'), picks)
    const studio = await openStudio(theme, { catalog: realCatalog })
    const { body } = await studio.addSection(type)
    const id = body.home.at(-1).id
    const patch = (settings: object) => studio.send('PATCH', `api/home/sections/${id}`, { settings })
    const read = async () => (await studio.send('GET', `api/home/sections/${id}`)).body
    return { theme, studio, id, patch, read }
  }

  it("lists a section's collection and link settings with their values", async () => {
    const featured = await withSection('featured-collection')
    expect((await featured.read()).settings).toContainEqual({ id: 'collection', type: 'collection', label: 'Collection', value: '' })
    const hero = await withSection('hero')
    expect((await hero.read()).settings).toContainEqual({ id: 'button_link', type: 'url', label: 'Button link', value: '' })
    const custom = await withSection('picks')
    expect((await custom.read()).settings).toEqual([
      { id: 'products', type: 'product_list', label: 'Products', value: [] },
      { id: 'collections', type: 'collection_list', label: 'Collections', value: [] },
      { id: 'menu', type: 'link_list', label: 'Menu', value: 'main-menu' },
      { id: 'product', type: 'product', label: 'Product', value: '' },
      { id: 'page', type: 'page', label: 'Page', value: '' },
    ])
  })

  it('writes the featured collection by its handle into the template, with a clean Theme Check', async () => {
    const { theme, id, patch, read } = await withSection('featured-collection')
    const { status, body } = await patch({ collection: 'summer-sale' })
    expect(status).toBe(200)
    expect(errors(body.validation)).toEqual([])
    expect(readTemplate(theme).sections[id].settings.collection).toBe('summer-sale')
    expect((await read()).settings).toContainEqual(expect.objectContaining({ id: 'collection', value: 'summer-sale' }))
  })

  it('clears a store resource setting with an empty value', async () => {
    const { theme, id, patch } = await withSection('picks')
    await patch({ product: 'mug', products: ['mug', 'plate'], menu: 'footer', page: 'size-guide' })
    expect(readTemplate(theme).sections[id].settings).toMatchObject({ product: 'mug', products: ['mug', 'plate'], menu: 'footer', page: 'size-guide' })
    expect((await patch({ product: '', products: [], page: '' })).status).toBe(200)
    const { settings } = readTemplate(theme).sections[id]
    expect(settings).not.toHaveProperty('product')
    expect(settings).not.toHaveProperty('page')
    expect(settings).not.toHaveProperty('products')
  })

  it.each(['/collections/all', 'https://example.com/about', 'shopify://collections/summer-sale', 'mailto:hi@example.com', ''])(
    'writes the link %j',
    async (link) => {
      const { theme, id, patch } = await withSection('hero')
      expect((await patch({ button_link: link })).status).toBe(200)
      expect(readTemplate(theme).sections[id].settings.button_link).toBe(link || undefined)
    },
  )

  it.each([
    ['hero', { button_link: 'javascript:alert(1)' }, 'button_link'],
    ['hero', { button_link: 42 }, 'button_link'],
    ['featured-collection', { collection: 'summer sale' }, 'collection'],
    ['featured-collection', { collection: ['summer'] }, 'collection'],
    ['picks', { products: 'mug' }, 'products'],
    ['picks', { products: ['a', 'b', 'c'] }, 'products'],
    ['picks', { collections: ['ok', 'no way'] }, 'collections'],
    ['picks', { page: 'size guide' }, 'page'],
  ])('refuses %s %j', async (type, change, named) => {
    const { theme, patch } = await withSection(type)
    const before = readFileSync(path.join(theme, home), 'utf8')
    const { status, body } = await patch(change)
    expect(status).toBe(400)
    expect(body.error).toContain(named)
    expect(readFileSync(path.join(theme, home), 'utf8')).toBe(before)
  })

  it("lists the store's collections, products, menus and pages through the Shopify CLI's stored auth, read-only", async () => {
    const cli = fakeShopify({
      store: {
        collections: {
          nodes: [
            { handle: 'frontpage', title: 'Home page', productsCount: { count: 0 } },
            { handle: 'summer-sale', title: 'Summer sale', productsCount: { count: 8 } },
          ],
        },
        products: { nodes: [{ handle: 'mug', title: 'Mug' }] },
        menus: { nodes: [{ handle: 'main-menu', title: 'Main menu' }] },
        pages: { nodes: [{ handle: 'size-guide', title: 'Size guide' }] },
      },
    })
    const studio = await openStudio(fixtureTheme(), { cli })
    const { status, body } = await studio.send('GET', 'api/store')
    expect(status).toBe(200)
    expect(body).toEqual({
      collections: [
        { handle: 'frontpage', title: 'Home page', products: 0 },
        { handle: 'summer-sale', title: 'Summer sale', products: 8 },
      ],
      products: [{ handle: 'mug', title: 'Mug' }],
      menus: [{ handle: 'main-menu', title: 'Main menu' }],
      pages: [{ handle: 'size-guide', title: 'Size guide' }],
    })
    const [args]: string[][] = JSON.parse(readFileSync(path.join(path.dirname(cli), 'store.json'), 'utf8'))
    expect(args.slice(0, 4)).toEqual(['store', 'execute', '--store', 'example.myshopify.com'])
    expect(args).toContain('--json')
    expect(args).not.toContain('--allow-mutations')
    expect(args[args.indexOf('--query') + 1]).toContain('productsCount { count }')
  })

  it('tells how to authenticate the store when the CLI has no stored auth for it', async () => {
    const studio = await openStudio(fixtureTheme())
    const { status, body } = await studio.send('GET', 'api/store')
    expect(status).toBe(409)
    expect(body.error).toContain('shopify store auth --store example.myshopify.com --scopes read_products,read_online_store_navigation,read_online_store_pages,write_files,write_online_store_navigation,write_locales,write_products,write_publications`')
  })
})

describe("Studio API: images in the shop's Files", () => {
  /** A stand-in for Shopify's staged upload target: it keeps each multipart form posted to it. */
  async function uploadTarget() {
    const forms: FormData[] = []
    const server = createHttpServer(async (req, res) => {
      const chunks: Buffer[] = []
      for await (const chunk of req) chunks.push(chunk)
      forms.push(await new Response(Buffer.concat(chunks), { headers: { 'Content-Type': req.headers['content-type'] ?? '' } }).formData())
      res.statusCode = 201
      res.end()
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    cleanup.push(() => new Promise((resolve) => server.close(() => resolve())))
    return { url: `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}/upload`, forms }
  }

  const resourceUrl = 'https://shopify-staged-uploads.storage.googleapis.com/tmp/1/hero.png'
  const staged = (url: string) => ({
    stagedUploadsCreate: {
      stagedTargets: [{ url, resourceUrl, parameters: [{ name: 'key', value: 'tmp/1/hero.png' }, { name: 'policy', value: 'signed' }] }],
      userErrors: [],
    },
  })
  const created = { fileCreate: { files: [{ id: 'gid://shopify/MediaImage/7', fileStatus: 'UPLOADED' }], userErrors: [] } }
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])

  function localImage(name = 'hero.png', bytes: Uint8Array = png) {
    const file = path.join(tempDir('image-'), name)
    writeFileSync(file, bytes)
    return file
  }

  function storeCalls(cli: string): string[][] {
    const log = path.join(path.dirname(cli), 'store.json')
    return existsSync(log) ? JSON.parse(readFileSync(log, 'utf8')) : []
  }

  const variables = (args: string[]) => JSON.parse(args[args.indexOf('--variables') + 1])

  it("puts a local image into the shop's Files and answers the value an image_picker setting takes", async () => {
    const target = await uploadTarget()
    const cdn = 'https://cdn.shopify.com/s/files/1/0001/files/hero_4f2a.png?v=1727180000'
    const cli = fakeShopify({
      store: [
        staged(target.url),
        created,
        { node: { fileStatus: 'PROCESSING', fileErrors: [], image: null } },
        { node: { fileStatus: 'READY', fileErrors: [], image: { url: cdn } } },
      ],
    })
    const studio = await openStudio(fixtureTheme(), { cli })
    const { status, body } = await studio.send('POST', 'api/files', { path: localImage() })
    expect(status).toBe(200)
    expect(body).toEqual({ image: 'shopify://shop_images/hero_4f2a.png', url: cdn })

    expect(target.forms).toHaveLength(1)
    const [form] = target.forms
    expect(form.get('key')).toBe('tmp/1/hero.png')
    expect(form.get('policy')).toBe('signed')
    expect(new Uint8Array(await (form.get('file') as File).arrayBuffer())).toEqual(png)

    const [stage, create, ...polls] = storeCalls(cli)
    for (const args of [stage, create, ...polls]) expect(args.slice(0, 4)).toEqual(['store', 'execute', '--store', 'example.myshopify.com'])
    expect(stage).toContain('--allow-mutations')
    expect(variables(stage)).toEqual({
      input: [{ resource: 'IMAGE', filename: 'hero.png', mimeType: 'image/png', fileSize: String(png.length), httpMethod: 'POST' }],
    })
    expect(create).toContain('--allow-mutations')
    expect(variables(create)).toEqual({ files: [{ originalSource: resourceUrl, contentType: 'IMAGE' }] })
    expect(polls).toHaveLength(2)
    for (const args of polls) {
      expect(args).not.toContain('--allow-mutations')
      expect(variables(args)).toEqual({ id: 'gid://shopify/MediaImage/7' })
    }
  })

  it.each([
    ['a type Shopify images are not', () => ({ path: localImage('hero.svg') }), 'jpg'],
    ['a file over 20 MB', () => ({ path: localImage('hero.png', new Uint8Array(20 * 1024 * 1024 + 1)) }), '20 MB'],
    ['a missing file', () => ({ path: path.join(tempDir('image-'), 'gone.png') }), 'gone.png'],
    ['a relative path', () => ({ path: 'hero.png' }), 'absolute'],
    ['no path', () => ({}), 'absolute'],
  ])('refuses %s with a 400, without calling the store', async (_, body, named) => {
    const cli = fakeShopify({ store: {} })
    const studio = await openStudio(fixtureTheme(), { cli })
    const answer = await studio.send('POST', 'api/files', body())
    expect(answer.status).toBe(400)
    expect(answer.body.error).toContain(named)
    expect(storeCalls(cli)).toEqual([])
  })

  it("quotes only the CLI's error, without its escape codes or the lines before it", async () => {
    const cli = fakeShopify({
      storeError:
        '\x1b[2K\x1b[1A\x1b[2K\x1b[G  value="shopify-ai-toolkit@claude-plugins-official" />\n' +
        'Loading stored store auth...\n' +
        '\x1b[31m╭─ error ──────────────────────────────╮\x1b[39m\n' +
        '│                                      │\n' +
        '│  No stored app authentication found  │\n' +
        '│  for example.myshopify.com.          │\n' +
        '╰──────────────────────────────────────╯\n',
    })
    const studio = await openStudio(fixtureTheme(), { cli })
    const { status, body } = await studio.send('POST', 'api/files', { path: localImage() })
    expect(status).toBe(409)
    expect(body.error).toMatch(/The CLI said: error No stored app authentication found for example\.myshopify\.com\.$/)
  })

  it('tells the command that grants write_files when the CLI has no stored auth or scope for it', async () => {
    const studio = await openStudio(fixtureTheme())
    const { status, body } = await studio.send('POST', 'api/files', { path: localImage() })
    expect(status).toBe(409)
    expect(body.error).toContain('`shopify store auth --store example.myshopify.com --scopes read_products,read_online_store_navigation,read_online_store_pages,write_files,write_online_store_navigation,write_locales,write_products,write_publications`')
  })

  it("answers Shopify's error when it can't process the image", async () => {
    const target = await uploadTarget()
    const cli = fakeShopify({
      store: [staged(target.url), created, { node: { fileStatus: 'FAILED', fileErrors: [{ message: 'Image is corrupt.' }], image: null } }],
    })
    const studio = await openStudio(fixtureTheme(), { cli })
    const { status, body } = await studio.send('POST', 'api/files', { path: localImage() })
    expect(status).toBe(502)
    expect(body.error).toContain('Image is corrupt.')
  })
})
