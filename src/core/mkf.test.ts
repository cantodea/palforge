import { describe, expect, it } from 'vitest'
import { MkfFormatError, parseMkfIndex, readMkfChunk, readMkfIndex } from './mkf'

function archive(offsets: number[], length: number) {
  const buffer = new ArrayBuffer(length)
  const view = new DataView(buffer)
  offsets.forEach((offset, index) => view.setUint32(index * 4, offset, true))
  return buffer
}

describe('parseMkfIndex', () => {
  it('returns chunk offsets and sizes', () => {
    const chunks = parseMkfIndex(archive([12, 16, 23], 23))
    expect(chunks).toEqual([
      { index: 0, offset: 12, size: 4 },
      { index: 1, offset: 16, size: 7 },
    ])
  })

  it('keeps empty chunks', () => {
    expect(parseMkfIndex(archive([12, 12, 16], 16))[0].size).toBe(0)
  })

  it('rejects malformed offset tables', () => {
    expect(() => parseMkfIndex(archive([8, 7], 8))).toThrow(MkfFormatError)
    expect(() => parseMkfIndex(archive([40], 8))).toThrow(MkfFormatError)
  })

  it('extracts the exact bytes of a chunk', () => {
    const buffer = archive([12, 16, 20], 20)
    new Uint8Array(buffer).set([1, 2, 3, 4], 12)
    expect(Array.from(readMkfChunk(buffer, parseMkfIndex(buffer)[0]))).toEqual([1, 2, 3, 4])
  })

  it('reads only the index from a browser file', async () => {
    const buffer = archive([12, 16, 1024], 1024)
    const file = new File([buffer], 'MGO.MKF')
    expect(await readMkfIndex(file)).toEqual([
      { index: 0, offset: 12, size: 4 },
      { index: 1, offset: 16, size: 1008 },
    ])
  })
})
