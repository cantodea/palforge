import type { PalEventObject, PalSceneRecord } from './scene'
import { formatPalEntry, formatPalWord, getPalOpcodeDefinition, type PalScriptEntry } from './script'
import type { CompiledForgeScriptProject } from './scriptProject'

export type SceneDebugMode = 'scene-enter' | 'scene-teleport' | 'event-trigger' | 'event-auto'
export type SceneDebugStatus = 'paused' | 'waiting' | 'completed' | 'error'

export type SceneDebugRuntime = {
  entries: PalScriptEntry[]
  messages: string[]
  entryRedirects: Record<string, number>
}

export type SceneDebugLog = {
  step: number
  entry: number
  level: 'info' | 'effect' | 'warning' | 'error'
  message: string
}

export type SceneDebugDecisionOption = {
  id: string
  label: string
  nextEntry?: number
  action?: 'continue' | 'complete'
}

export type SceneDebugPendingDecision = {
  kind: 'branch' | 'battle' | 'confirm' | 'dialogue' | 'unsupported'
  prompt: string
  options: SceneDebugDecisionOption[]
}

export type SceneDebugCallFrame = {
  returnEntry: number
  eventObjectId: number
  mode: SceneDebugMode
}

export type SceneDebugSession = {
  id: string
  mode: SceneDebugMode
  status: SceneDebugStatus
  stopReason: string
  sourceEntry: number
  currentEntry: number
  lastEntry: number | null
  resumeEntry: number | null
  nextSceneNumber: number | null
  eventObjectId: number
  scene: PalSceneRecord
  events: Record<string, PalEventObject>
  party: { x: number; y: number; layer: number; direction: number }
  palette: { number: number; night: boolean }
  music: number | null
  dialogue: { mode: string; messageId: number | null; text: string } | null
  scriptSuccess: boolean
  callStack: SceneDebugCallFrame[]
  idleCounters: Record<string, number>
  pendingDecision: SceneDebugPendingDecision | null
  steps: number
  maxSteps: number
  logs: SceneDebugLog[]
}

export type CreateSceneDebugSessionOptions = {
  id?: string
  mode: SceneDebugMode
  sourceEntry: number
  eventObjectId: number
  scene: PalSceneRecord
  events: PalEventObject[]
  party: { x: number; y: number; layer?: number; direction?: number }
  palette?: { number: number; night: boolean }
  maxSteps?: number
}

const observedOperations = new Set([
  0x0005, 0x0035, 0x0036, 0x0037, 0x0047, 0x004f, 0x0050, 0x0051,
  0x0071, 0x0073, 0x0076, 0x007f, 0x0085, 0x008c, 0x008e, 0x0093,
  0x0096, 0x009b, 0x00a3, 0x00a4, 0x00a5, 0x00a6,
])

const asSignedWord = (value: number) => value >= 0x8000 ? value - 0x10000 : value

function cloneEntry(entry: PalScriptEntry): PalScriptEntry {
  return { ...entry, operands: [...entry.operands] as [number, number, number] }
}

export function createSceneDebugRuntime(
  baseEntries: PalScriptEntry[],
  baseMessages: string[],
  project?: CompiledForgeScriptProject,
): SceneDebugRuntime {
  const entries = baseEntries.map(cloneEntry)
  const messages = [...baseMessages]
  if (project) {
    for (const script of project.scripts) {
      for (const entry of script.entries) entries[entry.index] = cloneEntry(entry)
      for (const message of script.messages) messages[message.id] = message.text
    }
  }
  return { entries, messages, entryRedirects: { ...(project?.entryRedirects ?? {}) } }
}

export function redirectSceneDebugEntry(runtime: SceneDebugRuntime, entry: number): number {
  return runtime.entryRedirects[String(entry)] ?? entry
}

function addLog(session: SceneDebugSession, level: SceneDebugLog['level'], entry: number, message: string) {
  session.logs = [...session.logs, { step: session.steps, entry, level, message }].slice(-500)
}

