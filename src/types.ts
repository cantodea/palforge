export type TerrainKind = 'grass' | 'path' | 'water' | 'stone' | 'flower'

export type Tile = {
  terrain: TerrainKind
  blocked: boolean
  elevation: number
}

export type MapEvent = {
  id: string
  name: string
  x: number
  y: number
  trigger: 'touch' | 'interact' | 'auto'
  scriptId: string
  icon: 'npc' | 'door' | 'chest' | 'marker'
}

export type SceneMap = {
  id: string
  name: string
  width: number
  height: number
  tiles: Tile[][]
  events: MapEvent[]
}

export type ScriptCommand = {
  id: string
  opcode: string
  label: string
  detail: string
  color: 'dialogue' | 'motion' | 'condition' | 'battle'
}

export type Script = {
  id: string
  name: string
  entry: string
  commands: ScriptCommand[]
}

export type ImportedResource = {
  name: string
  path: string
  size: number
  kind: 'mkf' | 'image' | 'audio' | 'data' | 'other'
  chunks?: number
  chunkIndex?: import('./core/mkf').MkfChunk[]
  file?: File
  error?: string
  previewUrl?: string
}

export type PaletteColor = {
  r: number
  g: number
  b: number
  a: number
}

export type PalPalette = {
  index: number
  variant: 'day' | 'night'
  colors: PaletteColor[]
}

export type IndexedImage = {
  width: number
  height: number
  pixels: Uint8Array
  alpha: Uint8Array
}

export type ForgeModule = {
  id: string
  name: string
  description: string
  version: string
  enabled: boolean
  kind: 'editor' | 'minigame' | 'bridge'
}

export type TestSettings = {
  scene: string
  spawnX: number
  spawnY: number
  partyLevel: number
  eventId: string
  flags: string[]
}
