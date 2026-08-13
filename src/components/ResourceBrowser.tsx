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
  ScanSearch,
  Sun,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { formatBytes, readMkfChunk, type MkfChunk } from '../core/mkf'
import { grayscalePalette } from '../core/palette'
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
  const [paletteKey, setPaletteKey] = useState('0-day')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const selectedPalette = useMemo(() => {
    const own = inspection?.palettes ?? []
    const available = own.length > 0 ? own : palettes
    return available.find((item) => `${item.index}-${item.variant}` === paletteKey) ?? available[0] ?? grayscalePalette()
  }, [inspection, paletteKey, palettes])

  const image = inspection?.kind === 'sprite'
    ? inspection.frames[Math.min(frame, inspection.frames.length - 1)]?.image
    : inspection?.image

  useEffect(() => {
    setInspection(null)
    setError('')
    setFrame(0)
    setSelectedChunk(-1)
  }, [selected?.path])

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
    try {
      const buffer = await selected.file.slice(chunk.offset, chunk.offset + chunk.size).arrayBuffer()
      const raw = readMkfChunk(buffer, { ...chunk, offset: 0 })
      const result = inspectChunk(raw, selected.name, chunk.index, profile)
      setInspection(result)
      if (result.palettes?.[0]) setPaletteKey(`${result.palettes[0].index}-${result.palettes[0].variant}`)
    } catch (reason) {
      setInspection(null)
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setLoading(false)
    }
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
              <div className="decode-badges"><span>{inspection.compression}</span><span>{kindLabels[inspection.kind]}</span><span>{formatBytes(inspection.raw.length)} → {formatBytes(inspection.payload.length)}</span></div>
              {inspection.kind === 'sprite' && <div className="frame-control"><button className="icon-button" disabled={frame <= 0} onClick={() => setFrame((value) => Math.max(0, value - 1))}><ChevronLeft size={15} /></button><span>帧 {frame + 1} / {inspection.frames.length}</span><button className="icon-button" disabled={frame >= inspection.frames.length - 1} onClick={() => setFrame((value) => Math.min(inspection.frames.length - 1, value + 1))}><ChevronRight size={15} /></button></div>}
              {(image || inspection.kind === 'palette') && (inspection.palettes?.length ?? palettes.length) > 0 && <label className="palette-picker"><Palette size={14} /><select value={paletteKey} onChange={(event) => setPaletteKey(event.target.value)}>{(inspection.palettes ?? palettes).map((item) => <option value={`${item.index}-${item.variant}`} key={`${item.index}-${item.variant}`}>PAT #{item.index} · {item.variant === 'night' ? '夜间' : '日间'}</option>)}</select>{selectedPalette.variant === 'night' ? <Moon size={13} /> : <Sun size={13} />}</label>}
              {inspection.notes.length > 0 && <div className="decode-notes">{inspection.notes.map((note) => <span key={note}>{note}</span>)}</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
