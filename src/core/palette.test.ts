import { describe, expect, it } from 'vitest'
import { adjustPalette, blendPalettes, decodePatChunk } from './palette'

describe('PAT palettes', () => {
  it('decodes day and night palettes and expands VGA values', () => {
    const bytes = new Uint8Array(1536)
    bytes.set([1, 2, 63], 0)
    bytes.set([4, 5, 6], 768)
    const palettes = decodePatChunk(bytes, 3)
    expect(palettes).toHaveLength(2)
    expect(palettes[0].colors[0]).toEqual({ r: 4, g: 8, b: 252, a: 255 })
    expect(palettes[1].colors[0]).toEqual({ r: 16, g: 20, b: 24, a: 255 })
  })

  it('interpolates day and night without changing palette indices', () => {
    const day = { index: 2, variant: 'day' as const, colors: [{ r: 20, g: 40, b: 60, a: 255 }] }
    const night = { index: 2, variant: 'night' as const, colors: [{ r: 0, g: 20, b: 40, a: 255 }] }
    expect(blendPalettes(day, night, 0.5)).toEqual({
      index: 2,
      variant: 'night',
      colors: [{ r: 10, g: 30, b: 50, a: 255 }],
    })
  })

  it('applies preview-only brightness, saturation and contrast adjustments', () => {
    const palette = { index: 1, variant: 'day' as const, colors: [{ r: 200, g: 100, b: 50, a: 255 }] }
    const grayscale = adjustPalette(palette, { brightness: 1, saturation: 0, contrast: 1 })
    expect(grayscale.colors[0].r).toBe(grayscale.colors[0].g)
    expect(grayscale.colors[0].g).toBe(grayscale.colors[0].b)
    expect(adjustPalette(palette, { brightness: 2, saturation: 1, contrast: 1 }).colors[0].r).toBe(255)
  })
})
