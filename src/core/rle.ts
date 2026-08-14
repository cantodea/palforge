import type { IndexedImage, PalPalette } from '../types'
import { readU16 } from './binary'

export class RleFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RleFormatError'
  }
}

export function rleHeaderOffset(bytes: Uint8Array): number {
  return bytes.length >= 8 && bytes[0] === 2 && bytes[1] === 0 && bytes[2] === 0 && bytes[3] === 0 ? 4 : 0
}

export function looksLikeRle(bytes: Uint8Array): boolean {
  try {
    const offset = rleHeaderOffset(bytes)
    if (offset + 5 > bytes.length) return false
    const width = readU16(bytes, offset)
    const height = readU16(bytes, offset + 2)
    return width > 0 && height > 0 && width <= 4096 && height <= 4096 && width * height <= 16_777_216
  } catch {
    return false
  }
}

export function decodeRle(bytes: Uint8Array): IndexedImage {
  const header = rleHeaderOffset(bytes)
  if (!looksLikeRle(bytes)) throw new RleFormatError('数据不是有效的 PAL RLE 图像')
  const width = readU16(bytes, header)
  const height = readU16(bytes, header + 2)
  const total = width * height
  const pixels = new Uint8Array(total)
  const alpha = new Uint8Array(total)
  let source = header + 4
  let destination = 0

  while (destination < total) {
    if (source >= bytes.length) throw new RleFormatError(`RLE 数据提前结束：已还原 ${destination}/${total} 像素`)
    const command = bytes[source++]
    if ((command & 0x80) !== 0 && command <= 0x80 + width) {
      const transparent = command - 0x80
      destination += transparent
      if (destination > total) throw new RleFormatError('RLE 透明游程越过图像边界')
      continue
    }

    if (command === 0) throw new RleFormatError('RLE 包含零长度像素游程')
    if (source + command > bytes.length || destination + command > total) throw new RleFormatError('RLE 像素游程超出数据边界')
    pixels.set(bytes.subarray(source, source + command), destination)
    alpha.fill(255, destination, destination + command)
    source += command
    destination += command
  }

  return { width, height, pixels, alpha }
}

export function indexedToRgba(image: IndexedImage, palette: PalPalette): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(image.width * image.height * 4)
  for (let index = 0; index < image.pixels.length; index += 1) {
    const color = palette.colors[image.pixels[index]]
    const target = index * 4
    rgba[target] = color.r
    rgba[target + 1] = color.g
    rgba[target + 2] = color.b
    rgba[target + 3] = image.alpha[index]
  }
  return rgba
}

export function decodeFbp(bytes: Uint8Array): IndexedImage {
  if (bytes.length !== 320 * 200) throw new RleFormatError('FBP 必须正好包含 320×200 个索引像素')
  return { width: 320, height: 200, pixels: bytes.slice(), alpha: new Uint8Array(bytes.length).fill(255) }
}
