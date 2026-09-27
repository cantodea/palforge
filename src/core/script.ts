import { readU16 } from './binary'
import type { PalEventObject, PalSceneRecord } from './scene'

export const PAL_SCRIPT_ENTRY_SIZE = 8

export type PalScriptCategory = 'flow' | 'dialogue' | 'scene' | 'motion' | 'inventory' | 'battle' | 'audio' | 'system' | 'unknown'
export type PalScriptTargetKind = 'jump' | 'call' | 'resume' | 'failure' | 'condition'

export type PalScriptEntry = {
  index: number
  operation: number
  operands: [number, number, number]
}

export type PalScriptTargetDefinition = {
  operand: 0 | 1 | 2
  kind: PalScriptTargetKind
  label: string
}

export type PalOpcodeDefinition = {
  operation: number
  label: string
  description: string
  category: PalScriptCategory
  targets: PalScriptTargetDefinition[]
  stopsFlow: boolean
}

export type PalScriptTarget = PalScriptTargetDefinition & {
  entry: number
}

export type PalScriptSource = {
  kind: 'scene-enter' | 'scene-teleport' | 'event-trigger' | 'event-auto'
  label: string
  eventObjectIndex?: number
}

export type PalScriptReference = {
  entry: number
  sources: PalScriptSource[]
}

export type PalScriptTrace = {
  startEntry: number
  entries: PalScriptEntry[]
  issues: string[]
  truncated: boolean
}

export class PalScriptFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PalScriptFormatError'
  }
}

const opcodeDefinitions = new Map<number, PalOpcodeDefinition>()

function opcode(
  operation: number,
  label: string,
  category: PalScriptCategory,
  description = label,
  targets: PalScriptTargetDefinition[] = [],
  stopsFlow = false,
) {
  opcodeDefinitions.set(operation, { operation, label, category, description, targets, stopsFlow })
}

const target = (operand: 0 | 1 | 2, kind: PalScriptTargetKind, label: string): PalScriptTargetDefinition => ({ operand, kind, label })

