import type { ForgeModule, SceneMap, Script, TerrainKind } from '../types'

const terrainAt = (x: number, y: number): TerrainKind => {
  if (x === 0 || y === 0 || x === 13 || y === 9) return 'water'
  if (x === 6 || x === 7 || y === 5) return 'path'
  if ((x + y * 3) % 11 === 0) return 'flower'
  if ((x * 2 + y) % 13 === 0) return 'stone'
  return 'grass'
}

export const demoMap: SceneMap = {
  id: 'scene-001',
  name: '十里坡 · 原型场景',
  width: 14,
  height: 10,
  tiles: Array.from({ length: 10 }, (_, y) =>
    Array.from({ length: 14 }, (_, x) => ({
      terrain: terrainAt(x, y),
      blocked: terrainAt(x, y) === 'water',
      elevation: (x === 2 && y === 3) || (x === 3 && y === 3) ? 1 : 0,
    })),
  ),
  events: [
    {
      id: 'event-01',
      name: '酒剑仙入场',
      x: 7,
      y: 4,
      trigger: 'interact',
      scriptId: 'script-0042',
      icon: 'npc',
    },
    {
      id: 'event-02',
      name: '山神庙门',
      x: 3,
      y: 3,
      trigger: 'touch',
      scriptId: 'script-0108',
      icon: 'door',
    },
    {
      id: 'event-03',
      name: '草丛宝箱',
      x: 10,
      y: 7,
      trigger: 'interact',
      scriptId: 'script-0133',
      icon: 'chest',
    },
  ],
}

export const demoScripts: Script[] = [
  {
    id: 'script-0042',
    name: '酒剑仙初遇',
    entry: '事件 0042',
    commands: [
      {
        id: 'cmd-1',
        opcode: '0x0006',
        label: '人物走向目标',
        detail: '对象 03 → (7, 4)，速度 2',
        color: 'motion',
      },
      {
        id: 'cmd-2',
        opcode: '0xFFFF',
        label: '显示对话',
        detail: '“小兄弟，这条山路可不好走。”',
        color: 'dialogue',
      },
      {
        id: 'cmd-3',
        opcode: '0x001A',
        label: '检查剧情标记',
        detail: '若 met_ling_er = 0，跳至 +4',
        color: 'condition',
      },
      {
        id: 'cmd-4',
        opcode: '0x0070',
        label: '进入战斗',
        detail: '队伍 012 · 允许逃跑',
        color: 'battle',
      },
      {
        id: 'cmd-5',
        opcode: '0x0013',
        label: '设置剧情标记',
        detail: 'met_sword_master = 1',
        color: 'condition',
      },
    ],
  },
  {
    id: 'script-0108',
    name: '山神庙入口',
    entry: '事件 0108',
    commands: [
      {
        id: 'cmd-6',
        opcode: '0x000A',
        label: '切换场景',
        detail: '场景 002 · 出生点 (11, 8)',
        color: 'motion',
      },
    ],
  },
]

export const demoModules: ForgeModule[] = [
  {
    id: 'runner-bridge',
    name: 'SDLPAL Runner Bridge',
    description: '把当前场景、队伍与剧情标记注入独立测试进程。',
    version: '0.1.0',
    enabled: true,
    kind: 'bridge',
  },
  {
    id: 'battle-lab',
    name: '战斗实验室',
    description: '脱离剧情直接组合敌我双方，快速测试技能与数值。',
    version: '0.1.0',
    enabled: true,
    kind: 'editor',
  },
  {
    id: 'fishing-demo',
    name: '钓鱼小游戏示例',
    description: '演示非原版玩法如何注册资源、入口事件与存档字段。',
    version: '0.0.1',
    enabled: false,
    kind: 'minigame',
  },
]

