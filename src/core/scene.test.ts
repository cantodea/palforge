import { describe, expect, it } from 'vitest'
import {
  PAL_MAP_BYTE_LENGTH,
  parsePalEventObjects,
  parsePalMap,
  parsePalSceneTable,
  sceneEventRange,
} from './scene'

function writeU16(bytes: Uint8Array, offset: number, value: number) {
  bytes[offset] = value & 0xff
  bytes[offset + 1] = (value >>> 8) & 0xff
}

function writeU32(bytes: Uint8Array, offset: number, value: number) {
  writeU16(bytes, offset, value)
  writeU16(bytes, offset + 2, value >>> 16)
}

describe('PAL scene structures', () => {
  it('parses SSS scene records and keeps the following record as the event sentinel', () => {
    const bytes = new Uint8Array(16)
    writeU16(bytes, 0, 7)
    writeU16(bytes, 2, 0x42)
    writeU16(bytes, 4, 0x43)
    writeU16(bytes, 6, 2)
    writeU16(bytes, 8, 8)
    writeU16(bytes, 14, 5)

    const scenes = parsePalSceneTable(bytes)
    expect(scenes[0]).toEqual({
      number: 1,
      mapNumber: 7,
      scriptOnEnter: 0x42,
      scriptOnTeleport: 0x43,
      eventObjectIndex: 2,
    })
    expect(sceneEventRange(scenes, 1, 5)).toEqual({ start: 2, end: 5 })
  })

  it('parses the complete 32-byte event object including signed fields', () => {
    const bytes = new Uint8Array(32)
    writeU16(bytes, 0, 0xffff)
    writeU16(bytes, 2, 320)
    writeU16(bytes, 4, 112)
    writeU16(bytes, 6, 0xfffe)
    writeU16(bytes, 8, 0x1234)
    writeU16(bytes, 10, 0x5678)
    writeU16(bytes, 12, 1)
    writeU16(bytes, 14, 2)
    writeU16(bytes, 16, 9)
    writeU16(bytes, 18, 3)
    writeU16(bytes, 20, 1)
    writeU16(bytes, 22, 2)

    const event = parsePalEventObjects(bytes)[0]
    expect(event.vanishTime).toBe(-1)
    expect(event.layer).toBe(-2)
    expect(event).toMatchObject({
      x: 320,
      y: 112,
      triggerScript: 0x1234,
      autoScript: 0x5678,
      state: 1,
      triggerMode: 2,
      spriteNumber: 9,
      spriteFrames: 3,
      direction: 1,
      currentFrame: 2,
    })
  })

  it('decodes both MAP layers, height bits and blocking without changing the payload', () => {
    const bytes = new Uint8Array(PAL_MAP_BYTE_LENGTH)
    const raw = ((0x1123 << 16) | 0x3505) >>> 0
    writeU32(bytes, 0, raw)
    const original = bytes.slice()

    const map = parsePalMap(bytes)
    expect(map.tiles[0][0][0]).toEqual({
      raw,
      bottomFrame: 0x105,
      topFrame: 0x122,
      blocked: true,
      bottomHeight: 5,
      topHeight: 1,
    })
    expect(bytes).toEqual(original)
  })

  it('rejects a decompressed MAP with a non-canonical length', () => {
    expect(() => parsePalMap(new Uint8Array(PAL_MAP_BYTE_LENGTH - 1))).toThrow('65536')
  })
})
