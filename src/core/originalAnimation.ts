import type { IndexedImage } from '../types'
import {
  addForgeAnimationFrames,
  createForgeAnimationDraft,
  type ForgeAnimationDraft,
} from './animationProject'
import type { ChunkInspection } from './resourceDecoder'
import { resourceChunkUri } from './resourceSemantics'

export type ImportableOriginalFrame = {
  sourceIndex: number
  name: string
  image: IndexedImage
}

export function collectImportableOriginalFrames(inspection: ChunkInspection): ImportableOriginalFrame[] {
  const base = `${inspection.archiveName.replace(/\.MKF$/i, '')}-${String(inspection.chunkIndex).padStart(4, '0')}`
  if (inspection.kind === 'sprite' && inspection.frames.length > 0) {
    return inspection.frames.map((frame) => ({
      sourceIndex: frame.index,
      name: `${base}-frame-${String(frame.index).padStart(3, '0')}.png`,
      image: frame.image,
    }))
  }
  if ((inspection.kind === 'rle' || inspection.kind === 'fbp') && inspection.image) {
    return [{ sourceIndex: 0, name: `${base}.png`, image: inspection.image }]
  }
  if (inspection.kind === 'binary' && inspection.archiveName.toUpperCase() === 'RNG.MKF') {
    throw new Error('RNG 是增量动画格式，当前版本尚不能安全复制为工程帧')
  }
  throw new Error(`${inspection.archiveName} #${inspection.chunkIndex} 未识别为可导入的 sprite、RLE 或 FBP 图像`)
}

export function createDerivedOriginalAnimation(
  inspection: ChunkInspection,
  renderedDataUrls: string[],
  animations: ForgeAnimationDraft[] = [],
  now = Date.now(),
): ForgeAnimationDraft {
  const sources = collectImportableOriginalFrames(inspection)
  if (renderedDataUrls.length !== sources.length) throw new Error('原版帧渲染数量与解码结果不一致')
  if (renderedDataUrls.some((dataUrl) => !/^data:image\/png;base64,/i.test(dataUrl))) {
    throw new Error('原版派生帧必须先渲染为工程 PNG')
  }
  const archive = inspection.archiveName.replace(/\.MKF$/i, '').toUpperCase()
  const name = `${archive} #${String(inspection.chunkIndex).padStart(4, '0')} 派生动画`
  const draft = createForgeAnimationDraft(name, animations, now, {
    kind: 'derived',
    originalUri: resourceChunkUri(inspection.archiveName, inspection.chunkIndex),
  })
  return addForgeAnimationFrames(draft, sources.map((source, index) => ({
    name: source.name,
    dataUrl: renderedDataUrls[index],
    width: source.image.width,
    height: source.image.height,
    durationMs: 120,
    anchorX: Math.floor(source.image.width / 2),
    anchorY: Math.max(0, source.image.height - 1),
  })), now)
}
