import { sceneEventRange } from './scene'
import type { PalSceneCatalog } from './sceneLoader'
import { formatPalEntry, getPalOpcodeDefinition } from './script'

export type ResourceReferenceKind = 'scene' | 'event' | 'script'

export type ResourceReference = {
  id: string
  kind: ResourceReferenceKind
  label: string
  detail: string
  sceneNumber?: number
  eventObjectIndex?: number
  scriptEntry?: number
}

export type ChunkSemantic = {
  archiveName: string
  chunkIndex: number
  uri: string
  title: string
  summary: string
  references: ResourceReference[]
  confidence: 'exact' | 'unresolved'
  searchText: string
}

export type ArchiveSemantic = {
  title: string
  description: string
  chunkLabel: string
  indexed: boolean
}

const DEFAULT_ARCHIVE_SEMANTIC: ArchiveSemantic = {
  title: 'PAL 数据归档',
  description: '该归档尚未接入语义关系表；仍可按 chunk 编号查看与导出。',
  chunkLabel: '资源',
  indexed: false,
}

export const PAL_ARCHIVE_SEMANTICS: Record<string, ArchiveSemantic> = {
  'ABC.MKF': { title: '敌方战斗精灵', description: '敌人与怪物的战斗画面；名称需要继续关联对象表和 WORD.DAT。', chunkLabel: '敌方精灵', indexed: false },
  'BALL.MKF': { title: '道具位图', description: '物品图标与投掷物；名称需要继续关联对象表和 WORD.DAT。', chunkLabel: '道具位图', indexed: false },
  'DATA.MKF': { title: '游戏数据表', description: '角色、敌人、法术等结构化数值，不是普通图片归档。', chunkLabel: '数据表', indexed: false },
  'F.MKF': { title: '角色战斗精灵', description: '队伍成员的战斗动作与特殊施法姿态。', chunkLabel: '战斗精灵', indexed: false },
  'FBP.MKF': { title: '全屏背景', description: '320×200 背景、状态画面与过场图片；已从事件脚本反查用途。', chunkLabel: '全屏背景', indexed: true },
  'FIRE.MKF': { title: '法术特效', description: '战斗法术与特殊效果动画；名称需要继续关联法术表。', chunkLabel: '法术特效', indexed: false },
  'GOP.MKF': { title: '地图图块包', description: '等距场景使用的图块精灵；已从场景表反查对应场景。', chunkLabel: '地图图块', indexed: true },
  'MAP.MKF': { title: '地图布局', description: '场景的图块编号、层级与阻挡数据；已从场景表反查对应场景。', chunkLabel: '地图数据', indexed: true },
  'MGO.MKF': { title: '场景精灵', description: 'NPC、机关和角色行走精灵；已从事件对象与切换形象脚本反查用途。', chunkLabel: '场景精灵', indexed: true },
  'MUS.MKF': { title: '背景音乐', description: '游戏背景音乐数据。', chunkLabel: '音乐', indexed: false },
  'PAT.MKF': { title: '调色板', description: '256 色日间/夜间调色板；用于地图、精灵和背景预览。', chunkLabel: '调色板', indexed: false },
  'RGM.MKF': { title: '角色头像', description: '角色头像位图；名称需要继续关联角色表。', chunkLabel: '头像', indexed: false },
  'RNG.MKF': { title: '过场动画', description: '逐帧过场动画；已从选择/播放 RNG 的事件脚本反查用途。', chunkLabel: '过场动画', indexed: true },
  'SOUNDS.MKF': { title: '音效', description: '数字音效数据。', chunkLabel: '音效', indexed: false },
  'SSS.MKF': { title: '场景与事件脚本', description: '事件对象、场景表、对象表、文本偏移和脚本指令。', chunkLabel: '系统数据表', indexed: false },
}

export function normalizeArchiveName(name: string): string {
  return name.split(/[\\/]/).at(-1)?.toUpperCase() ?? name.toUpperCase()
}

export function getArchiveSemantic(name: string): ArchiveSemantic {
  return PAL_ARCHIVE_SEMANTICS[normalizeArchiveName(name)] ?? DEFAULT_ARCHIVE_SEMANTIC
}

export function resourceChunkKey(archiveName: string, chunkIndex: number): string {
  return `${normalizeArchiveName(archiveName)}#${chunkIndex}`
}

export function resourceChunkUri(archiveName: string, chunkIndex: number): string {
  return `pal://archives/${normalizeArchiveName(archiveName)}/chunks/${chunkIndex}`
}

function chunkTitle(archiveName: string, chunkIndex: number): string {
  const archive = getArchiveSemantic(archiveName)
  return `${archive.chunkLabel} #${String(chunkIndex).padStart(4, '0')}`
}

