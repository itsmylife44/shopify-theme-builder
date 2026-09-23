import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const projectDir = fileURLToPath(new URL('..', import.meta.url))
const read = (file: string) => readFileSync(`${projectDir}${file}`, 'utf8')
const version = JSON.parse(read('package.json')).version

describe('Release version', () => {
  it('is semver', () => {
    expect(version).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('matches in both package.json files, their lock files and the SKILL.md metadata', () => {
    for (const file of ['package-lock.json', 'skills/shopify-theme-builder/package.json', 'skills/shopify-theme-builder/package-lock.json']) {
      const pkg = JSON.parse(read(file))
      expect(pkg.version, file).toBe(version)
      if (pkg.packages) expect(pkg.packages[''].version, file).toBe(version)
    }
    const frontmatter = read('skills/shopify-theme-builder/SKILL.md').match(/^---\n([\s\S]*?)\n---/)![1]
    expect(frontmatter).toContain(`\nmetadata:\n  version: "${version}"`)
  })

  it('has its CHANGELOG entry, under an Unreleased section', () => {
    const changelog = read('CHANGELOG.md')
    const headings = [...changelog.matchAll(/^## \[(.+?)\]/gm)].map((m) => m[1])
    expect(headings.slice(0, 2)).toEqual(['Unreleased', version])
    expect(changelog).toContain(`\n[${version}]: https://github.com/itsmylife44/shopify-theme-builder/releases/tag/v${version}`)
  })
})
