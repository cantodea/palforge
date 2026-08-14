import {
  AppWindow,
  ArrowDown,
  ArrowUp,
  Archive,
  AlertTriangle,
  Blocks,
  Braces,
  BugPlay,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Code2,
  CopyPlus,
  Download,
  FileCode2,
  FileImage,
  FolderOpen,
  Gamepad2,
  Grid3X3,
  Hammer,
  Layers3,
  LoaderCircle,
  Map,
  MousePointer2,
  PackagePlus,
  PanelBottomClose,
  PanelBottomOpen,
  Pause,
  Play,
  PlugZap,
  Save,
  Search,
  Settings2,
  StepForward,
  SquareMousePointer,
  TerminalSquare,
  Trash2,
  Undo2,
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { MapCanvas } from './components/MapCanvas'
import { PalSceneCanvas, type PalTileSelection } from './components/PalSceneCanvas'
import { ResourceBrowser } from './components/ResourceBrowser'
import { SdlpalRunnerDialog } from './components/SdlpalRunnerDialog'
import { readMkfChunk, readMkfIndex } from './core/mkf'
import { decodePatChunk } from './core/palette'
import type { GameProfile } from './core/resourceDecoder'
import {
  createPalArchiveSet,
  loadPalScene,
  loadPalSceneCatalog,
  type LoadedPalEvent,
  type LoadedPalScene,
  type PalArchiveSet,
  type PalSceneCatalog,
} from './core/sceneLoader'
import {
  collectSceneScriptReferences,
  formatPalEntry,
  formatPalWord,
  getPalOpcodeDefinition,
  getPalScriptTargets,
  listPalOpcodeDefinitions,
  parsePalEntryInput,
  tracePalScript,
  type PalScriptEntry,
  type PalScriptReference,
} from './core/script'
import {
  compileForgeScriptProject,
  createForgeScriptDraft,
  getTargetDefinition,
  insertForgeScriptCommand,
  isForgeScriptDraftCompatible,
  moveForgeScriptCommand,
  parseForgeScriptDrafts,
  removeForgeScriptCommand,
  setForgeScriptTarget,
  updateForgeScriptCommand,
  updateForgeScriptMessage,
  type CompiledForgeScript,
  type ForgeScriptDraft,
} from './core/scriptProject'
import {
  createSceneDebugRuntime,
  createSceneDebugSession,
  resolveSceneDebugDecision,
  stepSceneDebugSession,
  type SceneDebugMode,
  type SceneDebugRuntime,
  type SceneDebugSession,
} from './core/sceneDebugger'
import { createSdlpalLaunchTarget, type SdlpalLaunchTarget } from './core/sdlpalRunner'
import { createTestSnapshot, type TestSnapshot } from './core/tester'
import { demoMap, demoModules, demoScripts } from './data/demo'
import type {
  ForgeModule,
  ImportedResource,
  MapEvent,
  PalPalette,
  SceneMap,
  Script,
  TerrainKind,
  TestSettings,
} from './types'

type View = 'map' | 'script' | 'resources' | 'modules'
type Tool = 'select' | 'paint' | 'event'

type SceneDebugTarget = {
  id: string
  label: string
  entry: number
  eventObjectId: number
  mode: SceneDebugMode
}

const resourceKind = (file: File): ImportedResource['kind'] => {
  const extension = file.name.split('.').pop()?.toLowerCase()
  if (extension === 'mkf') return 'mkf'
  if (file.type.startsWith('image/') || ['png', 'bmp', 'webp'].includes(extension ?? '')) return 'image'
  if (file.type.startsWith('audio/') || ['wav', 'mp3', 'ogg', 'mid'].includes(extension ?? '')) return 'audio'
  if (['json', 'txt', 'csv', 'bin'].includes(extension ?? '')) return 'data'
  return 'other'
}

const terrainLabels: Record<TerrainKind, string> = {
  grass: '草地',
  path: '道路',
  water: '水面',
  stone: '岩地',
  flower: '花丛',
}

function RailButton({
  active,
  label,
  children,
  onClick,
}: {
  active?: boolean
  label: string
  children: React.ReactNode
  onClick?: () => void
}) {
  return (
    <button className={`rail-button ${active ? 'active' : ''}`} title={label} onClick={onClick}>
      {children}
      <span>{label}</span>
    </button>
  )
}

function Section({
  title,
  count,
  children,
  defaultOpen = true,
}: {
  title: string
  count?: number
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="tree-section">
      <button className="section-title" onClick={() => setOpen((value) => !value)}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span>{title}</span>
        {count !== undefined && <small>{count}</small>}
      </button>
      {open && <div className="section-body">{children}</div>}
    </section>
  )
}

function ProjectExplorer({
  view,
  onView,
  selectedScriptId,
  onScript,
  resources,
  sceneCatalog,
  selectedSceneNumber,
  onScene,
  realScriptReferences,
  selectedRealScriptEntry,
  onRealScript,
  editedScriptEntries,
}: {
  view: View
  onView: (view: View) => void
  selectedScriptId: string
  onScript: (script: Script) => void
  resources: ImportedResource[]
  sceneCatalog: PalSceneCatalog | null
  selectedSceneNumber: number | null
  onScene: (sceneNumber: number) => void
  realScriptReferences: PalScriptReference[]
  selectedRealScriptEntry: number | null
  onRealScript: (entry: number) => void
  editedScriptEntries: number[]
}) {
  return (
    <aside className="explorer panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">PALFORGE PROJECT</span>
          <strong>逍遥试作</strong>
        </div>
        <button className="icon-button" title="工程设置">
          <Settings2 size={15} />
        </button>
      </div>
      <label className="search-box">
        <Search size={14} />
        <input aria-label="搜索工程" placeholder="搜索场景、脚本、资源…" />
        <kbd>⌘K</kbd>
      </label>
      <div className="tree-scroll">
        <Section title="场景" count={sceneCatalog?.availableScenes.length ?? 3}>
          {sceneCatalog ? sceneCatalog.availableScenes.map((scene) => (
            <button
              className={`tree-item ${view === 'map' && selectedSceneNumber === scene.number ? 'selected' : ''}`}
              key={scene.number}
              onClick={() => onScene(scene.number)}
            >
              <Map size={14} />
              <span>场景 #{String(scene.number).padStart(3, '0')}</span>
              <code>MAP {String(scene.mapNumber).padStart(3, '0')}</code>
            </button>
          )) : (
            <>
              <button className={`tree-item ${view === 'map' ? 'selected' : ''}`} onClick={() => onView('map')}>
                <Map size={14} />
                <span>十里坡 · 原型场景</span>
                <i className="dirty-dot" />
              </button>
              <button className="tree-item muted-item"><Map size={14} /><span>山神庙</span></button>
              <button className="tree-item muted-item"><Map size={14} /><span>余杭镇</span></button>
            </>
          )}
        </Section>
        <Section title={sceneCatalog ? '当前场景脚本' : '事件脚本'} count={sceneCatalog ? realScriptReferences.length : demoScripts.length}>
          {sceneCatalog ? (
            realScriptReferences.length > 0 ? realScriptReferences.map((reference) => (
              <button
                key={reference.entry}
                className={`tree-item ${view === 'script' && selectedRealScriptEntry === reference.entry ? 'selected' : ''}`}
                onClick={() => onRealScript(reference.entry)}
                title={reference.sources.map((source) => source.label).join('\n')}
              >
                <FileCode2 size={14} />
                <span>{reference.sources[0].label}{reference.sources.length > 1 ? ` +${reference.sources.length - 1}` : ''}</span>
                {editedScriptEntries.includes(reference.entry) && <i className="dirty-dot" title="工程脚本已修改" />}
                <code>{formatPalEntry(reference.entry)}</code>
              </button>
            )) : <button className="tree-item muted-item"><FileCode2 size={14} /><span>当前场景没有脚本入口</span></button>
          ) : demoScripts.map((script) => (
            <button
              key={script.id}
              className={`tree-item ${view === 'script' && selectedScriptId === script.id ? 'selected' : ''}`}
              onClick={() => onScript(script)}
            >
              <FileCode2 size={14} />
              <span>{script.name}</span>
              <code>{script.id.split('-')[1]}</code>
            </button>
          ))}
        </Section>
        <Section title="原版资源" count={resources.filter((item) => item.kind === 'mkf').length}>
          {resources
            .filter((item) => item.kind === 'mkf')
            .slice(0, 6)
            .map((resource) => (
              <button className="tree-item" key={resource.path} onClick={() => onView('resources')}>
                <Archive size={14} />
                <span>{resource.name}</span>
                {resource.chunks ? <code>{resource.chunks}</code> : null}
              </button>
            ))}
        </Section>
        <Section title="扩展内容" count={2}>
          <button className="tree-item" onClick={() => onView('resources')}>
            <FileImage size={14} />
            <span>自定义美术</span>
          </button>
          <button className="tree-item" onClick={() => onView('modules')}>
            <Blocks size={14} />
            <span>玩法模块</span>
          </button>
        </Section>
      </div>
      <div className="explorer-footer">
        <span className="status-light" />
        {resources.some((item) => item.file && !item.path.startsWith('forge://'))
          ? '本地游戏目录 · 只读模式'
          : '演示工程 · 尚未挂载游戏目录'}
      </div>
    </aside>
  )
}

function TopBar({
  projectMounted,
  sceneTitle,
  onOpen,
  onSave,
  onExport,
}: {
  projectMounted: boolean
  sceneTitle: string
  onOpen: () => void
  onSave: () => void
  onExport: () => void
}) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark"><Hammer size={17} /></span>
        <strong>PalForge</strong>
        <span className="version">ALPHA 0.6</span>
      </div>
      <div className="breadcrumb">
        <FolderOpen size={14} />
        <span>{projectMounted ? 'PAL 游戏目录' : '逍遥试作'}</span>
        <ChevronRight size={13} />
        <strong>{sceneTitle}</strong>
      </div>
      <div className="top-actions">
        <button className="toolbar-button" onClick={onOpen}><FolderOpen size={15} /> 打开游戏目录</button>
        <button className="icon-button" title="撤销"><Undo2 size={16} /></button>
        <button className="icon-button" title="导出工程" onClick={onExport}><Download size={16} /></button>
        <button className="primary-button" onClick={onSave}><Save size={15} /> 保存工程</button>
      </div>
    </header>
  )
}

