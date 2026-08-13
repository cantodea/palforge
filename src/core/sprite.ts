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

type FrameRange = { index: number; offset: number; end: number }

/**
 * PAL sprites have N frame starts followed by an end sentinel. Some shipped
 * resources (including enemy battle sprites) contain a zero/broken sentinel;
 * SDLPAL never reads that sentinel when locating a frame, so use the payload
 * boundary as the final end in that case.
 */
function frameRanges(bytes: Uint8Array): FrameRange[] {
  if (bytes.length < 4) return []
  const tableWords = readU16(bytes, 0)
  const frameCount = tableWords - 1
  if (tableWords < 2 || tableWords > 4096 || tableWords * 2 > bytes.length) return []

  const starts = Array.from({ length: frameCount }, (_, index) => ({
    index,
    offset: readU16(bytes, index * 2) * 2,
  }))
  if (starts[0]?.offset !== tableWords * 2) return []

  return starts.flatMap((frame, position) => {
    if (frame.offset < tableWords * 2 || frame.offset >= bytes.length) return []
    const next = starts.slice(position + 1).find((candidate) => candidate.offset > frame.offset && candidate.offset <= bytes.length)
    const sentinel = position === frameCount - 1 ? readU16(bytes, tableWords * 2 - 2) * 2 : 0
    const end = next?.offset ?? (sentinel > frame.offset && sentinel <= bytes.length ? sentinel : bytes.length)
    return end > frame.offset ? [{ ...frame, end }] : []
  })
}

export function looksLikeSprite(bytes: Uint8Array): boolean {
  try {
    return frameRanges(bytes).some(({ offset, end }) => looksLikeRle(bytes.subarray(offset, end)))
  } catch {
    return false
  }
}

export function decodeSprite(bytes: Uint8Array): SpriteFrame[] {
  if (!looksLikeSprite(bytes)) throw new SpriteFormatError('数据不是有效的 PAL sprite')
  const frames: SpriteFrame[] = []

  for (const { index, offset, end } of frameRanges(bytes)) {
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
