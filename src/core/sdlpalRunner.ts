import type { SceneDebugMode } from './sceneDebugger'
import type { PalEventObject, PalMapData } from './scene'

export type SdlpalRunnerStatus = 'booting' | 'ready' | 'mounting' | 'running' | 'error' | 'exited'

export type SdlpalLaunchTarget = {
  scene: number
  worldX: number
  worldY: number
  eventObjectId: number
  scriptEntry: number
  scriptMode: 0 | 1 | 2
  direction: number
  label: string
}

export type SdlpalRunnerMessage = {
  source: 'palforge-sdlpal'
  type: 'status' | 'log' | 'error'
  status?: SdlpalRunnerStatus
  message: string
  progress?: { current: number; total: number }
}

export type SdlpalTile = { x: number; y: number; half: number }

export type SdlpalSpawnHazard = {
  eventObjectId: number
  triggerMode: number
  distance: number
  threshold: number
}

export function sdlpalTileToWorld(tile: SdlpalTile): { x: number; y: number } {
  return {
    x: tile.x * 32 + tile.half * 16,
    y: tile.y * 16 + tile.half * 8,
  }
}

export function findSdlpalSpawnHazard(
  tile: SdlpalTile,
  events: PalEventObject[],
): SdlpalSpawnHazard | null {
  const world = sdlpalTileToWorld(tile)
  for (const event of events) {
    if (event.state <= 0 || event.vanishTime !== 0 || event.triggerScript === 0 || event.triggerMode < 4) continue
    const distance = Math.abs(world.x - event.x) + Math.abs(world.y - event.y) * 2
    const threshold = (event.triggerMode - 4) * 32 + 16
    if (distance < threshold) {
      return { eventObjectId: event.index + 1, triggerMode: event.triggerMode, distance, threshold }
    }
  }
  return null
}

export function findSafeSdlpalSpawn(
  map: PalMapData,
  events: PalEventObject[],
  preferred: SdlpalTile,
): SdlpalTile | null {
  if (
    preferred.x >= 0 && preferred.x < map.width
    && preferred.y >= 0 && preferred.y < map.height
    && preferred.half >= 0 && preferred.half < map.halves
    && !map.tiles[preferred.y][preferred.x][preferred.half].blocked
    && !findSdlpalSpawnHazard(preferred, events)
  ) return preferred

  const origin = sdlpalTileToWorld(preferred)
  let best: { tile: SdlpalTile; score: number } | null = null
  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      for (let half = 0; half < map.halves; half += 1) {
        if (map.tiles[y][x][half].blocked) continue
        const tile = { x, y, half }
        if (findSdlpalSpawnHazard(tile, events)) continue
        const world = sdlpalTileToWorld(tile)
        const score = Math.abs(world.x - origin.x) + Math.abs(world.y - origin.y) * 2
        if (!best || score < best.score) best = { tile, score }
      }
    }
  }
  return best?.tile ?? null
}

export function createSdlpalLaunchTarget(options: {
  scene: number
  tile: SdlpalTile
  mode: SceneDebugMode
  entry: number
  eventObjectId: number
  direction?: number
  label: string
}): SdlpalLaunchTarget {
  const world = sdlpalTileToWorld(options.tile)
  const runTriggerImmediately = options.mode === 'scene-teleport' || options.mode === 'event-trigger'
  return {
    scene: options.scene,
    worldX: world.x,
    worldY: world.y,
    eventObjectId: options.eventObjectId,
    // Scene-enter and event-auto scripts are already scheduled by the engine.
    // Replaying an auto entry here would execute it twice during the first frame.
    scriptEntry: runTriggerImmediately ? options.entry : 0,
    scriptMode: runTriggerImmediately ? 1 : 0,
    direction: (options.direction ?? 0) & 3,
    label: options.label,
  }
}

export function isSdlpalRunnerMessage(value: unknown): value is SdlpalRunnerMessage {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<SdlpalRunnerMessage>
  return candidate.source === 'palforge-sdlpal'
    && (candidate.type === 'status' || candidate.type === 'log' || candidate.type === 'error')
    && typeof candidate.message === 'string'
}

export function selectSdlpalFiles(files: File[]): File[] {
  const selected = new Map<string, File>()
  for (const file of files) {
    const name = file.name.toLowerCase()
    if (!name || name === 'palforge-runner.json') continue
    selected.set(name, file)
  }
  return [...selected.values()].sort((left, right) => left.name.localeCompare(right.name))
}
