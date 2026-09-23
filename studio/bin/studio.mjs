#!/usr/bin/env node
// Usage: studio --theme <dir> --store <shop>.myshopify.com [--store-password <password>] [--port <n>]
// Starts the Studio for the Theme in <dir>, with `shopify theme dev` on <shop> for the preview, and prints its URL.
// --store-password opens the storefront's password page, which development stores always have.
import { parseArgs } from 'node:util'
import { startStudio } from '../server/studio.mjs'

try {
  const { values } = parseArgs({
    options: {
      theme: { type: 'string' },
      store: { type: 'string' },
      'store-password': { type: 'string' },
      port: { type: 'string' },
    },
  })
  if (!values.theme || !values.store) {
    throw new Error(
      'Usage: studio --theme <dir> --store <shop>.myshopify.com [--store-password <password>] [--port <n>]\n' +
        '--store is required, and each Theme needs its own store (the Shopify CLI keeps one development theme per store per machine).\n' +
        'Create a free development store with `shopify store create dev --demo-data`.',
    )
  }
  const server = await startStudio({
    theme: values.theme,
    store: values.store,
    storePassword: values['store-password'],
    port: values.port ? Number(values.port) : undefined,
  })
  // Vite closes the Studio, and so theme dev, on SIGTERM; do the same on Ctrl-C.
  process.once('SIGINT', () => server.close().finally(() => process.exit(130)))
  server.printUrls()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
