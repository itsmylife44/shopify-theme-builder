#!/usr/bin/env node
// Usage: create-theme <dir> --name <shop name> --author <author> [--documentation-url <url>] [--support-url <url>]
// Creates a new Theme in <dir> (which must not exist or be empty): the Base Theme, the catalog files
// every Theme starts with, its name, author, documentation and support links, and a Git repository on main.
import { parseArgs } from 'node:util'
import { createTheme } from '../server/create-theme.mjs'

try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      name: { type: 'string' },
      author: { type: 'string' },
      'documentation-url': { type: 'string' },
      'support-url': { type: 'string' },
    },
  })
  if (positionals.length !== 1) {
    throw new Error('Usage: create-theme <dir> --name <shop name> --author <author> [--documentation-url <url>] [--support-url <url>]')
  }
  createTheme({
    theme: positionals[0],
    name: values.name ?? '',
    author: values.author ?? '',
    documentationUrl: values['documentation-url'],
    supportUrl: values['support-url'],
  })
  console.log(`Created the Theme in ${positionals[0]}`)
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
