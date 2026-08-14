import { readI16, readU16, readU32 } from './binary'

export const PAL_SCENE_RECORD_SIZE = 8
export const PAL_EVENT_OBJECT_SIZE = 32
export const PAL_MAP_WIDTH = 64
export const PAL_MAP_HEIGHT = 128
export const PAL_MAP_HALVES = 2
export const PAL_MAP_BYTE_LENGTH = PAL_MAP_WIDTH * PAL_MAP_HEIGHT * PAL_MAP_HALVES * 4

export class PalSceneFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PalSceneFormatError'
  }
}

export type PalSceneRecord = {
  number: number
  mapNumber: number
  scriptOnEnter: number
  scriptOnTeleport: number
  eventObjectIndex: number
}

export type PalEventObject = {
  index: number
  vanishTime: number
  x: number
  y: number
  layer: number
  triggerScript: number
  autoScript: number
  state: number
  triggerMode: number
  spriteNumber: number
  spriteFrames: number
  direction: number
  currentFrame: number
  scriptIdleFrame: number
  spritePointerOffset: number
  autoSpriteFrames: number
  autoScriptIdleFrameCount: number
}

export type PalMapTile = {
  raw: number
  bottomFrame: number
  topFrame: number | null
  blocked: boolean
  bottomHeight: number
  topHeight: number
}

export type PalMapData = {
  width: typeof PAL_MAP_WIDTH
  height: typeof PAL_MAP_HEIGHT
  halves: typeof PAL_MAP_HALVES
  tiles: PalMapTile[][][]
}

export function parsePalSceneTable(bytes: Uint8Array): PalSceneRecord[] {
  if (bytes.length < PAL_SCENE_RECORD_SIZE || bytes.length % PAL_SCENE_RECORD_SIZE !== 0) {
    throw new PalSceneFormatError(`SSS.MKF #1 长度必须是 ${PAL_SCENE_RECORD_SIZE} 的倍数`)
  }

  return Array.from({ length: bytes.length / PAL_SCENE_RECORD_SIZE }, (_, index) => {
    const offset = index * PAL_SCENE_RECORD_SIZE
    return {
      number: index + 1,
      mapNumber: readU16(bytes, offset),
      scriptOnEnter: readU16(bytes, offset + 2),
      scriptOnTeleport: readU16(bytes, offset + 4),
      eventObjectIndex: readU16(bytes, offset + 6),
    }
  })
}

export function parsePalEventObjects(bytes: Uint8Array): PalEventObject[] {
  if (bytes.length % PAL_EVENT_OBJECT_SIZE !== 0) {
    throw new PalSceneFormatError(`SSS.MKF #0 长度必须是 ${PAL_EVENT_OBJECT_SIZE} 的倍数`)
  }

  return Array.from({ length: bytes.length / PAL_EVENT_OBJECT_SIZE }, (_, index) => {
    const offset = index * PAL_EVENT_OBJECT_SIZE
    return {
      index,
      vanishTime: readI16(bytes, offset),
      x: readU16(bytes, offset + 2),
      y: readU16(bytes, offset + 4),
      layer: readI16(bytes, offset + 6),
      triggerScript: readU16(bytes, offset + 8),
      autoScript: readU16(bytes, offset + 10),
      state: readI16(bytes, offset + 12),
      triggerMode: readU16(bytes, offset + 14),
      spriteNumber: readU16(bytes, offset + 16),
      spriteFrames: readU16(bytes, offset + 18),
      direction: readU16(bytes, offset + 20),
      currentFrame: readU16(bytes, offset + 22),
      scriptIdleFrame: readU16(bytes, offset + 24),
      spritePointerOffset: readU16(bytes, offset + 26),
      autoSpriteFrames: readU16(bytes, offset + 28),
      autoScriptIdleFrameCount: readU16(bytes, offset + 30),
    }
  })
}

function frameIndex(word: number): number {
  return (word & 0xff) | ((word >>> 4) & 0x100)
}

export function parsePalMap(bytes: Uint8Array): PalMapData {
  if (bytes.length !== PAL_MAP_BYTE_LENGTH) {
    throw new PalSceneFormatError(`MAP 解压后应为 ${PAL_MAP_BYTE_LENGTH} 字节，实际为 ${bytes.length} 字节`)
  }

  const tiles = Array.from({ length: PAL_MAP_HEIGHT }, (_, y) =>
    Array.from({ length: PAL_MAP_WIDTH }, (_, x) =>
      Array.from({ length: PAL_MAP_HALVES }, (_, half) => {
        const offset = ((y * PAL_MAP_WIDTH + x) * PAL_MAP_HALVES + half) * 4
        const raw = readU32(bytes, offset)
        const upper = raw >>> 16
        const encodedTopFrame = frameIndex(upper)
        return {
          raw,
          bottomFrame: frameIndex(raw),
          topFrame: encodedTopFrame === 0 ? null : encodedTopFrame - 1,
          blocked: (raw & 0x2000) !== 0,
          bottomHeight: (raw >>> 8) & 0xf,
          topHeight: (upper >>> 8) & 0xf,
        }
      }),
    ),
  )

  return { width: PAL_MAP_WIDTH, height: PAL_MAP_HEIGHT, halves: PAL_MAP_HALVES, tiles }
}

export function sceneEventRange(
  scenes: PalSceneRecord[],
  sceneNumber: number,
  eventObjectCount: number,
): { start: number; end: number } {
  const sceneIndex = sceneNumber - 1
  const scene = scenes[sceneIndex]
  const sentinel = scenes[sceneIndex + 1]
  if (!scene || !sentinel) throw new PalSceneFormatError(`场景 #${sceneNumber} 缺少记录或下一条事件索引哨兵`)
  if (sentinel.eventObjectIndex < scene.eventObjectIndex) {
    throw new PalSceneFormatError(`场景 #${sceneNumber} 的事件对象索引倒序`)
  }
  if (sentinel.eventObjectIndex > eventObjectCount) {
    throw new PalSceneFormatError(`场景 #${sceneNumber} 的事件对象范围超出 SSS.MKF #0`)
  }
  return { start: scene.eventObjectIndex, end: sentinel.eventObjectIndex }
}
