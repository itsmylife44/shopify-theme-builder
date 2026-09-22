// Seam 2: assembles an example Theme (the Base Theme plus every Section Catalog
// file) in a temp folder and runs Theme Check on it. Exits 1 on any error.
// Usage: node scripts/check-theme.mjs [catalogDir]   (default: catalog/)
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Severity, check } from '@shopify/theme-check-node'

const projectDir = fileURLToPath(new URL('..', import.meta.url))
const catalogDir = path.resolve(process.argv[2] ?? path.join(projectDir, 'catalog'))

const theme = mkdtempSync(path.join(tmpdir(), 'example-theme-'))
try {
  cpSync(path.join(projectDir, 'base-theme'), theme, { recursive: true })
  if (existsSync(catalogDir)) cpSync(catalogDir, theme, { recursive: true })

  const offenses = await check(theme)
  for (const offense of offenses) {
    const file = path.relative(theme, fileURLToPath(offense.uri))
    const level = offense.severity === Severity.ERROR ? 'error' : 'warning'
    console.log(`${file}:${offense.start.line} ${level} ${offense.check}: ${offense.message}`)
  }
  const errors = offenses.filter((offense) => offense.severity === Severity.ERROR).length
  console.log(`Theme Check: ${errors} errors, ${offenses.length - errors} warnings`)
  process.exitCode = errors > 0 ? 1 : 0
} finally {
  rmSync(theme, { recursive: true, force: true })
}
