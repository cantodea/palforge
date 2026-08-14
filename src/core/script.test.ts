import { describe, expect, it } from 'vitest'
import type { PalEventObject, PalSceneRecord } from './scene'
import {
  collectSceneScriptReferences,
  formatPalEntry,
  getPalOpcodeDefinition,
  getPalScriptTargets,
  parsePalEntryInput,
  parsePalScriptEntries,
  tracePalScript,
} from './script'

function writeU16(bytes: Uint8Array, offset: number, value: number) {
  bytes[offset] = value & 0xff
  bytes[offset + 1] = (value >>> 8) & 0xff
}

function entry(operation: number, operand0 = 0, operand1 = 0, operand2 = 0) {
  const bytes = new Uint8Array(8)
  ;[operation, operand0, operand1, operand2].forEach((value, index) => writeU16(bytes, index * 2, value))
  return bytes
}

describe('PAL event scripts', () => {
  it('parses every SSS #4 record as one opcode plus three unsigned operands', () => {
    const bytes = new Uint8Array([...entry(0x0054, 1, 0xffff, 3), ...entry(0x0000)])
    const original = bytes.slice()
    expect(parsePalScriptEntries(bytes)).toEqual([
      { index: 0, operation: 0x0054, operands: [1, 0xffff, 3] },
      { index: 1, operation: 0, operands: [0, 0, 0] },
    ])
    expect(bytes).toEqual(original)
    expect(() => parsePalScriptEntries(new Uint8Array(7))).toThrow('8')
  })

  it('registers real opcode semantics and exposes typed jump targets', () => {
    const [branch] = parsePalScriptEntries(entry(0x0006, 35, 0x42, 0))
    expect(getPalOpcodeDefinition(branch.operation)).toMatchObject({ label: '概率跳转', category: 'flow' })
    expect(getPalScriptTargets(branch)).toEqual([{ operand: 1, kind: 'condition', label: '概率分支', entry: 0x42 }])
    expect(getPalOpcodeDefinition(0x1234).category).toBe('unknown')
  })

  it('traces fallthrough and branches without looping forever', () => {
    const bytes = new Uint8Array([
      ...entry(0x0003, 2),
      ...entry(0x0053),
      ...entry(0x0006, 50, 1),
      ...entry(0x0000),
    ])
    const trace = tracePalScript(parsePalScriptEntries(bytes), 0)
    expect(trace.entries.map((item) => item.index)).toEqual([0, 1, 2, 3])
    expect(trace.issues).toEqual([])
    expect(trace.truncated).toBe(false)
  })

  it('reports invalid addresses while preserving hexadecimal entry notation', () => {
    const trace = tracePalScript(parsePalScriptEntries(entry(0x0004, 0x42)), 0)
    expect(trace.issues[0]).toContain('#0042')
    expect(formatPalEntry(0x42)).toBe('#0042')
    expect(parsePalEntryInput('0x42')).toBe(0x42)
    expect(parsePalEntryInput('66')).toBe(66)
    expect(parsePalEntryInput('nope')).toBeNull()
  })

  it('deduplicates scene and event references but keeps every source', () => {
    const scene: PalSceneRecord = { number: 7, mapNumber: 3, scriptOnEnter: 0x42, scriptOnTeleport: 0, eventObjectIndex: 0 }
    const event = {
      index: 4,
      triggerScript: 0x42,
      autoScript: 0x43,
    } as PalEventObject
    const references = collectSceneScriptReferences(scene, [event])
    expect(references.map((reference) => reference.entry)).toEqual([0x42, 0x43])
    expect(references[0].sources.map((source) => source.label)).toEqual(['场景 #7 · 进入', '事件 #5 · 触发'])
  })
})
