import { readU32 } from './binary'

export type PalMessageEncoding = 'gbk' | 'big5'

export type PalMessageTable = {
  messages: string[]
  encoding: PalMessageEncoding
}

export class PalMessageFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PalMessageFormatError'
  }
}

function decodeWithEncoding(offsets: number[], bytes: Uint8Array, encoding: PalMessageEncoding): string[] {
  const decoder = new TextDecoder(encoding)
  return offsets.slice(0, -1).map((start, index) => decoder.decode(bytes.subarray(start, offsets[index + 1])).replace(/\0+$/g, ''))
}

function textScore(messages: string[]): number {
  let score = 0
  for (const message of messages) {
    for (const character of message) {
      const code = character.codePointAt(0) ?? 0
      if (character === '\ufffd') score -= 50
      else if ((code < 0x20 && character !== '\n' && character !== '\r' && character !== '\t') || code === 0x7f) score -= 8
      else if ((code >= 0x3400 && code <= 0x9fff) || (code >= 0xf900 && code <= 0xfaff)) score += 2
      else if (code >= 0x20 && code <= 0x7e) score += 0.1
    }
  }
  return score
}

export function parsePalMessageTable(
  offsetBytes: Uint8Array,
  messageBytes: Uint8Array,
  requestedEncoding: PalMessageEncoding | 'auto' = 'auto',
): PalMessageTable {
  if (offsetBytes.length < 8 || offsetBytes.length % 4 !== 0) {
    throw new PalMessageFormatError('SSS.MKF #3 必须包含至少两个 32 位消息偏移')
  }
  const offsets = Array.from({ length: offsetBytes.length / 4 }, (_, index) => readU32(offsetBytes, index * 4))
  for (let index = 0; index < offsets.length; index++) {
    if (offsets[index] > messageBytes.length) throw new PalMessageFormatError(`消息偏移 #${index} 超出 M.MSG`)
    if (index > 0 && offsets[index] < offsets[index - 1]) throw new PalMessageFormatError(`消息偏移 #${index} 倒序`)
  }

  if (requestedEncoding !== 'auto') {
    return { messages: decodeWithEncoding(offsets, messageBytes, requestedEncoding), encoding: requestedEncoding }
  }
  const candidates = (['gbk', 'big5'] as const).map((encoding) => ({
    encoding,
    messages: decodeWithEncoding(offsets, messageBytes, encoding),
  }))
  candidates.sort((left, right) => textScore(right.messages) - textScore(left.messages))
  return candidates[0]
}
