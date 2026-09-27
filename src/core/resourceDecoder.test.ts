import { describe, expect, it } from 'vitest'
import { inspectChunk } from './resourceDecoder'

describe('resource inspection', () => {
  it('recognizes a direct RLE chunk', () => {
    const result = inspectChunk(new Uint8Array([2, 0, 1, 0, 2, 4, 5]), 'RGM.MKF', 0, 'auto')
    expect(result.kind).toBe('rle')
    expect(Array.from(result.image!.pixels)).toEqual([4, 5])
  })

  it('recognizes a PAT palette chunk', () => {
    const result = inspectChunk(new Uint8Array(768), 'PAT.MKF', 0, 'auto')
    expect(result.kind).toBe('palette')
    expect(result.palettes).toHaveLength(1)
  })

  it('explains known structured archives instead of treating every binary as a broken image', () => {
    const result = inspectChunk(new Uint8Array([1, 2, 3, 4, 5]), 'MAP.MKF', 3, 'dos')
    expect(result.kind).toBe('binary')
    expect(result.notes.join(' ')).toContain('地图数据')
  })

  it('does not mistake a raw GOP sprite pack for YJ_2 data', () => {
    const result = inspectChunk(new Uint8Array([8, 0, 0, 0, 1, 2, 3, 4]), 'GOP.MKF', 1, 'auto')
    expect(result.compression).toBe('none')
  })
})
