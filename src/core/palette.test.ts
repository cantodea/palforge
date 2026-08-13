import { describe, expect, it } from 'vitest'
import { decodePatChunk } from './palette'

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
})
