import {
  getPalOpcodeDefinition,
  getPalScriptTargets,
  type PalScriptEntry,
  type PalScriptTargetDefinition,
} from './script'

export const FORGE_SCRIPT_PROJECT_VERSION = 1

export type ForgeScriptTargetLink = {
  operand: 0 | 1 | 2
  commandId: string
}

export type ForgeScriptCommand = {
  id: string
  sourceIndex: number | null
  operation: number
  operands: [number, number, number]
  targetLinks: ForgeScriptTargetLink[]
  message: { sourceMessage: number | null; text: string } | null
}

export type ForgeScriptDraft = {
  formatVersion: typeof FORGE_SCRIPT_PROJECT_VERSION
  sourceEntry: number
  baseSignature: string
  name: string
  commands: ForgeScriptCommand[]
  createdAt: number
  updatedAt: number
}

export type ForgeScriptIssue = {
  level: 'error' | 'warning'
  code: 'empty' | 'duplicate-id' | 'dangling-target' | 'unknown-opcode' | 'missing-stop' | 'address-overflow' | 'message-base-missing'
  message: string
  commandId?: string
}

export type CompiledForgeScript = {
  sourceEntry: number
  compiledEntry: number
  entries: PalScriptEntry[]
  addressByCommandId: Record<string, number>
  messages: { id: number; text: string; sourceMessage: number | null }[]
  issues: ForgeScriptIssue[]
}

export type CompiledForgeScriptProject = {
  format: 'palforge-script-patches'
  version: typeof FORGE_SCRIPT_PROJECT_VERSION
  baseEntryCount: number
  baseMessageCount: number | null
  messageAllocationSafe: boolean
  entryRedirects: Record<string, number>
  scripts: CompiledForgeScript[]
  issues: ForgeScriptIssue[]
}

const touch = (draft: ForgeScriptDraft, commands: ForgeScriptCommand[], now = Date.now()): ForgeScriptDraft => ({
  ...draft,
  commands,
  updatedAt: now,
})

function cloneCommand(command: ForgeScriptCommand): ForgeScriptCommand {
  return {
    ...command,
    operands: [...command.operands],
    targetLinks: command.targetLinks.map((link) => ({ ...link })),
    message: command.message ? { ...command.message } : null,
  }
}

function commandIdForSource(index: number) {
  return `source-${index.toString(16).padStart(4, '0')}`
}

function targetOperands(operation: number): Set<number> {
  return new Set(getPalOpcodeDefinition(operation).targets.map((target) => target.operand))
}

function sourceBlock(entries: PalScriptEntry[], sourceEntry: number): PalScriptEntry[] {
  const result: PalScriptEntry[] = []
  for (let index = sourceEntry; index < entries.length && result.length < 256; index++) {
    const entry = entries[index]
    result.push(entry)
    if (getPalOpcodeDefinition(entry.operation).stopsFlow) break
  }
  return result
}

export function getForgeScriptSourceSignature(entries: PalScriptEntry[], sourceEntry: number): string {
  const block = sourceBlock(entries, sourceEntry)
  let hash = 0x811c9dc5
  for (const entry of block) {
    for (const word of [entry.operation, ...entry.operands]) {
      hash ^= word & 0xff
      hash = Math.imul(hash, 0x01000193)
      hash ^= (word >>> 8) & 0xff
      hash = Math.imul(hash, 0x01000193)
    }
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}:${block.length}`
}

export function isForgeScriptDraftCompatible(draft: ForgeScriptDraft, entries: PalScriptEntry[]): boolean {
  return draft.baseSignature === getForgeScriptSourceSignature(entries, draft.sourceEntry)
}

function inferTargetLinks(entry: PalScriptEntry, bySourceIndex: Map<number, string>): ForgeScriptTargetLink[] {
  return getPalScriptTargets(entry).flatMap((target) => {
    const commandId = bySourceIndex.get(target.entry)
    return commandId ? [{ operand: target.operand, commandId }] : []
  })
}

export function createForgeScriptDraft(
  entries: PalScriptEntry[],
  sourceEntry: number,
  name = `事件脚本 #${sourceEntry.toString(16).padStart(4, '0').toUpperCase()}`,
  now = Date.now(),
  messages: string[] = [],
): ForgeScriptDraft {
  const sourceEntries = sourceBlock(entries, sourceEntry)
  const bySourceIndex = new Map(sourceEntries.map((entry) => [entry.index, commandIdForSource(entry.index)]))
  const commands = sourceEntries.map((entry) => ({
    id: bySourceIndex.get(entry.index)!,
    sourceIndex: entry.index,
    operation: entry.operation,
    operands: [...entry.operands] as [number, number, number],
    targetLinks: inferTargetLinks(entry, bySourceIndex),
    message: entry.operation === 0xffff && messages[entry.operands[0]] !== undefined
      ? { sourceMessage: entry.operands[0], text: messages[entry.operands[0]] }
      : null,
  }))
  return { formatVersion: FORGE_SCRIPT_PROJECT_VERSION, sourceEntry, baseSignature: getForgeScriptSourceSignature(entries, sourceEntry), name, commands, createdAt: now, updatedAt: now }
}

