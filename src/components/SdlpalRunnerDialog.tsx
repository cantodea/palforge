import { useEffect, useMemo, useRef, useState } from 'react'
import { ExternalLink, Gamepad2, LoaderCircle, RotateCcw, Square, TerminalSquare, X } from 'lucide-react'
import {
  isSdlpalRunnerMessage,
  selectSdlpalFiles,
  type SdlpalLaunchTarget,
  type SdlpalRunnerStatus,
} from '../core/sdlpalRunner'
import type { ForgeAnimationDraft } from '../core/animationProject'
import { prepareAnimationRuntime, type RuntimeReplacementReport } from '../core/animationRuntime'
import type { GameProfile } from '../core/resourceDecoder'
import type { ImportedResource, PalPalette } from '../types'

type SdlpalRunnerDialogProps = {
  resources: ImportedResource[]
  animations: ForgeAnimationDraft[]
  palettes: PalPalette[]
  profile: GameProfile
  target: SdlpalLaunchTarget
  onClose: () => void
}

const statusLabels: Record<SdlpalRunnerStatus, string> = {
  booting: '载入引擎',
  ready: '引擎就绪',
  mounting: '复制资源',
  running: '实机运行',
  error: '启动失败',
  exited: '已经退出',
}

export function SdlpalRunnerDialog({ resources, animations, palettes, profile, target, onClose }: SdlpalRunnerDialogProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const launchedRef = useRef(false)
  const [instance, setInstance] = useState(0)
  const [status, setStatus] = useState<SdlpalRunnerStatus>('booting')
  const [statusMessage, setStatusMessage] = useState('正在载入 SDLPAL WebAssembly')
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const [useReplacements, setUseReplacements] = useState(true)
  const [replacements, setReplacements] = useState<RuntimeReplacementReport[]>([])
  const sourceFiles = useMemo(() => resources.flatMap((resource) => resource.file ? [resource.file] : []), [resources])
  const runtimeFiles = useMemo(() => selectSdlpalFiles(sourceFiles), [sourceFiles])
  const enabledCount = animations.filter((animation) => animation.runtimeBinding?.enabled).length

  useEffect(() => {
    launchedRef.current = false
    setStatus('booting')
    setStatusMessage('正在载入 SDLPAL WebAssembly')
    setProgress(null)
    setLogs([])
    setReplacements([])
  }, [instance])

  useEffect(() => {
    let cancelled = false
    const launch = async () => {
      try {
        setStatus('mounting')
        setStatusMessage(useReplacements ? '正在准备自定义动画替换' : '正在准备原版对照')
        const prepared = useReplacements ? await prepareAnimationRuntime({
          files: sourceFiles, animations, palettes, profile,
          onProgress: (message) => { if (!cancelled) setStatusMessage(message) },
        }) : { files: runtimeFiles, replacements: [] }
        if (cancelled) return
        setReplacements(prepared.replacements)
        setLogs((current) => [...current, ...prepared.replacements.map((item) =>
          `替换 ${item.archive} #${item.chunkIndex} ← ${item.animationName} · ${item.sourceFrames} → ${item.runtimeFrames} 帧 · ${item.compression} · ${item.encodedBytes} B`),
        prepared.replacements.length ? '自定义动画已编译；仅写入本次运行副本。' : '本次使用原版资源。'])
        iframeRef.current?.contentWindow?.postMessage({ type: 'palforge:launch', files: selectSdlpalFiles(prepared.files), target }, window.location.origin)
      } catch (reason) {
        if (cancelled) return
        const message = reason instanceof Error ? reason.message : String(reason)
        setStatus('error')
        setStatusMessage(message)
        setLogs((current) => [...current, `ERROR ${message}`])
      }
    }
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== iframeRef.current?.contentWindow) return
      if (!isSdlpalRunnerMessage(event.data)) return
      const message = event.data
      if (message.type === 'log') setLogs((current) => [...current, message.message].slice(-200))
      if (message.type === 'error') {
        setStatus('error')
        setStatusMessage(message.message)
        setLogs((current) => [...current, `ERROR ${message.message}`].slice(-200))
      }
      if (message.type === 'status') {
        if (message.status) setStatus(message.status)
        setStatusMessage(message.message)
        setProgress(message.progress ?? null)
        if (message.status === 'ready' && !launchedRef.current) {
          launchedRef.current = true
          void launch()
        }
      }
    }
    window.addEventListener('message', receive)
    return () => { cancelled = true; window.removeEventListener('message', receive) }
  }, [instance, sourceFiles, runtimeFiles, target, animations, palettes, profile, useReplacements])

  const restart = () => setInstance((current) => current + 1)
  const copied = progress && progress.total > 0 ? Math.round(progress.current / progress.total * 100) : 0

  return (
    <div className="sdlpal-runner-backdrop" role="dialog" aria-modal="true" aria-label="SDLPAL 实机运行器">
      <section className="sdlpal-runner-dialog">
        <header>
          <div>
            <span className="runner-icon"><Gamepad2 size={19} /></span>
            <span><small>SDLPAL · WEBASSEMBLY</small><strong>实机运行 · {target.label}</strong></span>
          </div>
          <div className="runner-header-actions">
            <button className="toolbar-button" onClick={() => iframeRef.current?.focus()}><ExternalLink size={14} /> 聚焦画面</button>
            <button className="toolbar-button" onClick={restart}><RotateCcw size={14} /> 重启</button>
            <button className="icon-button" title="停止并关闭" onClick={onClose}><X size={17} /></button>
          </div>
        </header>
        <div className="sdlpal-runner-body">
          <div className="sdlpal-screen-frame">
            <iframe
              key={instance}
              ref={iframeRef}
              src="/sdlpal-runtime/runner.html"
              title="SDLPAL runtime"
              allow="autoplay; gamepad"
              sandbox="allow-scripts allow-same-origin allow-pointer-lock"
            />
            {status !== 'running' && <div className={`runner-loading-state ${status}`}>
              {status === 'error' ? <Square size={18} /> : <LoaderCircle size={18} className="spin" />}
              <strong>{statusLabels[status]}</strong>
              <span>{statusMessage}</span>
              {progress && <div className="runner-copy-progress"><i style={{ width: `${copied}%` }} /></div>}
            </div>}
          </div>
          <aside className="sdlpal-runtime-info">
            <div className="runner-target-card">
              <span className="eyebrow">REAL ENGINE TARGET</span>
              <strong>场景 #{target.scene}</strong>
              <dl>
                <div><dt>世界坐标</dt><dd>{target.worldX}, {target.worldY}</dd></div>
                <div><dt>事件对象</dt><dd>{target.eventObjectId || '场景入口'}</dd></div>
                <div><dt>立即脚本</dt><dd>{target.scriptEntry ? `#${target.scriptEntry.toString(16).padStart(4, '0')}` : '进入脚本/自然执行'}</dd></div>
                <div><dt>资源文件</dt><dd>{runtimeFiles.length}</dd></div>
                <div><dt>动画替换</dt><dd>{replacements.length} / {useReplacements ? enabledCount : 0}</dd></div>
              </dl>
            </div>
            <label className="field switch-field runner-replacement-toggle"><span><b>使用自定义动画</b><small>切换后重启；关闭可看原版对照</small></span><input type="checkbox" checked={useReplacements} onChange={(event) => { setUseReplacements(event.target.checked); restart() }} /></label>
            {replacements.length > 0 && <div className="runner-replacement-list">{replacements.map((item) => <p key={`${item.archive}:${item.chunkIndex}`}><strong>{item.archive} #{item.chunkIndex}</strong><span>{item.animationName} · {item.runtimeFrames} 帧</span></p>)}</div>}
            <div className="runner-safety-note">
              <strong>隔离运行</strong>
              <p>文件只复制到当前 iframe 的 Emscripten 内存文件系统。关闭窗口即销毁运行实例，不写回原游戏目录。</p>
              <p>启用的动画绑定会替换临时 MKF 中对应的精灵。角色方向、动作帧速和昼夜调色板仍由原版引擎控制。</p>
              <p>Script Forge 的追加脚本和对白尚未接入实机，请使用脚本沙盒验证。</p>
            </div>
            <div className="runner-log-panel">
              <div><TerminalSquare size={13} /> SDLPAL LOG <span>{logs.length}</span></div>
              <pre>{logs.length ? logs.join('\n') : `› ${statusMessage}`}</pre>
            </div>
          </aside>
        </div>
        <footer><span>方向键移动 · Enter/Space 确认 · Esc 菜单</span><span>关闭窗口 = 停止 WASM 实例</span></footer>
      </section>
    </div>
  )
}
