import { describe, expect, it } from 'vitest'
import type { PalEventObject, PalSceneRecord } from './scene'
import type { PalSceneCatalog } from './sceneLoader'
import type { PalScriptEntry } from './script'
import {
  buildResourceSemanticIndex,
  describeResourceChunk,
  getArchiveSemantic,
  resourceChunkKey,
  resourceChunkUri,
} from './resourceSemantics'

function event(index: number, spriteNumber: number): PalEventObject {
  return {
    index,
    vanishTime: 0,
    x: 32 + index * 16,
    y: 48 + index * 8,
    layer: 0,
    triggerScript: 0x40 + index,
    autoScript: 0,
    state: 1,
    triggerMode: 1,
    spriteNumber,
    spriteFrames: 3,
    direction: 0,
    currentFrame: 0,
    scriptIdleFrame: 0,
    spritePointerOffset: 0,
    autoSpriteFrames: 0,
    autoScriptIdleFrameCount: 0,
  }
}

function script(index: number, operation: number, operand0: number): PalScriptEntry {
  return { index, operation, operands: [operand0, 0, 0] }
}

describe('resource semantic index', () => {
  const scenes: PalSceneRecord[] = [
    { number: 1, mapNumber: 2, scriptOnEnter: 0x20, scriptOnTeleport: 0, eventObjectIndex: 0 },
    { number: 2, mapNumber: 2, scriptOnEnter: 0x30, scriptOnTeleport: 0x31, eventObjectIndex: 2 },
    { number: 3, mapNumber: 0, scriptOnEnter: 0, scriptOnTeleport: 0, eventObjectIndex: 3 },
  ]
  const catalog: PalSceneCatalog = {
    scenes,
    availableScenes: scenes.slice(0, 2),
    eventObjects: [event(0, 4), event(1, 4), event(2, 9)],
    scriptEntries: [
      script(0x50, 0x0036, 7),
      script(0x51, 0x0037, 0),
      script(0x52, 0x0076, 12),
      script(0x53, 0x00a4, 12),
      script(0x54, 0x0065, 9),
    ],
    messages: [],
    messageEncoding: null,
  }

  it('describes known archives without pretending every chunk has an original name', () => {
    expect(getArchiveSemantic('mgo.mkf')).toMatchObject({ title: '场景精灵', indexed: true })
    expect(resourceChunkUri('MGO.MKF', 9)).toBe('pal://archives/MGO.MKF/chunks/9')
  })

  it('cross-references maps and scene sprites from scene/event tables', () => {
    const index = buildResourceSemanticIndex(catalog)
    expect(index.get(resourceChunkKey('MAP.MKF', 2))?.map((reference) => reference.sceneNumber)).toEqual([1, 2])
    expect(index.get(resourceChunkKey('GOP.MKF', 2))).toHaveLength(2)
    expect(index.get(resourceChunkKey('MGO.MKF', 4))?.map((reference) => reference.eventObjectIndex)).toEqual([0, 1])
    expect(index.get(resourceChunkKey('MGO.MKF', 9))?.map((reference) => reference.kind)).toEqual(['event', 'script'])
  })

  it('finds RNG and FBP operands in the complete script table', () => {
    const index = buildResourceSemanticIndex(catalog)
    expect(index.get(resourceChunkKey('RNG.MKF', 7))?.[0]).toMatchObject({ scriptEntry: 0x50, kind: 'script' })
    expect(index.get(resourceChunkKey('FBP.MKF', 12))?.map((reference) => reference.scriptEntry)).toEqual([0x52, 0x53])
  })

  it('marks an unreferenced indexed resource conservatively', () => {
    const semantic = describeResourceChunk('MGO.MKF', 99, buildResourceSemanticIndex(catalog))
    expect(semantic.confidence).toBe('unresolved')
    expect(semantic.summary).toContain('不代表资源一定废弃')
    expect(semantic.searchText).toContain('mgo.mkf')
  })
})
