#!/usr/bin/env node
// Usage: studio --theme <dir> [--port <n>]
// Starts the Studio for the Theme in <dir> and prints its URL.
import { parseArgs } from 'node:util'
import { startStudio } from '../server/studio.mjs'

try {
  const { values } = parseArgs({ options: { theme: { type: 'string' }, port: { type: 'string' } } })
  if (!values.theme) throw new Error('Usage: studio --theme <dir> [--port <n>]')
  const server = await startStudio({ theme: values.theme, port: values.port ? Number(values.port) : undefined })
  server.printUrls()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
