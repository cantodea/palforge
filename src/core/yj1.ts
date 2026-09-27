import { assertReadable, hasAscii, readU16, readU32 } from './binary'

export class Yj1FormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'Yj1FormatError'
  }
}

type TreeNode = {
  leaf: boolean
  value: number
  left: number
  right: number
}

function readWord(bytes: Uint8Array, offset: number): number {
  if (offset + 1 >= bytes.length) throw new Yj1FormatError('YJ_1 位流意外结束')
  return bytes[offset] | (bytes[offset + 1] << 8)
}

function readBits(bytes: Uint8Array, base: number, state: { bit: number }, count: number): number {
  if (count === 0) return 0
  if (count < 0 || count > 16) throw new Yj1FormatError(`无效的 YJ_1 位宽：${count}`)

  const byteOffset = base + ((state.bit >>> 4) << 1)
  const bitInWord = state.bit & 0xf
  state.bit += count

  if (count > 16 - bitInWord) {
    const remaining = count + bitInWord - 16
    const first = readWord(bytes, byteOffset) & (0xffff >>> bitInWord)
    const second = readWord(bytes, byteOffset + 2) >>> (16 - remaining)
    return (first << remaining) | second
  }

  return ((readWord(bytes, byteOffset) << bitInWord) & 0xffff) >>> (16 - count)
}

type BlockTables = {
  repeats: number[]
  offsetWidths: number[]
  repeatWidths: number[]
  loopWidths: number[]
  loopConstants: number[]
}

function readLoop(bytes: Uint8Array, base: number, state: { bit: number }, tables: BlockTables): number {
  if (readBits(bytes, base, state, 1) !== 0) return tables.loopConstants[0]
  const selector = readBits(bytes, base, state, 2)
  return selector === 0
    ? tables.loopConstants[1]
    : readBits(bytes, base, state, tables.loopWidths[selector - 1])
}

function readRepeat(bytes: Uint8Array, base: number, state: { bit: number }, tables: BlockTables): number {
  const selector = readBits(bytes, base, state, 2)
  if (selector === 0) return tables.repeats[0]
  return readBits(bytes, base, state, 1) !== 0
    ? readBits(bytes, base, state, tables.repeatWidths[selector - 1])
    : tables.repeats[selector]
}

export function isYj1(bytes: Uint8Array): boolean {
  return hasAscii(bytes, 'YJ_1')
}

export function decompressYj1(bytes: Uint8Array): Uint8Array {
  if (!isYj1(bytes)) throw new Yj1FormatError('缺少 YJ_1 文件签名')
  assertReadable(bytes, 0, 16, 'YJ_1 文件头')

  const outputLength = readU32(bytes, 4)
  const declaredCompressedLength = readU32(bytes, 8)
  const blockCount = readU16(bytes, 12)
  const treeLength = bytes[15] * 2

  if (outputLength > 256 * 1024 * 1024) throw new Yj1FormatError('YJ_1 解压尺寸异常')
  if (declaredCompressedLength > bytes.length) throw new Yj1FormatError('YJ_1 声明长度超出 chunk')
  assertReadable(bytes, 16, treeLength, 'YJ_1 Huffman 树')

  const tree: TreeNode[] = Array.from({ length: treeLength + 1 }, () => ({
    leaf: true,
    value: 0,
    left: -1,
    right: -1,
  }))
  if (treeLength > 0) {
    tree[0] = { leaf: false, value: 0, left: 1, right: 2 }
    const flagsOffset = 16 + treeLength
    const flagState = { bit: 0 }
    for (let index = 1; index <= treeLength; index += 1) {
      const leaf = readBits(bytes, flagsOffset, flagState, 1) === 0
      const value = bytes[15 + index]
      const left = leaf ? -1 : value * 2 + 1
      const right = leaf ? -1 : left + 1
      if (!leaf && right > treeLength) throw new Yj1FormatError('YJ_1 Huffman 树指向越界节点')
      tree[index] = { leaf, value, left, right }
    }
  }

  const flagBytes = Math.ceil(treeLength / 16) * 2
  let source = 16 + treeLength + flagBytes
  const output = new Uint8Array(outputLength)
  let destination = 0

  const put = (value: number) => {
    if (destination >= output.length) throw new Yj1FormatError('YJ_1 解压结果超过声明长度')
    output[destination++] = value
  }

  for (let block = 0; block < blockCount; block += 1) {
    assertReadable(bytes, source, 4, `YJ_1 block #${block}`)
    const header = source
    const rawLength = readU16(bytes, header)
    const compressedLength = readU16(bytes, header + 2)

    if (compressedLength === 0) {
      const rawStart = header + 4
      assertReadable(bytes, rawStart, rawLength, `YJ_1 raw block #${block}`)
      output.set(bytes.subarray(rawStart, rawStart + rawLength), destination)
      destination += rawLength
      if (destination > output.length) throw new Yj1FormatError('YJ_1 raw block 超过声明长度')
      source = rawStart + rawLength
      continue
    }

    if (compressedLength < 24) throw new Yj1FormatError(`YJ_1 block #${block} 长度无效`)
    assertReadable(bytes, header, compressedLength, `YJ_1 compressed block #${block}`)
    const tables: BlockTables = {
      repeats: [0, 1, 2, 3].map((index) => readU16(bytes, header + 4 + index * 2)),
      offsetWidths: Array.from(bytes.subarray(header + 12, header + 16)),
      repeatWidths: Array.from(bytes.subarray(header + 16, header + 19)),
      loopWidths: Array.from(bytes.subarray(header + 19, header + 22)),
      loopConstants: Array.from(bytes.subarray(header + 22, header + 24)),
    }
    const bitstream = header + 24
    const state = { bit: 0 }

    for (;;) {
      let loop = readLoop(bytes, bitstream, state, tables)
      if (loop === 0) break
      while (loop-- > 0) {
        if (treeLength === 0) throw new Yj1FormatError('压缩 block 缺少 Huffman 树')
        let nodeIndex = 0
        let guard = 0
        while (!tree[nodeIndex].leaf) {
          nodeIndex = readBits(bytes, bitstream, state, 1) !== 0
            ? tree[nodeIndex].right
            : tree[nodeIndex].left
          if (nodeIndex < 0 || nodeIndex >= tree.length || guard++ > tree.length) {
            throw new Yj1FormatError('YJ_1 Huffman 遍历失败')
          }
        }
        put(tree[nodeIndex].value)
      }

      loop = readLoop(bytes, bitstream, state, tables)
      if (loop === 0) break
      while (loop-- > 0) {
        const count = readRepeat(bytes, bitstream, state, tables)
        const widthSlot = readBits(bytes, bitstream, state, 2)
        const distance = readBits(bytes, bitstream, state, tables.offsetWidths[widthSlot])
        if (distance <= 0 || distance > destination) throw new Yj1FormatError('YJ_1 LZSS 回引距离无效')
        for (let index = 0; index < count; index += 1) put(output[destination - distance])
      }
    }
    source = header + compressedLength
  }

  if (destination !== outputLength) {
    throw new Yj1FormatError(`YJ_1 解压长度不符：预期 ${outputLength}，实际 ${destination}`)
  }
  return output
}
