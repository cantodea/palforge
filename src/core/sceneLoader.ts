import type { ImportedResource } from '../types'
import type { MkfChunk } from './mkf'
import { decompressPalChunk, type GameProfile } from './resourceDecoder'
import {
  parsePalEventObjects,
  parsePalMap,
  parsePalSceneTable,
  sceneEventRange,
  type PalEventObject,
  type PalMapData,
  type PalSceneRecord,
} from './scene'
import { decodeSprite, type SpriteFrame } from './sprite'

export class PalSceneLoadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PalSceneLoadError'
  }
}

export type PalArchiveSource = {
  name: string
  file: File
  chunks: MkfChunk[]
}

export type PalArchiveSet = Map<string, PalArchiveSource>

export type PalSceneCatalog = {
  scenes: PalSceneRecord[]
  availableScenes: PalSceneRecord[]
  eventObjects: PalEventObject[]
}

export type LoadedPalEvent = {
  object: PalEventObject
  frames: SpriteFrame[]
  error?: string
}

export type LoadedPalScene = {
  record: PalSceneRecord
  map: PalMapData
  tileset: SpriteFrame[]
  events: LoadedPalEvent[]
  warnings: string[]
  compression: 'none' | 'YJ_1' | 'YJ_2'
}

const REQUIRED_ARCHIVES = ['SSS.MKF', 'MAP.MKF', 'GOP.MKF'] as const

export function createPalArchiveSet(resources: ImportedResource[]): PalArchiveSet {
  const archives = new Map<string, PalArchiveSource>()
  for (const resource of resources) {
    if (!resource.file || !resource.chunkIndex || resource.kind !== 'mkf') continue
    archives.set(resource.name.toUpperCase(), {
      name: resource.name,
      file: resource.file,
      chunks: resource.chunkIndex,
    })
  }
  return archives
}

function requireArchive(archives: PalArchiveSet, name: string): PalArchiveSource {
  const archive = archives.get(name)
  if (!archive) throw new PalSceneLoadError(`缺少 ${name}，无法读取真实场景`)
  return archive
}

async function readChunk(archive: PalArchiveSource, index: number): Promise<Uint8Array> {
  const chunk = archive.chunks[index]
  if (!chunk) throw new PalSceneLoadError(`${archive.name} 不存在 chunk #${index}`)
  const buffer = await archive.file.slice(chunk.offset, chunk.offset + chunk.size).arrayBuffer()
  return new Uint8Array(buffer)
}

export async function loadPalSceneCatalog(archives: PalArchiveSet): Promise<PalSceneCatalog> {
  const sss = requireArchive(archives, 'SSS.MKF')
  const [eventBytes, sceneBytes] = await Promise.all([readChunk(sss, 0), readChunk(sss, 1)])
  const scenes = parsePalSceneTable(sceneBytes)
  const eventObjects = parsePalEventObjects(eventBytes)
  const mapCount = archives.get('MAP.MKF')?.chunks.length ?? Number.POSITIVE_INFINITY
  const gopCount = archives.get('GOP.MKF')?.chunks.length ?? Number.POSITIVE_INFINITY

  const availableScenes = scenes.slice(0, -1).filter((scene, index) => {
    const next = scenes[index + 1]
    const hasSceneData = scene.mapNumber > 0 || scene.scriptOnEnter > 0 || scene.scriptOnTeleport > 0 || next.eventObjectIndex > scene.eventObjectIndex
    return hasSceneData && scene.mapNumber > 0 && scene.mapNumber < mapCount && scene.mapNumber < gopCount
  })

  if (availableScenes.length === 0) {
    throw new PalSceneLoadError('SSS.MKF 中没有找到可与 MAP/GOP 对应的场景')
  }
  return { scenes, availableScenes, eventObjects }
}

function eventFrameIndex(object: PalEventObject): number {
  let current = object.currentFrame
  if (object.spriteFrames === 3) {
    if (current === 2) current = 0
    if (current === 3) current = 2
  }
  return object.direction * object.spriteFrames + current
}

export function selectEventFrame(event: LoadedPalEvent): SpriteFrame | undefined {
  const wanted = eventFrameIndex(event.object)
  return event.frames.find((frame) => frame.index === wanted) ?? event.frames[0]
}

export async function loadPalScene(
  archives: PalArchiveSet,
  catalog: PalSceneCatalog,
  sceneNumber: number,
  profile: GameProfile,
): Promise<LoadedPalScene> {
  for (const name of REQUIRED_ARCHIVES) requireArchive(archives, name)
  const record = catalog.scenes[sceneNumber - 1]
  if (!record) throw new PalSceneLoadError(`场景 #${sceneNumber} 不存在`)
  if (record.mapNumber <= 0) throw new PalSceneLoadError(`场景 #${sceneNumber} 没有关联有效地图`)

  const mapArchive = requireArchive(archives, 'MAP.MKF')
  const gopArchive = requireArchive(archives, 'GOP.MKF')
  const [mapRaw, gopRaw] = await Promise.all([
    readChunk(mapArchive, record.mapNumber),
    readChunk(gopArchive, record.mapNumber),
  ])
  const decompressedMap = decompressPalChunk(mapRaw, 'MAP.MKF', profile)
  const map = parsePalMap(decompressedMap.payload)

  let tileset: SpriteFrame[]
  try {
    // GOP chunks are raw PAL sprite packs. Unlike MAP/MGO, SDLPAL reads them directly.
    tileset = decodeSprite(gopRaw)
  } catch (error) {
    throw new PalSceneLoadError(`GOP.MKF #${record.mapNumber} 图块包无法解析：${error instanceof Error ? error.message : String(error)}`)
  }

  const range = sceneEventRange(catalog.scenes, sceneNumber, catalog.eventObjects.length)
  const objects = catalog.eventObjects.slice(range.start, range.end)
  const warnings: string[] = [...decompressedMap.notes]
  const mgo = archives.get('MGO.MKF')
  const spriteCache = new Map<number, Promise<{ frames: SpriteFrame[]; error?: string }>>()

  const loadSprite = (spriteNumber: number) => {
    const cached = spriteCache.get(spriteNumber)
    if (cached) return cached
    const task = (async () => {
      if (!mgo) return { frames: [], error: '缺少 MGO.MKF' }
      if (spriteNumber === 0) return { frames: [] }
      try {
        const raw = await readChunk(mgo, spriteNumber)
        const decoded = decompressPalChunk(raw, 'MGO.MKF', profile)
        return { frames: decodeSprite(decoded.payload) }
      } catch (error) {
        return { frames: [], error: error instanceof Error ? error.message : String(error) }
      }
    })()
    spriteCache.set(spriteNumber, task)
    return task
  }

  const events = await Promise.all(objects.map(async (object) => {
    const sprite = await loadSprite(object.spriteNumber)
    if (sprite.error) warnings.push(`事件 #${object.index + 1} / MGO #${object.spriteNumber}：${sprite.error}`)
    return { object, ...sprite }
  }))

  return {
    record,
    map,
    tileset,
    events,
    warnings,
    compression: decompressedMap.compression,
  }
}
