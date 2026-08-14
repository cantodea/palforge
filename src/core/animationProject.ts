export const FORGE_ANIMATION_PROJECT_VERSION = 1
export const FORGE_ANIMATION_PACK_FORMAT = 'palforge-animation-pack' as const

export type ForgeAnimationSource = {
  kind: 'custom' | 'derived'
  originalUri: string | null
}

export type ForgeAnimationFrame = {
  id: string
  name: string
  dataUrl: string
  width: number
  height: number
  durationMs: number
  anchorX: number
  anchorY: number
}

export type ForgeAnimationDraft = {
  formatVersion: typeof FORGE_ANIMATION_PROJECT_VERSION
  id: string
  uri: string
  name: string
  loop: boolean
  source: ForgeAnimationSource
  frames: ForgeAnimationFrame[]
  createdAt: number
  updatedAt: number
}

export type ForgeAnimationFrameInput = Omit<ForgeAnimationFrame, 'id'> & { id?: string }

export type ForgeAnimationPack = {
  format: typeof FORGE_ANIMATION_PACK_FORMAT
  version: typeof FORGE_ANIMATION_PROJECT_VERSION
  animations: ForgeAnimationDraft[]
}

export type ForgeSpriteSheetLayout = {
  columns: number
  rows: number
  cellWidth: number
  cellHeight: number
  width: number
  height: number
}

function slug(value: string): string {
  return value.toLowerCase().trim()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'animation'
}

function cloneFrame(frame: ForgeAnimationFrame): ForgeAnimationFrame {
  return { ...frame }
}

function cloneAnimation(animation: ForgeAnimationDraft): ForgeAnimationDraft {
  return {
    ...animation,
    source: { ...animation.source },
    frames: animation.frames.map(cloneFrame),
  }
}

export function nextForgeAnimationId(name: string, animations: ForgeAnimationDraft[]): string {
  const base = slug(name)
  const used = new Set(animations.map((animation) => animation.id))
  if (!used.has(base)) return base
  let suffix = 2
  while (used.has(`${base}-${suffix}`)) suffix += 1
  return `${base}-${suffix}`
}

export function createForgeAnimationDraft(
  name: string,
  animations: ForgeAnimationDraft[] = [],
  now = Date.now(),
  source: ForgeAnimationSource = { kind: 'custom', originalUri: null },
): ForgeAnimationDraft {
  if (source.kind === 'derived' && !source.originalUri?.startsWith('pal://')) {
    throw new Error('派生动画必须引用 pal:// 原版资源')
  }
  const id = nextForgeAnimationId(name, animations)
  return {
    formatVersion: FORGE_ANIMATION_PROJECT_VERSION,
    id,
    uri: `project://animations/${id}`,
    name,
    loop: true,
    source: source.kind === 'custom' ? { kind: 'custom', originalUri: null } : { ...source },
    frames: [],
    createdAt: now,
    updatedAt: now,
  }
}

export function addForgeAnimationFrames(
  animation: ForgeAnimationDraft,
  frames: ForgeAnimationFrameInput[],
  now = Date.now(),
): ForgeAnimationDraft {
  const used = new Set(animation.frames.map((frame) => frame.id))
  let next = animation.frames.length + 1
  const added = frames.map((frame) => {
    let id = frame.id ?? `frame-${next++}`
    while (used.has(id)) id = `frame-${next++}`
    used.add(id)
    return { ...frame, id }
  })
  return { ...cloneAnimation(animation), frames: [...animation.frames.map(cloneFrame), ...added], updatedAt: now }
}

export function updateForgeAnimation(
  animation: ForgeAnimationDraft,
  patch: Partial<Pick<ForgeAnimationDraft, 'name' | 'loop'>>,
  now = Date.now(),
): ForgeAnimationDraft {
  return { ...cloneAnimation(animation), ...patch, id: animation.id, uri: animation.uri, updatedAt: now }
}

export function updateForgeAnimationFrame(
  animation: ForgeAnimationDraft,
  frameId: string,
  patch: Partial<Pick<ForgeAnimationFrame, 'name' | 'durationMs' | 'anchorX' | 'anchorY'>>,
  now = Date.now(),
): ForgeAnimationDraft {
  return {
    ...cloneAnimation(animation),
    frames: animation.frames.map((frame) => frame.id === frameId ? { ...frame, ...patch, id: frame.id } : cloneFrame(frame)),
    updatedAt: now,
  }
}

export function moveForgeAnimationFrame(
  animation: ForgeAnimationDraft,
  frameId: string,
  direction: -1 | 1,
  now = Date.now(),
): ForgeAnimationDraft {
  const frames = animation.frames.map(cloneFrame)
  const index = frames.findIndex((frame) => frame.id === frameId)
  const target = index + direction
  if (index < 0 || target < 0 || target >= frames.length) return cloneAnimation(animation)
  ;[frames[index], frames[target]] = [frames[target], frames[index]]
  return { ...cloneAnimation(animation), frames, updatedAt: now }
}

