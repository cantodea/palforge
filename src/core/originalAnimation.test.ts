import { describe, expect, it } from 'vitest'
import type { IndexedImage } from '../types'
import type { ChunkInspection } from './resourceDecoder'
import { collectImportableOriginalFrames, createDerivedOriginalAnimation } from './originalAnimation'

const png = 'data:image/png;base64,iVBORw0KGgo='

function image(width: number, height: number): IndexedImage {
  return { width, height, pixels: new Uint8Array(width * height), alpha: new Uint8Array(width * height).fill(255) }
}

function spriteInspection(): ChunkInspection {
  const raw = new Uint8Array([1, 2, 3])
  return {
    archiveName: 'MGO.MKF',
    chunkIndex: 391,
    raw,
    payload: raw,
    compression: 'none',
    kind: 'sprite',
    frames: [
      { index: 0, offset: 0, size: 1, image: image(16, 24) },
      { index: 2, offset: 1, size: 2, image: image(18, 22) },
    ],
    image: image(16, 24),
    notes: [],
  }
}

describe('original animation derivation', () => {
  it('preserves original frame indices while exposing indexed images for rendering', () => {
    const frames = collectImportableOriginalFrames(spriteInspection())
    expect(frames.map((frame) => frame.sourceIndex)).toEqual([0, 2])
    expect(frames.map((frame) => frame.name)).toEqual(['MGO-0391-frame-000.png', 'MGO-0391-frame-002.png'])
  })

  it('creates an editable project copy with a stable read-only source URI', () => {
    const derived = createDerivedOriginalAnimation(spriteInspection(), [png, png], [], 10)
    expect(derived.uri).toBe('project://animations/mgo-0391-派生动画')
    expect(derived.source).toEqual({ kind: 'derived', originalUri: 'pal://archives/MGO.MKF/chunks/391' })
    expect(derived.frames).toMatchObject([
      { width: 16, height: 24, anchorX: 8, anchorY: 23 },
      { width: 18, height: 22, anchorX: 9, anchorY: 21 },
    ])
  })

  it('accepts a single RLE image and rejects unsupported RNG increments', () => {
    const base = spriteInspection()
    const rle = { ...base, archiveName: 'BALL.MKF', kind: 'rle' as const, frames: [], image: image(12, 13) }
    expect(collectImportableOriginalFrames(rle)).toHaveLength(1)
    const rng = { ...base, archiveName: 'RNG.MKF', kind: 'binary' as const, frames: [], image: undefined }
    expect(() => collectImportableOriginalFrames(rng)).toThrow(/增量动画/)
  })
})
