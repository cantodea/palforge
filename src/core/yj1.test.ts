import { describe, expect, it } from 'vitest'
import { decompressYj1, isYj1 } from './yj1'

function rawYj1(payload: number[]) {
  const bytes = new Uint8Array(16 + 4 + payload.length)
  bytes.set([0x59, 0x4a, 0x5f, 0x31])
  new DataView(bytes.buffer).setUint32(4, payload.length, true)
  new DataView(bytes.buffer).setUint32(8, bytes.length, true)
  new DataView(bytes.buffer).setUint16(12, 1, true)
  new DataView(bytes.buffer).setUint16(16, payload.length, true)
  bytes.set(payload, 20)
  return bytes
}

describe('YJ_1 decompression', () => {
  it('recognizes its signature', () => {
    expect(isYj1(new Uint8Array([0x59, 0x4a, 0x5f, 0x31]))).toBe(true)
    expect(isYj1(new Uint8Array([0, 0, 0, 0]))).toBe(false)
  })

  it('decompresses an uncompressed block', () => {
    expect(Array.from(decompressYj1(rawYj1([10, 20, 30, 40])))).toEqual([10, 20, 30, 40])
  })

  it('rejects data without the signature', () => {
    expect(() => decompressYj1(new Uint8Array(16))).toThrow('YJ_1')
  })
})
