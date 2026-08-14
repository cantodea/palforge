import {
  Archive,
  ArrowDown,
  ArrowUp,
  CopyPlus,
  Download,
  FileDown,
  FileUp,
  Film,
  ImagePlus,
  LoaderCircle,
  LockKeyhole,
  Palette,
  PackagePlus,
  Pause,
  Play,
  Plus,
  Repeat2,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  addForgeAnimationFrames,
  createForgeAnimationDraft,
  createForgeAnimationPack,
  duplicateForgeAnimationFrame,
  getForgeSpriteSheetLayout,
  mergeForgeAnimationDrafts,
  moveForgeAnimationFrame,
  parseForgeAnimationPack,
  removeForgeAnimationFrame,
  updateForgeAnimation,
  updateForgeAnimationFrame,
  type ForgeAnimationDraft,
  type ForgeAnimationFrame,
  type ForgeAnimationFrameInput,
} from '../core/animationProject'
import { formatBytes, readMkfChunk } from '../core/mkf'
import { collectImportableOriginalFrames, createDerivedOriginalAnimation } from '../core/originalAnimation'
import { grayscalePalette } from '../core/palette'
import { inspectChunk, type GameProfile } from '../core/resourceDecoder'
import { indexedToRgba } from '../core/rle'
import type { ImportedResource, IndexedImage, PalPalette } from '../types'

type AnimationForgeProps = {
  animations: ForgeAnimationDraft[]
  selectedId: string
  resources: ImportedResource[]
  palettes: PalPalette[]
  profile: GameProfile
  preferredPaletteKey: string
  onAnimations: (animations: ForgeAnimationDraft[]) => void
  onSelect: (id: string) => void
  onOpenOriginal: (path: string) => void
  onToast: (message: string) => void
}

const ORIGINAL_VISUAL_ARCHIVE = /^(ABC|BALL|F|FBP|FIRE|MGO|RGM|RNG)\.MKF$/i
const DIRECT_IMPORT_ARCHIVE = /^(ABC|BALL|F|FBP|FIRE|MGO|RGM)\.MKF$/i

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function downloadJson(value: unknown, filename: string) {
  downloadBlob(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }), filename)
}

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error(`${file.name} 读取结果不是 Data URL`))
    reader.onerror = () => reject(reader.error ?? new Error(`无法读取 ${file.name}`))
    reader.readAsDataURL(file)
  })
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('图像解码失败'))
    image.src = source
  })
}

function indexedImageToPngDataUrl(image: IndexedImage, palette: PalPalette): string {
  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('浏览器无法建立原版帧转换画布')
  context.putImageData(new ImageData(indexedToRgba(image, palette), image.width, image.height), 0, 0)
  return canvas.toDataURL('image/png')
}

async function filesToFrames(files: File[]): Promise<ForgeAnimationFrameInput[]> {
  const sorted = [...files].sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }))
  return Promise.all(sorted.map(async (file) => {
    if (!file.type.startsWith('image/') && !/\.(?:png|webp|jpe?g)$/i.test(file.name)) throw new Error(`${file.name} 不是浏览器支持的图像`)
    const dataUrl = await readDataUrl(file)
    const image = await loadImage(dataUrl)
    if (image.naturalWidth > 8192 || image.naturalHeight > 8192) throw new Error(`${file.name} 超过单帧 8192 × 8192 限制`)
    return {
      name: file.name,
      dataUrl,
      width: image.naturalWidth,
      height: image.naturalHeight,
      durationMs: 120,
      anchorX: Math.floor(image.naturalWidth / 2),
      anchorY: Math.max(0, image.naturalHeight - 1),
    }
  }))
}

function replaceAnimation(animations: ForgeAnimationDraft[], updated: ForgeAnimationDraft): ForgeAnimationDraft[] {
  return animations.map((animation) => animation.id === updated.id ? updated : animation)
}

