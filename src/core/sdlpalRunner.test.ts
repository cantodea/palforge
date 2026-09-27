import { describe, expect, it } from 'vitest'
import type { PalEventObject, PalMapData } from './scene'
import {
  createSdlpalLaunchTarget,
  findSafeSdlpalSpawn,
  findSdlpalSpawnHazard,
  isSdlpalRunnerMessage,
  selectSdlpalFiles,
} from './sdlpalRunner'

function event(overrides: Partial<PalEventObject> = {}): PalEventObject {
  return {
    index: 12,
    vanishTime: 0,
    x: 320,
    y: 160,
    layer: 0,
    triggerScript: 0x0570,
    autoScript: 0,
    state: 1,
    triggerMode: 5,
    spriteNumber: 0,
    spriteFrames: 0,
    direction: 0,
    currentFrame: 0,
    scriptIdleFrame: 0,
    spritePointerOffset: 0,
    autoSpriteFrames: 0,
    autoScriptIdleFrameCount: 0,
    ...overrides,
  }
}

function map(blocked: Array<[number, number, number]> = []): PalMapData {
  const blockedKeys = new Set(blocked.map((tile) => tile.join(':')))
  const tiles = Array.from({ length: 128 }, (_, y) => Array.from({ length: 64 }, (_, x) => Array.from({ length: 2 }, (_, half) => ({
    raw: 0,
    bottomFrame: 0,
    topFrame: null,
    blocked: blockedKeys.has(`${x}:${y}:${half}`),
    bottomHeight: 0,
    topHeight: 0,
  }))))
  return { width: 64, height: 128, halves: 2, tiles }
}

describe('SDLPAL runner bridge', () => {
  it('converts a selected PAL tile into engine world coordinates', () => {
    expect(createSdlpalLaunchTarget({
      scene: 6,
      tile: { x: 10, y: 105, half: 0 },
      mode: 'event-trigger',
      entry: 0x0570,
      eventObjectId: 116,
      direction: 5,
      label: 'event #116',
    })).toMatchObject({
      scene: 6,
      worldX: 320,
      worldY: 1680,
      eventObjectId: 116,
      scriptEntry: 0x0570,
      scriptMode: 1,
      direction: 1,
    })
  })

  it('lets scene-enter and auto scripts execute naturally without a duplicate first frame', () => {
    const sceneEnter = createSdlpalLaunchTarget({ scene: 2, tile: { x: 1, y: 2, half: 1 }, mode: 'scene-enter', entry: 42, eventObjectId: 0, label: 'enter' })
    const auto = createSdlpalLaunchTarget({ scene: 2, tile: { x: 1, y: 2, half: 1 }, mode: 'event-auto', entry: 99, eventObjectId: 8, label: 'auto' })
    expect(sceneEnter).toMatchObject({ worldX: 48, worldY: 40, scriptEntry: 0, scriptMode: 0 })
    expect(auto).toMatchObject({ scriptEntry: 0, scriptMode: 0 })
  })

  it('matches SDLPAL touch-trigger distance and ignores search-only events', () => {
    const tile = { x: 10, y: 10, half: 0 }
    expect(findSdlpalSpawnHazard(tile, [event()])).toMatchObject({ eventObjectId: 13, distance: 0, threshold: 48 })
    expect(findSdlpalSpawnHazard(tile, [event({ triggerMode: 3 })])).toBeNull()
    expect(findSdlpalSpawnHazard({ x: 12, y: 10, half: 0 }, [event()])).toBeNull()
  })

  it('moves an unsafe or blocked launch point to the nearest safe half-tile', () => {
    const preferred = { x: 10, y: 10, half: 0 }
    const safe = findSafeSdlpalSpawn(map([[10, 9, 0]]), [event()], preferred)
    expect(safe).not.toBeNull()
    expect(findSdlpalSpawnHazard(safe!, [event()])).toBeNull()
    expect(map([[10, 9, 0]]).tiles[safe!.y][safe!.x][safe!.half].blocked).toBe(false)
  })

  it('normalizes game files and ignores an injected runner control file', () => {
    const files = [new File(['a'], 'SSS.MKF'), new File(['b'], 'sss.mkf'), new File(['c'], 'palforge-runner.json'), new File(['d'], 'M.MSG')]
    expect(selectSdlpalFiles(files).map((file) => file.name)).toEqual(['M.MSG', 'sss.mkf'])
  })

  it('accepts only messages from the isolated runtime frame', () => {
    expect(isSdlpalRunnerMessage({ source: 'palforge-sdlpal', type: 'status', status: 'ready', message: 'ready' })).toBe(true)
    expect(isSdlpalRunnerMessage({ source: 'other', type: 'status', message: 'ready' })).toBe(false)
  })
})