export function updateForgeScriptCommand(
  draft: ForgeScriptDraft,
  commandId: string,
  patch: Partial<Pick<ForgeScriptCommand, 'operation' | 'operands'>>,
  now = Date.now(),
): ForgeScriptDraft {
  const commands = draft.commands.map((command) => {
    if (command.id !== commandId) return cloneCommand(command)
    const operation = patch.operation ?? command.operation
    const operands = patch.operands ? [...patch.operands] as [number, number, number] : [...command.operands] as [number, number, number]
    const allowedOperands = targetOperands(operation)
    const targetLinks = command.targetLinks.filter((link) => allowedOperands.has(link.operand))
    for (const definition of getPalOpcodeDefinition(operation).targets) {
      if (targetLinks.some((link) => link.operand === definition.operand)) continue
      const linked = draft.commands.find((candidate) => candidate.sourceIndex === operands[definition.operand])
      if (linked) targetLinks.push({ operand: definition.operand, commandId: linked.id })
    }
    const message = operation === 0xffff
      ? command.message ?? { sourceMessage: operands[0], text: '' }
      : null
    return { ...command, operation, operands, targetLinks, message }
  })
  return touch(draft, commands, now)
}

export function setForgeScriptTarget(
  draft: ForgeScriptDraft,
  commandId: string,
  operand: 0 | 1 | 2,
  targetCommandId: string | null,
  now = Date.now(),
): ForgeScriptDraft {
  const commands = draft.commands.map((command) => {
    if (command.id !== commandId) return cloneCommand(command)
    const targetLinks = command.targetLinks.filter((link) => link.operand !== operand)
    if (targetCommandId) targetLinks.push({ operand, commandId: targetCommandId })
    return { ...command, operands: [...command.operands] as [number, number, number], targetLinks }
  })
  return touch(draft, commands, now)
}

function nextCommandId(draft: ForgeScriptDraft): string {
  let suffix = 1
  const used = new Set(draft.commands.map((command) => command.id))
  while (used.has(`forge-${suffix}`)) suffix++
  return `forge-${suffix}`
}

export function insertForgeScriptCommand(
  draft: ForgeScriptDraft,
  afterCommandId: string | null,
  operation = 0x0000,
  now = Date.now(),
): ForgeScriptDraft {
  const command: ForgeScriptCommand = {
    id: nextCommandId(draft),
    sourceIndex: null,
    operation,
    operands: [0, 0, 0],
    targetLinks: [],
    message: operation === 0xffff ? { sourceMessage: null, text: '' } : null,
  }
  const commands = draft.commands.map(cloneCommand)
  const index = afterCommandId ? commands.findIndex((item) => item.id === afterCommandId) : -1
  commands.splice(index + 1, 0, command)
  return touch(draft, commands, now)
}

export function removeForgeScriptCommand(draft: ForgeScriptDraft, commandId: string, now = Date.now()): ForgeScriptDraft {
  return touch(draft, draft.commands.filter((command) => command.id !== commandId).map(cloneCommand), now)
}