function cloneSession(session: SceneDebugSession): SceneDebugSession {
  return {
    ...session,
    scene: { ...session.scene },
    events: Object.fromEntries(Object.entries(session.events).map(([id, event]) => [id, { ...event }])),
    party: { ...session.party },
    palette: { ...session.palette },
    dialogue: session.dialogue ? { ...session.dialogue } : null,
    callStack: session.callStack.map((frame) => ({ ...frame })),
    idleCounters: { ...session.idleCounters },
    pendingDecision: session.pendingDecision ? {
      ...session.pendingDecision,
      options: session.pendingDecision.options.map((option) => ({ ...option })),
    } : null,
    logs: [...session.logs],
  }
}

export function createSceneDebugSession(
  runtime: SceneDebugRuntime,
  options: CreateSceneDebugSessionOptions,
): SceneDebugSession {
  const currentEntry = redirectSceneDebugEntry(runtime, options.sourceEntry)
  const valid = options.sourceEntry > 0 && Boolean(runtime.entries[currentEntry])
  const session: SceneDebugSession = {
    id: options.id ?? `scene-${options.scene.number}-${options.sourceEntry}`,
    mode: options.mode,
    status: valid ? 'paused' : 'error',
    stopReason: valid ? '已建立只读场景沙盒，等待执行' : `脚本入口 ${formatPalEntry(options.sourceEntry)} 无效`,
    sourceEntry: options.sourceEntry,
    currentEntry,
    lastEntry: null,
    resumeEntry: null,
    nextSceneNumber: null,
    eventObjectId: options.eventObjectId,
    scene: { ...options.scene },
    events: Object.fromEntries(options.events.map((event) => [String(event.index + 1), { ...event }])),
    party: { x: options.party.x, y: options.party.y, layer: options.party.layer ?? 0, direction: options.party.direction ?? 0 },
    palette: { ...(options.palette ?? { number: 0, night: false }) },
    music: null,
    dialogue: null,
    scriptSuccess: true,
    callStack: [],
    idleCounters: {},
    pendingDecision: null,
    steps: 0,
    maxSteps: options.maxSteps ?? 2048,
    logs: [],
  }
  addLog(session, valid ? 'info' : 'error', currentEntry, valid
    ? `场景 #${options.scene.number} · ${options.mode} · 入口 ${formatPalEntry(options.sourceEntry)}${currentEntry !== options.sourceEntry ? ` → 工程覆盖 ${formatPalEntry(currentEntry)}` : ''}`
    : session.stopReason)
  return session
}

function currentEvent(session: SceneDebugSession): PalEventObject | undefined {
  return session.events[String(session.eventObjectId)]
}

function targetEvent(session: SceneDebugSession, operand0: number): PalEventObject | undefined {
  const id = operand0 === 0 || operand0 === 0xffff ? session.eventObjectId : operand0
  return session.events[String(id)]
}

function eventOrWait(session: SceneDebugSession, entry: PalScriptEntry, event: PalEventObject | undefined, role: string): event is PalEventObject {
  if (event) return true
  session.status = 'waiting'
  session.stopReason = `${role}不在当前场景沙盒中`
  session.pendingDecision = {
    kind: 'unsupported',
    prompt: `${formatPalEntry(entry.index)} 需要事件对象，但当前上下文没有可用对象。`,
    options: [
      { id: 'skip', label: '明确跳过并继续', nextEntry: entry.index + 1 },
      { id: 'stop', label: '停止本次调试', action: 'complete' },
    ],
  }
  addLog(session, 'warning', entry.index, session.stopReason)
  return false
}

function goTo(runtime: SceneDebugRuntime, session: SceneDebugSession, entry: number, explicit = true) {
  session.currentEntry = explicit ? redirectSceneDebugEntry(runtime, entry) : entry
  session.status = 'paused'
  session.stopReason = '单步完成'
}

