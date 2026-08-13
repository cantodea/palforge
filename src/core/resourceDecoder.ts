import type { IndexedImage, PalPalette } from '../types'
import { hasAscii, readU32 } from './binary'
import { decodePatChunk } from './palette'
import { decodeFbp, decodeRle, looksLikeRle } from './rle'
import { decodeSprite, looksLikeSprite, type SpriteFrame } from './sprite'
import { decompressYj1, isYj1 } from './yj1'
import { decompressYj2, looksLikeYj2 } from './yj2'

export type GameProfile = 'auto' | 'dos' | 'win95'
export type DecodedKind = 'sprite' | 'rle' | 'fbp' | 'palette' | 'binary' | 'empty'

export type ChunkInspection = {
  archiveName: string
  chunkIndex: number
  raw: Uint8Array
  payload: Uint8Array
  compression: 'none' | 'YJ_1' | 'YJ_2'
  kind: DecodedKind
  frames: SpriteFrame[]
  image?: IndexedImage
  palettes?: PalPalette[]
  notes: string[]
}

const COMPRESSED_ARCHIVES = new Set(['ABC.MKF', 'F.MKF', 'FBP.MKF', 'FIRE.MKF', 'GOP.MKF', 'MAP.MKF', 'MGO.MKF'])

function tryYj2(bytes: Uint8Array): Uint8Array | null {
  if (!looksLikeYj2(bytes)) return null
  try { return decompressYj2(bytes) } catch { return null }
}

function findRle(bytes: Uint8Array): { image: IndexedImage; skipped: number } | null {
  for (const skipped of [0, 2, 4]) {
    const candidate = bytes.subarray(skipped)
    if (!looksLikeRle(candidate)) continue
    try { return { image: decodeRle(candidate), skipped } } catch { /* try next prefix */ }
  }
  return null
}

export function inspectChunk(
  raw: Uint8Array,
  archiveName: string,
  chunkIndex: number,
  profile: GameProfile,
): ChunkInspection {
  const normalizedName = archiveName.toUpperCase()
  const notes: string[] = []
  if (raw.length === 0) return { archiveName, chunkIndex, raw, payload: raw, compression: 'none', kind: 'empty', frames: [], notes: ['空 chunk'] }

  let payload = raw
  let compression: ChunkInspection['compression'] = 'none'
  if (isYj1(raw)) {
    payload = decompressYj1(raw)
    compression = 'YJ_1'
  } else if (profile === 'win95' || (profile === 'auto' && COMPRESSED_ARCHIVES.has(normalizedName))) {
    const decompressed = tryYj2(raw)
    if (decompressed) {
      payload = decompressed
      compression = 'YJ_2'
    } else if (profile === 'win95') {
      notes.push('未能按 YJ_2 解压，改为检查原始 chunk')
    }
  }

  if (normalizedName === 'PAT.MKF') {
    try {
      const palettes = decodePatChunk(payload, chunkIndex)
      return { archiveName, chunkIndex, raw, payload, compression, kind: 'palette', frames: [], palettes, notes }
    } catch (error) {
      notes.push(error instanceof Error ? error.message : String(error))
    }
  }

  if (payload.length === 320 * 200 && (normalizedName === 'FBP.MKF' || !looksLikeSprite(payload))) {
    const image = decodeFbp(payload)
    return { archiveName, chunkIndex, raw, payload, compression, kind: 'fbp', frames: [], image, notes }
  }

  if (looksLikeSprite(payload)) {
    const frames = decodeSprite(payload)
    return { archiveName, chunkIndex, raw, payload, compression, kind: 'sprite', frames, image: frames[0].image, notes }
  }

  const direct = findRle(payload)
  if (direct) {
    if (direct.skipped > 0) notes.push(`跳过 ${direct.skipped} 字节资源前缀后识别为 RLE`)
    return { archiveName, chunkIndex, raw, payload, compression, kind: 'rle', frames: [], image: direct.image, notes }
  }

  if (hasAscii(payload, 'YJ_1')) notes.push('检测到 YJ_1，但未成功解码')
  if (payload.length >= 4) notes.push(`前四字节（LE）：0x${readU32(payload, 0).toString(16).padStart(8, '0')}`)
  notes.push('该 chunk 暂未识别为 sprite、RLE、FBP 或 PAT')
  return { archiveName, chunkIndex, raw, payload, compression, kind: 'binary', frames: [], notes }
}