function pushReference(
  index: Map<string, ResourceReference[]>,
  archiveName: string,
  chunkIndex: number,
  reference: ResourceReference,
) {
  const key = resourceChunkKey(archiveName, chunkIndex)
  const references = index.get(key) ?? []
  if (!references.some((candidate) => candidate.id === reference.id)) references.push(reference)
  index.set(key, references)
}

function scriptReference(chunkIndex: number, entry: PalSceneCatalog['scriptEntries'][number]): ResourceReference {
  const definition = getPalOpcodeDefinition(entry.operation)
  return {
    id: `script-${entry.index}-${entry.operation}`,
    kind: 'script',
    label: `脚本 ${formatPalEntry(entry.index)} · ${definition.label}`,
    detail: `opcode 0x${entry.operation.toString(16).padStart(4, '0')} · 资源参数 ${chunkIndex}`,
    scriptEntry: entry.index,
  }
}

export function buildResourceSemanticIndex(catalog: PalSceneCatalog | null): Map<string, ResourceReference[]> {
  const index = new Map<string, ResourceReference[]>()
  if (!catalog) return index

  for (const scene of catalog.availableScenes) {
    pushReference(index, 'MAP.MKF', scene.mapNumber, {
      id: `map-scene-${scene.number}`,
      kind: 'scene',
      label: `场景 #${String(scene.number).padStart(3, '0')}`,
      detail: `地图 #${String(scene.mapNumber).padStart(3, '0')} · 进入脚本 ${formatPalEntry(scene.scriptOnEnter)}`,
      sceneNumber: scene.number,
    })
    pushReference(index, 'GOP.MKF', scene.mapNumber, {
      id: `gop-scene-${scene.number}`,
      kind: 'scene',
      label: `场景 #${String(scene.number).padStart(3, '0')}`,
      detail: `图块包 #${String(scene.mapNumber).padStart(3, '0')} · 传送脚本 ${formatPalEntry(scene.scriptOnTeleport)}`,
      sceneNumber: scene.number,
    })

    let range: { start: number; end: number }
    try {
      range = sceneEventRange(catalog.scenes, scene.number, catalog.eventObjects.length)
    } catch {
      continue
    }
    for (const event of catalog.eventObjects.slice(range.start, range.end)) {
      if (event.spriteNumber === 0) continue
      const eventObjectId = event.index + 1
      const scripts = [event.triggerScript, event.autoScript].filter(Boolean).map(formatPalEntry).join(' / ') || '无脚本'
      pushReference(index, 'MGO.MKF', event.spriteNumber, {
        id: `event-${scene.number}-${event.index}`,
        kind: 'event',
        label: `场景 #${String(scene.number).padStart(3, '0')} · 事件 #${eventObjectId}`,
        detail: `坐标 ${event.x}, ${event.y} · 脚本 ${scripts}`,
        sceneNumber: scene.number,
        eventObjectIndex: event.index,
      })
    }
  }

  for (const entry of catalog.scriptEntries) {
    const chunkIndex = entry.operands[0]
    if (entry.operation === 0x0036) pushReference(index, 'RNG.MKF', chunkIndex, scriptReference(chunkIndex, entry))
    if (entry.operation === 0x0065) pushReference(index, 'MGO.MKF', chunkIndex, scriptReference(chunkIndex, entry))
    if (entry.operation === 0x0076 || entry.operation === 0x00a4 || entry.operation === 0x00a5) {
      pushReference(index, 'FBP.MKF', chunkIndex, scriptReference(chunkIndex, entry))
    }
  }

  return index
}

export function describeResourceChunk(
  archiveName: string,
  chunkIndex: number,
  referenceIndex: Map<string, ResourceReference[]>,
): ChunkSemantic {
  const normalized = normalizeArchiveName(archiveName)
  const archive = getArchiveSemantic(normalized)
  const references = referenceIndex.get(resourceChunkKey(normalized, chunkIndex)) ?? []
  const title = chunkTitle(normalized, chunkIndex)
  const summary = references.length > 0
    ? `自动反查到 ${references.length} 处明确引用`
    : archive.indexed
      ? '当前场景表和脚本中未发现引用；不代表资源一定废弃'
      : '该资源类型的名称关系将在下一阶段接入'
  const confidence = references.length > 0 ? 'exact' : 'unresolved'
  return {
    archiveName: normalized,
    chunkIndex,
    uri: resourceChunkUri(normalized, chunkIndex),
    title,
    summary,
    references,
    confidence,
    searchText: [normalized, chunkIndex, title, summary, archive.title, archive.description, ...references.flatMap((reference) => [reference.label, reference.detail])].join(' ').toLocaleLowerCase(),
  }
}