function returnOrComplete(runtime: SceneDebugRuntime, session: SceneDebugSession, resumeEntry: number | null, reason: string) {
  const frame = session.callStack.pop()
  if (frame) {
    session.eventObjectId = frame.eventObjectId
    session.mode = frame.mode
    goTo(runtime, session, frame.returnEntry, false)
    addLog(session, 'info', session.lastEntry ?? session.currentEntry, `子脚本结束，返回 ${formatPalEntry(frame.returnEntry)}`)
    return
  }
  session.status = 'completed'
  session.stopReason = reason
  session.resumeEntry = resumeEntry
}

function waitForDecision(session: SceneDebugSession, decision: SceneDebugPendingDecision, reason: string) {
  session.status = 'waiting'
  session.stopReason = reason
  session.pendingDecision = decision
}

function externalBranchDecision(runtime: SceneDebugRuntime, session: SceneDebugSession, entry: PalScriptEntry) {
  const definition = getPalOpcodeDefinition(entry.operation)
  const options: SceneDebugDecisionOption[] = [{ id: 'fallthrough', label: `条件不成立 → ${formatPalEntry(entry.index + 1)}`, nextEntry: entry.index + 1 }]
  for (const target of definition.targets) {
    const destination = redirectSceneDebugEntry(runtime, entry.operands[target.operand])
    if (entry.operands[target.operand] !== 0) options.push({ id: `target-${target.operand}`, label: `${target.label} → ${formatPalEntry(destination)}`, nextEntry: destination })
  }
  waitForDecision(session, {
    kind: 'branch',
    prompt: `${definition.label}依赖战斗、存档或玩家状态，请明确选择本次沙盒路径。`,
    options,
  }, '等待外部条件')
}

function unsupportedDecision(session: SceneDebugSession, entry: PalScriptEntry) {
  const definition = getPalOpcodeDefinition(entry.operation)
  waitForDecision(session, {
    kind: 'unsupported',
    prompt: `${definition.label}尚未在浏览器沙盒中模拟；它没有被当作执行成功。`,
    options: [
      { id: 'skip', label: '明确跳过并继续', nextEntry: entry.index + 1 },
      { id: 'stop', label: '停止本次调试', action: 'complete' },
    ],
  }, `遇到未模拟指令 ${formatPalWord(entry.operation)}`)
  addLog(session, 'warning', entry.index, `${definition.label}：等待用户决定跳过或停止`)
}

function setEventPosition(event: PalEventObject, x: number, y: number, half: number) {
  event.x = x * 32 + half * 16
  event.y = y * 16 + half * 8
}

