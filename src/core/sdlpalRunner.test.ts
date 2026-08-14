import { describe, expect, it } from 'vitest'
import { createSdlpalLaunchTarget, isSdlpalRunnerMessage, selectSdlpalFiles } from './sdlpalRunner'

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

  it('normalizes game files and ignores an injected runner control file', () => {
    const files = [new File(['a'], 'SSS.MKF'), new File(['b'], 'sss.mkf'), new File(['c'], 'palforge-runner.json'), new File(['d'], 'M.MSG')]
    expect(selectSdlpalFiles(files).map((file) => file.name)).toEqual(['M.MSG', 'sss.mkf'])
  })

  it('accepts only messages from the isolated runtime frame', () => {
    expect(isSdlpalRunnerMessage({ source: 'palforge-sdlpal', type: 'status', status: 'ready', message: 'ready' })).toBe(true)
    expect(isSdlpalRunnerMessage({ source: 'other', type: 'status', message: 'ready' })).toBe(false)
  })
})
