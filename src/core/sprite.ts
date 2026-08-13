import type { IndexedImage } from '../types'
import { readU16 } from './binary'
import { decodeRle, looksLikeRle } from './rle'

export class SpriteFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SpriteFormatError'
  }
}

export type SpriteFrame = {
  index: number
  offset: number
  size: number
  image: IndexedImage
}

export function looksLikeSprite(bytes: Uint8Array): boolean {
  if (bytes.length < 8) return false
  try {
    const tableWords = readU16(bytes, 0)
    if (tableWords < 2 || tableWords > 4096 || tableWords * 2 > bytes.length) return false
    let previous = tableWords * 2
    for (let index = 0; index < tableWords; index += 1) {
      const offset = readU16(bytes, index * 2) * 2
      if (offset < previous || offset > bytes.length) return false
      previous = offset
    }
    const first = readU16(bytes, 0) * 2
    const second = readU16(bytes, 2) * 2
    return second > first && looksLikeRle(bytes.subarray(first, second))
  } catch {
    return false
  }
}

export function decodeSprite(bytes: Uint8Array): SpriteFrame[] {
  if (!looksLikeSprite(bytes)) throw new SpriteFormatError('数据不是有效的 PAL sprite')
  const tableWords = readU16(bytes, 0)
  const frameCount = tableWords - 1
  const frames: SpriteFrame[] = []

  for (let index = 0; index < frameCount; index += 1) {
    const offset = readU16(bytes, index * 2) * 2
    const end = readU16(bytes, (index + 1) * 2) * 2
    if (end <= offset || end > bytes.length) continue
    const encoded = bytes.subarray(offset, end)
    if (!looksLikeRle(encoded)) continue
    try {
      frames.push({ index, offset, size: encoded.length, image: decodeRle(encoded) })
    } catch {
      // A damaged frame should not hide the rest of a usable sprite.
    }
  }

  if (frames.length === 0) throw new SpriteFormatError('sprite 偏移表存在，但没有可解码的 RLE 帧')
  return frames
}
