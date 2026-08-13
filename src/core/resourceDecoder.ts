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

const ARCHIVE_NOTES: Record<string, string> = {
  'ABC.MKF': 'ABC.MKF 通常是敌方战斗 sprite；非空资源仍未识别时可能存在原版兼容性偏移。',
  'BALL.MKF': 'BALL.MKF 通常是物品或装备的单张 RLE 图像。',
  'DATA.MKF': 'DATA.MKF 是角色、敌人、法术和战场等结构化数据；数据表解析器尚未实现。',
  'F.MKF': 'F.MKF 通常是玩家战斗 sprite。',
  'FIRE.MKF': 'FIRE.MKF 通常是战斗与法术效果 sprite。',
  'GOP.MKF': 'GOP.MKF 是地图图块资源，需要与 MAP.MKF 联合解析；tileset 预览尚未实现。',
  'MAP.MKF': 'MAP.MKF 是场景地图数据，需要与 GOP.MKF 联合解析；地图解码器尚未实现。',
  'MGO.MKF': 'MGO.MKF 通常是场景角色与对象 sprite。',
  'MUS.MKF': 'MUS.MKF 是音乐资源；MIDI/RIX 播放器尚未实现。',
  'RGM.MKF': 'RGM.MKF 通常是角色头像等单张 RLE 图像。',
  'RNG.MKF': 'RNG.MKF 内部还有一层帧索引并保存增量动画；RNG 播放器尚未实现。',
  'SOUNDS.MKF': 'SOUNDS.MKF 是 WAVE 音效库；音频播放器尚未实现。',
  'SSS.MKF': 'SSS.MKF 是场景、对象和脚本结构化数据；脚本解析器尚未实现。',
}

function tryYj2(bytes: Uint8Array, heuristic = true): Uint8Array | null {
  if (heuristic && !looksLikeYj2(bytes)) return null
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
    const decompressed = tryYj2(raw, profile !== 'win95')
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
  notes.push(ARCHIVE_NOTES[normalizedName] ?? '该 chunk 暂未识别为 sprite、RLE、FBP 或 PAT')
  return { archiveName, chunkIndex, raw, payload, compression, kind: 'binary', frames: [], notes }
}