export function stepSceneDebugSession(runtime: SceneDebugRuntime, previous: SceneDebugSession): SceneDebugSession {
  if (previous.status !== 'paused') return previous
  const session = cloneSession(previous)
  if (session.steps >= session.maxSteps) {
    session.status = 'error'
    session.stopReason = `超过 ${session.maxSteps} 步，可能存在无限循环`
    addLog(session, 'error', session.currentEntry, session.stopReason)
    return session
  }
  const entry = runtime.entries[session.currentEntry]
  if (!entry) {
    session.status = 'error'
    session.stopReason = `脚本地址 ${formatPalEntry(session.currentEntry)} 越界或未编译`
    addLog(session, 'error', session.currentEntry, session.stopReason)
    return session
  }

  session.steps += 1
  session.lastEntry = entry.index
  session.pendingDecision = null
  session.dialogue = null
  const definition = getPalOpcodeDefinition(entry.operation)
  addLog(session, 'info', entry.index, `${formatPalWord(entry.operation)} ${definition.label} · ${entry.operands.map(formatPalWord).join(' ')}`)
  const next = () => goTo(runtime, session, entry.index + 1, false)
  const jump = (address: number) => goTo(runtime, session, address, true)

  switch (entry.operation) {
    case 0x0000:
      returnOrComplete(runtime, session, null, '脚本正常结束')
      break
    case 0x0001:
      if (session.mode === 'event-auto') next()
      else returnOrComplete(runtime, session, entry.index + 1, '脚本暂停，后续入口已保存')
      break
    case 0x0002: {
      const key = `${session.eventObjectId}:${entry.index}:${session.mode}`
      const count = (session.idleCounters[key] ?? 0) + 1
      session.idleCounters[key] = count
      if (entry.operands[1] === 0 || count < entry.operands[1]) {
        if (session.mode === 'event-auto') jump(entry.operands[0])
        else returnOrComplete(runtime, session, entry.operands[0], '脚本暂停，指定后续入口已保存')
      }
      else { session.idleCounters[key] = 0; next() }
      break
    }
    case 0x0003: {
      const event = currentEvent(session)
      if (entry.operands[1] > 0 && !eventOrWait(session, entry, event, '循环计数事件')) break
      const key = `${session.eventObjectId}:${entry.index}:${session.mode}`
      const count = (session.idleCounters[key] ?? 0) + 1
      session.idleCounters[key] = count
      if (entry.operands[1] === 0 || count < entry.operands[1]) jump(entry.operands[0])
      else { session.idleCounters[key] = 0; next() }
      break
    }
    case 0x0004:
      session.callStack.push({ returnEntry: entry.index + 1, eventObjectId: session.eventObjectId, mode: session.mode })
      if (entry.operands[1] !== 0) session.eventObjectId = entry.operands[1]
      session.mode = 'event-trigger'
      jump(entry.operands[0])
      addLog(session, 'info', entry.index, `调用 ${formatPalEntry(session.currentEntry)} · 栈深 ${session.callStack.length}`)
      break
    case 0x0006:
      waitForDecision(session, {
        kind: 'branch',
        prompt: `SDLPAL 会生成 1–100 的随机数；大于等于 ${entry.operands[0]} 时跳转。`,
        options: [
          { id: 'fallthrough', label: `随机未跳转 → ${formatPalEntry(entry.index + 1)}`, nextEntry: entry.index + 1 },
          { id: 'branch', label: `采用概率分支 → ${formatPalEntry(redirectSceneDebugEntry(runtime, entry.operands[1]))}`, nextEntry: redirectSceneDebugEntry(runtime, entry.operands[1]) },
        ],
      }, '等待随机分支选择')
      break
    case 0x0007:
      waitForDecision(session, {
        kind: 'battle',
        prompt: `战斗 #${entry.operands[0]} 不会在浏览器中伪造，请选择测试结果。`,
        options: [
          { id: 'win', label: `胜利 → ${formatPalEntry(entry.index + 1)}`, nextEntry: entry.index + 1 },
          { id: 'lose', label: `战败 → ${formatPalEntry(redirectSceneDebugEntry(runtime, entry.operands[1] || entry.index + 1))}`, nextEntry: redirectSceneDebugEntry(runtime, entry.operands[1] || entry.index + 1) },
          { id: 'flee', label: `逃跑 → ${formatPalEntry(redirectSceneDebugEntry(runtime, entry.operands[2] || entry.index + 1))}`, nextEntry: redirectSceneDebugEntry(runtime, entry.operands[2] || entry.index + 1) },
        ],
      }, '等待战斗结果')
      break
    case 0x0008:
      session.resumeEntry = entry.index + 1
      next()
      break
    case 0x0009: {
      const frames = entry.operands[0] || 1
      if (session.mode === 'event-auto') {
        const key = `${session.eventObjectId}:${entry.index}:auto-wait`
        const count = (session.idleCounters[key] ?? 0) + 1
        session.idleCounters[key] = count
        if (count >= frames) { session.idleCounters[key] = 0; next() }
        else goTo(runtime, session, entry.index, false)
      } else {
        addLog(session, 'effect', entry.index, `记录等待 ${frames} 帧；调试器不做真实时间阻塞`)
        next()
      }
      break
    }
    case 0x000a:
      waitForDecision(session, {
        kind: 'confirm',
        prompt: '确认菜单需要玩家输入。',
        options: [
          { id: 'yes', label: `选择“是” → ${formatPalEntry(entry.index + 1)}`, nextEntry: entry.index + 1 },
          { id: 'no', label: `选择“否” → ${formatPalEntry(redirectSceneDebugEntry(runtime, entry.operands[0]))}`, nextEntry: redirectSceneDebugEntry(runtime, entry.operands[0]) },
        ],
      }, '等待确认选择')
      break
    case 0x000b:
    case 0x000c:
    case 0x000d:
    case 0x000e: {
      const event = currentEvent(session)
      if (!eventOrWait(session, entry, event, '移动事件')) break
      event.direction = entry.operation - 0x000b
      event.x += (event.direction === 2 || event.direction === 3 ? -4 : 4)
      event.y += (event.direction === 0 || event.direction === 3 ? -2 : 2)
      if (event.spriteFrames > 0) event.currentFrame = (event.currentFrame + 1) % (event.spriteFrames === 3 ? 4 : event.spriteFrames)
      next()
      break
    }
    case 0x000f: {
      const event = currentEvent(session)
      if (!eventOrWait(session, entry, event, '当前事件')) break
      if (entry.operands[0] !== 0xffff) event.direction = entry.operands[0]
      if (entry.operands[1] !== 0xffff) event.currentFrame = entry.operands[1]
      next()
      break
    }
    case 0x0010:
    case 0x0011:
    case 0x007c:
    case 0x0082: {
      const event = currentEvent(session)
      if (!eventOrWait(session, entry, event, '移动事件')) break
      setEventPosition(event, entry.operands[0], entry.operands[1], entry.operands[2])
      next()
      break
    }
    case 0x0012: {
      const event = targetEvent(session, entry.operands[0])
      if (!eventOrWait(session, entry, event, '目标事件')) break
      event.x = session.party.x + asSignedWord(entry.operands[1])
      event.y = session.party.y + asSignedWord(entry.operands[2])
      next()
      break
    }
    case 0x0013: {
      const event = targetEvent(session, entry.operands[0])
      if (!eventOrWait(session, entry, event, '目标事件')) break
      event.x = entry.operands[1]
      event.y = entry.operands[2]
      next()
      break
    }
    case 0x0014: {
      const event = currentEvent(session)
      if (!eventOrWait(session, entry, event, '当前事件')) break
      event.currentFrame = entry.operands[0]
      event.direction = 2
      next()
      break
    }
    case 0x0016: {
      const event = targetEvent(session, entry.operands[0])
      if (entry.operands[0] !== 0 && eventOrWait(session, entry, event, '目标事件')) {
        event.direction = entry.operands[1]
        event.currentFrame = entry.operands[2]
      }
      if (session.status !== 'waiting') next()
      break
    }
    case 0x0024:
    case 0x0025: {
      const event = targetEvent(session, entry.operands[0])
      if (entry.operands[0] !== 0 && eventOrWait(session, entry, event, '目标事件')) {
        if (entry.operation === 0x0024) event.autoScript = entry.operands[1]
        else event.triggerScript = entry.operands[1]
      }
      if (session.status !== 'waiting') next()
      break
    }
    case 0x003b:
    case 0x003c:
    case 0x003d:
    case 0x003e:
      session.dialogue = { mode: definition.label, messageId: null, text: '' }
      next()
      break
    case 0x0040: {
      const event = targetEvent(session, entry.operands[0])
      if (entry.operands[0] !== 0 && eventOrWait(session, entry, event, '目标事件')) event.triggerMode = entry.operands[1]
      if (session.status !== 'waiting') next()
      break
    }
    case 0x0041:
      session.scriptSuccess = false
      next()
      break
    case 0x0043:
      session.music = entry.operands[0]
      addLog(session, 'effect', entry.index, `背景音乐切换为 #${entry.operands[0]}（仅记录，不播放）`)
      next()
      break
    case 0x0049: {
      const event = targetEvent(session, entry.operands[0])
      if (entry.operands[0] !== 0 && eventOrWait(session, entry, event, '目标事件')) event.state = asSignedWord(entry.operands[1])
      if (session.status !== 'waiting') next()
      break
    }
    case 0x004b: {
      const event = currentEvent(session)
      if (!eventOrWait(session, entry, event, '当前事件')) break
      event.vanishTime = -15
      next()
      break
    }
    case 0x004d:
      waitForDecision(session, {
        kind: 'confirm',
        prompt: '原游戏会等待任意按键。',
        options: [{ id: 'continue', label: '模拟按键并继续', nextEntry: entry.index + 1 }],
      }, '等待按键')
      break
    case 0x004e:
    case 0x00a0:
      session.status = 'completed'
      session.stopReason = entry.operation === 0x004e ? '已拦截“读取最近存档”' : '已拦截“退出游戏”'
      addLog(session, 'warning', entry.index, `${session.stopReason}；浏览器沙盒没有执行外部副作用`)
      break
    case 0x0052: {
      const event = currentEvent(session)
      if (!eventOrWait(session, entry, event, '当前事件')) break
      event.state *= -1
      event.vanishTime = entry.operands[0] || 800
      next()
      break
    }
    case 0x0053:
      session.palette.night = false
      next()
      break
    case 0x0054:
      session.palette.night = true
      next()
      break
    case 0x0059:
      session.scene.number = entry.operands[0] || session.scene.number
      session.nextSceneNumber = entry.operands[0] || null
      session.status = 'completed'
      session.stopReason = entry.operands[0] ? `脚本请求切换到场景 #${entry.operands[0]}` : '场景切换指令没有有效目标'
      addLog(session, 'effect', entry.index, `${session.stopReason}；目标资源尚未自动挂入当前沙盒`)
      break
    case 0x006c:
    case 0x007d: {
      const event = targetEvent(session, entry.operands[0])
      if (!eventOrWait(session, entry, event, '目标事件')) break
      event.x += asSignedWord(entry.operands[1])
      event.y += asSignedWord(entry.operands[2])
      if (entry.operation === 0x006c && event.spriteFrames > 0) event.currentFrame = (event.currentFrame + 1) % (event.spriteFrames === 3 ? 4 : event.spriteFrames)
      next()
      break
    }
    case 0x006d:
      if (entry.operands[0] === session.scene.number) {
        if (entry.operands[1] || entry.operands[2]) {
          if (entry.operands[1]) session.scene.scriptOnEnter = entry.operands[1]
          if (entry.operands[2]) session.scene.scriptOnTeleport = entry.operands[2]
        } else {
          session.scene.scriptOnEnter = 0
          session.scene.scriptOnTeleport = 0
        }
      } else addLog(session, 'effect', entry.index, `记录对场景 #${entry.operands[0]} 的脚本入口修改；当前沙盒未加载该场景`)
      next()
      break
    case 0x006e:
      session.party.x += asSignedWord(entry.operands[0])
      session.party.y += asSignedWord(entry.operands[1])
      session.party.layer = entry.operands[2] * 8
      next()
      break
    case 0x006f: {
      const selected = targetEvent(session, entry.operands[0])
      const event = currentEvent(session)
      if (!eventOrWait(session, entry, selected, '目标事件') || !eventOrWait(session, entry, event, '当前事件')) break
      if (selected.state === asSignedWord(entry.operands[1])) event.state = asSignedWord(entry.operands[1])
      next()
      break
    }
    case 0x0070:
    case 0x007a:
    case 0x007b:
      session.party.x = entry.operands[0] * 32 + entry.operands[2] * 16
      session.party.y = entry.operands[1] * 16 + entry.operands[2] * 8
      next()
      break
    case 0x007e: {
      const event = targetEvent(session, entry.operands[0])
      if (!eventOrWait(session, entry, event, '目标事件')) break
      event.layer = asSignedWord(entry.operands[1])
      next()
      break
    }
    case 0x0080:
      session.palette.night = !session.palette.night
      next()
      break
    case 0x0083: {
      const selected = targetEvent(session, entry.operands[0])
      const event = currentEvent(session)
      if (!eventOrWait(session, entry, selected, '目标事件') || !eventOrWait(session, entry, event, '当前事件')) break
      const outside = Math.abs(event.x - selected.x) + Math.abs((event.y - selected.y) * 2) >= entry.operands[1] * 32 + 16
      session.scriptSuccess = !outside
      if (outside) jump(entry.operands[2]); else next()
      break
    }
    case 0x0087: {
      const event = targetEvent(session, entry.operands[0])
      if (!eventOrWait(session, entry, event, '目标事件')) break
      const frames = event.spriteFrames || event.autoSpriteFrames
      if (frames > 0) event.currentFrame = (event.currentFrame + 1) % (event.spriteFrames === 3 ? 4 : frames)
      next()
      break
    }
    case 0x008b:
      session.palette.number = entry.operands[0]
      next()
      break
    case 0x0094: {
      const event = targetEvent(session, entry.operands[0])
      if (!eventOrWait(session, entry, event, '目标事件')) break
      if (event.state === asSignedWord(entry.operands[1])) jump(entry.operands[2]); else next()
      break
    }
    case 0x0095:
      if (session.scene.number === entry.operands[0]) jump(entry.operands[1]); else next()
      break
    case 0x0099:
      if (entry.operands[0] === session.scene.number) session.scene.mapNumber = entry.operands[1]
      else addLog(session, 'effect', entry.index, `记录场景 #${entry.operands[0]} 更换地图为 #${entry.operands[1]}`)
      next()
      break
    case 0xffff: {
      if (session.mode === 'event-auto') {
        addLog(session, 'effect', entry.index, '自动脚本中的文本记录按 SDLPAL 经典模式跳过显示')
        next()
        break
      }
      const text = runtime.messages[entry.operands[0]] ?? `[M.MSG #${entry.operands[0]} 未挂载]`
      session.dialogue = { mode: '显示文本', messageId: entry.operands[0], text }
      addLog(session, 'effect', entry.index, `对白 #${entry.operands[0]}：${text}`)
      waitForDecision(session, {
        kind: 'dialogue',
        prompt: text,
        options: [{ id: 'continue', label: '继续对白', nextEntry: entry.index + 1 }],
      }, '等待继续对白')
      break
    }
    default:
      if (observedOperations.has(entry.operation)) {
        addLog(session, 'effect', entry.index, `${definition.label}已记录，但浏览器不渲染该影音效果`)
        next()
      } else if (definition.targets.length > 0) {
        externalBranchDecision(runtime, session, entry)
      } else {
        unsupportedDecision(session, entry)
      }
      break
  }
  return session
}

