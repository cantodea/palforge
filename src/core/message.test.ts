import { describe, expect, it } from 'vitest'
import { parsePalMessageTable } from './message'

function offsets(...values: number[]) {
  const bytes = new Uint8Array(values.length * 4)
  values.forEach((value, index) => {
    bytes[index * 4] = value & 0xff
    bytes[index * 4 + 1] = (value >>> 8) & 0xff
    bytes[index * 4 + 2] = (value >>> 16) & 0xff
    bytes[index * 4 + 3] = (value >>> 24) & 0xff
  })
  return bytes
}

describe('PAL message table', () => {
  it('uses SSS #3 offsets to split M.MSG without changing either input', () => {
    const index = offsets(0, 5, 10)
    const messages = new TextEncoder().encode('helloPAL!!')
    const indexCopy = index.slice()
    const messageCopy = messages.slice()
    expect(parsePalMessageTable(index, messages, 'gbk')).toEqual({ messages: ['hello', 'PAL!!'], encoding: 'gbk' })
    expect(index).toEqual(indexCopy)
    expect(messages).toEqual(messageCopy)
  })

  it('rejects descending and out-of-range message offsets', () => {
    expect(() => parsePalMessageTable(offsets(0, 4, 3), new Uint8Array(4))).toThrow('倒序')
    expect(() => parsePalMessageTable(offsets(0, 5), new Uint8Array(4))).toThrow('超出')
  })
})
