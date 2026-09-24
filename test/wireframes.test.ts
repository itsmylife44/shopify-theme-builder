import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { layoutWireframe, wireframes } from '../skills/shopify-theme-builder/studio/src/wireframes.mjs'

const catalog = fileURLToPath(new URL('../skills/shopify-theme-builder/catalog/sections', import.meta.url))

/** The presets of each catalog section the Studio can add to a page: not the header's and footer's group sections. */
function pagePresets() {
  return readdirSync(catalog)
    .filter((file) => file.endsWith('.liquid'))
    .flatMap((file) => {
      const schema = JSON.parse(readFileSync(path.join(catalog, file), 'utf8').match(/{% schema %}([\s\S]*){% endschema %}/)![1])
      if (schema.enabled_on?.groups) return []
      const type = file.slice(0, -'.liquid'.length)
      return (schema.presets ?? []).map((preset: { name: string }) => [type, preset.name])
    })
}

describe('Studio section picker wireframes', () => {
  const presets = pagePresets()
  it.each(presets)('has a wireframe for the %s preset %s that lays out', (type, name) => {
    const wireframe = wireframes[type]?.[name]?.wireframe
    expect(wireframe).toEqual(expect.any(String))
    expect(layoutWireframe(wireframe!).length).toBeGreaterThan(0)
  })

  // Sibling presets are told apart by a line under their name; a section's only preset has its section's description.
  const siblingPresets = presets.filter(([type]) => presets.filter(([other]) => other === type).length > 1)
  it.each(siblingPresets)(
    'describes the %s preset %s in one short line',
    (type, name) => {
      const description = wireframes[type]?.[name]?.description
      expect(description).toEqual(expect.any(String))
      expect(description!.length).toBeLessThanOrEqual(60)
    },
  )

  it('lays out columns side by side, an image filling its column and text centred in its own', () => {
    expect(layoutWireframe('image | heading')).toEqual([
      { tone: 'image', x: 8, y: 8, width: 69, height: 84 },
      { tone: 'strong', x: 83, y: 47.5, width: 41.4, height: 5 },
    ])
  })

  it('stacks rows by their weight, and repeats a column', () => {
    const shapes = layoutWireframe('heading / 3* image x2')
    // 84 high less one 6 gap: 19.5 for the heading row, 58.5 for the cards.
    expect(shapes.filter((shape) => shape.tone === 'image')).toEqual([
      { tone: 'image', x: 8, y: 33.5, width: 69, height: 58.5 },
      { tone: 'image', x: 83, y: 33.5, width: 69, height: 58.5 },
    ])
  })

  it('puts text over an image at a position, on a panel', () => {
    const [image, panel, heading] = layoutWireframe('image@bl panel heading')
    expect(image).toEqual({ tone: 'image', x: 8, y: 8, width: 144, height: 84 })
    expect(panel.tone).toBe('panel')
    expect(heading.tone).toBe('strong')
    // Inside the panel, at the image's bottom left.
    expect(heading.x).toBeGreaterThan(panel.x)
    expect(heading.y + heading.height).toBeLessThan(panel.y + panel.height)
    expect(panel.x).toBeLessThan(40)
    expect(panel.y + panel.height).toBeGreaterThan(80)
  })

  it('draws two buttons side by side, centred with the column', () => {
    expect(layoutWireframe('center buttons')).toEqual([
      { tone: 'strong', x: 56.5, y: 47, width: 22, height: 6 },
      { tone: 'outline', x: 81.5, y: 47, width: 22, height: 6 },
    ])
  })

  it('names a part it does not know', () => {
    expect(() => layoutWireframe('image | haeding')).toThrow('haeding')
  })
})