export function AnimationForge({
  animations,
  selectedId,
  resources,
  palettes,
  profile,
  preferredPaletteKey,
  onAnimations,
  onSelect,
  onOpenOriginal,
  onToast,
}: AnimationForgeProps) {
  const selected = animations.find((animation) => animation.id === selectedId) ?? animations[0]
  const [frameId, setFrameId] = useState('')
  const [playing, setPlaying] = useState(false)
  const [originalImportOpen, setOriginalImportOpen] = useState(false)
  const [originalResourcePath, setOriginalResourcePath] = useState('')
  const [originalChunkIndex, setOriginalChunkIndex] = useState(0)
  const [originalChunkQuery, setOriginalChunkQuery] = useState('')
  const [originalPaletteKey, setOriginalPaletteKey] = useState('')
  const [originalImporting, setOriginalImporting] = useState(false)
  const [originalImportError, setOriginalImportError] = useState('')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const newImagesRef = useRef<HTMLInputElement>(null)
  const appendImagesRef = useRef<HTMLInputElement>(null)
  const packInputRef = useRef<HTMLInputElement>(null)

  const selectedFrameIndex = selected ? Math.max(0, selected.frames.findIndex((frame) => frame.id === frameId)) : 0
  const selectedFrame = selected?.frames[selectedFrameIndex]
  const originalResources = useMemo(() => resources.filter((resource) => resource.kind === 'mkf' && ORIGINAL_VISUAL_ARCHIVE.test(resource.name)), [resources])
  const originalResource = originalResources.find((resource) => resource.path === originalResourcePath) ?? originalResources[0]
  const originalChunks = useMemo(() => (originalResource?.chunkIndex ?? []).filter((chunk) => {
    if (chunk.size === 0) return false
    const query = originalChunkQuery.trim().replace(/^#/, '')
    return !query || String(chunk.index).includes(query) || String(chunk.index).padStart(4, '0').includes(query)
  }), [originalChunkQuery, originalResource?.chunkIndex])
  const originalPaletteOptions = palettes.length > 0 ? palettes : [grayscalePalette()]
  const resolvedOriginalPaletteKey = originalPaletteOptions.some((palette) => `${palette.index}:${palette.variant}` === originalPaletteKey)
    ? originalPaletteKey
    : `${originalPaletteOptions[0].index}:${originalPaletteOptions[0].variant}`

  useEffect(() => {
    if (selected && selected.id !== selectedId) onSelect(selected.id)
  }, [onSelect, selected, selectedId])

  useEffect(() => {
    if (!selected) {
      setFrameId('')
      setPlaying(false)
      return
    }
    if (!selected.frames.some((frame) => frame.id === frameId)) setFrameId(selected.frames[0]?.id ?? '')
  }, [frameId, selected])

  useEffect(() => {
    if (!playing || !selected || selected.frames.length <= 1 || !selectedFrame) return
    const timer = window.setTimeout(() => {
      const next = selectedFrameIndex + 1
      if (next >= selected.frames.length) {
        if (selected.loop) setFrameId(selected.frames[0].id)
        else setPlaying(false)
      } else setFrameId(selected.frames[next].id)
    }, selectedFrame.durationMs)
    return () => window.clearTimeout(timer)
  }, [playing, selected, selectedFrame, selectedFrameIndex])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return
    if (!selectedFrame) {
      canvas.width = 320
      canvas.height = 240
      context.clearRect(0, 0, canvas.width, canvas.height)
      return
    }
    const stageWidth = Math.max(320, selectedFrame.width + 96)
    const stageHeight = Math.max(240, selectedFrame.height + 96)
    canvas.width = stageWidth
    canvas.height = stageHeight
    const image = new Image()
    image.onload = () => {
      context.clearRect(0, 0, stageWidth, stageHeight)
      const anchorStageX = Math.floor(stageWidth / 2)
      const anchorStageY = Math.floor(stageHeight * 0.72)
      context.imageSmoothingEnabled = false
      context.drawImage(image, anchorStageX - selectedFrame.anchorX, anchorStageY - selectedFrame.anchorY)
      context.strokeStyle = 'rgba(227, 174, 88, .7)'
      context.beginPath()
      context.moveTo(anchorStageX - 8, anchorStageY)
      context.lineTo(anchorStageX + 8, anchorStageY)
      context.moveTo(anchorStageX, anchorStageY - 8)
      context.lineTo(anchorStageX, anchorStageY + 8)
      context.stroke()
    }
    image.src = selectedFrame.dataUrl
  }, [selectedFrame])

  const createTemplate = () => {
    const animation = createForgeAnimationDraft('新建动画', animations)
    onAnimations([...animations, animation])
    onSelect(animation.id)
    onToast(`已创建 ${animation.uri}`)
  }

  const selectOriginalArchive = (path: string) => {
    const resource = originalResources.find((candidate) => candidate.path === path)
    setOriginalResourcePath(path)
    setOriginalChunkIndex(resource?.chunkIndex?.find((chunk) => chunk.size > 0)?.index ?? 0)
    setOriginalChunkQuery('')
    setOriginalImportError('')
  }

  const openOriginalImporter = (path?: string) => {
    const resource = originalResources.find((candidate) => candidate.path === path) ?? originalResources[0]
    if (!resource) {
      onToast('请先挂载包含 MGO、FIRE、BALL 等文件的 PAL 游戏目录')
      return
    }
    const preferred = originalPaletteOptions.some((palette) => `${palette.index}:${palette.variant}` === preferredPaletteKey)
      ? preferredPaletteKey
      : `${originalPaletteOptions[0].index}:${originalPaletteOptions[0].variant}`
    setOriginalResourcePath(resource.path)
    setOriginalChunkIndex(resource.chunkIndex?.find((chunk) => chunk.size > 0)?.index ?? 0)
    setOriginalChunkQuery('')
    setOriginalPaletteKey(preferred)
    setOriginalImportError('')
    setOriginalImportOpen(true)
  }

  const importOriginalChunk = async () => {
    if (!originalResource?.file || !originalResource.chunkIndex) return
    if (!DIRECT_IMPORT_ARCHIVE.test(originalResource.name)) {
      setOriginalImportError('RNG 使用增量动画格式；当前解码器尚不能安全复制它的完整帧序列')
      return
    }
    const chunk = originalResource.chunkIndex[originalChunkIndex]
    if (!chunk || chunk.size === 0) {
      setOriginalImportError(`${originalResource.name} 不存在非空 chunk #${originalChunkIndex}`)
      return
    }
    setOriginalImporting(true)
    setOriginalImportError('')
    try {
      const buffer = await originalResource.file.slice(chunk.offset, chunk.offset + chunk.size).arrayBuffer()
      const raw = readMkfChunk(buffer, { ...chunk, offset: 0 })
      const inspection = inspectChunk(raw, originalResource.name, chunk.index, profile)
      const sources = collectImportableOriginalFrames(inspection)
      const palette = originalPaletteOptions.find((candidate) => `${candidate.index}:${candidate.variant}` === resolvedOriginalPaletteKey) ?? grayscalePalette()
      const rendered = sources.map((source) => indexedImageToPngDataUrl(source.image, palette))
      const animation = createDerivedOriginalAnimation(inspection, rendered, animations)
      onAnimations([...animations, animation])
      onSelect(animation.id)
      setFrameId(animation.frames[0]?.id ?? '')
      setOriginalImportOpen(false)
      onToast(`已从 ${animation.source.originalUri} 复制 ${animation.frames.length} 帧；原版保持只读`)
    } catch (error) {
      setOriginalImportError(error instanceof Error ? error.message : String(error))
    } finally {
      setOriginalImporting(false)
    }
  }

  const importImages = async (files: File[], append: boolean) => {
    if (!files.length) return
    try {
      const frames = await filesToFrames(files)
      const base = append && selected ? selected : createForgeAnimationDraft(files[0].name.replace(/\.[^.]+$/, ''), animations)
      const updated = addForgeAnimationFrames(base, frames)
      onAnimations(append && selected ? replaceAnimation(animations, updated) : [...animations, updated])
      onSelect(updated.id)
      setFrameId(updated.frames[append && selected ? selected.frames.length : 0]?.id ?? '')
      onToast(`已导入 ${frames.length} 帧到 ${updated.uri}`)
    } catch (error) {
      onToast(error instanceof Error ? error.message : String(error))
    }
  }

  const importPack = async (file: File | undefined) => {
    if (!file) return
    try {
      const imported = parseForgeAnimationPack(JSON.parse(await file.text()))
      if (imported.length === 0) throw new Error('不是有效的 PalForge 动画包，或包内帧数据损坏')
      onAnimations(mergeForgeAnimationDrafts(animations, imported))
      onSelect(imported[0].id)
      onToast(`已导入动画包 · ${imported.length} 个工程动画`)
    } catch (error) {
      onToast(error instanceof Error ? error.message : String(error))
    }
  }

  const updateSelected = (updated: ForgeAnimationDraft) => onAnimations(replaceAnimation(animations, updated))

  const exportPack = () => {
    if (!selected) return
    downloadJson(createForgeAnimationPack([selected]), `${selected.id}.palforge-animation.json`)
    onToast('工程动画包已导出；原版资源未包含在包内')
  }

  const exportSpriteSheet = async () => {
    if (!selected || selected.frames.length === 0) return
    const layout = getForgeSpriteSheetLayout(selected.frames)
    const canvas = document.createElement('canvas')
    canvas.width = layout.width
    canvas.height = layout.height
    const context = canvas.getContext('2d')
    if (!context) return
    context.imageSmoothingEnabled = false
    const images = await Promise.all(selected.frames.map((frame) => loadImage(frame.dataUrl)))
    selected.frames.forEach((frame, index) => {
      const column = index % layout.columns
      const row = Math.floor(index / layout.columns)
      context.drawImage(images[index], column * layout.cellWidth, row * layout.cellHeight)
    })
    canvas.toBlob((blob) => {
      if (blob) downloadBlob(blob, `${selected.id}.png`)
    }, 'image/png')
    downloadJson({
      format: 'palforge-sprite-sheet',
      version: 1,
      animation: selected.uri,
      image: `${selected.id}.png`,
      loop: selected.loop,
      ...layout,
      frames: selected.frames.map((frame, index) => ({
        id: frame.id,
        name: frame.name,
        x: (index % layout.columns) * layout.cellWidth,
        y: Math.floor(index / layout.columns) * layout.cellHeight,
        width: frame.width,
        height: frame.height,
        durationMs: frame.durationMs,
        anchorX: frame.anchorX,
        anchorY: frame.anchorY,
      })),
    }, `${selected.id}.sheet.json`)
    onToast('精灵表 PNG 与布局清单已导出')
  }

  const deleteSelected = () => {
    if (!selected || !window.confirm(`删除工程动画“${selected.name}”？原版资源不会受到影响。`)) return
    const next = animations.filter((animation) => animation.id !== selected.id)
    onAnimations(next)
    onSelect(next[0]?.id ?? '')
  }

  const patchFrame = (patch: Partial<Pick<ForgeAnimationFrame, 'name' | 'durationMs' | 'anchorX' | 'anchorY'>>) => {
    if (!selected || !selectedFrame) return
    updateSelected(updateForgeAnimationFrame(selected, selectedFrame.id, patch))
  }

  return (
    <div className="workspace-view animation-forge-view">
      <input ref={newImagesRef} hidden type="file" multiple accept="image/png,image/webp,image/jpeg" onChange={(event) => { const files = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = ''; void importImages(files, false) }} />
      <input ref={appendImagesRef} hidden type="file" multiple accept="image/png,image/webp,image/jpeg" onChange={(event) => { const files = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = ''; void importImages(files, true) }} />
      <input ref={packInputRef} hidden type="file" accept=".palforge-animation.json,.json,application/json" onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; void importPack(file) }} />

      <div className="view-titlebar animation-titlebar">
        <div><span className="view-icon violet"><Film size={18} /></span><div><strong>Animation Forge</strong><small>原版只读引用 + project:// 工程动画</small></div></div>
        <div>
          <button className="toolbar-button original-import-button" disabled={originalResources.length === 0} onClick={() => openOriginalImporter()}><Archive size={14} /> 导入原版资源</button>
          <button className="toolbar-button" onClick={() => packInputRef.current?.click()}><FileUp size={14} /> 导入动画包</button>
          <button className="toolbar-button" onClick={() => newImagesRef.current?.click()}><ImagePlus size={14} /> 导入图片为动画</button>
          <button className="primary-button" onClick={createTemplate}><Plus size={14} /> 新建模板</button>
        </div>
      </div>

      <div className="animation-forge-layout">
        <aside className="animation-library-panel">
          <section>
            <header><span><LockKeyhole size={13} /> 原版素材</span><i>READ ONLY</i></header>
            <p>点击归档可浏览原件；“导入原版资源”会复制指定 chunk 到 project:// 工程层。</p>
            <div className="animation-source-list">
              {originalResources.length ? originalResources.map((resource) => (
                <button key={resource.path} onClick={() => onOpenOriginal(resource.path)}>
                  <Archive size={14} /><span><strong>{resource.name}</strong><small>pal://archives/{resource.name.toLowerCase()}</small></span><em>{resource.chunks ?? 0}</em>
                </button>
              )) : <div className="animation-list-empty">挂载游戏目录后可在这里打开 MGO/RNG 等原版资源。</div>}
            </div>
          </section>
          <section className="project-animation-section">
            <header><span><Film size={13} /> 工程动画</span><i>WRITABLE</i></header>
            <div className="animation-source-list">
              {animations.map((animation) => (
                <button key={animation.id} className={animation.id === selected?.id ? 'active' : ''} onClick={() => onSelect(animation.id)}>
                  <Film size={14} /><span><strong>{animation.name}</strong><small>{animation.uri}</small></span><em>{animation.frames.length}F</em>
                </button>
              ))}
              {animations.length === 0 && <div className="animation-list-empty">新建空模板，或按文件名顺序导入一组 PNG/WebP/JPEG。</div>}
            </div>
          </section>
          <div className="animation-separation-note"><LockKeyhole size={14} /><span><strong>双层资源协议</strong><small>pal:// 永久只读；project:// 才能编辑、保存和导出。</small></span></div>
        </aside>

        <section className="animation-editor-stage">
          {selected ? <>
            <div className="animation-stage-toolbar">
              <span><b>{selected.name}</b><code>{selected.uri}</code></span>
              <div>
                <button className="toolbar-button" onClick={() => appendImagesRef.current?.click()}><PackagePlus size={14} /> 添加帧</button>
                <button className="toolbar-button" disabled={selected.frames.length === 0} onClick={exportSpriteSheet}><Download size={14} /> 导出精灵表</button>
                <button className="primary-button" onClick={exportPack}><FileDown size={14} /> 导出动画包</button>
              </div>
            </div>
            <div className="animation-canvas-stage">
              <div className="animation-checker"><canvas ref={canvasRef} /></div>
              {!selectedFrame && <div className="animation-empty-frame"><ImagePlus size={29} /><strong>模板尚无帧</strong><span>点击“添加帧”导入透明 PNG/WebP/JPEG。</span></div>}
              {selectedFrame && <div className="animation-frame-readout">{selectedFrame.width} × {selectedFrame.height} · {selectedFrame.durationMs}ms · anchor {selectedFrame.anchorX},{selectedFrame.anchorY}</div>}
            </div>
            <div className="animation-playback-bar">
              <button className="play-button" disabled={selected.frames.length <= 1} onClick={() => setPlaying((value) => !value)}>{playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}</button>
              <button className={`loop-button ${selected.loop ? 'active' : ''}`} onClick={() => updateSelected(updateForgeAnimation(selected, { loop: !selected.loop }))}><Repeat2 size={13} /> 循环</button>
              <input type="range" min={0} max={Math.max(0, selected.frames.length - 1)} value={selectedFrameIndex} disabled={selected.frames.length <= 1} onChange={(event) => { setPlaying(false); setFrameId(selected.frames[Number(event.target.value)]?.id ?? '') }} />
              <output>{selected.frames.length ? selectedFrameIndex + 1 : 0} / {selected.frames.length}</output>
            </div>
            <div className="animation-timeline">
              {selected.frames.map((frame, index) => (
                <button key={frame.id} className={frame.id === selectedFrame?.id ? 'active' : ''} onClick={() => { setPlaying(false); setFrameId(frame.id) }}>
                  <span><img src={frame.dataUrl} alt="" /></span><b>{String(index + 1).padStart(2, '0')}</b><small>{frame.durationMs}ms</small>
                </button>
              ))}
            </div>
          </> : <div className="animation-welcome"><span><Film size={36} /></span><h2>建立工程层动画</h2><p>从图片创建全新动画；原版资源仍停留在只读层，二者以后通过统一资源 URI 被场景和事件共同引用。</p><div><button className="primary-button" onClick={createTemplate}><Plus size={14} /> 新建动画模板</button><button className="toolbar-button" onClick={() => newImagesRef.current?.click()}><ImagePlus size={14} /> 导入图片帧</button></div></div>}
        </section>

        <aside className="animation-inspector-panel">
          {selected ? <>
            <div className="animation-inspector-heading"><span className="eyebrow">PROJECT ANIMATION</span><strong>{selected.name}</strong><code>{selected.uri}</code></div>
            <label className="field"><span>动画名称</span><input value={selected.name} onChange={(event) => updateSelected(updateForgeAnimation(selected, { name: event.target.value }))} /></label>
            <label className="field"><span>资源来源</span><input value={selected.source.kind === 'custom' ? '自定义工程资源' : `派生自 ${selected.source.originalUri}`} readOnly /></label>
            <label className="field switch-field"><span><b>循环播放</b><small>导出到清单的默认播放策略</small></span><input type="checkbox" checked={selected.loop} onChange={(event) => updateSelected(updateForgeAnimation(selected, { loop: event.target.checked }))} /></label>
            {selectedFrame ? <div className="animation-frame-inspector">
              <div className="animation-frame-card"><span>{selectedFrameIndex + 1}</span><div><strong>{selectedFrame.name}</strong><small>{selectedFrame.id}</small></div></div>
              <label className="field"><span>帧名称</span><input value={selectedFrame.name} onChange={(event) => patchFrame({ name: event.target.value })} /></label>
              <label className="field"><span>持续时间（ms）</span><input type="number" min={16} max={60000} value={selectedFrame.durationMs} onChange={(event) => patchFrame({ durationMs: Math.min(60000, Math.max(16, Math.round(Number(event.target.value) || 16))) })} /></label>
              <div className="field-row"><label className="field"><span>锚点 X</span><input type="number" min={-8192} max={8192} value={selectedFrame.anchorX} onChange={(event) => patchFrame({ anchorX: Math.min(8192, Math.max(-8192, Math.round(Number(event.target.value) || 0))) })} /></label><label className="field"><span>锚点 Y</span><input type="number" min={-8192} max={8192} value={selectedFrame.anchorY} onChange={(event) => patchFrame({ anchorY: Math.min(8192, Math.max(-8192, Math.round(Number(event.target.value) || 0))) })} /></label></div>
              <div className="animation-frame-actions">
                <button className="icon-button" title="前移" disabled={selectedFrameIndex === 0} onClick={() => updateSelected(moveForgeAnimationFrame(selected, selectedFrame.id, -1))}><ArrowUp size={14} /></button>
                <button className="icon-button" title="后移" disabled={selectedFrameIndex === selected.frames.length - 1} onClick={() => updateSelected(moveForgeAnimationFrame(selected, selectedFrame.id, 1))}><ArrowDown size={14} /></button>
                <button className="toolbar-button" onClick={() => updateSelected(duplicateForgeAnimationFrame(selected, selectedFrame.id))}><CopyPlus size={14} /> 复制帧</button>
                <button className="icon-button danger-button" title="删除帧" onClick={() => updateSelected(removeForgeAnimationFrame(selected, selectedFrame.id))}><Trash2 size={14} /></button>
              </div>
            </div> : <div className="animation-inspector-empty">导入帧后可以编辑单帧时长和角色脚底锚点。</div>}
            <button className="wide-button danger-button animation-delete" onClick={deleteSelected}><Trash2 size={14} /> 删除工程动画</button>
          </> : <div className="animation-inspector-empty">选择或创建一个 project:// 动画以查看属性。</div>}
        </aside>
      </div>

      {originalImportOpen && <div className="original-import-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !originalImporting) setOriginalImportOpen(false) }}>
        <section className="original-import-dialog">
          <header>
            <div><span><Archive size={17} /></span><div><small>READ-ONLY SOURCE → PROJECT COPY</small><strong>导入原版资源</strong></div></div>
            <button className="icon-button" disabled={originalImporting} onClick={() => setOriginalImportOpen(false)}><X size={15} /></button>
          </header>
          <div className="original-import-body">
            <aside>
              <span className="eyebrow">VISUAL ARCHIVES</span>
              <div>{originalResources.map((resource) => {
                const supported = DIRECT_IMPORT_ARCHIVE.test(resource.name)
                return <button key={resource.path} className={`${resource.path === originalResource?.path ? 'active' : ''} ${supported ? '' : 'unsupported'}`} onClick={() => selectOriginalArchive(resource.path)}>
                  <Archive size={14} /><span><strong>{resource.name}</strong><small>{supported ? '可复制为工程帧' : '增量格式待支持'}</small></span><em>{resource.chunkIndex?.length ?? 0}</em>
                </button>
              })}</div>
            </aside>
            <main>
              <div className="original-import-heading">
                <span><strong>{originalResource?.name ?? '未选择归档'}</strong><code>pal://archives/{originalResource?.name.toUpperCase() ?? 'UNKNOWN'}/chunks/{originalChunkIndex}</code></span>
                <i className={DIRECT_IMPORT_ARCHIVE.test(originalResource?.name ?? '') ? '' : 'unsupported'}>{DIRECT_IMPORT_ARCHIVE.test(originalResource?.name ?? '') ? 'COPY SUPPORTED' : 'NOT YET DECODABLE'}</i>
              </div>
              <div className="original-import-fields">
                <label className="field"><span>Chunk 编号</span><input type="number" min={0} max={Math.max(0, (originalResource?.chunkIndex?.length ?? 1) - 1)} value={originalChunkIndex} onChange={(event) => { setOriginalChunkIndex(Math.max(0, Math.round(Number(event.target.value) || 0))); setOriginalImportError('') }} /></label>
                <label className="field"><span><Palette size={12} /> 烘焙调色板</span><select value={resolvedOriginalPaletteKey} onChange={(event) => setOriginalPaletteKey(event.target.value)}>{originalPaletteOptions.map((palette) => <option key={`${palette.index}:${palette.variant}`} value={`${palette.index}:${palette.variant}`}>{palette.index < 0 ? '灰度回退' : `PAT #${palette.index} · ${palette.variant === 'night' ? '夜间' : '日间'}`}</option>)}</select></label>
              </div>
              <label className="original-chunk-search"><Search size={13} /><input value={originalChunkQuery} onChange={(event) => setOriginalChunkQuery(event.target.value)} placeholder="搜索 chunk 编号…" /></label>
              <div className="original-chunk-list">
                {originalChunks.map((chunk) => <button key={chunk.index} className={chunk.index === originalChunkIndex ? 'active' : ''} onClick={() => { setOriginalChunkIndex(chunk.index); setOriginalImportError('') }}><span><b>#{String(chunk.index).padStart(4, '0')}</b><small>0x{chunk.offset.toString(16).padStart(8, '0')}</small></span><em>{formatBytes(chunk.size)}</em></button>)}
                {originalChunks.length === 0 && <div><Search size={20} /><span>没有符合条件的非空 chunk</span></div>}
              </div>
              <div className={`original-import-note ${originalImportError ? 'error' : ''}`}>
                {originalImportError
                  ? <><strong>无法导入</strong><span>{originalImportError}</span></>
                  : DIRECT_IMPORT_ARCHIVE.test(originalResource?.name ?? '')
                    ? <><strong>将建立独立工程副本</strong><span>sprite 会复制全部可解码帧；RLE/FBP 会成为单帧动画。颜色按当前调色板烘焙为 PNG，源 MKF 不会改变。</span></>
                    : <><strong>RNG 暂时只可浏览</strong><span>RNG 需要增量帧合成器，不能把未还原的数据冒充完整动画帧。</span></>}
              </div>
            </main>
          </div>
          <footer>
            <span><LockKeyhole size={13} /> 原版永久只读；导入结果保存到 project://</span>
            <div><button className="toolbar-button" disabled={originalImporting} onClick={() => setOriginalImportOpen(false)}>取消</button><button className="primary-button" disabled={originalImporting || !DIRECT_IMPORT_ARCHIVE.test(originalResource?.name ?? '')} onClick={() => void importOriginalChunk()}>{originalImporting ? <LoaderCircle className="spin" size={14} /> : <CopyPlus size={14} />} 复制到动画工程</button></div>
          </footer>
        </section>
      </div>}
    </div>
  )
}
