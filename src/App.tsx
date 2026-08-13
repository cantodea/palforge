import {
  AppWindow,
  Archive,
  AlertTriangle,
  Blocks,
  Braces,
  BugPlay,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Code2,
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
  Play,
  PlugZap,
  Save,
  Search,
  Settings2,
  SquareMousePointer,
  TerminalSquare,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { MapCanvas } from './components/MapCanvas'
import { PalSceneCanvas, type PalTileSelection } from './components/PalSceneCanvas'
import { ResourceBrowser } from './components/ResourceBrowser'
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
}: {
  view: View
  onView: (view: View) => void
  selectedScriptId: string
  onScript: (script: Script) => void
  resources: ImportedResource[]
  sceneCatalog: PalSceneCatalog | null
  selectedSceneNumber: number | null
  onScene: (sceneNumber: number) => void
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
        <Section title="事件脚本" count={demoScripts.length}>
          {demoScripts.map((script) => (
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
        <span className="version">ALPHA 0.3</span>
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
}: {
  scene: LoadedPalScene
  selectedTile: PalTileSelection
  selectedEvent?: LoadedPalEvent
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
        <div><span className="eyebrow">INSPECTOR · REAL DATA</span><strong>{selectedEvent ? '事件对象' : '地图单元'}</strong></div>
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
          <label className="field"><span>触发脚本</span><input value={`0x${selectedEvent.object.triggerScript.toString(16).padStart(4, '0')}`} readOnly /></label>
          <label className="field"><span>自动脚本</span><input value={`0x${selectedEvent.object.autoScript.toString(16).padStart(4, '0')}`} readOnly /></label>
          <div className="field-row">
            <label className="field"><span>方向</span><input value={selectedEvent.object.direction} readOnly /></label>
            <label className="field"><span>当前帧</span><input value={`${selectedEvent.object.currentFrame} / ${selectedEvent.frames.length}`} readOnly /></label>
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
  const [toast, setToast] = useState('')
  const [testSettings, setTestSettings] = useState<TestSettings>({ scene: demoMap.name, spawnX: 7, spawnY: 4, partyLevel: 8, eventId: 'event-01', flags: ['met_ling_er'] })
  const gameInputRef = useRef<HTMLInputElement>(null)
  const assetInputRef = useRef<HTMLInputElement>(null)
  const sceneLoadTokenRef = useRef(0)

  useEffect(() => gameInputRef.current?.setAttribute('webkitdirectory', ''), [])
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 2400)
    return () => window.clearTimeout(timer)
  }, [toast])

  const selectedEvent = map.events.find((event) => event.id === selectedEventId)
  const selectedPalEvent = loadedScene?.events.find((event) => event.object.index === realSelectedEventIndex)
  const selectedScript = useMemo(() => demoScripts.find((script) => script.id === selectedScriptId) ?? demoScripts[0], [selectedScriptId])
  const mapPalette = useMemo(() => palettes.find((palette) => `${palette.index}:${palette.variant}` === mapPaletteKey), [mapPaletteKey, palettes])
  const sceneTitle = loadedScene
    ? `场景 #${String(loadedScene.record.number).padStart(3, '0')} · 地图 #${String(loadedScene.record.mapNumber).padStart(3, '0')}`
    : '十里坡 · 原型场景'

  const updateEvent = (updated: MapEvent) => setMap((current) => ({ ...current, events: current.events.map((event) => event.id === updated.id ? updated : event) }))
  const paintTile = (x: number, y: number) => setMap((current) => ({ ...current, tiles: current.tiles.map((row, rowIndex) => rowIndex !== y ? row : row.map((tile, columnIndex) => columnIndex !== x ? tile : { ...tile, terrain: brush, blocked: brush === 'water' }) ) }))

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
      setTool('select')
      setZoom(0.5)
      setSnapshot(null)
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
        const nextCatalog = await loadPalSceneCatalog(nextArchives)
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
    localStorage.setItem('palforge.project', JSON.stringify({ map, modules, testSettings }))
    setToast('工程快照已保存到浏览器')
  }

  const exportProject = () => {
    const payload = JSON.stringify({ format: 'palforge-project', version: 1, map, modules, testSettings, resources: resources.map(({ name, path, size, kind, chunks }) => ({ name, path, size, kind, chunks })) }, null, 2)
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
          <RailButton label="脚本" active={view === 'script'} onClick={() => setView('script')}><Braces size={20} /></RailButton>
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
                palette={mapPalette}
                zoom={zoom}
                showGrid={showGrid}
                selectedTile={realSelectedTile}
                selectedEventIndex={realSelectedEventIndex}
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
        {view === 'script' && <ScriptEditor script={selectedScript} />}
        {view === 'resources' && <ResourceBrowser resources={resources} palettes={palettes} selectedPath={selectedResourcePath} profile={gameProfile} onProfile={setGameProfile} onSelectResource={setSelectedResourcePath} onImport={() => assetInputRef.current?.click()} onOpenDirectory={() => gameInputRef.current?.click()} onToast={setToast} />}
        {view === 'modules' && <ModulesView modules={modules} onToggle={(id) => setModules((current) => current.map((module) => module.id === id ? { ...module, enabled: !module.enabled } : module))} />}
      </main>
      {view === 'map' && loadedScene && <PalSceneInspector scene={loadedScene} selectedTile={realSelectedTile} selectedEvent={selectedPalEvent} />}
      {view === 'map' && !projectMounted && <Inspector map={map} selectedTile={selectedTile} selectedEvent={selectedEvent} onEventChange={updateEvent} />}
      {view === 'map' && !projectMounted && <TestBench open={testOpen} onOpen={() => setTestOpen((value) => !value)} settings={testSettings} onSettings={setTestSettings} events={map.events} onRun={() => { const event = map.events.find((item) => item.id === testSettings.eventId); setSnapshot(createTestSnapshot(testSettings, event)); setToast('独立测试快照已建立') }} snapshot={snapshot} />}
      {toast && <div className="toast"><CircleDot size={14} />{toast}</div>}
      <footer className="statusbar"><span><span className="status-light" /> PalForge project</span><span>UTF-8</span><span>SDLPAL classic profile</span><span className="status-spacer" /><span>Ln {(loadedScene ? realSelectedTile.y : selectedTile.y) + 1}, Col {(loadedScene ? realSelectedTile.x : selectedTile.x) + 1}</span><span>{loadedScene ? 'READ ONLY' : 'main*'}</span></footer>
    </div>
  )
}
