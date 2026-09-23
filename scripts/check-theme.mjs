// Assembles an example Theme (the Base Theme plus every Section Catalog
// file) in a temp folder and runs Theme Check on it. Exits 1 on any error.
// Usage: node scripts/check-theme.mjs [catalogDir]   (default: skills/shopify-theme-builder/catalog/)
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { validate } from '../skills/shopify-theme-builder/studio/server/studio.mjs'

const projectDir = fileURLToPath(new URL('..', import.meta.url))
const catalogDir = path.resolve(process.argv[2] ?? path.join(projectDir, 'skills/shopify-theme-builder/catalog'))

const theme = mkdtempSync(path.join(tmpdir(), 'example-theme-'))
try {
  cpSync(path.join(projectDir, 'skills/shopify-theme-builder/base-theme'), theme, { recursive: true })
  if (existsSync(catalogDir)) cpSync(catalogDir, theme, { recursive: true })

  const offenses = await validate(theme)
  for (const { file, line, severity, check, message } of offenses) {
    console.log(`${file}:${line} ${severity} ${check}: ${message}`)
  }
  const errors = offenses.filter((offense) => offense.severity === 'error').length
  console.log(`Theme Check: ${errors} errors, ${offenses.length - errors} warnings`)
  process.exitCode = errors > 0 ? 1 : 0
} finally {
  rmSync(theme, { recursive: true, force: true })
}
