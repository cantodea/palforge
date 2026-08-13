import {
  Archive,
  ChevronLeft,
  ChevronRight,
  Download,
  FileDown,
  FileWarning,
  Image as ImageIcon,
  LoaderCircle,
  Moon,
  Palette,
  Pause,
  Play,
  Repeat2,
  RotateCcw,
  ScanSearch,
  SlidersHorizontal,
  Sun,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { formatBytes, readMkfChunk, type MkfChunk } from '../core/mkf'
import { adjustPalette, blendPalettes, grayscalePalette } from '../core/palette'
import { indexedToRgba } from '../core/rle'
import { inspectChunk, type ChunkInspection, type GameProfile } from '../core/resourceDecoder'
import type { ImportedResource, PalPalette } from '../types'

type ResourceBrowserProps = {
  resources: ImportedResource[]
  palettes: PalPalette[]
  selectedPath: string
  profile: GameProfile
  onProfile: (profile: GameProfile) => void
  onSelectResource: (path: string) => void
  onImport: () => void
  onOpenDirectory: () => void
  onToast: (message: string) => void
}

const kindLabels: Record<ChunkInspection['kind'], string> = {
  sprite: 'SPRITE',
  rle: 'RLE IMAGE',
  fbp: 'FBP 320×200',
  palette: 'PAT PALETTE',
  binary: 'BINARY',
  empty: 'EMPTY',
}

function ToolSlider({
  label,
  value,
  min,
  max,
  unit,
  disabled,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  unit: string
  disabled?: boolean
  onChange: (value: number) => void
}) {
  return (
    <label className={`tool-slider ${disabled ? 'disabled' : ''}`}>
      <span>{label}<output>{value}{unit}</output></span>
      <input type="range" min={min} max={max} value={value} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  )
}

function downloadBytes(bytes: Uint8Array, filename: string, type = 'application/octet-stream') {
  const copy = new Uint8Array(bytes)
  const url = URL.createObjectURL(new Blob([copy.buffer], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function PaletteGrid({ palette }: { palette: PalPalette }) {
  return (
    <div className="palette-grid" title={`PAT #${palette.index} · ${palette.variant}`}>
      {palette.colors.map((color, index) => (
        <i key={index} style={{ backgroundColor: `rgb(${color.r} ${color.g} ${color.b})` }} />
      ))}
    </div>
  )
}

function ChunkList({
  chunks,
  selected,
  onSelect,
}: {
  chunks: MkfChunk[]
  selected: number
  onSelect: (chunk: MkfChunk) => void
}) {
  return (
    <div className="chunk-column">
      <div className="resource-column-title">
        <span>CHUNKS</span>
        <b>{chunks.length}</b>
      </div>
      <div className="chunk-list">
        {chunks.map((chunk) => (
          <button
            key={chunk.index}
            className={chunk.index === selected ? 'active' : ''}
            onClick={() => onSelect(chunk)}
            disabled={chunk.size === 0}
          >
            <span><b>#{String(chunk.index).padStart(4, '0')}</b><small>0x{chunk.offset.toString(16).padStart(8, '0')}</small></span>
            <em>{chunk.size === 0 ? 'EMPTY' : formatBytes(chunk.size)}</em>
          </button>
        ))}
      </div>
    </div>
  )
}

export function ResourceBrowser({
  resources,
  palettes,
  selectedPath,
  profile,
  onProfile,
  onSelectResource,
  onImport,
  onOpenDirectory,
  onToast,
}: ResourceBrowserProps) {
  const selected = resources.find((resource) => resource.path === selectedPath) ?? resources.find((resource) => resource.kind === 'mkf')
  const [selectedChunk, setSelectedChunk] = useState(-1)
  const [inspection, setInspection] = useState<ChunkInspection | null>(null)
  const [frame, setFrame] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [loop, setLoop] = useState(true)
  const [fps, setFps] = useState(8)
  const [paletteIndex, setPaletteIndex] = useState(0)
  const [nightMix, setNightMix] = useState(0)
  const [brightness, setBrightness] = useState(100)
  const [saturation, setSaturation] = useState(100)
  const [contrast, setContrast] = useState(100)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const availablePalettes = useMemo(() => {
    const own = inspection?.palettes ?? []
    return own.length > 0 ? own : palettes
  }, [inspection, palettes])

  const paletteIndexes = useMemo(
    () => [...new Set(availablePalettes.map((item) => item.index))],
    [availablePalettes],
  )

  const resolvedPaletteIndex = paletteIndexes.includes(paletteIndex) ? paletteIndex : (paletteIndexes[0] ?? -1)
  const hasNightPalette = availablePalettes.some((item) => item.index === resolvedPaletteIndex && item.variant === 'night')

  const selectedPalette = useMemo(() => {
    const fallback = grayscalePalette()
    const day = availablePalettes.find((item) => item.index === resolvedPaletteIndex && item.variant === 'day')
      ?? availablePalettes.find((item) => item.index === resolvedPaletteIndex)
      ?? fallback
    const night = availablePalettes.find((item) => item.index === resolvedPaletteIndex && item.variant === 'night') ?? day
    const blended = blendPalettes(day, night, nightMix / 100)
    return adjustPalette(blended, {
      brightness: brightness / 100,
      saturation: saturation / 100,
      contrast: contrast / 100,
    })
  }, [availablePalettes, brightness, contrast, nightMix, resolvedPaletteIndex, saturation])

  const image = inspection?.kind === 'sprite'
    ? inspection.frames[Math.min(frame, inspection.frames.length - 1)]?.image
    : inspection?.image
  const frameCount = inspection?.kind === 'sprite' ? inspection.frames.length : 0

  useEffect(() => {
    setInspection(null)
    setError('')
    setFrame(0)
    setPlaying(false)
    setSelectedChunk(-1)
  }, [selected?.path])

  useEffect(() => {
    if (!playing || frameCount <= 1) return
    const timer = window.setInterval(() => {
      setFrame((current) => loop ? (current + 1) % frameCount : Math.min(current + 1, frameCount - 1))
    }, 1000 / fps)
    return () => window.clearInterval(timer)
  }, [fps, frameCount, loop, playing])

  useEffect(() => {
    if (playing && !loop && frameCount > 0 && frame >= frameCount - 1) setPlaying(false)
  }, [frame, frameCount, loop, playing])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !image) return
    canvas.width = image.width
    canvas.height = image.height
    const context = canvas.getContext('2d')
    if (!context) return
    const rgba = indexedToRgba(image, selectedPalette)
    context.putImageData(new ImageData(rgba, image.width, image.height), 0, 0)
  }, [image, selectedPalette])

  const openChunk = async (chunk: MkfChunk) => {
    if (!selected?.file) return
    setSelectedChunk(chunk.index)
    setLoading(true)
    setError('')
    setFrame(0)
    setPlaying(false)
    try {
      const buffer = await selected.file.slice(chunk.offset, chunk.offset + chunk.size).arrayBuffer()
      const raw = readMkfChunk(buffer, { ...chunk, offset: 0 })
      const result = inspectChunk(raw, selected.name, chunk.index, profile)
      setInspection(result)
      if (result.palettes?.[0]) setPaletteIndex(result.palettes[0].index)
    } catch (reason) {
      setInspection(null)
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setLoading(false)
    }
  }

  const resetPalette = () => {
    setNightMix(0)
    setBrightness(100)
    setSaturation(100)
    setContrast(100)
  }

  const togglePlayback = () => {
    if (frameCount <= 1) return
    if (!playing && frame >= frameCount - 1) setFrame(0)
    setPlaying((value) => !value)
  }

  const exportPng = () => {
    const canvas = canvasRef.current
    if (!canvas || !inspection || !image) return
    canvas.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${inspection.archiveName.replace(/\.MKF$/i, '')}-${inspection.chunkIndex}-${frame}.png`
      link.click()
      URL.revokeObjectURL(url)
      onToast('真实资源帧已导出为 PNG')
    }, 'image/png')
  }

  if (resources.length === 0) {
    return (
      <div className="workspace-view resources-view empty-resource-view">
        <div className="view-titlebar">
          <div><span className="view-icon cyan"><Archive size={18} /></span><div><strong>真实资源浏览器</strong><small>当前没有使用演示 MKF 占位</small></div></div>
        </div>
        <div className="empty-resource-state">
          <span><ScanSearch size={34} /></span>
          <h2>尚未挂载 PAL 游戏目录</h2>
          <p>请选择包含 <code>MGO.MKF</code>、<code>PAT.MKF</code> 等文件的实际游戏目录。文件只在你的浏览器本地读取。</p>
          <button className="primary-button" onClick={onOpenDirectory}><Archive size={15} /> 打开实际游戏目录</button>
        </div>
      </div>
    )
  }

  return (
    <div className="workspace-view resources-view real-resource-view">
      <div className="view-titlebar resource-titlebar">
        <div><span className="view-icon cyan"><Archive size={18} /></span><div><strong>真实资源浏览器</strong><small>MKF → YJ → sprite/RLE → PAT 调色板</small></div></div>
        <div className="resource-actions">
          <label className="profile-select"><span>游戏格式</span><select value={profile} onChange={(event) => onProfile(event.target.value as GameProfile)}><option value="auto">自动识别</option><option value="dos">DOS / YJ_1</option><option value="win95">Win95 / YJ_2</option></select></label>
          <button className="toolbar-button" onClick={onImport}>导入扩展资源</button>
        </div>
      </div>

      <div className="resource-browser-layout">
        <div className="archive-column">
          <div className="resource-column-title"><span>ARCHIVES</span><b>{resources.filter((item) => item.kind === 'mkf').length}</b></div>
          <div className="archive-list">
            {resources.filter((item) => item.kind === 'mkf').map((resource) => (
              <button key={resource.path} className={resource.path === selected?.path ? 'active' : ''} onClick={() => onSelectResource(resource.path)}>
                <span className="archive-icon"><Archive size={16} /></span>
                <span><strong>{resource.name}</strong><small>{resource.error ?? `${resource.chunkIndex?.length ?? 0} chunks · ${formatBytes(resource.size)}`}</small></span>
              </button>
            ))}
          </div>
        </div>

        <ChunkList chunks={selected?.chunkIndex ?? []} selected={selectedChunk} onSelect={(chunk) => void openChunk(chunk)} />

        <div className="preview-column">
          <div className="preview-toolbar">
            <span>{selected ? <><b>{selected.name}</b>{selectedChunk >= 0 ? ` / #${selectedChunk}` : ''}</> : '选择 MKF'}</span>
            <div>
              {inspection && <button className="icon-button" title="导出原始 chunk" onClick={() => { downloadBytes(inspection.raw, `${inspection.archiveName}-${inspection.chunkIndex}.bin`); onToast('原始 chunk 已导出') }}><FileDown size={15} /></button>}
              {inspection && inspection.payload !== inspection.raw && <button className="icon-button" title="导出解压数据" onClick={() => { downloadBytes(inspection.payload, `${inspection.archiveName}-${inspection.chunkIndex}.decoded.bin`); onToast('解压数据已导出') }}><Download size={15} /></button>}
              {image && <button className="primary-button" onClick={exportPng}><ImageIcon size={14} /> 导出 PNG</button>}
            </div>
          </div>

          <div className="preview-stage">
            {loading && <div className="preview-message"><LoaderCircle className="spin" size={28} /><strong>正在读取并解码 chunk…</strong></div>}
            {!loading && error && <div className="preview-message error"><FileWarning size={28} /><strong>解码失败</strong><p>{error}</p></div>}
            {!loading && !error && !inspection && <div className="preview-message"><ScanSearch size={30} /><strong>选择一个非空 chunk</strong><p>PalForge 将读取真实文件并检测 YJ_1/YJ_2、sprite、RLE、FBP 或 PAT。</p></div>}
            {!loading && inspection?.kind === 'binary' && <div className="preview-message"><FileWarning size={28} /><strong>暂未识别该 chunk</strong>{inspection.notes.map((note) => <p key={note}>{note}</p>)}</div>}
            {!loading && inspection?.kind === 'empty' && <div className="preview-message"><Archive size={28} /><strong>这是一个空 chunk</strong></div>}
            {!loading && inspection?.kind === 'palette' && <div className="palette-preview"><PaletteGrid palette={selectedPalette} /><strong>PAT #{selectedPalette.index} · {selectedPalette.variant === 'night' ? '夜间' : '日间'}</strong></div>}
            {!loading && image && <div className="image-preview-shell"><div className="image-checker"><canvas ref={canvasRef} /></div><span>{image.width} × {image.height} · 8-bit indexed</span></div>}
          </div>

          {inspection && (
            <div className="decode-details">
              <div className="decode-summary">
                <div className="decode-badges"><span>{inspection.compression}</span><span>{kindLabels[inspection.kind]}</span><span>{formatBytes(inspection.raw.length)} → {formatBytes(inspection.payload.length)}</span></div>
                {inspection.notes.length > 0 && <div className="decode-notes">{inspection.notes.map((note) => <span key={note}>{note}</span>)}</div>}
              </div>

              {(image || inspection.kind === 'palette') && (
                <div className={`resource-tool-grid ${inspection.kind === 'sprite' ? 'with-player' : ''}`}>
                  <section className="resource-tool-card palette-workbench">
                    <header>
                      <span className="tool-card-icon"><SlidersHorizontal size={15} /></span>
                      <span><strong>调色板工作台</strong><small>只影响预览与 PNG 导出</small></span>
                      <button className="icon-button" title="重置调色板调节" onClick={resetPalette}><RotateCcw size={14} /></button>
                    </header>
                    <div className="palette-source-row">
                      <label><Palette size={13} /><span>调色板</span><select value={resolvedPaletteIndex} disabled={paletteIndexes.length === 0} onChange={(event) => setPaletteIndex(Number(event.target.value))}>{paletteIndexes.length > 0 ? paletteIndexes.map((index) => <option value={index} key={index}>PAT #{index}</option>) : <option value={-1}>灰度回退</option>}</select></label>
                      <div className="day-night-shortcuts"><button className={nightMix === 0 ? 'active' : ''} onClick={() => setNightMix(0)}><Sun size={13} />白天</button><button className={nightMix === 100 ? 'active' : ''} disabled={!hasNightPalette} onClick={() => setNightMix(100)}><Moon size={13} />夜间</button></div>
                    </div>
                    <div className="palette-slider-grid">
                      <ToolSlider label="昼夜混合" value={nightMix} min={0} max={100} unit="%" disabled={!hasNightPalette} onChange={setNightMix} />
                      <ToolSlider label="亮度" value={brightness} min={25} max={200} unit="%" onChange={setBrightness} />
                      <ToolSlider label="饱和度" value={saturation} min={0} max={200} unit="%" onChange={setSaturation} />
                      <ToolSlider label="对比度" value={contrast} min={25} max={200} unit="%" onChange={setContrast} />
                    </div>
                  </section>

                  {inspection.kind === 'sprite' && (
                    <section className="resource-tool-card animation-player">
                      <header>
                        <span className="tool-card-icon"><Play size={15} /></span>
                        <span><strong>动画播放器</strong><small>{frameCount} 帧 sprite 序列</small></span>
                        <button className={`loop-button ${loop ? 'active' : ''}`} onClick={() => setLoop((value) => !value)}><Repeat2 size={13} />循环</button>
                      </header>
                      <div className="player-transport">
                        <button className="play-button" disabled={frameCount <= 1} onClick={togglePlayback}>{playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}</button>
                        <button className="icon-button" disabled={frame <= 0} onClick={() => { setPlaying(false); setFrame((value) => Math.max(0, value - 1)) }}><ChevronLeft size={15} /></button>
                        <input aria-label="动画帧" type="range" min={0} max={Math.max(0, frameCount - 1)} value={frame} disabled={frameCount <= 1} onChange={(event) => setFrame(Number(event.target.value))} />
                        <button className="icon-button" disabled={frame >= frameCount - 1} onClick={() => { setPlaying(false); setFrame((value) => Math.min(frameCount - 1, value + 1)) }}><ChevronRight size={15} /></button>
                        <output>{frame + 1} / {frameCount}</output>
                      </div>
                      <ToolSlider label="播放速度" value={fps} min={1} max={24} unit=" FPS" onChange={setFps} />
                    </section>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
