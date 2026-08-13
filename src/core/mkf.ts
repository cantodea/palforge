export type MkfChunk = {
  index: number
  offset: number
  size: number
}

export class MkfFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MkfFormatError'
  }
}

/**
 * Reads the offset table shared by PAL MKF archives.
 * Chunk compression and payload decoding intentionally live in separate codecs.
 */
export function parseMkfIndex(buffer: ArrayBuffer, fileSize = buffer.byteLength): MkfChunk[] {
  if (buffer.byteLength < 4) {
    throw new MkfFormatError('文件太短，缺少 MKF 偏移表')
  }

  const view = new DataView(buffer)
  const firstOffset = view.getUint32(0, true)

  if (firstOffset < 4 || firstOffset % 4 !== 0) {
    throw new MkfFormatError('MKF 首偏移不是有效的 32 位偏移表')
  }
  if (firstOffset > fileSize) {
    throw new MkfFormatError('MKF 偏移表超出文件范围')
  }
  if (firstOffset > buffer.byteLength) {
    throw new MkfFormatError('尚未读取完整的 MKF 偏移表')
  }

  const offsetCount = firstOffset / 4
  const offsets: number[] = []
  for (let index = 0; index < offsetCount; index += 1) {
    const offset = view.getUint32(index * 4, true)
    if (offset > fileSize) {
      throw new MkfFormatError(`第 ${index} 个偏移超出文件范围`)
    }
    if (index > 0 && offset < offsets[index - 1]) {
      throw new MkfFormatError('MKF 偏移表不是递增序列')
    }
    offsets.push(offset)
  }

  return offsets.slice(0, -1).map((offset, index) => ({
    index,
    offset,
    size: offsets[index + 1] - offset,
  }))
}

/** Reads only the MKF offset table from a browser File instead of loading a large archive into memory. */
export async function readMkfIndex(file: File): Promise<MkfChunk[]> {
  const header = await file.slice(0, 4).arrayBuffer()
  if (header.byteLength < 4) throw new MkfFormatError('文件太短，缺少 MKF 偏移表')
  const firstOffset = new DataView(header).getUint32(0, true)
  const index = await file.slice(0, Math.min(firstOffset, file.size)).arrayBuffer()
  return parseMkfIndex(index, file.size)
}

export function readMkfChunk(buffer: ArrayBuffer, chunk: MkfChunk): Uint8Array {
  if (chunk.offset < 0 || chunk.size < 0 || chunk.offset + chunk.size > buffer.byteLength) {
    throw new MkfFormatError(`Chunk #${chunk.index} 超出文件范围`)
  }
  return new Uint8Array(buffer.slice(chunk.offset, chunk.offset + chunk.size))
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
