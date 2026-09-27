import { describe, expect, it } from 'vitest'
import { loadPalScene, loadPalSceneCatalog, type PalArchiveSet } from './sceneLoader'
import { PAL_MAP_BYTE_LENGTH } from './scene'

function writeU16(bytes: Uint8Array, offset: number, value: number) {
  bytes[offset] = value & 0xff
  bytes[offset + 1] = (value >>> 8) & 0xff
}

function source(name: string, chunks: Uint8Array[]) {
  let offset = 0
  const index = chunks.map((chunk, chunkIndex) => {
    const record = { index: chunkIndex, offset, size: chunk.length }
    offset += chunk.length
    return record
  })
  return { name, file: new File(chunks, name), chunks: index }
}

describe('PAL scene loader', () => {
  it('joins SSS, MAP, GOP and MGO into one read-only scene model', async () => {
    const eventBytes = new Uint8Array(32)
    writeU16(eventBytes, 2, 32)
    writeU16(eventBytes, 4, 16)
    writeU16(eventBytes, 12, 1)
    writeU16(eventBytes, 16, 1)
    writeU16(eventBytes, 18, 1)

    const sceneBytes = new Uint8Array(16)
    writeU16(sceneBytes, 0, 1)
    writeU16(sceneBytes, 2, 0x42)
    writeU16(sceneBytes, 6, 0)
    writeU16(sceneBytes, 8, 2)
    writeU16(sceneBytes, 14, 1)

    const scriptBytes = new Uint8Array(0x43 * 8)
    writeU16(scriptBytes, 0x42 * 8, 0x0053)
    const messageOffsets = new Uint8Array(8)
    writeU16(messageOffsets, 4, 5)

    const mapBytes = new Uint8Array(PAL_MAP_BYTE_LENGTH)
    const onePixelSprite = new Uint8Array([2, 0, 5, 0, 1, 0, 1, 0, 1, 7])
    const archives: PalArchiveSet = new Map([
      ['SSS.MKF', source('SSS.MKF', [eventBytes, sceneBytes, new Uint8Array(), messageOffsets, scriptBytes])],
      ['MAP.MKF', source('MAP.MKF', [new Uint8Array(), mapBytes])],
      ['GOP.MKF', source('GOP.MKF', [new Uint8Array(), onePixelSprite])],
      ['MGO.MKF', source('MGO.MKF', [new Uint8Array(), onePixelSprite])],
    ])

    const catalog = await loadPalSceneCatalog(archives, new File(['hello'], 'M.MSG'))
    const loaded = await loadPalScene(archives, catalog, 1, 'dos')

    expect(catalog.availableScenes.map((scene) => scene.number)).toEqual([1])
    expect(catalog.scriptEntries[0x42]).toMatchObject({ index: 0x42, operation: 0x0053 })
    expect(catalog.messages).toEqual(['hello'])
    expect(loaded.record).toMatchObject({ number: 1, mapNumber: 1, scriptOnEnter: 0x42 })
    expect(loaded.map.tiles[0][0][0].bottomFrame).toBe(0)
    expect(loaded.tileset[0].image.pixels[0]).toBe(7)
    expect(loaded.events[0].object).toMatchObject({ x: 32, y: 16, spriteNumber: 1 })
    expect(loaded.events[0].frames[0].image.pixels[0]).toBe(7)
    expect(mapBytes.every((value) => value === 0)).toBe(true)
  })
})
