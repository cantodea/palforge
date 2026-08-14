import { describe, expect, it } from 'vitest'
import { createTestSnapshot } from './tester'

describe('createTestSnapshot', () => {
  it('captures an isolated event start', () => {
    const snapshot = createTestSnapshot(
      {
        scene: '十里坡',
        spawnX: 4,
        spawnY: 6,
        partyLevel: 8,
        eventId: 'event-01',
        flags: ['met_ling_er'],
      },
      {
        id: 'event-01',
        name: '酒剑仙入场',
        x: 4,
        y: 6,
        trigger: 'auto',
        scriptId: 'script-0042',
        icon: 'npc',
      },
    )

    expect(snapshot.settings.flags).toEqual(['met_ling_er'])
    expect(snapshot.log.join('\n')).toContain('酒剑仙入场')
  })
})
