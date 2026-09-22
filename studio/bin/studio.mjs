#!/usr/bin/env node
// Usage: studio --theme <dir> [--store <shop>.myshopify.com] [--port <n>]
// Starts the Studio for the Theme in <dir>, with `shopify theme dev` on <shop> for the preview, and prints its URL.
import { parseArgs } from 'node:util'
import { startStudio } from '../server/studio.mjs'

try {
  const { values } = parseArgs({
    options: { theme: { type: 'string' }, store: { type: 'string' }, port: { type: 'string' } },
  })
  if (!values.theme) throw new Error('Usage: studio --theme <dir> [--store <shop>.myshopify.com] [--port <n>]')
  const server = await startStudio({
    theme: values.theme,
    store: values.store,
    port: values.port ? Number(values.port) : undefined,
  })
  // Vite closes the Studio, and so theme dev, on SIGTERM; do the same on Ctrl-C.
  process.once('SIGINT', () => server.close().finally(() => process.exit(130)))
  server.printUrls()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