function MapToolbar({
  tool,
  onTool,
  brush,
  onBrush,
  zoom,
  onZoom,
  showGrid,
  onGrid,
  realScene,
  palettes,
  paletteKey,
  onPalette,
}: {
  tool: Tool
  onTool: (tool: Tool) => void
  brush: TerrainKind
  onBrush: (brush: TerrainKind) => void
  zoom: number
  onZoom: (zoom: number) => void
  showGrid: boolean
  onGrid: () => void
  realScene: boolean
  palettes: PalPalette[]
  paletteKey: string
  onPalette: (key: string) => void
}) {
  return (
    <div className="map-toolbar">
      <div className="segmented tools">
        <button className={tool === 'select' ? 'active' : ''} onClick={() => onTool('select')} title="选择">
          <MousePointer2 size={15} />
        </button>
        <button disabled={realScene} className={tool === 'paint' ? 'active' : ''} onClick={() => onTool('paint')} title={realScene ? '原版资源只读' : '绘制地形'}>
          <SquareMousePointer size={15} />
        </button>
        <button className={tool === 'event' ? 'active' : ''} onClick={() => onTool('event')} title="事件对象">
          <CircleDot size={15} />
        </button>
      </div>
      {realScene ? (
        <div className="real-scene-controls">
          <span className="readonly-pill">原版场景 · 只读</span>
          <label>调色板
            <select value={paletteKey} onChange={(event) => onPalette(event.target.value)} disabled={palettes.length === 0}>
              {palettes.length === 0
                ? <option value="">灰度回退</option>
                : palettes.map((palette) => <option key={`${palette.index}:${palette.variant}`} value={`${palette.index}:${palette.variant}`}>PAT #{palette.index} · {palette.variant === 'night' ? '夜晚' : '白天'}</option>)}
            </select>
          </label>
        </div>
      ) : <div className="brushes">
        {(Object.keys(terrainLabels) as TerrainKind[]).map((terrain) => (
          <button
            key={terrain}
            className={`brush ${terrain} ${brush === terrain ? 'active' : ''}`}
            onClick={() => {
              onBrush(terrain)
              onTool('paint')
            }}
          >
            <i /> {terrainLabels[terrain]}
          </button>
        ))}
      </div>}
      <div className="zoom-controls">
        <button className="icon-button" onClick={() => onZoom(Math.max(realScene ? 0.25 : 0.65, zoom - 0.1))}><ZoomOut size={15} /></button>
        <span>{Math.round(zoom * 100)}%</span>
        <button className="icon-button" onClick={() => onZoom(Math.min(1.35, zoom + 0.1))}><ZoomIn size={15} /></button>
        <button className={`icon-button ${showGrid ? 'active' : ''}`} onClick={onGrid} title="网格"><Grid3X3 size={15} /></button>
      </div>
    </div>
  )
}

function Inspector({
  map,
  selectedTile,
  selectedEvent,
  onEventChange,
}: {
  map: SceneMap
  selectedTile: { x: number; y: number }
  selectedEvent?: MapEvent
  onEventChange: (event: MapEvent) => void
}) {
  const tile = map.tiles[selectedTile.y][selectedTile.x]
  return (
    <aside className="inspector panel">
      <div className="panel-heading compact">
        <div>
          <span className="eyebrow">INSPECTOR</span>
          <strong>{selectedEvent ? '事件对象' : '地图单元'}</strong>
        </div>
        <Settings2 size={15} />
      </div>
      {selectedEvent ? (
        <div className="inspector-content">
          <div className="object-card">
            <span className="object-avatar">{selectedEvent.icon === 'door' ? '门' : selectedEvent.icon === 'chest' ? '箱' : '人'}</span>
            <div><strong>{selectedEvent.name}</strong><small>{selectedEvent.id}</small></div>
          </div>
          <label className="field"><span>名称</span><input value={selectedEvent.name} onChange={(e) => onEventChange({ ...selectedEvent, name: e.target.value })} /></label>
          <div className="field-row">
            <label className="field"><span>X 坐标</span><input type="number" value={selectedEvent.x} readOnly /></label>
            <label className="field"><span>Y 坐标</span><input type="number" value={selectedEvent.y} readOnly /></label>
          </div>
          <label className="field"><span>触发方式</span><select value={selectedEvent.trigger} onChange={(e) => onEventChange({ ...selectedEvent, trigger: e.target.value as MapEvent['trigger'] })}><option value="interact">主动交互</option><option value="touch">接触触发</option><option value="auto">自动运行</option></select></label>
          <label className="field"><span>入口脚本</span><select value={selectedEvent.scriptId} onChange={(e) => onEventChange({ ...selectedEvent, scriptId: e.target.value })}>{demoScripts.map((script) => <option key={script.id} value={script.id}>{script.name}</option>)}</select></label>
          <button className="wide-button"><Code2 size={15} /> 在脚本编辑器中打开</button>
        </div>
      ) : (
        <div className="inspector-content">
          <div className="coordinate-card"><span>选中单元</span><strong>{selectedTile.x}, {selectedTile.y}</strong><small>场景 {map.id}</small></div>
          <label className="field"><span>地形</span><input value={terrainLabels[tile.terrain]} readOnly /></label>
          <label className="field switch-field"><span><b>阻挡通行</b><small>角色不可进入此单元</small></span><input type="checkbox" checked={tile.blocked} readOnly /></label>
          <label className="field"><span>高度层</span><input type="number" value={tile.elevation} readOnly /></label>
          <div className="meta-list"><span><small>资源来源</small><code>MAP.MKF / #001</code></span><span><small>修改状态</small><b className="changed">已修改</b></span></div>
        </div>
      )}
    </aside>
  )
}

function PalSceneInspector({
  scene,
  selectedTile,
  selectedEvent,
  onOpenScript,
  onDebugScript,
  debugActive,
}: {
  scene: LoadedPalScene
  selectedTile: PalTileSelection
  selectedEvent?: LoadedPalEvent
  onOpenScript: (entry: number) => void
  onDebugScript: (entry: number, eventObjectId: number, mode: SceneDebugMode) => void
  debugActive: boolean
}) {
  const tile = scene.map.tiles[selectedTile.y][selectedTile.x][selectedTile.half]
  const triggerLabel = (mode: number) => {
    if (mode === 0) return '无触发'
    if (mode >= 3) return `接近触发 (${mode})`
    return mode === 2 ? '主动交互' : `模式 ${mode}`
  }

  return (
    <aside className="inspector panel">
      <div className="panel-heading compact">
        <div><span className="eyebrow">{debugActive ? 'INSPECTOR · DEBUG SNAPSHOT' : 'INSPECTOR · REAL DATA'}</span><strong>{selectedEvent ? '事件对象' : '地图单元'}</strong></div>
        <Settings2 size={15} />
      </div>
      {selectedEvent ? (
        <div className="inspector-content">
          <div className="object-card">
            <span className="object-avatar">{selectedEvent.frames.length > 0 ? '人' : '点'}</span>
            <div><strong>事件 #{selectedEvent.object.index + 1}</strong><small>MGO.MKF / #{selectedEvent.object.spriteNumber}</small></div>
          </div>
          <div className="field-row">
            <label className="field"><span>X 坐标</span><input value={selectedEvent.object.x} readOnly /></label>
            <label className="field"><span>Y 坐标</span><input value={selectedEvent.object.y} readOnly /></label>
          </div>
          <label className="field"><span>状态 / 层级</span><input value={`${selectedEvent.object.state} / ${selectedEvent.object.layer}`} readOnly /></label>
          <label className="field"><span>触发方式</span><input value={triggerLabel(selectedEvent.object.triggerMode)} readOnly /></label>
          <label className="field"><span>触发脚本</span><input value={formatPalEntry(selectedEvent.object.triggerScript)} readOnly /></label>
          <label className="field"><span>自动脚本</span><input value={formatPalEntry(selectedEvent.object.autoScript)} readOnly /></label>
          <div className="field-row">
            <label className="field"><span>方向</span><input value={selectedEvent.object.direction} readOnly /></label>
            <label className="field"><span>当前帧</span><input value={`${selectedEvent.object.currentFrame} / ${selectedEvent.frames.length}`} readOnly /></label>
          </div>
          <div className="script-entry-actions">
            <button className="wide-button" disabled={selectedEvent.object.triggerScript === 0} onClick={() => onOpenScript(selectedEvent.object.triggerScript)}><Code2 size={14} /> 打开触发脚本</button>
            <button className="wide-button" disabled={selectedEvent.object.autoScript === 0} onClick={() => onOpenScript(selectedEvent.object.autoScript)}><Code2 size={14} /> 打开自动脚本</button>
          </div>
          <div className="debug-entry-actions">
            <button className="wide-button debug-button" disabled={selectedEvent.object.triggerScript === 0} onClick={() => onDebugScript(selectedEvent.object.triggerScript, selectedEvent.object.index + 1, 'event-trigger')}><BugPlay size={14} /> 在场景中调试触发脚本</button>
            <button className="wide-button debug-button" disabled={selectedEvent.object.autoScript === 0} onClick={() => onDebugScript(selectedEvent.object.autoScript, selectedEvent.object.index + 1, 'event-auto')}><BugPlay size={14} /> 调试自动脚本</button>
          </div>
          {selectedEvent.error && <div className="scene-warning"><AlertTriangle size={14} />{selectedEvent.error}</div>}
        </div>
      ) : (
        <div className="inspector-content">
          <div className="coordinate-card"><span>选中单元</span><strong>{selectedTile.x}, {selectedTile.y}</strong><small>半格 {selectedTile.half} · 场景 #{scene.record.number}</small></div>
          <label className="field"><span>原始 DWORD</span><input value={`0x${tile.raw.toString(16).padStart(8, '0')}`} readOnly /></label>
          <div className="field-row">
            <label className="field"><span>底层帧</span><input value={tile.bottomFrame} readOnly /></label>
            <label className="field"><span>顶层帧</span><input value={tile.topFrame ?? '无'} readOnly /></label>
          </div>
          <label className="field switch-field"><span><b>阻挡通行</b><small>MAP 位标记 0x2000</small></span><input type="checkbox" checked={tile.blocked} readOnly /></label>
          <label className="field"><span>底层 / 顶层高度</span><input value={`${tile.bottomHeight} / ${tile.topHeight}`} readOnly /></label>
          <div className="meta-list">
            <span><small>资源来源</small><code>MAP/GOP.MKF / #{scene.record.mapNumber}</code></span>
            <span><small>修改状态</small><b className="readonly-status">只读</b></span>
          </div>
          <div className="script-entry-actions">
            <button className="wide-button" disabled={scene.record.scriptOnEnter === 0} onClick={() => onOpenScript(scene.record.scriptOnEnter)}><Code2 size={14} /> 场景进入 {formatPalEntry(scene.record.scriptOnEnter)}</button>
            <button className="wide-button" disabled={scene.record.scriptOnTeleport === 0} onClick={() => onOpenScript(scene.record.scriptOnTeleport)}><Code2 size={14} /> 场景传送 {formatPalEntry(scene.record.scriptOnTeleport)}</button>
          </div>
          <div className="debug-entry-actions">
            <button className="wide-button debug-button" disabled={scene.record.scriptOnEnter === 0} onClick={() => onDebugScript(scene.record.scriptOnEnter, 0, 'scene-enter')}><BugPlay size={14} /> 调试场景进入脚本</button>
            <button className="wide-button debug-button" disabled={scene.record.scriptOnTeleport === 0} onClick={() => onDebugScript(scene.record.scriptOnTeleport, 0, 'scene-teleport')}><BugPlay size={14} /> 调试传送脚本</button>
          </div>
        </div>
      )}
    </aside>
  )
}

function ScriptEditor({ script }: { script: Script }) {
  const [commands, setCommands] = useState(script.commands)
  useEffect(() => setCommands(script.commands), [script])
  return (
    <div className="workspace-view script-view">
      <div className="view-titlebar">
        <div><span className="view-icon violet"><Braces size={18} /></span><div><strong>{script.name}</strong><small>{script.entry} · {commands.length} 条指令</small></div></div>
        <div><button className="toolbar-button"><TerminalSquare size={15} /> 原始指令</button><button className="primary-button" onClick={() => setCommands([...commands, { id: `cmd-${Date.now()}`, opcode: '0xFFFF', label: '显示对话', detail: '双击编辑新对话…', color: 'dialogue' }])}><PackagePlus size={15} /> 添加指令</button></div>
      </div>
      <div className="script-layout">
        <div className="script-flow">
          <div className="flow-start"><Play size={13} fill="currentColor" /> 入口</div>
          {commands.map((command, index) => (
            <div className={`command-card ${command.color}`} key={command.id}>
              <div className="command-index">{String(index + 1).padStart(2, '0')}</div>
              <div className="command-main"><span><b>{command.label}</b><code>{command.opcode}</code></span><p>{command.detail}</p></div>
              <button className="icon-button"><Settings2 size={14} /></button>
            </div>
          ))}
          <button className="flow-add" onClick={() => setCommands([...commands, { id: `cmd-${Date.now()}`, opcode: '0xFFFF', label: '显示对话', detail: '双击编辑新对话…', color: 'dialogue' }])}>＋</button>
        </div>
        <aside className="opcode-panel"><span className="eyebrow">COMPILED PREVIEW</span><pre>{commands.map((command, index) => `${String(index).padStart(4, '0')}  ${command.opcode}  ${command.detail}`).join('\n')}</pre><div className="compile-status"><span className="status-light" /> 指令结构有效</div></aside>
      </div>
    </div>
  )
}

const scriptCategoryClass = (entry: PalScriptEntry) => {
  const category = getPalOpcodeDefinition(entry.operation).category
  if (category === 'battle') return 'battle'
  if (category === 'flow' || category === 'inventory') return 'condition'
  if (category === 'motion' || category === 'scene' || category === 'audio') return 'motion'
  return category === 'unknown' ? 'unknown' : 'dialogue'
}

function RealScriptEditor({
  entries,
  startEntry,
  references,
  messages,
  messageEncoding,
  messageError,
  draft,
  compiledDraft,
  onEntry,
  onCreateDraft,
  onDraftChange,
  onDiscardDraft,
  canUndo,
  onUndo,
  sourceMismatch,
  debugEntry,
  breakpoints,
  onToggleBreakpoint,
}: {
  entries: PalScriptEntry[]
  startEntry: number
  references: PalScriptReference[]
  messages: string[]
  messageEncoding: PalSceneCatalog['messageEncoding']
  messageError?: string
  draft?: ForgeScriptDraft
  compiledDraft?: CompiledForgeScript
  onEntry: (entry: number) => void
  onCreateDraft: () => void
  onDraftChange: (draft: ForgeScriptDraft) => void
  onDiscardDraft: () => void
  canUndo: boolean
  onUndo: () => void
  sourceMismatch: boolean
  debugEntry: number | null
  breakpoints: number[]
  onToggleBreakpoint: (entry: number) => void
}) {
  const [entryInput, setEntryInput] = useState(formatPalWord(startEntry))
  const [selectedCommandId, setSelectedCommandId] = useState<string | null>(null)
  useEffect(() => setEntryInput(formatPalWord(startEntry)), [startEntry])
  useEffect(() => {
    setSelectedCommandId((current) => draft?.commands.some((command) => command.id === current) ? current : draft?.commands[0]?.id ?? null)
  }, [draft, startEntry])
  const trace = useMemo(() => tracePalScript(entries, startEntry), [entries, startEntry])
  const origin = references.find((reference) => reference.entry === startEntry)
  const unknownCount = trace.entries.filter((entry) => getPalOpcodeDefinition(entry.operation).category === 'unknown').length
  const jumpCount = trace.entries.reduce((count, entry) => count + getPalScriptTargets(entry).filter((item) => item.entry > 0).length, 0)
  const selectedCommand = draft?.commands.find((command) => command.id === selectedCommandId)
  const selectedDefinition = selectedCommand ? getPalOpcodeDefinition(selectedCommand.operation) : undefined
  const compiledById = compiledDraft?.addressByCommandId ?? {}
  const compiledEntryByAddress = new globalThis.Map(compiledDraft?.entries.map((entry) => [entry.index, entry]) ?? [])
  const selectedCompiledEntry = selectedCommand ? compiledEntryByAddress.get(compiledById[selectedCommand.id]) : undefined
  const opcodeDefinitions = useMemo(() => listPalOpcodeDefinitions(), [])

  const submitEntry = () => {
    const parsed = parsePalEntryInput(entryInput)
    if (parsed !== null) onEntry(parsed)
  }

  const changeOperand = (operand: 0 | 1 | 2, value: number) => {
    if (!draft || !selectedCommand || !Number.isFinite(value)) return
    const operands = [...selectedCommand.operands] as [number, number, number]
    operands[operand] = Math.max(0, Math.min(0xffff, Math.trunc(value)))
    onDraftChange(updateForgeScriptCommand(draft, selectedCommand.id, { operands }))
  }

  return (
    <div className="workspace-view script-view real-script-view">
      <div className="view-titlebar">
        <div>
          <span className="view-icon violet"><Braces size={18} /></span>
          <div>
            <strong>事件脚本 {formatPalEntry(startEntry)}</strong>
            <small>{origin ? origin.sources.map((source) => source.label).join(' · ') : '手动地址'} · {draft ? `${draft.commands.length} 条工程指令` : `${trace.entries.length} 条可达指令`}</small>
          </div>
        </div>
        <div className="script-entry-picker">
          <span className={draft ? 'forge-edit-pill' : 'readonly-pill'}>{draft ? 'FORGE 工程覆盖' : 'SSS.MKF #4 · 只读'}</span>
          <label>入口
            <input value={entryInput} onChange={(event) => setEntryInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') submitEntry() }} aria-label="脚本入口地址" />
          </label>
          <button className="toolbar-button" onClick={submitEntry}><Search size={14} /> 定位</button>
          {draft
            ? <><button className="toolbar-button" disabled={!canUndo} onClick={onUndo}><Undo2 size={14} /> 撤销一步</button><button className="toolbar-button danger-button" onClick={onDiscardDraft}><Trash2 size={14} /> 放弃覆盖</button></>
            : <button className="primary-button" disabled={trace.entries.length === 0} onClick={onCreateDraft}><CopyPlus size={14} /> 克隆到工程</button>}
        </div>
      </div>
      <div className="script-layout">
        <div className="script-flow">
          <div className="flow-start"><Play size={13} fill="currentColor" /> {draft ? `编译入口 ${formatPalEntry(compiledDraft?.compiledEntry ?? entries.length)}` : `入口 ${formatPalEntry(startEntry)}`}</div>
          {draft && sourceMismatch && <div className="source-mismatch-warning"><AlertTriangle size={14} /><span><strong>基础脚本不匹配</strong>这个工程覆盖来自另一份或另一版本的 SSS.MKF；请核对后重新克隆，避免把修改应用到错误资源。</span></div>}
          {!draft && trace.entries.length === 0 ? (
            <div className="script-empty-state"><AlertTriangle size={24} /><strong>脚本入口无效</strong><p>{trace.issues[0] ?? 'SSS.MKF #4 中没有这个地址。'}</p></div>
          ) : draft ? draft.commands.map((command, index) => {
            const definition = getPalOpcodeDefinition(command.operation)
            const compiledAddress = compiledById[command.id]
            const compiledEntry = compiledEntryByAddress.get(compiledAddress)
            return (
              <div className={`command-card editable ${scriptCategoryClass({ index: compiledAddress ?? 0, operation: command.operation, operands: command.operands })} ${selectedCommandId === command.id ? 'selected' : ''} ${compiledAddress === debugEntry ? 'debug-current' : ''}`} key={command.id} onClick={() => setSelectedCommandId(command.id)}>
                <div className="command-index">
                  <button className={`breakpoint-button ${compiledAddress !== undefined && breakpoints.includes(compiledAddress) ? 'active' : ''}`} disabled={compiledAddress === undefined} title="切换断点" onClick={(event) => { event.stopPropagation(); if (compiledAddress !== undefined) onToggleBreakpoint(compiledAddress) }} />
                  <b>{compiledAddress === undefined ? '—' : formatPalEntry(compiledAddress)}</b>
                  <small>{command.sourceIndex === null ? 'NEW' : `原 ${formatPalEntry(command.sourceIndex)}`}</small>
                </div>
                <div className="command-main">
                  <span><b>{definition.label}</b><code>{formatPalWord(command.operation)}</code><i>{definition.category}</i></span>
                  <p className={command.message ? 'dialogue-preview' : ''}>{command.message?.text || definition.description}</p>
                  <div className="operand-row">
                    {(compiledEntry?.operands ?? command.operands).map((operand, operandIndex) => <code key={operandIndex}>P{operandIndex} {formatPalWord(operand)}</code>)}
                  </div>
                  {command.targetLinks.length > 0 && <div className="script-target-row">{command.targetLinks.map((link) => (
                    <button key={link.operand} onClick={(event) => { event.stopPropagation(); setSelectedCommandId(link.commandId) }}>
                      P{link.operand} → {compiledById[link.commandId] === undefined ? '已删除' : formatPalEntry(compiledById[link.commandId])}
                    </button>
                  ))}</div>}
                </div>
                <div className="command-actions">
                  <button className="icon-button" disabled={index === 0} title="上移" onClick={(event) => { event.stopPropagation(); onDraftChange(moveForgeScriptCommand(draft, command.id, -1)) }}><ArrowUp size={13} /></button>
                  <button className="icon-button" disabled={index === draft.commands.length - 1} title="下移" onClick={(event) => { event.stopPropagation(); onDraftChange(moveForgeScriptCommand(draft, command.id, 1)) }}><ArrowDown size={13} /></button>
                  <button className="icon-button danger-icon" title="删除" onClick={(event) => { event.stopPropagation(); onDraftChange(removeForgeScriptCommand(draft, command.id)) }}><Trash2 size={13} /></button>
                </div>
              </div>
            )
          }) : trace.entries.map((entry) => {
            const definition = getPalOpcodeDefinition(entry.operation)
            const targets = getPalScriptTargets(entry)
            const message = entry.operation === 0xffff ? messages[entry.operands[0]] : undefined
            return (
              <div className={`command-card ${scriptCategoryClass(entry)} ${entry.index === debugEntry ? 'debug-current' : ''}`} key={entry.index}>
                <div className="command-index"><button className={`breakpoint-button ${breakpoints.includes(entry.index) ? 'active' : ''}`} title="切换断点" onClick={() => onToggleBreakpoint(entry.index)} />{formatPalEntry(entry.index)}</div>
                <div className="command-main">
                  <span><b>{definition.label}</b><code>{formatPalWord(entry.operation)}</code><i>{definition.category}</i></span>
                  <p className={message ? 'dialogue-preview' : ''}>{message || definition.description}</p>
                  <div className="operand-row">
                    {entry.operands.map((operand, index) => <code key={index}>P{index} {formatPalWord(operand)}</code>)}
                  </div>
                  {targets.length > 0 && <div className="script-target-row">
                    {targets.map((destination) => (
                      <button
                        key={`${destination.operand}:${destination.kind}`}
                        disabled={destination.entry === 0 || destination.entry >= entries.length}
                        onClick={() => onEntry(destination.entry)}
                        title={`操作数 ${destination.operand}`}
                      >
                        {destination.label} → {destination.entry === 0 ? 'NULL' : formatPalEntry(destination.entry)}
                      </button>
                    ))}
                  </div>}
                </div>
                <button className="icon-button" title={`从 ${formatPalEntry(entry.index)} 作为入口查看`} onClick={() => onEntry(entry.index)}><ChevronRight size={14} /></button>
              </div>
            )
          })}
          {draft && <button className="flow-add labeled" onClick={() => {
            const updated = insertForgeScriptCommand(draft, selectedCommandId)
            onDraftChange(updated)
            const currentIndex = updated.commands.findIndex((command) => command.id === selectedCommandId)
            setSelectedCommandId(updated.commands[currentIndex + 1]?.id ?? updated.commands.at(-1)?.id ?? null)
          }}><PackagePlus size={13} /> 在选中指令后添加</button>}
        </div>
        {draft ? (
          <aside className="opcode-panel script-property-panel">
            <span className="eyebrow">COMMAND INSPECTOR</span>
            {selectedCommand && selectedDefinition ? <>
              <div className="selected-command-meta"><strong>{selectedCommand.id}</strong><code>{selectedCommand.sourceIndex === null ? '工程新增' : `来源 ${formatPalEntry(selectedCommand.sourceIndex)}`}</code></div>
              <label className="field"><span>指令 / opcode</span><select value={selectedCommand.operation} onChange={(event) => onDraftChange(updateForgeScriptCommand(draft, selectedCommand.id, { operation: Number(event.target.value) }))}>
                {getPalOpcodeDefinition(selectedCommand.operation).category === 'unknown' && <option value={selectedCommand.operation}>{formatPalWord(selectedCommand.operation)} · 未识别</option>}
                {opcodeDefinitions.map((definition) => <option key={definition.operation} value={definition.operation}>{formatPalWord(definition.operation)} · {definition.label}</option>)}
              </select></label>
              <label className="field"><span>自定义 opcode 数值</span><input type="number" min="0" max="65535" value={selectedCommand.operation} onChange={(event) => {
                const operation = Math.max(0, Math.min(0xffff, Math.trunc(Number(event.target.value))))
                if (Number.isFinite(operation)) onDraftChange(updateForgeScriptCommand(draft, selectedCommand.id, { operation }))
              }} /></label>
              <div className="property-operands">{([0, 1, 2] as const).map((operand) => {
                const targetDefinition = getTargetDefinition(selectedCommand.operation, operand)
                const link = selectedCommand.targetLinks.find((item) => item.operand === operand)
                return <div className="operand-editor" key={operand}>
                  <label className="field"><span>P{operand}{targetDefinition ? ` · ${targetDefinition.label}` : ''}</span><input type="number" min="0" max="65535" value={selectedCommand.operands[operand]} onChange={(event) => changeOperand(operand, Number(event.target.value))} /></label>
                  {targetDefinition && <label className="field target-field"><span>符号目标</span><select value={link?.commandId ?? ''} onChange={(event) => onDraftChange(setForgeScriptTarget(draft, selectedCommand.id, operand, event.target.value || null))}>
                    <option value="">外部地址 / 原始数值</option>
                    {draft.commands.map((command) => <option key={command.id} value={command.id}>{compiledById[command.id] === undefined ? '—' : formatPalEntry(compiledById[command.id])} · {getPalOpcodeDefinition(command.operation).label}</option>)}
                  </select></label>}
                </div>
              })}</div>
              {selectedCommand.operation === 0xffff && <label className="field dialogue-editor"><span>对白文本 · 工程覆盖</span><textarea value={selectedCommand.message?.text ?? ''} onChange={(event) => onDraftChange(updateForgeScriptMessage(draft, selectedCommand.id, event.target.value))} placeholder="输入新的对白文本…" /></label>}
              <div className="compiled-command"><span className="eyebrow">COMPILED COMMAND</span><pre>{selectedCompiledEntry ? `${formatPalEntry(selectedCompiledEntry.index)}  ${formatPalWord(selectedCompiledEntry.operation)}\n${selectedCompiledEntry.operands.map((operand, index) => `P${index}  ${formatPalWord(operand)}`).join('\n')}` : '等待编译地址'}</pre></div>
            </> : <div className="script-empty-state compact"><strong>选择一条指令</strong></div>}
            {compiledDraft && compiledDraft.issues.length > 0 && <div className="script-issues">{compiledDraft.issues.map((issue, index) => <span key={`${issue.code}:${index}`}><AlertTriangle size={12} />{issue.message}</span>)}</div>}
            <div className={`compile-status ${compiledDraft?.issues.some((issue) => issue.level === 'error') ? 'warning' : ''}`}><span className="status-light" /> 追加式编译 · 原 SSS.MKF 未修改</div>
          </aside>
        ) : (
          <aside className="opcode-panel">
            <span className="eyebrow">RAW SCRIPT ENTRIES</span>
            <pre>{trace.entries.map((entry) => `${formatPalEntry(entry.index)}  ${formatPalWord(entry.operation)}  ${entry.operands.map(formatPalWord).join('  ')}`).join('\n')}</pre>
            {messageEncoding && <div className="message-status">M.MSG · {messageEncoding.toUpperCase()} · {messages.length} 条文本</div>}
            {!messageEncoding && !messageError && <div className="message-status">M.MSG 未挂载 · 文本指令仅显示消息编号</div>}
            {messageError && <div className="script-issues"><span><AlertTriangle size={12} />M.MSG：{messageError}</span></div>}
            {trace.issues.length > 0 && <div className="script-issues">{trace.issues.map((issue) => <span key={issue}><AlertTriangle size={12} />{issue}</span>)}</div>}
            <div className={`compile-status ${unknownCount > 0 || trace.issues.length > 0 ? 'warning' : ''}`}>
              <span className="status-light" /> {jumpCount} 个显式引用 · {unknownCount} 个未知 opcode · 未执行
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}

function ModulesView({ modules, onToggle }: { modules: ForgeModule[]; onToggle: (id: string) => void }) {
  return (
    <div className="workspace-view modules-view">
      <div className="view-titlebar"><div><span className="view-icon amber"><Blocks size={18} /></span><div><strong>玩法模块</strong><small>给原版没有的系统一个正式入口</small></div></div><button className="primary-button"><PlugZap size={15} /> 安装本地模块</button></div>
      <div className="module-grid">
        {modules.map((module) => (
          <article className={`module-card ${module.enabled ? 'enabled' : ''}`} key={module.id}>
            <div className="module-card-top"><span className={`module-icon ${module.kind}`}>{module.kind === 'bridge' ? <PlugZap /> : module.kind === 'minigame' ? <Gamepad2 /> : <BugPlay />}</span><label className="toggle"><input type="checkbox" checked={module.enabled} onChange={() => onToggle(module.id)} /><i /></label></div>
            <span className="module-kind">{module.kind === 'minigame' ? 'MINIGAME' : module.kind.toUpperCase()}</span>
            <h3>{module.name}</h3><p>{module.description}</p>
            <footer><code>{module.id}</code><span>v{module.version}</span></footer>
          </article>
        ))}
        <button className="new-module-card"><PackagePlus size={24} /><strong>新建模块</strong><span>从 TypeScript 模板开始</span></button>
      </div>
      <div className="api-note"><Code2 size={17} /><div><strong>稳定扩展点，而不是魔改主程序</strong><p>模块通过 manifest 注册资源、事件、存档字段和测试入口；编辑器与 SDLPAL runner 只依赖公共协议。</p></div></div>
    </div>
  )
}

function SceneDebugBench({
  open,
  onOpen,
  runtime,
  targets,
  targetId,
  onTarget,
  session,
  running,
  breakpoints,
  spawn,
  onStart,
  onStep,
  onRun,
  onPause,
  onReset,
  onDecision,
  onOpenCurrent,
  onOpenTargetScene,
  onRunReal,
}: {
  open: boolean
  onOpen: () => void
  runtime: SceneDebugRuntime
  targets: SceneDebugTarget[]
  targetId: string
  onTarget: (id: string) => void
  session: SceneDebugSession | null
  running: boolean
  breakpoints: number[]
  spawn: PalTileSelection
  onStart: () => void
  onStep: () => void
  onRun: () => void
  onPause: () => void
  onReset: () => void
  onDecision: (optionId: string) => void
  onOpenCurrent: () => void
  onOpenTargetScene: () => void
  onRunReal: () => void
}) {
  const current = session ? runtime.entries[session.currentEntry] : undefined
  const definition = current ? getPalOpcodeDefinition(current.operation) : undefined
  const statusLabel = running ? 'RUNNING' : session?.status.toUpperCase() ?? 'IDLE'
  return (
    <section className={`scene-debug-bench ${open ? 'open' : ''}`}>
      <button className="test-handle" onClick={onOpen}>
        <span><BugPlay size={16} /><strong>场景脚本调试器</strong><i className="ready-pill">READ-ONLY SANDBOX</i></span>
        <span>{session ? `${formatPalEntry(session.currentEntry)} · ${session.stopReason}` : '选择当前场景入口或事件脚本'} {open ? <PanelBottomClose size={16} /> : <PanelBottomOpen size={16} />}</span>
      </button>
      {open && <div className="scene-debug-content">
        <div className="debug-setup-panel">
          <span className="eyebrow">SCENE CONTEXT</span>
          <label className="field"><span>调试目标</span><select value={targetId} onChange={(event) => onTarget(event.target.value)}>
            {targets.map((target) => <option key={target.id} value={target.id}>{target.label} · {formatPalEntry(target.entry)}</option>)}
          </select></label>
          <div className="debug-context-grid">
            <span><small>队伍起点</small><b>{spawn.x}, {spawn.y}, H{spawn.half}</b></span>
            <span><small>断点</small><b>{breakpoints.length}</b></span>
            <span><small>覆盖层</small><b>{session && session.currentEntry !== session.sourceEntry ? '工程/重定向' : '原始入口'}</b></span>
          </div>
          <div className="debug-launch-actions">
            <button className="primary-button debug-start" disabled={targets.length === 0} onClick={onStart}><BugPlay size={14} /> 建立脚本推演沙盒</button>
            <button className="primary-button sdlpal-run-button" disabled={targets.length === 0} onClick={onRunReal}><Gamepad2 size={14} /> 用 SDLPAL 实机运行</button>
          </div>
          <p>从当前图块生成队伍位置，复制本场景事件状态；所有变化仅存在于这次调试会话。</p>
        </div>
        <div className="debug-execution-panel">
          <div className="debug-panel-title"><span className="eyebrow">EXECUTION</span><i className={`debug-status ${session?.status ?? 'idle'} ${running ? 'running' : ''}`}>{statusLabel}</i></div>
          {session ? <>
            <div className="debug-current-command">
              <span><b>{formatPalEntry(session.currentEntry)}</b><code>{current ? formatPalWord(current.operation) : 'OUT OF RANGE'}</code></span>
              <strong>{definition?.label ?? session.stopReason}</strong>
              <small>{current?.operands.map((operand, index) => `P${index} ${formatPalWord(operand)}`).join(' · ')}</small>
            </div>
            <div className="debug-transport">
              <button className="icon-button" title="重置" onClick={onReset}><RotateCcw size={14} /></button>
              <button className="toolbar-button" disabled={session.status !== 'paused' || running} onClick={onStep}><StepForward size={14} /> 单步</button>
              {!running
                ? <button className="primary-button" disabled={session.status !== 'paused'} onClick={onRun}><Play size={14} fill="currentColor" /> 继续</button>
                : <button className="toolbar-button pause-button" onClick={onPause}><Pause size={14} fill="currentColor" /> 暂停</button>}
              <button className="toolbar-button" onClick={onOpenCurrent}><Code2 size={14} /> 定位脚本</button>
            </div>
            {session.pendingDecision && <div className="debug-decision">
              <strong>{session.pendingDecision.prompt}</strong>
              <div>{session.pendingDecision.options.map((option) => <button key={option.id} onClick={() => onDecision(option.id)}>{option.label}</button>)}</div>
            </div>}
            {session.nextSceneNumber && <button className="wide-button debug-button" onClick={onOpenTargetScene}>打开脚本请求的场景 #{session.nextSceneNumber}</button>}
            <div className="debug-state-strip">
              <span>步骤 <b>{session.steps}</b></span><span>调用栈 <b>{session.callStack.length}</b></span><span>事件 <b>#{session.eventObjectId || 'SCENE'}</b></span><span>调色板 <b>{session.palette.number}/{session.palette.night ? '夜' : '日'}</b></span><span>状态 <b>{session.scriptSuccess ? '成功' : '失败'}</b></span>
            </div>
          </> : <div className="debug-empty"><BugPlay size={22} /><strong>尚未建立会话</strong><span>选择入口后点击“建立场景沙盒”。</span></div>}
        </div>
        <div className="debug-console-panel">
          <div className="console-title"><TerminalSquare size={14} /> DEBUG TRACE <span>{session ? `${session.logs.length} LOGS` : 'IDLE'}</span></div>
          <pre>{session?.logs.length ? session.logs.map((log) => `${log.step.toString().padStart(4, '0')} ${formatPalEntry(log.entry)} ${log.level.toUpperCase().padEnd(7)} ${log.message}`).join('\n') : '› 沙盒不会写入 SSS.MKF、M.MSG 或存档。\n› 未模拟的 opcode 会暂停并要求明确处理。'}</pre>
        </div>
      </div>}
    </section>
  )
}

function TestBench({
  open,
  onOpen,
  settings,
  onSettings,
  events,
  onRun,
  snapshot,
}: {
  open: boolean
  onOpen: () => void
  settings: TestSettings
  onSettings: (settings: TestSettings) => void
  events: MapEvent[]
  onRun: () => void
  snapshot: TestSnapshot | null
}) {
  return (
    <section className={`test-bench ${open ? 'open' : ''}`}>
      <button className="test-handle" onClick={onOpen}>
        <span><BugPlay size={16} /><strong>即时测试台</strong><i className="ready-pill">SANDBOX READY</i></span>
        <span>{snapshot ? `快照 ${snapshot.id}` : '从任意场景、坐标或事件开始'} {open ? <PanelBottomClose size={16} /> : <PanelBottomOpen size={16} />}</span>
      </button>
      {open && (
        <div className="test-content">
          <div className="test-settings">
            <label className="field"><span>启动场景</span><select value={settings.scene} onChange={(e) => onSettings({ ...settings, scene: e.target.value })}><option>十里坡 · 原型场景</option><option>山神庙</option><option>余杭镇</option></select></label>
            <div className="field-row compact-row"><label className="field"><span>出生 X</span><input type="number" value={settings.spawnX} onChange={(e) => onSettings({ ...settings, spawnX: Number(e.target.value) })} /></label><label className="field"><span>出生 Y</span><input type="number" value={settings.spawnY} onChange={(e) => onSettings({ ...settings, spawnY: Number(e.target.value) })} /></label><label className="field"><span>队伍等级</span><input type="number" value={settings.partyLevel} onChange={(e) => onSettings({ ...settings, partyLevel: Number(e.target.value) })} /></label></div>
            <label className="field"><span>跳转事件</span><select value={settings.eventId} onChange={(e) => onSettings({ ...settings, eventId: e.target.value })}><option value="">从场景入口开始</option>{events.map((event) => <option key={event.id} value={event.id}>{event.name} · {event.id}</option>)}</select></label>
            <label className="field"><span>剧情标记</span><input value={settings.flags.join(', ')} onChange={(e) => onSettings({ ...settings, flags: e.target.value.split(',').map((item) => item.trim()).filter(Boolean) })} placeholder="met_ling_er, opened_temple" /></label>
            <button className="run-button" onClick={onRun}><Play size={16} fill="currentColor" /> 建立快照并运行</button>
          </div>
          <div className="test-console"><div className="console-title"><TerminalSquare size={14} /> RUNNER OUTPUT <span>{snapshot ? 'SNAPSHOT BUILT' : 'IDLE'}</span></div><pre>{snapshot ? snapshot.log.map((line, index) => `${index === snapshot.log.length - 1 ? '›' : '✓'} ${line}`).join('\n') : '› 选择场景与事件，然后建立独立测试快照。\n› 不需要从头推进游戏流程。'}</pre></div>
        </div>
      )}
    </section>
  )
}

function loadStoredScriptDrafts(): ForgeScriptDraft[] {
  try {
    const stored = globalThis.localStorage?.getItem('palforge.project')
    if (!stored) return []
    return parseForgeScriptDrafts(JSON.parse(stored).scriptDrafts)
  } catch {
    return []
  }
}

export default function App() {
  const [view, setView] = useState<View>('map')
  const [map, setMap] = useState<SceneMap>(() => structuredClone(demoMap))
  const [archives, setArchives] = useState<PalArchiveSet>(() => new globalThis.Map())
  const [sceneCatalog, setSceneCatalog] = useState<PalSceneCatalog | null>(null)
  const [loadedScene, setLoadedScene] = useState<LoadedPalScene | null>(null)
  const [selectedSceneNumber, setSelectedSceneNumber] = useState<number | null>(null)
  const [sceneLoading, setSceneLoading] = useState(false)
  const [sceneError, setSceneError] = useState('')
  const [realSelectedTile, setRealSelectedTile] = useState<PalTileSelection>({ x: 0, y: 0, half: 0 })
  const [realSelectedEventIndex, setRealSelectedEventIndex] = useState<number | null>(null)
  const [tool, setTool] = useState<Tool>('select')
  const [brush, setBrush] = useState<TerrainKind>('grass')
  const [selectedTile, setSelectedTile] = useState({ x: 7, y: 4 })
  const [selectedEventId, setSelectedEventId] = useState('event-01')
  const [selectedScriptId, setSelectedScriptId] = useState('script-0042')
  const [selectedRealScriptEntry, setSelectedRealScriptEntry] = useState<number | null>(null)
  const [scriptDrafts, setScriptDrafts] = useState<ForgeScriptDraft[]>(loadStoredScriptDrafts)
  const [scriptDraftHistory, setScriptDraftHistory] = useState<Record<string, ForgeScriptDraft[]>>({})
  const [zoom, setZoom] = useState(0.85)
  const [showGrid, setShowGrid] = useState(true)
  const [resources, setResources] = useState<ImportedResource[]>([])
  const [palettes, setPalettes] = useState<PalPalette[]>([])
  const [mapPaletteKey, setMapPaletteKey] = useState('')
  const [selectedResourcePath, setSelectedResourcePath] = useState('')
  const [gameProfile, setGameProfile] = useState<GameProfile>('auto')
  const [modules, setModules] = useState<ForgeModule[]>(demoModules)
  const [projectMounted, setProjectMounted] = useState(false)
  const [testOpen, setTestOpen] = useState(true)
  const [snapshot, setSnapshot] = useState<TestSnapshot | null>(null)
  const [sceneDebugOpen, setSceneDebugOpen] = useState(false)
  const [sceneDebugTargetId, setSceneDebugTargetId] = useState('')
  const [sceneDebugSession, setSceneDebugSession] = useState<SceneDebugSession | null>(null)
  const [sceneDebugRunning, setSceneDebugRunning] = useState(false)
  const [sceneDebugBreakpoints, setSceneDebugBreakpoints] = useState<number[]>([])
  const [sdlpalLaunchTarget, setSdlpalLaunchTarget] = useState<SdlpalLaunchTarget | null>(null)
  const [toast, setToast] = useState('')
  const [testSettings, setTestSettings] = useState<TestSettings>({ scene: demoMap.name, spawnX: 7, spawnY: 4, partyLevel: 8, eventId: 'event-01', flags: ['met_ling_er'] })
  const gameInputRef = useRef<HTMLInputElement>(null)
  const assetInputRef = useRef<HTMLInputElement>(null)
  const sceneLoadTokenRef = useRef(0)
  const debugSkipBreakpointOnceRef = useRef(false)

  useEffect(() => gameInputRef.current?.setAttribute('webkitdirectory', ''), [])
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 2400)
    return () => window.clearTimeout(timer)
  }, [toast])

  const selectedEvent = map.events.find((event) => event.id === selectedEventId)
  const selectedPalEventSource = loadedScene?.events.find((event) => event.object.index === realSelectedEventIndex)
  const selectedPalEvent = selectedPalEventSource && sceneDebugSession?.events[String(selectedPalEventSource.object.index + 1)]
    ? { ...selectedPalEventSource, object: sceneDebugSession.events[String(selectedPalEventSource.object.index + 1)] }
    : selectedPalEventSource
  const selectedScript = useMemo(() => demoScripts.find((script) => script.id === selectedScriptId) ?? demoScripts[0], [selectedScriptId])
  const realScriptReferences = useMemo(
    () => loadedScene ? collectSceneScriptReferences(loadedScene.record, loadedScene.events.map((event) => event.object)) : [],
    [loadedScene],
  )
  const mapPalette = useMemo(() => palettes.find((palette) => `${palette.index}:${palette.variant}` === mapPaletteKey), [mapPaletteKey, palettes])
  const compiledScriptProject = useMemo(
    () => compileForgeScriptProject(
      scriptDrafts,
      sceneCatalog?.scriptEntries.length ?? 0,
      sceneCatalog?.messageEncoding ? sceneCatalog.messages.length : null,
    ),
    [scriptDrafts, sceneCatalog],
  )
  const sceneDebugRuntime = useMemo(
    () => createSceneDebugRuntime(sceneCatalog?.scriptEntries ?? [], sceneCatalog?.messages ?? [], compiledScriptProject),
    [sceneCatalog, compiledScriptProject],
  )
  const sceneDebugTargets = useMemo((): SceneDebugTarget[] => {
    if (!loadedScene) return []
    const targets: SceneDebugTarget[] = []
    if (loadedScene.record.scriptOnEnter) targets.push({ id: 'scene-enter', label: `场景 #${loadedScene.record.number} · 进入脚本`, entry: loadedScene.record.scriptOnEnter, eventObjectId: 0, mode: 'scene-enter' })
    if (loadedScene.record.scriptOnTeleport) targets.push({ id: 'scene-teleport', label: `场景 #${loadedScene.record.number} · 传送脚本`, entry: loadedScene.record.scriptOnTeleport, eventObjectId: 0, mode: 'scene-teleport' })
    for (const event of loadedScene.events) {
      const eventObjectId = event.object.index + 1
      if (event.object.triggerScript) targets.push({ id: `event-${eventObjectId}-trigger`, label: `事件 #${eventObjectId} · 触发脚本`, entry: event.object.triggerScript, eventObjectId, mode: 'event-trigger' })
      if (event.object.autoScript) targets.push({ id: `event-${eventObjectId}-auto`, label: `事件 #${eventObjectId} · 自动脚本`, entry: event.object.autoScript, eventObjectId, mode: 'event-auto' })
    }
    return targets
  }, [loadedScene])
  const activeScriptDraft = scriptDrafts.find((draft) => draft.sourceEntry === selectedRealScriptEntry)
  const activeCompiledScript = compiledScriptProject.scripts.find((script) => script.sourceEntry === selectedRealScriptEntry)
  const activeDraftHistory = selectedRealScriptEntry === null ? [] : scriptDraftHistory[String(selectedRealScriptEntry)] ?? []
  const activeDraftSourceMismatch = Boolean(activeScriptDraft && sceneCatalog && !isForgeScriptDraftCompatible(activeScriptDraft, sceneCatalog.scriptEntries))
  const sceneTitle = loadedScene
    ? `场景 #${String(loadedScene.record.number).padStart(3, '0')} · 地图 #${String(loadedScene.record.mapNumber).padStart(3, '0')}`
    : '十里坡 · 原型场景'

  const debugPalette = sceneDebugSession
    ? palettes.find((palette) => palette.index === sceneDebugSession.palette.number && palette.variant === (sceneDebugSession.palette.night ? 'night' : 'day')) ?? mapPalette
    : mapPalette

  useEffect(() => {
    if (sceneDebugTargets.length === 0) {
      setSceneDebugTargetId('')
      return
    }
    if (sceneDebugSession) return
    const eventObjectId = realSelectedEventIndex === null ? null : realSelectedEventIndex + 1
    const preferred = eventObjectId === null ? undefined : sceneDebugTargets.find((target) => target.id === `event-${eventObjectId}-trigger`)
      ?? sceneDebugTargets.find((target) => target.id === `event-${eventObjectId}-auto`)
    setSceneDebugTargetId((current) => preferred?.id ?? (sceneDebugTargets.some((target) => target.id === current) ? current : sceneDebugTargets[0].id))
  }, [realSelectedEventIndex, sceneDebugSession, sceneDebugTargets])

  useEffect(() => {
    if (!sceneDebugRunning || !sceneDebugSession || sceneDebugSession.status !== 'paused') return
    const timer = window.setTimeout(() => {
      if (sceneDebugBreakpoints.includes(sceneDebugSession.currentEntry) && !debugSkipBreakpointOnceRef.current) {
        setSceneDebugSession((current) => current ? { ...current, stopReason: `命中断点 ${formatPalEntry(current.currentEntry)}` } : current)
        setSceneDebugRunning(false)
        return
      }
      debugSkipBreakpointOnceRef.current = false
      const next = stepSceneDebugSession(sceneDebugRuntime, sceneDebugSession)
      setSceneDebugSession(next)
      if (next.status !== 'paused') setSceneDebugRunning(false)
    }, 160)
    return () => window.clearTimeout(timer)
  }, [sceneDebugBreakpoints, sceneDebugRunning, sceneDebugRuntime, sceneDebugSession])

  const updateEvent = (updated: MapEvent) => setMap((current) => ({ ...current, events: current.events.map((event) => event.id === updated.id ? updated : event) }))
  const paintTile = (x: number, y: number) => setMap((current) => ({ ...current, tiles: current.tiles.map((row, rowIndex) => rowIndex !== y ? row : row.map((tile, columnIndex) => columnIndex !== x ? tile : { ...tile, terrain: brush, blocked: brush === 'water' }) ) }))

  const startSceneDebug = (targetOverride?: SceneDebugTarget) => {
    if (!loadedScene || !sceneCatalog) return
    const target = targetOverride ?? sceneDebugTargets.find((candidate) => candidate.id === sceneDebugTargetId)
    if (!target) {
      setToast('当前场景没有可调试的脚本入口')
      return
    }
    const incompatibleDraft = scriptDrafts.find((draft) => !isForgeScriptDraftCompatible(draft, sceneCatalog.scriptEntries))
    if (incompatibleDraft) {
      setToast(`工程脚本 ${formatPalEntry(incompatibleDraft.sourceEntry)} 与当前 SSS.MKF 不匹配，已阻止调试`)
      return
    }
    const structuralError = compiledScriptProject.issues.find((issue) => issue.level === 'error' && issue.code !== 'message-base-missing')
    if (structuralError) {
      setToast(`脚本覆盖无法调试：${structuralError.message}`)
      return
    }
    const session = createSceneDebugSession(sceneDebugRuntime, {
      id: `scene-${loadedScene.record.number}-${target.id}`,
      mode: target.mode,
      sourceEntry: target.entry,
      eventObjectId: target.eventObjectId,
      scene: loadedScene.record,
      events: loadedScene.events.map((event) => event.object),
      party: {
        x: realSelectedTile.x * 32 + realSelectedTile.half * 16,
        y: realSelectedTile.y * 16 + realSelectedTile.half * 8,
      },
      palette: { number: mapPalette?.index ?? 0, night: mapPalette?.variant === 'night' },
    })
    setSceneDebugTargetId(target.id)
    setSceneDebugSession(session)
    setSceneDebugRunning(false)
    setSceneDebugOpen(true)
    setSelectedRealScriptEntry(target.entry)
    if (target.eventObjectId > 0) setRealSelectedEventIndex(target.eventObjectId - 1)
    setToast(`已建立场景 #${loadedScene.record.number} 调试沙盒`)
  }

  const debugScriptInScene = (entry: number, eventObjectId: number, mode: SceneDebugMode) => {
    const target = sceneDebugTargets.find((candidate) => candidate.entry === entry && candidate.eventObjectId === eventObjectId && candidate.mode === mode)
      ?? { id: `${mode}-${eventObjectId}-${entry}`, label: `${mode} · ${formatPalEntry(entry)}`, entry, eventObjectId, mode }
    startSceneDebug(target)
  }

  const openDebugCurrentScript = () => {
    if (!sceneDebugSession) return
    const owner = compiledScriptProject.scripts.find((script) => script.entries.some((entry) => entry.index === sceneDebugSession.currentEntry))
    setSelectedRealScriptEntry(owner?.sourceEntry ?? sceneDebugSession.currentEntry)
    setView('script')
  }

  const toggleDebugBreakpoint = (entry: number) => setSceneDebugBreakpoints((current) => current.includes(entry)
    ? current.filter((candidate) => candidate !== entry)
    : [...current, entry].sort((left, right) => left - right))

  const runCurrentSceneInSdlpal = () => {
    if (!loadedScene) return
    const target = sceneDebugTargets.find((candidate) => candidate.id === sceneDebugTargetId) ?? sceneDebugTargets[0]
    if (!target) {
      setToast('当前场景没有可用于实机启动的脚本目标')
      return
    }
    const mountedNames = new Set(resources.filter((resource) => resource.file).map((resource) => resource.name.toUpperCase()))
    const missing = ['SSS.MKF', 'DATA.MKF', 'MAP.MKF', 'GOP.MKF', 'MGO.MKF', 'PAT.MKF'].filter((name) => !mountedNames.has(name))
    if (missing.length > 0) {
      setToast(`SDLPAL 缺少运行资源：${missing.join(', ')}`)
      return
    }
    const eventDirection = target.eventObjectId > 0
      ? loadedScene.events.find((event) => event.object.index + 1 === target.eventObjectId)?.object.direction ?? 0
      : 0
    setSceneDebugRunning(false)
    setSdlpalLaunchTarget(createSdlpalLaunchTarget({
      scene: loadedScene.record.number,
      tile: realSelectedTile,
      mode: target.mode,
      entry: target.entry,
      eventObjectId: target.eventObjectId,
      direction: eventDirection,
      label: target.label,
    }))
  }

  const openRealScene = async (
    sceneNumber: number,
    sourceArchives = archives,
    sourceCatalog = sceneCatalog,
    profile = gameProfile,
  ) => {
    if (!sourceCatalog) return
    const token = ++sceneLoadTokenRef.current
    setSceneLoading(true)
    setSceneError('')
    setView('map')
    try {
      const scene = await loadPalScene(sourceArchives, sourceCatalog, sceneNumber, profile)
      if (token !== sceneLoadTokenRef.current) return
      const focus = scene.events.find((event) => event.object.state > 0) ?? scene.events[0]
      const half = focus && focus.object.x % 32 >= 16 ? 1 : 0
      const focusTile: PalTileSelection = focus ? {
        x: Math.max(0, Math.min(63, Math.floor((focus.object.x - half * 16) / 32))),
        y: Math.max(0, Math.min(127, Math.floor((focus.object.y - half * 8) / 16))),
        half,
      } : { x: 0, y: 0, half: 0 }
      setLoadedScene(scene)
      setSelectedSceneNumber(sceneNumber)
      setRealSelectedTile(focusTile)
      setRealSelectedEventIndex(focus?.object.index ?? null)
      const scriptReferences = collectSceneScriptReferences(scene.record, scene.events.map((event) => event.object))
      setSelectedRealScriptEntry(scriptReferences[0]?.entry ?? null)
      setTool('select')
      setZoom(0.5)
      setSnapshot(null)
      setSceneDebugSession(null)
      setSceneDebugRunning(false)
      setSdlpalLaunchTarget(null)
      setToast(`已读取场景 #${sceneNumber} · MAP #${scene.record.mapNumber}`)
    } catch (error) {
      if (token !== sceneLoadTokenRef.current) return
      setLoadedScene(null)
      setSelectedSceneNumber(sceneNumber)
      setSceneError(error instanceof Error ? error.message : String(error))
    } finally {
      if (token === sceneLoadTokenRef.current) setSceneLoading(false)
    }
  }

  const importFiles = async (fileList: FileList | null, asGameDirectory: boolean) => {
    if (!fileList?.length) return
    const files = Array.from(fileList)
    const imported = await Promise.all(files.map(async (file) => {
      const kind = resourceKind(file)
      let chunks: number | undefined
      let chunkIndex: ImportedResource['chunkIndex']
      let error: string | undefined
      if (kind === 'mkf') {
        try {
          chunkIndex = await readMkfIndex(file)
          chunks = chunkIndex.length
        } catch (reason) {
          error = reason instanceof Error ? reason.message : String(reason)
        }
      }
      const relativePath = file.webkitRelativePath || file.name
      return { name: file.name, path: asGameDirectory ? `/${relativePath}` : `forge://assets/${file.name}`, size: file.size, kind, chunks, chunkIndex, file, error, previewUrl: !asGameDirectory && kind === 'image' ? URL.createObjectURL(file) : undefined } satisfies ImportedResource
    }))
    setResources(asGameDirectory ? imported : (current) => [...current, ...imported])
    if (asGameDirectory) {
      setProjectMounted(true)
      const preferred = imported.find((item) => item.name.toUpperCase() === 'MGO.MKF')
        ?? imported.find((item) => item.name.toUpperCase() === 'FBP.MKF')
        ?? imported.find((item) => item.kind === 'mkf')
      setSelectedResourcePath(preferred?.path ?? '')

      const pat = imported.find((item) => item.name.toUpperCase() === 'PAT.MKF' && item.file && item.chunkIndex)
      const loadedPalettes: PalPalette[] = []
      if (pat?.file && pat.chunkIndex) {
        for (const chunk of pat.chunkIndex) {
          if (chunk.size < 768) continue
          try {
            const buffer = await pat.file.slice(chunk.offset, chunk.offset + chunk.size).arrayBuffer()
            loadedPalettes.push(...decodePatChunk(readMkfChunk(buffer, { ...chunk, offset: 0 }), chunk.index))
          } catch { /* keep other palettes */ }
        }
      }
      setPalettes(loadedPalettes)
      setMapPaletteKey(loadedPalettes[0] ? `${loadedPalettes[0].index}:${loadedPalettes[0].variant}` : '')

      const nextArchives = createPalArchiveSet(imported)
      setArchives(nextArchives)
      setLoadedScene(null)
      setSceneCatalog(null)
      setSceneError('')
      try {
        const messageFile = imported.find((item) => item.name.toUpperCase() === 'M.MSG')?.file
        const nextCatalog = await loadPalSceneCatalog(nextArchives, messageFile)
        setSceneCatalog(nextCatalog)
        const firstScene = nextCatalog.availableScenes[0]
        await openRealScene(firstScene.number, nextArchives, nextCatalog, gameProfile)
      } catch (error) {
        setSceneError(error instanceof Error ? error.message : String(error))
        setView('map')
        setToast(`目录已挂载，但真实场景尚未载入`)
      }
      return
    }
    setView('resources')
    setToast(`已导入 ${imported.length} 个扩展资源`)
  }

  const saveProject = () => {
    localStorage.setItem('palforge.project', JSON.stringify({ format: 'palforge-project', version: 2, map, modules, testSettings, scriptDrafts }))
    setToast(`工程快照已保存 · ${scriptDrafts.length} 个脚本覆盖`)
  }

  const exportProject = () => {
    const payload = JSON.stringify({
      format: 'palforge-project',
      version: 2,
      map,
      modules,
      testSettings,
      scriptProject: {
        format: 'palforge-script-project',
        version: 1,
        drafts: scriptDrafts,
        compiledPreview: compiledScriptProject,
      },
      resources: resources.map(({ name, path, size, kind, chunks }) => ({ name, path, size, kind, chunks })),
    }, null, 2)
    const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'xiaoyao-demo.palforge.json'
    link.click()
    URL.revokeObjectURL(url)
    setToast('PalForge 工程包已导出')
  }

  return (
    <div className="app-shell">
      <input ref={gameInputRef} hidden type="file" multiple onChange={(event) => void importFiles(event.target.files, true)} />
      <input ref={assetInputRef} hidden type="file" multiple accept="image/*,audio/*,.json,.txt,.bin" onChange={(event) => void importFiles(event.target.files, false)} />
      <TopBar projectMounted={projectMounted} sceneTitle={sceneTitle} onOpen={() => gameInputRef.current?.click()} onSave={saveProject} onExport={exportProject} />
      <nav className="activity-rail">
        <div className="rail-main">
          <RailButton label="地图" active={view === 'map'} onClick={() => setView('map')}><Map size={20} /></RailButton>
          <RailButton label="脚本" active={view === 'script'} onClick={() => {
            if (sceneCatalog && selectedRealScriptEntry === null) setSelectedRealScriptEntry(realScriptReferences[0]?.entry ?? 0)
            setView('script')
          }}><Braces size={20} /></RailButton>
          <RailButton label="资源" active={view === 'resources'} onClick={() => setView('resources')}><Archive size={20} /></RailButton>
          <RailButton label="模块" active={view === 'modules'} onClick={() => setView('modules')}><Blocks size={20} /></RailButton>
        </div>
        <RailButton label="设置"><Settings2 size={20} /></RailButton>
      </nav>
      <ProjectExplorer
        view={view}
        onView={setView}
        selectedScriptId={selectedScriptId}
        onScript={(script) => { setSelectedScriptId(script.id); setView('script') }}
        resources={resources}
        sceneCatalog={sceneCatalog}
        selectedSceneNumber={selectedSceneNumber}
        onScene={(sceneNumber) => void openRealScene(sceneNumber)}
        realScriptReferences={realScriptReferences}
        selectedRealScriptEntry={selectedRealScriptEntry}
        onRealScript={(entry) => { setSelectedRealScriptEntry(entry); setView('script') }}
        editedScriptEntries={scriptDrafts.map((draft) => draft.sourceEntry)}
      />
      <main className={`main-area ${testOpen && !projectMounted ? 'test-open' : ''}`}>
        {view === 'map' && (
          <div className="map-workspace">
            <MapToolbar
              tool={tool}
              onTool={setTool}
              brush={brush}
              onBrush={setBrush}
              zoom={zoom}
              onZoom={setZoom}
              showGrid={showGrid}
              onGrid={() => setShowGrid((value) => !value)}
              realScene={projectMounted}
              palettes={palettes}
              paletteKey={mapPaletteKey}
              onPalette={setMapPaletteKey}
            />
            {loadedScene ? (
              <PalSceneCanvas
                scene={loadedScene}
                palette={debugPalette}
                zoom={zoom}
                showGrid={showGrid}
                selectedTile={realSelectedTile}
                selectedEventIndex={realSelectedEventIndex}
                eventOverrides={sceneDebugSession?.events}
                debugParty={sceneDebugSession?.party}
                onSelectTile={(tile) => { setRealSelectedTile(tile); setRealSelectedEventIndex(null) }}
                onSelectEvent={(event) => setRealSelectedEventIndex(event.object.index)}
              />
            ) : projectMounted ? (
              <div className="scene-load-state">
                {sceneLoading ? <LoaderCircle className="spin" size={30} /> : <AlertTriangle size={30} />}
                <strong>{sceneLoading ? '正在组合真实场景…' : '真实场景读取失败'}</strong>
                <p>{sceneLoading ? '读取 SSS、MAP、GOP 与 MGO；原文件不会被修改。' : sceneError}</p>
                {!sceneLoading && <button className="toolbar-button" onClick={() => gameInputRef.current?.click()}><FolderOpen size={14} /> 重新选择完整游戏目录</button>}
              </div>
            ) : (
              <MapCanvas map={map} zoom={zoom} showGrid={showGrid} selectedTile={selectedTile} selectedEventId={selectedEventId} activeTool={tool} brush={brush} onSelectTile={(x, y) => { setSelectedTile({ x, y }); setSelectedEventId('') }} onSelectEvent={(event) => { setSelectedEventId(event.id); setSelectedTile({ x: event.x, y: event.y }); setTestSettings((current) => ({ ...current, eventId: event.id, spawnX: event.x, spawnY: event.y })) }} onPaint={paintTile} />
            )}
            {sceneLoading && loadedScene && <div className="scene-loading-overlay"><LoaderCircle className="spin" size={17} /> 正在切换场景…</div>}
            <div className="map-stats">
              <span><Layers3 size={13} /> {loadedScene ? '64 × 128 × 2' : '14 × 10'}</span>
              <span><CircleDot size={13} /> {loadedScene?.events.length ?? map.events.length} 个事件</span>
              <span><AppWindow size={13} /> {loadedScene ? `MAP ${loadedScene.compression}` : projectMounted ? '等待真实资源' : '演示数据'}</span>
            </div>
          </div>
        )}
        {view === 'script' && (sceneCatalog
          ? <RealScriptEditor
              entries={sceneCatalog.scriptEntries}
              startEntry={selectedRealScriptEntry ?? 0}
              references={realScriptReferences}
              messages={sceneCatalog.messages}
              messageEncoding={sceneCatalog.messageEncoding}
              messageError={sceneCatalog.messageError}
              draft={activeScriptDraft}
              compiledDraft={activeCompiledScript}
              onEntry={setSelectedRealScriptEntry}
              onCreateDraft={() => {
                const created = createForgeScriptDraft(
                  sceneCatalog.scriptEntries,
                  selectedRealScriptEntry ?? 0,
                  realScriptReferences.find((reference) => reference.entry === selectedRealScriptEntry)?.sources[0]?.label,
                  Date.now(),
                  sceneCatalog.messages,
                )
                setScriptDrafts((current) => [...current.filter((draft) => draft.sourceEntry !== created.sourceEntry), created])
                setScriptDraftHistory((current) => ({ ...current, [String(created.sourceEntry)]: [] }))
                setToast(`已创建工程脚本 ${formatPalEntry(created.sourceEntry)}`)
              }}
              onDraftChange={(updated) => {
                const previous = scriptDrafts.find((draft) => draft.sourceEntry === updated.sourceEntry)
                if (previous) setScriptDraftHistory((current) => ({
                  ...current,
                  [String(updated.sourceEntry)]: [...(current[String(updated.sourceEntry)] ?? []), previous].slice(-50),
                }))
                setScriptDrafts((current) => current.map((draft) => draft.sourceEntry === updated.sourceEntry ? updated : draft))
              }}
              onDiscardDraft={() => {
                setScriptDrafts((current) => current.filter((draft) => draft.sourceEntry !== selectedRealScriptEntry))
                setScriptDraftHistory((current) => {
                  const next = { ...current }
                  delete next[String(selectedRealScriptEntry)]
                  return next
                })
                setToast(`已放弃 ${formatPalEntry(selectedRealScriptEntry ?? 0)} 的工程覆盖`)
              }}
              canUndo={activeDraftHistory.length > 0}
              onUndo={() => {
                const previous = activeDraftHistory.at(-1)
                if (!previous) return
                setScriptDrafts((current) => current.map((draft) => draft.sourceEntry === previous.sourceEntry ? previous : draft))
                setScriptDraftHistory((current) => ({ ...current, [String(previous.sourceEntry)]: (current[String(previous.sourceEntry)] ?? []).slice(0, -1) }))
              }}
              sourceMismatch={activeDraftSourceMismatch}
              debugEntry={sceneDebugSession?.currentEntry ?? null}
              breakpoints={sceneDebugBreakpoints}
              onToggleBreakpoint={toggleDebugBreakpoint}
            />
          : <ScriptEditor script={selectedScript} />)}
        {view === 'resources' && <ResourceBrowser resources={resources} palettes={palettes} selectedPath={selectedResourcePath} profile={gameProfile} onProfile={setGameProfile} onSelectResource={setSelectedResourcePath} onImport={() => assetInputRef.current?.click()} onOpenDirectory={() => gameInputRef.current?.click()} onToast={setToast} />}
        {view === 'modules' && <ModulesView modules={modules} onToggle={(id) => setModules((current) => current.map((module) => module.id === id ? { ...module, enabled: !module.enabled } : module))} />}
      </main>
      {view === 'map' && loadedScene && <PalSceneInspector scene={loadedScene} selectedTile={realSelectedTile} selectedEvent={selectedPalEvent} onOpenScript={(entry) => { setSelectedRealScriptEntry(entry); setView('script') }} onDebugScript={debugScriptInScene} debugActive={Boolean(sceneDebugSession)} />}
      {view === 'map' && !projectMounted && <Inspector map={map} selectedTile={selectedTile} selectedEvent={selectedEvent} onEventChange={updateEvent} />}
      {loadedScene && sceneCatalog && <SceneDebugBench
        open={sceneDebugOpen}
        onOpen={() => setSceneDebugOpen((current) => !current)}
        runtime={sceneDebugRuntime}
        targets={sceneDebugTargets}
        targetId={sceneDebugTargetId}
        onTarget={setSceneDebugTargetId}
        session={sceneDebugSession}
        running={sceneDebugRunning}
        breakpoints={sceneDebugBreakpoints}
        spawn={realSelectedTile}
        onStart={() => startSceneDebug()}
        onStep={() => {
          setSceneDebugRunning(false)
          setSceneDebugSession((current) => current ? stepSceneDebugSession(sceneDebugRuntime, current) : current)
        }}
        onRun={() => {
          if (!sceneDebugSession || sceneDebugSession.status !== 'paused') return
          debugSkipBreakpointOnceRef.current = sceneDebugBreakpoints.includes(sceneDebugSession.currentEntry)
          setSceneDebugRunning(true)
        }}
        onPause={() => setSceneDebugRunning(false)}
        onReset={() => startSceneDebug()}
        onDecision={(optionId) => {
          setSceneDebugRunning(false)
          setSceneDebugSession((current) => current ? resolveSceneDebugDecision(sceneDebugRuntime, current, optionId) : current)
        }}
        onOpenCurrent={openDebugCurrentScript}
        onOpenTargetScene={() => { if (sceneDebugSession?.nextSceneNumber) void openRealScene(sceneDebugSession.nextSceneNumber) }}
        onRunReal={runCurrentSceneInSdlpal}
      />}
      {sdlpalLaunchTarget && <SdlpalRunnerDialog
        files={resources.flatMap((resource) => resource.file ? [resource.file] : [])}
        target={sdlpalLaunchTarget}
        onClose={() => setSdlpalLaunchTarget(null)}
      />}
      {view === 'map' && !projectMounted && <TestBench open={testOpen} onOpen={() => setTestOpen((value) => !value)} settings={testSettings} onSettings={setTestSettings} events={map.events} onRun={() => { const event = map.events.find((item) => item.id === testSettings.eventId); setSnapshot(createTestSnapshot(testSettings, event)); setToast('独立测试快照已建立') }} snapshot={snapshot} />}
      {toast && <div className="toast"><CircleDot size={14} />{toast}</div>}
      <footer className="statusbar"><span><span className="status-light" /> PalForge project</span><span>UTF-8</span><span>SDLPAL classic profile</span><span className="status-spacer" /><span>Ln {(loadedScene ? realSelectedTile.y : selectedTile.y) + 1}, Col {(loadedScene ? realSelectedTile.x : selectedTile.x) + 1}</span><span>{loadedScene ? 'READ ONLY' : 'main*'}</span></footer>
    </div>
  )
}
