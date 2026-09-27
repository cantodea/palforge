import type { IndexedImage, PalPalette } from '../types'
import type { ForgeAnimationFrame } from './animationProject'

export type RgbaFrame = { width: number; height: number; data: Uint8ClampedArray }

/** PAL has binary transparency and indexed colour. Preserve the authored foot
 * anchor by padding; refuse an anchor above the bottom rather than crop art. */
export function quantizeAnimationFrame(
  rgba: RgbaFrame,
  frame: ForgeAnimationFrame,
  palette: PalPalette,
): IndexedImage {
  if (rgba.width !== frame.width || rgba.height !== frame.height || rgba.data.length !== frame.width * frame.height * 4) {
    throw new Error(`${frame.name} 的实际图片尺寸与工程记录不符，请重新导入`)
  }
  if (palette.index < 0 || palette.colors.length !== 256) throw new Error('实机替换需要有效的 PAT 调色板')
  if (!Number.isInteger(frame.anchorX) || !Number.isInteger(frame.anchorY) || frame.anchorY < frame.height - 1) {
    throw new Error(`${frame.name} 的锚点 Y 必须在底边（${frame.height - 1}）或下方；PAL 以底部定位`)
  }
  const halfWidth = Math.max(1, frame.anchorX, frame.width - frame.anchorX)
  const width = halfWidth * 2
  const height = frame.anchorY + 1
  if (width > 512 || height > 512 || width < 1 || height < 1) throw new Error(`${frame.name} 对齐后超过实机单帧 512×512 限制，请缩小图片或锚点偏移`)
  const pixels = new Uint8Array(width * height)
  const alpha = new Uint8Array(width * height)
  const cache = new Map<number, number>()
  const left = halfWidth - frame.anchorX
  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      const source = (y * frame.width + x) * 4
      if (rgba.data[source + 3] < 128) continue
      const r = rgba.data[source], g = rgba.data[source + 1], b = rgba.data[source + 2]
      const rgb = (r << 16) | (g << 8) | b
      let nearest = cache.get(rgb)
      if (nearest === undefined) {
        let distance = Number.POSITIVE_INFINITY
        nearest = 0
        for (let index = 0; index < 256; index += 1) {
          const color = palette.colors[index]
          const candidate = (r - color.r) ** 2 + (g - color.g) ** 2 + (b - color.b) ** 2
          if (candidate < distance) { distance = candidate; nearest = index }
        }
        cache.set(rgb, nearest)
      }
      const destination = y * width + left + x
      pixels[destination] = nearest
      alpha[destination] = 255
    }
  }
  return { width, height, pixels, alpha }
}

export function encodeRle(image: IndexedImage): Uint8Array {
  const { width, height, pixels, alpha } = image
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 512 || height > 512
    || pixels.length !== width * height || alpha.length !== pixels.length) throw new Error('无效的 RLE 图片尺寸')
  // Explicit optional RLE signature, followed by width/height (little endian).
  const bytes = [2, 0, 0, 0, width & 255, width >>> 8, height & 255, height >>> 8]
  for (let y = 0; y < height; y += 1) {
    let cursor = y * width
    const end = cursor + width
    while (cursor < end) {
      const transparent = alpha[cursor] < 128
      const start = cursor
      // Commands >= 128 are ambiguous in PAL: keep literal runs <= 127,
      // and transparent runs <= both 127 and the image width.
      while (cursor < end && cursor - start < 127 && (alpha[cursor] < 128) === transparent) cursor += 1
      bytes.push((transparent ? 128 : 0) + cursor - start)
      if (!transparent) for (let i = start; i < cursor; i += 1) bytes.push(pixels[i])
    }
  }
  return new Uint8Array(bytes)
}

export function encodeSprite(frames: IndexedImage[]): Uint8Array {
  if (frames.length < 1 || frames.length > 4095) throw new Error('PAL sprite 需要 1–4095 帧')
  const encoded = frames.map(encodeRle)
  const size = (frames.length + 1) * 2 + encoded.reduce((total, bytes) => total + bytes.length + (bytes.length & 1), 0)
  if (size > 0xffff * 2) throw new Error('动画超过 PAL sprite 的 16 位偏移上限（约 128 KB），请缩小图片或减少不透明像素')
  const output = new Uint8Array(size)
  const view = new DataView(output.buffer)
  let offset = (frames.length + 1) * 2
  encoded.forEach((bytes, index) => {
    view.setUint16(index * 2, offset / 2, true)
    output.set(bytes, offset)
    offset += bytes.length + (bytes.length & 1)
  })
  view.setUint16(frames.length * 2, offset / 2, true)
  return output
}

/** Stored (uncompressed) YJ_1 blocks are understood by the original engine. */
export function encodeYj1(bytes: Uint8Array): Uint8Array {
  const blockSize = 0x4000
  const blockCount = Math.ceil(bytes.length / blockSize)
  if (blockCount < 1 || blockCount > 0xffff) throw new Error('YJ_1 输入长度无效')
  // Keep a minimal two-leaf Huffman tree, although stored blocks never use it.
  const output = new Uint8Array(20 + blockCount * 4 + bytes.length)
  const view = new DataView(output.buffer)
  output.set([0x59, 0x4a, 0x5f, 0x31])
  view.setUint32(4, bytes.length, true)
  view.setUint32(8, output.length, true)
  view.setUint16(12, blockCount, true)
  output[15] = 1
  output[17] = 1
  let offset = 20
  for (let start = 0; start < bytes.length; start += blockSize) {
    const block = bytes.subarray(start, start + blockSize)
    view.setUint16(offset, block.length, true)
    output.set(block, offset + 4)
    offset += block.length + 4
  }
  return output
}
