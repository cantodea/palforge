export function readU16(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 2 > bytes.length) throw new RangeError('读取 u16 时越界')
  return bytes[offset] | (bytes[offset + 1] << 8)
}

export function readU32(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 4 > bytes.length) throw new RangeError('读取 u32 时越界')
  return (
    bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)
  ) >>> 0
}

export function hasAscii(bytes: Uint8Array, signature: string, offset = 0): boolean {
  if (offset + signature.length > bytes.length) return false
  for (let index = 0; index < signature.length; index += 1) {
    if (bytes[offset + index] !== signature.charCodeAt(index)) return false
  }
  return true
}

export function assertReadable(bytes: Uint8Array, offset: number, length: number, label: string) {
  if (offset < 0 || length < 0 || offset + length > bytes.length) {
    throw new RangeError(`${label} 数据不完整（需要 ${offset + length} 字节，实际 ${bytes.length}）`)
  }
}
