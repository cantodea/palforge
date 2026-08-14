import type { SceneDebugMode } from './sceneDebugger'

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

export function createSdlpalLaunchTarget(options: {
  scene: number
  tile: { x: number; y: number; half: number }
  mode: SceneDebugMode
  entry: number
  eventObjectId: number
  direction?: number
  label: string
}): SdlpalLaunchTarget {
  const worldX = options.tile.x * 32 + options.tile.half * 16
  const worldY = options.tile.y * 16 + options.tile.half * 8
  const runTriggerImmediately = options.mode === 'scene-teleport' || options.mode === 'event-trigger'
  const runAutoImmediately = options.mode === 'event-auto'
  return {
    scene: options.scene,
    worldX,
    worldY,
    eventObjectId: options.eventObjectId,
    scriptEntry: runTriggerImmediately || runAutoImmediately ? options.entry : 0,
    scriptMode: runAutoImmediately ? 2 : runTriggerImmediately ? 1 : 0,
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
