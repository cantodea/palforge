import { describe, expect, it } from 'vitest'
import { decodeRle, indexedToRgba } from './rle'

describe('PAL RLE images', () => {
  it('restores literal pixels and transparent runs', () => {
    const bytes = new Uint8Array([3, 0, 2, 0, 2, 1, 2, 0x81, 3, 3, 4, 5])
    const image = decodeRle(bytes)
    expect([image.width, image.height]).toEqual([3, 2])
    expect(Array.from(image.pixels)).toEqual([1, 2, 0, 3, 4, 5])
    expect(Array.from(image.alpha)).toEqual([255, 255, 0, 255, 255, 255])
  })

  it('applies palette colors without making palette index zero implicitly transparent', () => {
    const image = decodeRle(new Uint8Array([1, 0, 1, 0, 1, 0]))
    const colors = Array.from({ length: 256 }, (_, value) => ({ r: value, g: 0, b: 0, a: 255 }))
    expect(Array.from(indexedToRgba(image, { index: 0, variant: 'day', colors }))).toEqual([0, 0, 0, 255])
  })
})
