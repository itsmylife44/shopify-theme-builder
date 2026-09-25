import { readFileSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { pinDocs, validate } from '../skills/shopify-theme-builder/studio/server/studio.mjs'
import { errors, fixtureTheme, tempDir } from './helpers/studio.js'

describe('Theme Check', () => {
  it('runs offline, on the JSON schemas bundled with it', async () => {
    const requests = [vi.spyOn(http, 'request'), vi.spyOn(https, 'request'), vi.spyOn(globalThis, 'fetch')]
    try {
      expect(errors(await validate(fixtureTheme()))).toEqual([])
      for (const request of requests) expect(request).not.toHaveBeenCalled()
    } finally {
      for (const request of requests) request.mockRestore()
    }
  })

  it('pins its docs into its cache, and names a JSON schema that does not load instead of skipping it', () => {
    const docs = tempDir('docs-')
    const cache = tempDir('cache-')
    writeFileSync(path.join(docs, 'manifest_theme.json'), JSON.stringify({ schemas: [{ uri: 'theme/section.json' }, { uri: 'theme/block.json' }] }))
    writeFileSync(path.join(docs, 'section.json'), '{"type": "object"}')
    writeFileSync(path.join(docs, 'block.json'), '')
    expect(() => pinDocs(docs, cache)).toThrow(`Theme Check can't load the JSON schema theme/block.json from ${docs}.`)

    writeFileSync(path.join(docs, 'block.json'), '{}')
    pinDocs(docs, cache)
    expect(readFileSync(path.join(cache, 'section.json'), 'utf8')).toBe('{"type": "object"}')
  })
})