export function updateForgeScriptMessage(draft: ForgeScriptDraft, commandId: string, text: string, now = Date.now()): ForgeScriptDraft {
  const commands = draft.commands.map((command) => command.id === commandId
    ? { ...cloneCommand(command), message: { sourceMessage: command.message?.sourceMessage ?? null, text } }
    : cloneCommand(command))
  return touch(draft, commands, now)
}

export function moveForgeScriptCommand(
  draft: ForgeScriptDraft,
  commandId: string,
  direction: -1 | 1,
  now = Date.now(),
): ForgeScriptDraft {
  const commands = draft.commands.map(cloneCommand)
  const index = commands.findIndex((command) => command.id === commandId)
  const destination = index + direction
  if (index < 0 || destination < 0 || destination >= commands.length) return draft
  const [command] = commands.splice(index, 1)
  commands.splice(destination, 0, command)
  return touch(draft, commands, now)
}

export function validateForgeScriptDraft(
  draft: ForgeScriptDraft,
  allocationStart = 0,
): ForgeScriptIssue[] {
  const issues: ForgeScriptIssue[] = []
  if (draft.commands.length === 0) issues.push({ level: 'error', code: 'empty', message: '工程脚本至少需要一条指令' })
  const commandIds = new Set<string>()
  for (const command of draft.commands) {
    if (commandIds.has(command.id)) issues.push({ level: 'error', code: 'duplicate-id', message: `指令 ID ${command.id} 重复`, commandId: command.id })
    commandIds.add(command.id)
  }
  for (const command of draft.commands) {
    if (getPalOpcodeDefinition(command.operation).category === 'unknown') {
      issues.push({ level: 'warning', code: 'unknown-opcode', message: `${command.id} 使用未识别 opcode 0x${command.operation.toString(16).padStart(4, '0')}`, commandId: command.id })
    }
    for (const link of command.targetLinks) {
      if (!commandIds.has(link.commandId)) {
        issues.push({ level: 'error', code: 'dangling-target', message: `${command.id} 的 P${link.operand} 指向已删除指令 ${link.commandId}`, commandId: command.id })
      }
    }
  }
  const finalCommand = draft.commands.at(-1)
  if (finalCommand && !getPalOpcodeDefinition(finalCommand.operation).stopsFlow) {
    issues.push({ level: 'warning', code: 'missing-stop', message: '脚本末尾不是明确的停止指令，可能继续落入后续数据' })
  }
  if (allocationStart + draft.commands.length > 0x10000) {
    issues.push({ level: 'error', code: 'address-overflow', message: '脚本编译结果超过 16 位地址空间' })
  }
  return issues
}

export function compileForgeScriptDraft(draft: ForgeScriptDraft, allocationStart: number, messageAllocationStart = 0): CompiledForgeScript {
  const addressByCommandId = Object.fromEntries(draft.commands.map((command, index) => [command.id, allocationStart + index]))
  const issues = validateForgeScriptDraft(draft, allocationStart)
  const messages: CompiledForgeScript['messages'] = []
  const entries = draft.commands.map((command, index): PalScriptEntry => {
    const operands = [...command.operands] as [number, number, number]
    for (const link of command.targetLinks) {
      const targetAddress = addressByCommandId[link.commandId]
      if (targetAddress !== undefined) operands[link.operand] = targetAddress
    }
    if (command.operation === 0xffff && command.message) {
      const id = messageAllocationStart + messages.length
      messages.push({ id, text: command.message.text, sourceMessage: command.message.sourceMessage })
      operands[0] = id
    }
    return { index: allocationStart + index, operation: command.operation, operands }
  })
  return { sourceEntry: draft.sourceEntry, compiledEntry: allocationStart, entries, addressByCommandId, messages, issues }
}

