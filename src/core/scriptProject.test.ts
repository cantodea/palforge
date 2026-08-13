import { describe, expect, it } from 'vitest'
import type { PalScriptEntry } from './script'
import {
  compileForgeScriptDraft,
  compileForgeScriptProject,
  createForgeScriptDraft,
  insertForgeScriptCommand,
  isForgeScriptDraftCompatible,
  moveForgeScriptCommand,
  parseForgeScriptDrafts,
  removeForgeScriptCommand,
  setForgeScriptTarget,
  updateForgeScriptMessage,
  updateForgeScriptCommand,
  validateForgeScriptDraft,
} from './scriptProject'

const source: PalScriptEntry[] = [
  { index: 0, operation: 0, operands: [0, 0, 0] },
  { index: 1, operation: 0x0006, operands: [50, 3, 0] },
  { index: 2, operation: 0x0053, operands: [0, 0, 0] },
  { index: 3, operation: 0x0000, operands: [0, 0, 0] },
]

describe('PalForge script projects', () => {
  it('clones a real reachable script into stable command IDs and symbolic targets', () => {
    const draft = createForgeScriptDraft(source, 1, 'test', 10)
    expect(draft.commands.map((command) => command.id)).toEqual(['source-0001', 'source-0002', 'source-0003'])
    expect(draft.commands[0].targetLinks).toEqual([{ operand: 1, commandId: 'source-0003' }])
    expect(draft.createdAt).toBe(10)
    expect(draft.baseSignature).toMatch(/^fnv1a32:/)
    expect(isForgeScriptDraftCompatible(draft, source)).toBe(true)
    expect(isForgeScriptDraftCompatible(draft, source.map((entry) => entry.index === 2 ? { ...entry, operation: 0x0054 } : entry))).toBe(false)
  })

  it('keeps a branch attached to its command while instructions are reordered', () => {
    let draft = createForgeScriptDraft(source, 1, 'test', 10)
    draft = moveForgeScriptCommand(draft, 'source-0003', -1, 11)
    const compiled = compileForgeScriptDraft(draft, 100)
    expect(draft.commands.map((command) => command.id)).toEqual(['source-0001', 'source-0003', 'source-0002'])
    expect(compiled.entries[0].operands[1]).toBe(101)
    expect(compiled.addressByCommandId['source-0003']).toBe(101)
  })

  it('adds, edits and removes commands without mutating the previous draft', () => {
    const original = createForgeScriptDraft(source, 1, 'test', 10)
    const inserted = insertForgeScriptCommand(original, 'source-0002', 0xffff, 11)
    const added = inserted.commands.find((command) => command.id === 'forge-1')!
    const edited = updateForgeScriptCommand(inserted, added.id, { operands: [9, 0, 0] }, 12)
    const removed = removeForgeScriptCommand(edited, added.id, 13)
    expect(original.commands).toHaveLength(3)
    expect(edited.commands.find((command) => command.id === added.id)?.operands[0]).toBe(9)
    expect(removed.commands).toHaveLength(3)
  })

  it('reports a dangling target when its destination is deleted', () => {
    const draft = removeForgeScriptCommand(createForgeScriptDraft(source, 1), 'source-0003')
    expect(validateForgeScriptDraft(draft)).toContainEqual(expect.objectContaining({ level: 'error', code: 'dangling-target' }))
  })

  it('can retarget a known branch and emits append-only entry redirects', () => {
    let draft = createForgeScriptDraft(source, 1)
    draft = setForgeScriptTarget(draft, 'source-0001', 1, 'source-0002')
    const project = compileForgeScriptProject([draft], source.length)
    expect(project.entryRedirects).toEqual({ '1': 4 })
    expect(project.scripts[0].entries[0].operands[1]).toBe(5)
    expect(project.baseEntryCount).toBe(4)
  })

  it('redirects cross-script calls when both source entries have project overrides', () => {
    const callSource: PalScriptEntry[] = [
      { index: 0, operation: 0, operands: [0, 0, 0] },
      { index: 1, operation: 0x0004, operands: [3, 0, 0] },
      { index: 2, operation: 0, operands: [0, 0, 0] },
      { index: 3, operation: 0, operands: [0, 0, 0] },
    ]
    let caller = createForgeScriptDraft(callSource, 1)
    caller = setForgeScriptTarget(caller, 'source-0001', 0, null)
    caller = removeForgeScriptCommand(caller, 'source-0003')
    const callee = createForgeScriptDraft(callSource, 3)
    const project = compileForgeScriptProject([caller, callee], callSource.length)
    expect(project.entryRedirects).toEqual({ '1': 4, '3': 6 })
    expect(project.scripts[0].entries[0].operands[0]).toBe(6)
  })

  it('drops target links that no longer belong to a changed opcode', () => {
    const draft = updateForgeScriptCommand(createForgeScriptDraft(source, 1), 'source-0001', { operation: 0x0054 })
    expect(draft.commands[0].targetLinks).toEqual([])
  })

  it('loads only structurally valid serialized drafts', () => {
    const draft = createForgeScriptDraft(source, 1)
    expect(parseForgeScriptDrafts([draft])).toHaveLength(1)
    expect(parseForgeScriptDrafts([{ ...draft, commands: [{ nope: true }] }])).toEqual([])
    expect(parseForgeScriptDrafts('bad')).toEqual([])
  })

  it('stores dialogue text in the project and allocates a new M.MSG id when compiled', () => {
    const withText: PalScriptEntry[] = [
      { index: 0, operation: 0, operands: [0, 0, 0] },
      { index: 1, operation: 0xffff, operands: [2, 0, 0] },
      { index: 2, operation: 0, operands: [0, 0, 0] },
    ]
    let draft = createForgeScriptDraft(withText, 1, 'dialogue', 10, ['', '', '原对白'])
    draft = updateForgeScriptMessage(draft, 'source-0001', '修改后的对白', 11)
    const compiled = compileForgeScriptDraft(draft, 20, 50)
    expect(compiled.entries[0].operands[0]).toBe(50)
    expect(compiled.messages).toEqual([{ id: 50, text: '修改后的对白', sourceMessage: 2 }])
  })

  it('blocks a safe project compile when dialogue exists but M.MSG is not mounted', () => {
    const withText: PalScriptEntry[] = [
      { index: 0, operation: 0, operands: [0, 0, 0] },
      { index: 1, operation: 0xffff, operands: [2, 0, 0] },
      { index: 2, operation: 0, operands: [0, 0, 0] },
    ]
    const draft = createForgeScriptDraft(withText, 1, 'dialogue', 10, ['', '', '原对白'])
    const unsafe = compileForgeScriptProject([draft], withText.length, null)
    const safe = compileForgeScriptProject([draft], withText.length, 10)
    expect(unsafe.messageAllocationSafe).toBe(false)
    expect(unsafe.baseMessageCount).toBeNull()
    expect(unsafe.scripts[0].issues).toContainEqual(expect.objectContaining({ level: 'error', code: 'message-base-missing' }))
    expect(safe.messageAllocationSafe).toBe(true)
    expect(safe.scripts[0].entries[0].operands[0]).toBe(10)
  })

  it('warns when the final instruction can fall through even if an earlier command stops', () => {
    let draft = createForgeScriptDraft(source, 1)
    draft = moveForgeScriptCommand(draft, 'source-0003', -1)
    expect(validateForgeScriptDraft(draft)).toContainEqual(expect.objectContaining({ code: 'missing-stop' }))
  })
})
