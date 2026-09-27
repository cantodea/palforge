import { describe, expect, it } from 'vitest'
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
  updateForgeAnimationFrame,
} from './animationProject'

const png = 'data:image/png;base64,iVBORw0KGgo='

function withFrames() {
  return addForgeAnimationFrames(createForgeAnimationDraft('走路', [], 10), [
    { name: 'walk-1.png', dataUrl: png, width: 16, height: 24, durationMs: 100, anchorX: 8, anchorY: 23 },
    { name: 'walk-2.png', dataUrl: png, width: 20, height: 22, durationMs: 120, anchorX: 10, anchorY: 21 },
  ], 11)
}

describe('Animation Forge project layer', () => {
  it('creates stable project URIs without using the original resource namespace', () => {
    const first = createForgeAnimationDraft('Hero Walk', [], 1)
    const second = createForgeAnimationDraft('Hero Walk', [first], 2)
    expect(first.uri).toBe('project://animations/hero-walk')
    expect(second.uri).toBe('project://animations/hero-walk-2')
    expect(first.source).toEqual({ kind: 'custom', originalUri: null })
    expect(() => createForgeAnimationDraft('非法派生', [], 3, { kind: 'derived', originalUri: 'project://animations/other' })).toThrow(/pal:\/\//)
  })

  it('edits frame order and timing without mutating the previous draft', () => {
    const original = withFrames()
    const moved = moveForgeAnimationFrame(original, 'frame-2', -1, 12)
    const timed = updateForgeAnimationFrame(moved, 'frame-2', { durationMs: 250, anchorX: 6 }, 13)
    const duplicated = duplicateForgeAnimationFrame(timed, 'frame-2', 14)
    const removed = removeForgeAnimationFrame(duplicated, 'frame-1', 15)
    expect(original.frames.map((frame) => frame.id)).toEqual(['frame-1', 'frame-2'])
    expect(moved.frames.map((frame) => frame.id)).toEqual(['frame-2', 'frame-1'])
    expect(timed.frames[0]).toMatchObject({ durationMs: 250, anchorX: 6 })
    expect(removed.frames).toHaveLength(2)
  })

  it('round-trips a versioned animation pack and rejects malformed frame data', () => {
    const animation = withFrames()
    expect(parseForgeAnimationPack(createForgeAnimationPack([animation]))).toEqual([animation])
    const malformed = createForgeAnimationPack([animation])
    malformed.animations[0].frames[0].dataUrl = 'https://example.com/frame.png'
    expect(parseForgeAnimationPack(malformed)).toEqual([])

    const crossedNamespaces = createForgeAnimationPack([animation])
    crossedNamespaces.animations[0].source = { kind: 'derived', originalUri: 'project://animations/other' }
    expect(parseForgeAnimationPack(crossedNamespaces)).toEqual([])
  })

  it('re-imports the same project URI as an update and computes a sprite sheet grid', () => {
    const animation = withFrames()
    const changed = { ...animation, name: '新版走路' }
    expect(mergeForgeAnimationDrafts([animation], [changed])).toEqual([changed])
    expect(getForgeSpriteSheetLayout(animation.frames)).toEqual({ columns: 2, rows: 1, cellWidth: 20, cellHeight: 24, width: 40, height: 24 })
  })
})
