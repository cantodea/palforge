import type { IndexedImage, PalPalette } from '../types'
import { isForgeAnimationBinding, type ForgeAnimationBinding, type ForgeAnimationDraft, type ForgeAnimationFrame } from './animationProject'
import { readU16 } from './binary'
import { encodeMkf, parseMkfIndex, readMkfChunk } from './mkf'
import { encodeSprite, encodeYj1, quantizeAnimationFrame, type RgbaFrame } from './palEncoder'
import { decompressPalChunk, type GameProfile } from './resourceDecoder'
import { decodeSprite } from './sprite'
import { encodeYj2 } from './yj2'

export type RuntimeReplacementReport = {
  animationName: string
  archive: string
  chunkIndex: number
  sourceFrames: number
  runtimeFrames: number
  compression: 'YJ_1' | 'YJ_2'
  encodedBytes: number
}

export function inspectRuntimeSprite(raw: Uint8Array, archive: string, profile: GameProfile) {
  const decoded = decompressPalChunk(raw, archive, profile)
  if (decoded.compression === 'none') throw new Error(`${archive} 的目标不是有效的 YJ_1/YJ_2 精灵，请检查 chunk 或游戏版本`)
  const frames = decodeSprite(decoded.payload)
  const frameCount = readU16(decoded.payload, 0) - 1
  if (frames.length !== frameCount || frames.some((frame, index) => frame.index !== index)) {
    throw new Error(`${archive} 目标精灵含有损坏或缺失帧，无法安全建立替换映射`)
  }
  return { frameCount, compression: decoded.compression }
}

export function runtimeFrameIndices(sourceCount: number, targetCount: number, mapping: ForgeAnimationBinding['frameMapping']): number[] {
  if (sourceCount < 1) throw new Error('工程动画还没有图片帧')
  if (mapping === 'exact' && sourceCount !== targetCount) {
    throw new Error(`帧数不匹配：自定义 ${sourceCount} 帧，原版 ${targetCount} 帧。请补齐帧，或明确选择“循环填满原版帧位”`)
  }
  if (sourceCount > targetCount) throw new Error(`自定义 ${sourceCount} 帧超过原版 ${targetCount} 个帧位；请减少帧数，不能静默丢弃图片`)
  return Array.from({ length: targetCount }, (_, index) => index % sourceCount)
}

export async function decodeAnimationFrame(frame: ForgeAnimationFrame): Promise<RgbaFrame> {
  if (!/^data:image\/(?:png|webp|jpeg);base64,/i.test(frame.dataUrl)) throw new Error(`${frame.name} 不是有效的本地图片帧`)
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image()
    element.onload = () => resolve(element)
    element.onerror = () => reject(new Error(`无法解码 ${frame.name}，请重新导入图片`))
    element.src = frame.dataUrl
  })
  if (image.naturalWidth !== frame.width || image.naturalHeight !== frame.height) throw new Error(`${frame.name} 图片尺寸不匹配，请重新导入`)
  if (frame.width > 512 || frame.height > 512) throw new Error(`${frame.name} 超过实机单帧 512×512 限制`)
  const canvas = document.createElement('canvas')
  canvas.width = frame.width
  canvas.height = frame.height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('无法创建动画转换画布')
  context.drawImage(image, 0, 0)
  return { width: frame.width, height: frame.height, data: context.getImageData(0, 0, frame.width, frame.height).data }
}

/** Compile all enabled bindings atomically. A failed binding prevents launch,
 * rather than silently falling back to original art. Unchanged files retain
 * their File identity, and untouched chunks retain their original bytes. */
export async function prepareAnimationRuntime(options: {
  files: File[]
  animations: ForgeAnimationDraft[]
  palettes: PalPalette[]
  profile: GameProfile
  decodeFrame?: (frame: ForgeAnimationFrame) => Promise<RgbaFrame>
  onProgress?: (message: string) => void
}): Promise<{ files: File[]; replacements: RuntimeReplacementReport[] }> {
  const { files, palettes, profile } = options
  const decode = options.decodeFrame ?? decodeAnimationFrame
  const enabled = options.animations.filter((animation) => animation.runtimeBinding?.enabled)
  const targets = new Set<string>()
  const archives = new Map<string, { source: File; chunks: Uint8Array[] }>()
  const replacements: RuntimeReplacementReport[] = []
  for (const animation of enabled) {
    const binding = animation.runtimeBinding!
    if (!isForgeAnimationBinding(binding)) throw new Error(`${animation.name} 的实机绑定无效`)
    const key = `${binding.archive} #${binding.chunkIndex}`
    if (targets.has(key)) throw new Error(`${key} 被多个工程动画同时绑定，请只启用一个`)
    targets.add(key)
    const matching = files.filter((file) => file.name.toUpperCase() === binding.archive)
    if (matching.length !== 1) throw new Error(`${key} 需要唯一的 ${binding.archive} 文件，请重新挂载完整游戏目录`)
  }
  for (const animation of enabled) {
    const binding = animation.runtimeBinding!
    const label = `${animation.name} → ${binding.archive} #${binding.chunkIndex}`
    options.onProgress?.(`正在转换 ${label}`)
    try {
      let archive = archives.get(binding.archive)
      if (!archive) {
        const source = files.find((file) => file.name.toUpperCase() === binding.archive)!
        const buffer = await source.arrayBuffer()
        archive = { source, chunks: parseMkfIndex(buffer).map((chunk) => readMkfChunk(buffer, chunk)) }
        archives.set(binding.archive, archive)
      }
      const raw = archive.chunks[binding.chunkIndex]
      if (!raw?.length) throw new Error('目标 chunk 不存在或为空')
      const target = inspectRuntimeSprite(raw, binding.archive, profile)
      const indices = runtimeFrameIndices(animation.frames.length, target.frameCount, binding.frameMapping)
      const palette = palettes.find((candidate) => candidate.index === binding.paletteIndex && candidate.variant === binding.paletteVariant)
      if (!palette) throw new Error(`未挂载 PAT #${binding.paletteIndex} ${binding.paletteVariant} 调色板`)
      const frames: IndexedImage[] = []
      for (const frame of animation.frames) frames.push(quantizeAnimationFrame(await decode(frame), frame, palette))
      const sprite = encodeSprite(indices.map((index) => frames[index]))
      const encoded = target.compression === 'YJ_1' ? encodeYj1(sprite) : encodeYj2(sprite)
      archive.chunks[binding.chunkIndex] = encoded
      replacements.push({ animationName: animation.name, archive: binding.archive, chunkIndex: binding.chunkIndex,
        sourceFrames: animation.frames.length, runtimeFrames: indices.length, compression: target.compression, encodedBytes: encoded.length })
    } catch (error) {
      throw new Error(`${label}：${error instanceof Error ? error.message : String(error)}`)
    }
  }
  const compiled = new Map<string, File>()
  for (const [name, archive] of archives) {
    compiled.set(name, new File([encodeMkf(archive.chunks)], archive.source.name, { type: 'application/octet-stream', lastModified: archive.source.lastModified }))
  }
  return { files: files.map((file) => compiled.get(file.name.toUpperCase()) ?? file), replacements }
}