opcode(0x0000, '停止脚本', 'flow', '结束当前脚本', [], true)
opcode(0x0001, '暂停并续行', 'flow', '本次停止，保存下一条为后续入口')
opcode(0x0002, '暂停并跳转', 'flow', '本次停止，把指定地址保存为后续入口', [target(0, 'resume', '后续入口')])
opcode(0x0003, '无条件跳转', 'flow', '跳到指定脚本地址；重复次数由操作数 1 控制', [target(0, 'jump', '跳转')])
opcode(0x0004, '调用子脚本', 'flow', '调用指定脚本，可指定事件对象上下文', [target(0, 'call', '调用')])
opcode(0x0005, '刷新画面', 'scene')
opcode(0x0006, '概率跳转', 'flow', '按指定概率跳到目标地址', [target(1, 'condition', '概率分支')])
opcode(0x0007, '开始战斗', 'battle', '进入指定敌方队伍的战斗', [target(1, 'failure', '战败分支'), target(2, 'condition', '逃跑分支')])
opcode(0x0008, '保存下一入口', 'flow', '把下一条指令保存为脚本的新入口')
opcode(0x0009, '等待帧', 'system')
opcode(0x000a, '确认选择', 'flow', '玩家选择“否”时跳转', [target(0, 'condition', '选择否')])
opcode(0x000b, '向北走一步', 'motion')
opcode(0x000c, '向东走一步', 'motion')
opcode(0x000d, '向南走一步', 'motion')
opcode(0x000e, '向西走一步', 'motion')
opcode(0x000f, '设置事件方向/姿态', 'motion')
opcode(0x0010, '事件走到坐标', 'motion', '事件对象以正常速度走到指定位置')
opcode(0x0011, '事件慢速走到坐标', 'motion')
opcode(0x0012, '相对队伍定位事件', 'motion')
opcode(0x0013, '设置事件坐标', 'motion')
opcode(0x0014, '设置事件姿态', 'motion')
opcode(0x0015, '设置队员方向/姿态', 'motion')
opcode(0x0016, '设置事件方向/姿态（二）', 'motion')
opcode(0x0017, '设置角色装备属性', 'inventory')
opcode(0x0018, '装备物品', 'inventory')
opcode(0x0019, '增减角色属性', 'inventory')
opcode(0x001a, '设置角色属性', 'inventory')
opcode(0x001b, '增减生命', 'battle')
opcode(0x001c, '增减真气', 'battle')
opcode(0x001d, '增减生命与真气', 'battle')
opcode(0x001e, '增减金钱', 'inventory', '金钱不足时跳转', [target(1, 'failure', '金钱不足')])
opcode(0x001f, '增加物品', 'inventory')
opcode(0x0020, '移除物品', 'inventory', '物品不足时跳转', [target(2, 'failure', '物品不足')])
opcode(0x0021, '伤害敌人', 'battle')
opcode(0x0022, '复活角色', 'battle')
opcode(0x0023, '卸下装备', 'inventory')
opcode(0x0024, '改写事件自动脚本', 'flow')
opcode(0x0025, '改写事件触发脚本', 'flow')
opcode(0x0026, '打开购买菜单', 'inventory')
opcode(0x0027, '打开出售菜单', 'inventory')
opcode(0x0028, '使敌人中毒', 'battle')
opcode(0x0029, '使角色中毒', 'battle')
opcode(0x002a, '解除敌人指定毒', 'battle')
opcode(0x002b, '解除角色指定毒', 'battle')
opcode(0x002c, '按等级解除毒', 'battle')
opcode(0x002d, '设置角色状态', 'battle')
opcode(0x002e, '设置敌人状态', 'battle', '状态抵抗时跳转', [target(2, 'failure', '抵抗分支')])
opcode(0x002f, '移除角色状态', 'battle')
opcode(0x0030, '临时增益角色属性', 'battle')
opcode(0x0031, '临时更换战斗形象', 'battle')
opcode(0x0033, '收集敌人', 'battle', '无法收集时跳转', [target(0, 'failure', '失败分支')])
opcode(0x0034, '炼化收集物', 'inventory', '没有可炼化对象时跳转', [target(0, 'failure', '空分支')])
opcode(0x0035, '震动画面', 'scene')
opcode(0x0036, '选择 RNG 动画', 'scene')
opcode(0x0037, '播放 RNG 动画', 'scene')
opcode(0x0038, '传送离开场景', 'scene', '执行当前场景传送脚本；失败时跳转', [target(0, 'failure', '失败分支')])
opcode(0x0039, '吸取敌人生命', 'battle')
opcode(0x003a, '队伍逃跑', 'battle', 'Boss 战无法逃跑时跳转', [target(0, 'failure', '禁止逃跑')])
opcode(0x003b, '中部对话框', 'dialogue')
opcode(0x003c, '上部对话框', 'dialogue')
opcode(0x003d, '下部对话框', 'dialogue')
opcode(0x003e, '中央窗口文字', 'dialogue')
opcode(0x003f, '骑乘事件慢速移动', 'motion')
opcode(0x0040, '设置事件触发方式', 'scene')
opcode(0x0041, '标记脚本失败', 'flow')
opcode(0x0042, '模拟角色施法', 'battle')
opcode(0x0043, '设置背景音乐', 'audio')
opcode(0x0044, '骑乘事件正常移动', 'motion')
opcode(0x0045, '设置战斗音乐', 'audio')
opcode(0x0046, '设置队伍地图位置', 'motion')
opcode(0x0047, '播放音效', 'audio')
opcode(0x0049, '设置事件状态', 'scene')
opcode(0x004a, '设置战场背景', 'battle')
opcode(0x004b, '暂时隐藏事件', 'scene')
opcode(0x004c, '事件追逐队伍', 'motion')
opcode(0x004d, '等待按键', 'system')
opcode(0x004e, '读取最近存档', 'system', '重新载入当前存档并停止脚本', [], true)
opcode(0x004f, '淡出为红色', 'scene')
opcode(0x0050, '画面淡出', 'scene')
opcode(0x0051, '画面淡入', 'scene')
opcode(0x0052, '隐藏事件一段时间', 'scene')
opcode(0x0053, '切换日间调色板', 'scene')
opcode(0x0054, '切换夜间调色板', 'scene')
opcode(0x0055, '角色学会仙术', 'inventory')
opcode(0x0056, '角色移除仙术', 'inventory')
opcode(0x0057, '按真气设置仙术伤害', 'battle')
opcode(0x0058, '检查物品数量', 'flow', '指定物品数量不足时跳转', [target(2, 'condition', '不足分支')])
opcode(0x0059, '切换场景', 'scene')
opcode(0x005a, '角色生命减半', 'battle')
opcode(0x005b, '敌人生命减半', 'battle')
opcode(0x005c, '战斗中隐藏队伍', 'battle')
opcode(0x005d, '检查角色指定毒', 'flow', '角色没有指定毒时跳转', [target(1, 'condition', '未中毒')])
opcode(0x005e, '检查敌人指定毒', 'flow', '敌人没有指定毒时跳转', [target(1, 'condition', '未中毒')])
opcode(0x005f, '立即击倒角色', 'battle')
opcode(0x0060, '立即击倒敌人', 'battle')
opcode(0x0061, '检查角色是否中毒', 'flow', '角色没有任何毒时跳转', [target(0, 'condition', '未中毒')])
opcode(0x0062, '暂停敌人追逐', 'motion')
opcode(0x0063, '加速敌人追逐', 'motion')
opcode(0x0064, '检查敌人生命比例', 'flow', '敌人生命高于指定比例时跳转', [target(1, 'condition', '条件成立')])
opcode(0x0065, '设置角色场景形象', 'scene')
opcode(0x0066, '投掷武器', 'battle')
opcode(0x0067, '敌人施法', 'battle')
opcode(0x0068, '检查敌人回合', 'flow', '当前是敌人回合时跳转', [target(0, 'condition', '条件成立')])
opcode(0x0069, '敌人逃跑', 'battle')
opcode(0x006a, '从敌人偷取物品', 'battle')
opcode(0x006b, '击退敌人', 'battle')
opcode(0x006c, '事件原地动画', 'motion')
opcode(0x006d, '设置场景脚本入口', 'flow')
opcode(0x006e, '队伍移动一步', 'motion')
opcode(0x006f, '同步事件状态', 'scene')
opcode(0x0070, '队伍走到坐标', 'motion')
opcode(0x0071, '画面波动', 'scene')
opcode(0x0073, '淡入当前场景', 'scene')
opcode(0x0074, '检查全员生命', 'flow', '并非全员满生命时跳转', [target(0, 'condition', '未满生命')])
opcode(0x0075, '设置队伍成员', 'scene')
opcode(0x0076, '显示 FBP 图片', 'scene')
opcode(0x0077, '停止当前音乐', 'audio')
opcode(0x0078, '保留指令 0x0078', 'unknown', 'SDLPAL 中仍标记为未知行为')
opcode(0x0079, '检查角色是否在队伍', 'flow', '指定角色在队伍中时跳转', [target(1, 'condition', '在队伍中')])
opcode(0x007a, '队伍快速走到坐标', 'motion')
opcode(0x007b, '队伍高速走到坐标', 'motion')
opcode(0x007c, '事件快速走到坐标', 'motion')
opcode(0x007d, '移动事件对象', 'motion')
opcode(0x007e, '设置事件层级', 'scene')
opcode(0x007f, '移动视口', 'scene')
opcode(0x0080, '切换昼夜调色板', 'scene')
opcode(0x0081, '检查队伍朝向事件', 'flow', '队伍没有面向指定事件时跳转', [target(2, 'condition', '未面向')])
opcode(0x0082, '事件高速走到坐标', 'motion')
opcode(0x0083, '检查事件距离', 'flow', '事件不在指定范围内时跳转', [target(2, 'condition', '范围外')])
opcode(0x0084, '放置使用中的物品', 'scene', '放置失败时跳转', [target(2, 'failure', '放置失败')])
opcode(0x0085, '延时', 'system')
opcode(0x0086, '检查已装备物品', 'flow', '没有装备指定物品时跳转', [target(2, 'condition', '未装备')])
opcode(0x0087, '播放事件动画', 'motion')
opcode(0x0088, '按金钱设置仙术伤害', 'battle')
opcode(0x0089, '设置战斗结果', 'battle')
opcode(0x008a, '下场战斗自动战斗', 'battle')
opcode(0x008b, '更换调色板编号', 'scene')
opcode(0x008c, '淡入/淡出指定颜色', 'scene')
opcode(0x008d, '提升角色等级', 'battle')
opcode(0x008e, '恢复画面', 'scene')
opcode(0x008f, '金钱减半', 'inventory')
opcode(0x0090, '设置对象脚本', 'flow')
opcode(0x0091, '检查同类敌人顺序', 'flow', '当前敌人不是同类中的第一个时跳转', [target(0, 'condition', '不是首个')])
opcode(0x0092, '播放角色施法动画', 'battle')
opcode(0x0093, '场景更新淡变', 'scene')
opcode(0x0094, '检查事件状态', 'flow', '事件状态等于指定值时跳转', [target(2, 'condition', '状态相等')])
opcode(0x0095, '检查当前场景', 'flow', '当前场景等于指定编号时跳转', [target(1, 'condition', '场景相等')])
opcode(0x0096, '播放结局动画', 'scene')
opcode(0x0097, '骑乘事件高速移动', 'motion')
opcode(0x0098, '设置队伍跟随者', 'scene')
opcode(0x0099, '更换场景地图', 'scene')
opcode(0x009a, '批量设置事件状态', 'scene')
opcode(0x009b, '淡入当前场景（二）', 'scene')
opcode(0x009c, '敌人分裂', 'battle', '无法分裂时跳转', [target(1, 'failure', '分裂失败')])
opcode(0x009e, '敌人召唤', 'battle', '无法召唤时跳转', [target(2, 'failure', '召唤失败')])
opcode(0x009f, '敌人变身', 'battle')
opcode(0x00a0, '退出游戏', 'system', '关闭游戏进程', [], true)
opcode(0x00a1, '重合队伍成员位置', 'motion')
opcode(0x00a2, '随机跳过若干指令', 'flow')
opcode(0x00a3, '播放 CD 音乐', 'audio')
opcode(0x00a4, '滚动显示 FBP', 'scene')
opcode(0x00a5, '带精灵效果显示 FBP', 'scene')
opcode(0x00a6, '备份画面', 'scene')
opcode(0x00a7, '说明文本控制', 'dialogue')
opcode(0xffff, '显示文本', 'dialogue', '显示 MSG 文件中由操作数 0 指定的文本')

