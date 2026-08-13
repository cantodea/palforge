import type { PalPalette, PaletteColor } from '../types'

export class PaletteFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PaletteFormatError'
  }
}

export type PaletteAdjustments = {
  brightness: number
  saturation: number
  contrast: number
}

const clampChannel = (value: number) => Math.max(0, Math.min(255, Math.round(value)))

export function blendPalettes(day: PalPalette, night: PalPalette, mix: number): PalPalette {
  const amount = Math.max(0, Math.min(1, mix))
  return {
    index: day.index,
    variant: amount >= 0.5 ? 'night' : 'day',
    colors: day.colors.map((color, index) => {
      const target = night.colors[index] ?? color
      return {
        r: clampChannel(color.r + (target.r - color.r) * amount),
        g: clampChannel(color.g + (target.g - color.g) * amount),
        b: clampChannel(color.b + (target.b - color.b) * amount),
        a: clampChannel(color.a + (target.a - color.a) * amount),
      }
    }),
  }
}

export function adjustPalette(palette: PalPalette, adjustments: PaletteAdjustments): PalPalette {
  const brightness = Math.max(0, adjustments.brightness)
  const saturation = Math.max(0, adjustments.saturation)
  const contrast = Math.max(0, adjustments.contrast)

  return {
    ...palette,
    colors: palette.colors.map((color) => {
      const luminance = color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722
      const channel = (value: number) => ((luminance + (value - luminance) * saturation - 128) * contrast + 128) * brightness
      return {
        r: clampChannel(channel(color.r)),
        g: clampChannel(channel(color.g)),
        b: clampChannel(channel(color.b)),
        a: color.a,
      }
    }),
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