export function resolveSceneDebugDecision(
  runtime: SceneDebugRuntime,
  previous: SceneDebugSession,
  optionId: string,
): SceneDebugSession {
  if (previous.status !== 'waiting' || !previous.pendingDecision) return previous
  const session = cloneSession(previous)
  const pending = session.pendingDecision
  if (!pending) return previous
  const option = pending.options.find((candidate) => candidate.id === optionId)
  if (!option) return previous
  const pendingKind = pending.kind
  session.pendingDecision = null
  if (option.action === 'complete') {
    session.status = 'completed'
    session.stopReason = '用户停止调试'
  } else if (option.nextEntry !== undefined) {
    goTo(runtime, session, option.nextEntry, false)
    session.stopReason = `${pendingKind}：${option.label}`
  } else {
    session.status = 'error'
    session.stopReason = '调试选项没有后续地址'
  }
  addLog(session, option.action === 'complete' ? 'warning' : 'info', session.lastEntry ?? session.currentEntry, option.label)
  return session
}

export function continueSceneDebugSession(
  runtime: SceneDebugRuntime,
  previous: SceneDebugSession,
  breakpoints: Iterable<number> = [],
  maxBatch = 512,
): SceneDebugSession {
  const stops = new Set(breakpoints)
  let session = previous
  for (let index = 0; index < maxBatch && session.status === 'paused'; index++) {
    if (index > 0 && stops.has(session.currentEntry)) {
      const paused = cloneSession(session)
      paused.stopReason = `命中断点 ${formatPalEntry(paused.currentEntry)}`
      return paused
    }
    session = stepSceneDebugSession(runtime, session)
  }
  if (session.status === 'paused' && maxBatch > 0) {
    const paused = cloneSession(session)
    paused.stopReason = `连续执行达到 ${maxBatch} 步批次上限`
    return paused
  }
  return session
}