export function parsePalScriptEntries(bytes: Uint8Array): PalScriptEntry[] {
  if (bytes.length === 0 || bytes.length % PAL_SCRIPT_ENTRY_SIZE !== 0) {
    throw new PalScriptFormatError(`SSS.MKF #4 长度必须是 ${PAL_SCRIPT_ENTRY_SIZE} 的非零倍数`)
  }
  return Array.from({ length: bytes.length / PAL_SCRIPT_ENTRY_SIZE }, (_, index) => {
    const offset = index * PAL_SCRIPT_ENTRY_SIZE
    return {
      index,
      operation: readU16(bytes, offset),
      operands: [readU16(bytes, offset + 2), readU16(bytes, offset + 4), readU16(bytes, offset + 6)],
    }
  })
}

export function getPalOpcodeDefinition(operation: number): PalOpcodeDefinition {
  return opcodeDefinitions.get(operation) ?? {
    operation,
    label: `未识别操作码 ${formatPalWord(operation)}`,
    description: '保留原始三个操作数；当前注册表没有为此操作码定义语义',
    category: 'unknown',
    targets: [],
    stopsFlow: false,
  }
}

export function listPalOpcodeDefinitions(): PalOpcodeDefinition[] {
  return [...opcodeDefinitions.values()].sort((left, right) => left.operation - right.operation)
}

