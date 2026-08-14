import { describe, expect, it } from 'vitest'
import { decodeSprite, looksLikeSprite } from './sprite'

describe('PAL sprites', () => {
  it('uses the word offset table to separate RLE frames', () => {
    const frameA = [1, 0, 1, 0, 1, 7]
    const frameB = [1, 0, 1, 0, 1, 9]
    const bytes = new Uint8Array([3, 0, 6, 0, 9, 0, ...frameA, ...frameB])
    expect(looksLikeSprite(bytes)).toBe(true)
    const frames = decodeSprite(bytes)
    expect(frames).toHaveLength(2)
    expect(frames.map((frame) => frame.image.pixels[0])).toEqual([7, 9])
  })

  it('uses the payload boundary when a shipped sprite has a broken final sentinel', () => {
    const frameA = [1, 0, 1, 0, 1, 7]
    const frameB = [1, 0, 1, 0, 1, 9]
    const bytes = new Uint8Array([3, 0, 6, 0, 0, 0, ...frameA, ...frameB])
    expect(looksLikeSprite(bytes)).toBe(true)
    expect(decodeSprite(bytes).map((frame) => frame.image.pixels[0])).toEqual([7, 9])
  })
})
