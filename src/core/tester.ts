import type { MapEvent, TestSettings } from '../types'

export type TestSnapshot = {
  id: string
  createdAt: string
  settings: TestSettings
  log: string[]
}

export function createTestSnapshot(
  settings: TestSettings,
  selectedEvent?: MapEvent,
): TestSnapshot {
  const event = selectedEvent?.id === settings.eventId ? selectedEvent : undefined
  const log = [
    `载入场景：${settings.scene}`,
    `队伍出生点：(${settings.spawnX}, ${settings.spawnY})，等级 ${settings.partyLevel}`,
    settings.flags.length > 0
      ? `注入标记：${settings.flags.join(', ')}`
      : '未注入额外剧情标记',
    event
      ? `从事件“${event.name}”启动脚本 ${event.scriptId}`
      : '从场景入口启动，不跳转事件',
    '沙盒快照已就绪；等待 SDLPAL runner bridge 接管。',
  ]

  return {
    id: `test-${Date.now()}`,
    createdAt: new Date().toISOString(),
    settings: { ...settings, flags: [...settings.flags] },
    log,
  }
}

