import { describe, expect, it } from 'vitest'
import { encodeRle, encodeSprite, encodeYj1, quantizeAnimationFrame } from './palEncoder'
import { decodeRle } from './rle'
import { decodeSprite } from './sprite'
import { decompressYj1 } from './yj1'
import { decompressYj2, encodeYj2 } from './yj2'
import { grayscalePalette } from './palette'

describe('runtime PAL codecs', () => {
  it.each([1, 2, 127, 128, 256, 512])('preserves transparent and opaque runs at width %i', (width) => {
    const pixels = Uint8Array.from({ length: width * 4 }, (_, i) => i & 255)
    const alpha = Uint8Array.from(pixels, (_, i) => i < width || i % 7 === 0 ? 0 : 255)
    const image = { width, height: 4, pixels, alpha }
    const decoded = decodeRle(encodeRle(image))
    expect(decoded.alpha).toEqual(alpha)
    expect([...decoded.pixels].filter((_, i) => alpha[i])).toEqual([...pixels].filter((_, i) => alpha[i]))
  })

  it('word-aligns frame starts and preserves original frame slots', () => {
    const frames = [3, 4, 5].map((width) => ({ width, height: 1, pixels: new Uint8Array(width).fill(width), alpha: new Uint8Array(width).fill(255) }))
    expect(decodeSprite(encodeSprite(frames)).map((frame) => frame.image)).toEqual(frames)
  })

  it('refuses sprites that cannot be addressed with 16-bit word offsets', () => {
    const frame = { width: 512, height: 512, pixels: new Uint8Array(512 * 512), alpha: new Uint8Array(512 * 512).fill(255) }
    expect(() => encodeSprite([frame])).toThrow(/16 位/)
  })

  it('matches colours and binary alpha while aligning the foot anchor', () => {
    const frame = { id: 'frame', name: 'test', dataUrl: '', width: 2, height: 1, anchorX: 0, anchorY: 1, durationMs: 100 }
    const palette = { ...grayscalePalette(), index: 0 }
    const image = quantizeAnimationFrame({ width: 2, height: 1, data: new Uint8ClampedArray([22, 22, 22, 128, 99, 99, 99, 127]) }, frame, palette)
    expect(image.width).toBe(4)
    expect(image.height).toBe(2)
    expect([...image.alpha]).toEqual([0, 0, 255, 0, 0, 0, 0, 0])
    expect(image.pixels[2]).toBe(22)
    expect(() => quantizeAnimationFrame({ width: 1, height: 1, data: new Uint8ClampedArray(4) }, frame, palette)).toThrow(/尺寸/)
    expect(() => quantizeAnimationFrame({ width: 2, height: 1, data: new Uint8ClampedArray(8) }, { ...frame, anchorY: -1 }, palette)).toThrow(/锚点/)
  })

  it.each([1, 16384, 16385, 70000])('encodes %i bytes for DOS stored blocks and Win95 Huffman rescaling', (length) => {
    let seed = 0x12345678
    const input = Uint8Array.from({ length }, () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed & 255 })
    expect(decompressYj1(encodeYj1(input))).toEqual(input)
    expect(decompressYj2(encodeYj2(input))).toEqual(input)
  })
})