export function getPalScriptTargets(entry: PalScriptEntry): PalScriptTarget[] {
  return getPalOpcodeDefinition(entry.operation).targets.map((definition) => ({
    ...definition,
    entry: entry.operands[definition.operand],
  }))
}

export function tracePalScript(entries: PalScriptEntry[], startEntry: number, maxEntries = 256): PalScriptTrace {
  const issues: string[] = []
  const visited = new Set<number>()
  const queue = [startEntry]
  const result: PalScriptEntry[] = []

  while (queue.length > 0 && result.length < maxEntries) {
    const index = queue.shift()!
    if (visited.has(index)) continue
    visited.add(index)
    const entry = entries[index]
    if (!entry) {
      issues.push(`脚本地址 ${formatPalEntry(index)} 超出 SSS.MKF #4 范围`)
      continue
    }
    result.push(entry)
    const definition = getPalOpcodeDefinition(entry.operation)
    if (!definition.stopsFlow && index + 1 < entries.length) queue.push(index + 1)
    for (const destination of getPalScriptTargets(entry)) {
      if (destination.entry === 0) continue
      if (destination.entry >= entries.length) {
        issues.push(`${formatPalEntry(index)} 的“${destination.label}”指向越界地址 ${formatPalEntry(destination.entry)}`)
      } else {
        queue.push(destination.entry)
      }
    }
  }

  const truncated = queue.some((index) => !visited.has(index))
  if (truncated) issues.push(`可达指令超过 ${maxEntries} 条，已停止继续展开`)
  return { startEntry, entries: result, issues: [...new Set(issues)], truncated }
}