export function compileForgeScriptProject(drafts: ForgeScriptDraft[], baseEntryCount: number, baseMessageCount: number | null = null): CompiledForgeScriptProject {
  let nextAddress = baseEntryCount
  let nextMessage = baseMessageCount ?? 0
  const scripts = drafts.map((draft) => {
    let compiled = compileForgeScriptDraft(draft, nextAddress, nextMessage)
    if (baseMessageCount === null && compiled.messages.length > 0) {
      compiled = {
        ...compiled,
        issues: [...compiled.issues, {
          level: 'error',
          code: 'message-base-missing',
          message: '未挂载 M.MSG，无法安全分配新增对白的消息编号',
          commandId: draft.commands.find((command) => command.operation === 0xffff && command.message)?.id,
        }],
      }
    }
    nextAddress += compiled.entries.length
    nextMessage += compiled.messages.length
    return compiled
  })
  const entryRedirects = Object.fromEntries(scripts.map((script) => [String(script.sourceEntry), script.compiledEntry]))
  const redirectedScripts = scripts.map((script) => ({
    ...script,
    entries: script.entries.map((entry) => {
      const operands = [...entry.operands] as [number, number, number]
      for (const target of getPalScriptTargets(entry)) {
        const redirected = entryRedirects[String(target.entry)]
        if (redirected !== undefined) operands[target.operand] = redirected
      }
      return { ...entry, operands }
    }),
  }))
  return {
    format: 'palforge-script-patches',
    version: FORGE_SCRIPT_PROJECT_VERSION,
    baseEntryCount,
    baseMessageCount,
    messageAllocationSafe: baseMessageCount !== null,
    entryRedirects,
    scripts: redirectedScripts,
    issues: redirectedScripts.flatMap((script) => script.issues),
  }
}

function isWord(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 0xffff
}

export function parseForgeScriptDrafts(value: unknown): ForgeScriptDraft[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((candidate): ForgeScriptDraft[] => {
    if (!candidate || typeof candidate !== 'object') return []
    const draft = candidate as Partial<ForgeScriptDraft>
    if (draft.formatVersion !== FORGE_SCRIPT_PROJECT_VERSION || !isWord(draft.sourceEntry) || typeof draft.baseSignature !== 'string' || typeof draft.name !== 'string' || !Array.isArray(draft.commands)) return []
    const commands = draft.commands.flatMap((item): ForgeScriptCommand[] => {
      if (!item || typeof item !== 'object') return []
      const command = item as Partial<ForgeScriptCommand>
      if (typeof command.id !== 'string' || !isWord(command.operation) || !Array.isArray(command.operands) || command.operands.length !== 3 || !command.operands.every(isWord)) return []
      const targetLinks = Array.isArray(command.targetLinks) ? command.targetLinks.flatMap((link): ForgeScriptTargetLink[] => {
        if (!link || typeof link !== 'object') return []
        const target = link as Partial<ForgeScriptTargetLink>
        return (target.operand === 0 || target.operand === 1 || target.operand === 2) && typeof target.commandId === 'string'
          ? [{ operand: target.operand, commandId: target.commandId }]
          : []
      }) : []
      return [{
        id: command.id,
        sourceIndex: command.sourceIndex === null || isWord(command.sourceIndex) ? command.sourceIndex : null,
        operation: command.operation,
        operands: command.operands as [number, number, number],
        targetLinks,
        message: command.message && typeof command.message === 'object' && typeof command.message.text === 'string'
          ? { sourceMessage: isWord(command.message.sourceMessage) ? command.message.sourceMessage : null, text: command.message.text }
          : null,
      }]
    })
    if (commands.length !== draft.commands.length) return []
    return [{
      formatVersion: FORGE_SCRIPT_PROJECT_VERSION,
      sourceEntry: draft.sourceEntry,
      baseSignature: draft.baseSignature,
      name: draft.name,
      commands,
      createdAt: typeof draft.createdAt === 'number' ? draft.createdAt : 0,
      updatedAt: typeof draft.updatedAt === 'number' ? draft.updatedAt : 0,
    }]
  })
}

export function getTargetDefinition(operation: number, operand: number): PalScriptTargetDefinition | undefined {
  return getPalOpcodeDefinition(operation).targets.find((target) => target.operand === operand)
}
