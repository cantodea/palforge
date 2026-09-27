import { describe, expect, it } from 'vitest'
import type { PalEventObject, PalSceneRecord } from './scene'
import type { PalScriptEntry } from './script'
import { compileForgeScriptProject, createForgeScriptDraft, updateForgeScriptMessage } from './scriptProject'
import {
  continueSceneDebugSession,
  createSceneDebugRuntime,
  createSceneDebugSession,
  resolveSceneDebugDecision,
  stepSceneDebugSession,
} from './sceneDebugger'

const scene: PalSceneRecord = { number: 10, mapNumber: 13, scriptOnEnter: 1, scriptOnTeleport: 0, eventObjectIndex: 0 }
const event = (patch: Partial<PalEventObject> = {}): PalEventObject => ({
  index: 0, vanishTime: 0, x: 320, y: 160, layer: 0, triggerScript: 1, autoScript: 0,
  state: 1, triggerMode: 2, spriteNumber: 1, spriteFrames: 3, direction: 0, currentFrame: 0,
  scriptIdleFrame: 0, spritePointerOffset: 0, autoSpriteFrames: 0, autoScriptIdleFrameCount: 0,
  ...patch,
})
const start = (entries: PalScriptEntry[], messages: string[] = [], sourceEntry = 1) => {
  const runtime = createSceneDebugRuntime(entries, messages)
  return {
    runtime,
    session: createSceneDebugSession(runtime, {
      id: 'test', mode: 'event-trigger', sourceEntry, eventObjectId: 1, scene, events: [event()],
      party: { x: 300, y: 150 },
    }),
  }
}

describe('scene script debugger', () => {
  it('runs event state, position and palette effects in an isolated scene snapshot', () => {
    const entries: PalScriptEntry[] = [
      { index: 0, operation: 0, operands: [0, 0, 0] },
      { index: 1, operation: 0x0013, operands: [1, 640, 320] },
      { index: 2, operation: 0x0049, operands: [1, 0xffff, 0] },
      { index: 3, operation: 0x0054, operands: [0, 0, 0] },
      { index: 4, operation: 0, operands: [0, 0, 0] },
    ]
    const { runtime, session } = start(entries)
    const ended = continueSceneDebugSession(runtime, session)
    expect(ended.status).toBe('completed')
    expect(ended.events['1']).toMatchObject({ x: 640, y: 320, state: -1 })
    expect(ended.palette.night).toBe(true)
    expect(event()).toMatchObject({ x: 320, y: 160, state: 1 })
  })

  it('uses a real call stack and returns after the child stop command', () => {
    const entries: PalScriptEntry[] = [
      { index: 0, operation: 0, operands: [0, 0, 0] },
      { index: 1, operation: 0x0004, operands: [4, 0, 0] },
      { index: 2, operation: 0x0053, operands: [0, 0, 0] },
      { index: 3, operation: 0, operands: [0, 0, 0] },
      { index: 4, operation: 0x0054, operands: [0, 0, 0] },
      { index: 5, operation: 0, operands: [0, 0, 0] },
    ]
    const { runtime, session } = start(entries)
    const ended = continueSceneDebugSession(runtime, session)
    expect(ended.status).toBe('completed')
    expect(ended.steps).toBe(5)
    expect(ended.callStack).toEqual([])
    expect(ended.palette.night).toBe(false)
  })

  it('keeps auto scripts alive across wait frames and opcode 0001', () => {
    const entries: PalScriptEntry[] = [
      { index: 0, operation: 0, operands: [0, 0, 0] },
      { index: 1, operation: 0x0009, operands: [2, 0, 0] },
      { index: 2, operation: 0x0001, operands: [0, 0, 0] },
      { index: 3, operation: 0, operands: [0, 0, 0] },
    ]
    const runtime = createSceneDebugRuntime(entries, [])
    const session = createSceneDebugSession(runtime, {
      id: 'auto', mode: 'event-auto', sourceEntry: 1, eventObjectId: 1, scene, events: [event()],
      party: { x: 300, y: 150 },
    })
    const ended = continueSceneDebugSession(runtime, session)
    expect(ended.status).toBe('completed')
    expect(ended.steps).toBe(4)
  })

  it('pauses for probability and dialogue instead of inventing an outcome', () => {
    const entries: PalScriptEntry[] = [
      { index: 0, operation: 0, operands: [0, 0, 0] },
      { index: 1, operation: 0x0006, operands: [50, 3, 0] },
      { index: 2, operation: 0xffff, operands: [0, 0, 0] },
      { index: 3, operation: 0, operands: [0, 0, 0] },
    ]
    const { runtime, session } = start(entries, ['测试对白'])
    const branch = stepSceneDebugSession(runtime, session)
    expect(branch.status).toBe('waiting')
    expect(branch.pendingDecision?.kind).toBe('branch')
    const dialogue = stepSceneDebugSession(runtime, resolveSceneDebugDecision(runtime, branch, 'fallthrough'))
    expect(dialogue.pendingDecision?.kind).toBe('dialogue')
    expect(dialogue.dialogue?.text).toBe('测试对白')
  })

  it('stops at a breakpoint before executing that instruction', () => {
    const entries: PalScriptEntry[] = [
      { index: 0, operation: 0, operands: [0, 0, 0] },
      { index: 1, operation: 0x0054, operands: [0, 0, 0] },
      { index: 2, operation: 0x0053, operands: [0, 0, 0] },
      { index: 3, operation: 0, operands: [0, 0, 0] },
    ]
    const { runtime, session } = start(entries)
    const paused = continueSceneDebugSession(runtime, session, [2])
    expect(paused.currentEntry).toBe(2)
    expect(paused.palette.night).toBe(true)
    expect(paused.stopReason).toContain('命中断点')
  })

  it('runs a compiled project override and its appended dialogue', () => {
    const entries: PalScriptEntry[] = [
      { index: 0, operation: 0, operands: [0, 0, 0] },
      { index: 1, operation: 0xffff, operands: [0, 0, 0] },
      { index: 2, operation: 0, operands: [0, 0, 0] },
    ]
    let draft = createForgeScriptDraft(entries, 1, 'edited', 10, ['原对白'])
    draft = updateForgeScriptMessage(draft, 'source-0001', '工程对白', 11)
    const project = compileForgeScriptProject([draft], entries.length, 1)
    const runtime = createSceneDebugRuntime(entries, ['原对白'], project)
    const session = createSceneDebugSession(runtime, { id: 'project', mode: 'event-trigger', sourceEntry: 1, eventObjectId: 1, scene, events: [event()], party: { x: 0, y: 0 } })
    const waiting = stepSceneDebugSession(runtime, session)
    expect(session.currentEntry).toBe(project.entryRedirects['1'])
    expect(waiting.dialogue?.text).toBe('工程对白')
  })

  it('pauses on unsupported side effects and requires an explicit skip', () => {
    const entries: PalScriptEntry[] = [
      { index: 0, operation: 0, operands: [0, 0, 0] },
      { index: 1, operation: 0x001f, operands: [1, 1, 0] },
      { index: 2, operation: 0, operands: [0, 0, 0] },
    ]
    const { runtime, session } = start(entries)
    const waiting = stepSceneDebugSession(runtime, session)
    expect(waiting.status).toBe('waiting')
    expect(waiting.pendingDecision?.kind).toBe('unsupported')
    expect(resolveSceneDebugDecision(runtime, waiting, 'skip').currentEntry).toBe(2)
  })
})