export function collectSceneScriptReferences(scene: PalSceneRecord, events: PalEventObject[]): PalScriptReference[] {
  const references = new Map<number, PalScriptReference>()
  const add = (entry: number, source: PalScriptSource) => {
    if (entry === 0) return
    const existing = references.get(entry)
    if (existing) existing.sources.push(source)
    else references.set(entry, { entry, sources: [source] })
  }

  add(scene.scriptOnEnter, { kind: 'scene-enter', label: `场景 #${scene.number} · 进入` })
  add(scene.scriptOnTeleport, { kind: 'scene-teleport', label: `场景 #${scene.number} · 传送` })
  for (const event of events) {
    add(event.triggerScript, { kind: 'event-trigger', label: `事件 #${event.index + 1} · 触发`, eventObjectIndex: event.index })
    add(event.autoScript, { kind: 'event-auto', label: `事件 #${event.index + 1} · 自动`, eventObjectIndex: event.index })
  }
  return [...references.values()]
}

export function parsePalEntryInput(value: string): number | null {
  const normalized = value.trim()
  if (!/^(?:0x[0-9a-f]+|[0-9]+)$/i.test(normalized)) return null
  const parsed = Number.parseInt(normalized, normalized.toLowerCase().startsWith('0x') ? 16 : 10)
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 0xffff ? parsed : null
}

export function formatPalWord(value: number): string {
  return `0x${(value & 0xffff).toString(16).padStart(4, '0').toUpperCase()}`
}

export function formatPalEntry(value: number): string {
  return `#${(value & 0xffff).toString(16).padStart(4, '0').toUpperCase()}`
}