export function duplicateForgeAnimationFrame(
  animation: ForgeAnimationDraft,
  frameId: string,
  now = Date.now(),
): ForgeAnimationDraft {
  const frames = animation.frames.map(cloneFrame)
  const index = frames.findIndex((frame) => frame.id === frameId)
  if (index < 0) return cloneAnimation(animation)
  let suffix = 2
  let id = `${frames[index].id}-copy`
  const used = new Set(frames.map((frame) => frame.id))
  while (used.has(id)) id = `${frames[index].id}-copy-${suffix++}`
  frames.splice(index + 1, 0, { ...frames[index], id, name: `${frames[index].name} 副本` })
  return { ...cloneAnimation(animation), frames, updatedAt: now }
}

export function removeForgeAnimationFrame(
  animation: ForgeAnimationDraft,
  frameId: string,
  now = Date.now(),
): ForgeAnimationDraft {
  return { ...cloneAnimation(animation), frames: animation.frames.filter((frame) => frame.id !== frameId).map(cloneFrame), updatedAt: now }
}

export function createForgeAnimationPack(animations: ForgeAnimationDraft[]): ForgeAnimationPack {
  return {
    format: FORGE_ANIMATION_PACK_FORMAT,
    version: FORGE_ANIMATION_PROJECT_VERSION,
    animations: animations.map(cloneAnimation),
  }
}

function finiteInteger(value: unknown, min: number, max: number): value is number {
  return Number.isInteger(value) && Number(value) >= min && Number(value) <= max
}

function parseFrame(value: unknown): ForgeAnimationFrame | null {
  if (!value || typeof value !== 'object') return null
  const frame = value as Partial<ForgeAnimationFrame>
  if (
    typeof frame.id !== 'string' || !frame.id
    || typeof frame.name !== 'string'
    || typeof frame.dataUrl !== 'string' || !/^data:image\/(?:png|webp|jpeg);base64,/i.test(frame.dataUrl)
    || !finiteInteger(frame.width, 1, 8192)
    || !finiteInteger(frame.height, 1, 8192)
    || !finiteInteger(frame.durationMs, 16, 60000)
    || !finiteInteger(frame.anchorX, -8192, 8192)
    || !finiteInteger(frame.anchorY, -8192, 8192)
  ) return null
  return {
    id: frame.id,
    name: frame.name,
    dataUrl: frame.dataUrl,
    width: frame.width,
    height: frame.height,
    durationMs: frame.durationMs,
    anchorX: frame.anchorX,
    anchorY: frame.anchorY,
  }
}

export function parseForgeAnimationDrafts(value: unknown): ForgeAnimationDraft[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((candidate): ForgeAnimationDraft[] => {
    if (!candidate || typeof candidate !== 'object') return []
    const animation = candidate as Partial<ForgeAnimationDraft>
    const source = animation.source as Partial<ForgeAnimationSource> | undefined
    if (
      animation.formatVersion !== FORGE_ANIMATION_PROJECT_VERSION
      || typeof animation.id !== 'string' || !animation.id
      || animation.uri !== `project://animations/${animation.id}`
      || typeof animation.name !== 'string'
      || typeof animation.loop !== 'boolean'
      || !source || (source.kind !== 'custom' && source.kind !== 'derived')
      || !(source.originalUri === null || typeof source.originalUri === 'string')
      || (source.kind === 'custom' && source.originalUri !== null)
      || (source.kind === 'derived' && (typeof source.originalUri !== 'string' || !source.originalUri.startsWith('pal://')))
      || !Array.isArray(animation.frames)
    ) return []
    const frames = animation.frames.map(parseFrame)
    if (frames.some((frame) => frame === null)) return []
    return [{
      formatVersion: FORGE_ANIMATION_PROJECT_VERSION,
      id: animation.id,
      uri: animation.uri,
      name: animation.name,
      loop: animation.loop,
      source: { kind: source.kind, originalUri: source.originalUri },
      frames: frames as ForgeAnimationFrame[],
      createdAt: typeof animation.createdAt === 'number' ? animation.createdAt : 0,
      updatedAt: typeof animation.updatedAt === 'number' ? animation.updatedAt : 0,
    }]
  })
}

export function parseForgeAnimationPack(value: unknown): ForgeAnimationDraft[] {
  if (!value || typeof value !== 'object') return []
  const pack = value as Partial<ForgeAnimationPack>
  if (pack.format !== FORGE_ANIMATION_PACK_FORMAT || pack.version !== FORGE_ANIMATION_PROJECT_VERSION) return []
  return parseForgeAnimationDrafts(pack.animations)
}

export function mergeForgeAnimationDrafts(
  current: ForgeAnimationDraft[],
  imported: ForgeAnimationDraft[],
): ForgeAnimationDraft[] {
  const next = current.map(cloneAnimation)
  for (const animation of imported) {
    const index = next.findIndex((candidate) => candidate.id === animation.id)
    if (index >= 0) next[index] = cloneAnimation(animation)
    else next.push(cloneAnimation(animation))
  }
  return next
}

export function getForgeSpriteSheetLayout(frames: ForgeAnimationFrame[]): ForgeSpriteSheetLayout {
  const cellWidth = Math.max(1, ...frames.map((frame) => frame.width))
  const cellHeight = Math.max(1, ...frames.map((frame) => frame.height))
  const columns = Math.max(1, Math.ceil(Math.sqrt(Math.max(1, frames.length))))
  const rows = Math.max(1, Math.ceil(Math.max(1, frames.length) / columns))
  return { columns, rows, cellWidth, cellHeight, width: columns * cellWidth, height: rows * cellHeight }
}
