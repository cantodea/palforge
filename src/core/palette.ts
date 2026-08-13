import type { PalPalette, PaletteColor } from '../types'

export class PaletteFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PaletteFormatError'
  }
}

function colorsAt(bytes: Uint8Array, offset: number): PaletteColor[] {
  if (offset + 768 > bytes.length) throw new PaletteFormatError('PAT 调色板不足 768 字节')
  return Array.from({ length: 256 }, (_, index) => ({
    r: Math.min(255, bytes[offset + index * 3] << 2),
    g: Math.min(255, bytes[offset + index * 3 + 1] << 2),
    b: Math.min(255, bytes[offset + index * 3 + 2] << 2),
    a: 255,
  }))
}

export function decodePatChunk(bytes: Uint8Array, index: number): PalPalette[] {
  if (bytes.length < 768) throw new PaletteFormatError(`PAT chunk #${index} 不是完整的 256 色调色板`)
  const palettes: PalPalette[] = [{ index, variant: 'day', colors: colorsAt(bytes, 0) }]
  if (bytes.length >= 1536) palettes.push({ index, variant: 'night', colors: colorsAt(bytes, 768) })
  return palettes
}

export function grayscalePalette(): PalPalette {
  return {
    index: -1,
    variant: 'day',
    colors: Array.from({ length: 256 }, (_, value) => ({ r: value, g: value, b: value, a: 255 })),
  }
}
