import { assertReadable, readU32 } from './binary'

export class Yj2FormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'Yj2FormatError'
  }
}

const OFFSET_HIGH = new Uint8Array([
  0x3f,0x0b,0x17,0x03,0x2f,0x0a,0x16,0x00,0x2e,0x09,0x15,0x02,0x2d,0x01,0x08,0x00,
  0x3e,0x07,0x14,0x03,0x2c,0x06,0x13,0x00,0x2b,0x05,0x12,0x02,0x2a,0x01,0x04,0x00,
  0x3d,0x0b,0x11,0x03,0x29,0x0a,0x10,0x00,0x28,0x09,0x0f,0x02,0x27,0x01,0x08,0x00,
  0x3c,0x07,0x0e,0x03,0x26,0x06,0x0d,0x00,0x25,0x05,0x0c,0x02,0x24,0x01,0x04,0x00,
  0x3b,0x0b,0x17,0x03,0x23,0x0a,0x16,0x00,0x22,0x09,0x15,0x02,0x21,0x01,0x08,0x00,
  0x3a,0x07,0x14,0x03,0x20,0x06,0x13,0x00,0x1f,0x05,0x12,0x02,0x1e,0x01,0x04,0x00,
  0x39,0x0b,0x11,0x03,0x1d,0x0a,0x10,0x00,0x1c,0x09,0x0f,0x02,0x1b,0x01,0x08,0x00,
  0x38,0x07,0x0e,0x03,0x1a,0x06,0x0d,0x00,0x19,0x05,0x0c,0x02,0x18,0x01,0x04,0x00,
  0x37,0x0b,0x17,0x03,0x2f,0x0a,0x16,0x00,0x2e,0x09,0x15,0x02,0x2d,0x01,0x08,0x00,
  0x36,0x07,0x14,0x03,0x2c,0x06,0x13,0x00,0x2b,0x05,0x12,0x02,0x2a,0x01,0x04,0x00,
  0x35,0x0b,0x11,0x03,0x29,0x0a,0x10,0x00,0x28,0x09,0x0f,0x02,0x27,0x01,0x08,0x00,
  0x34,0x07,0x0e,0x03,0x26,0x06,0x0d,0x00,0x25,0x05,0x0c,0x02,0x24,0x01,0x04,0x00,
  0x33,0x0b,0x17,0x03,0x23,0x0a,0x16,0x00,0x22,0x09,0x15,0x02,0x21,0x01,0x08,0x00,
  0x32,0x07,0x14,0x03,0x20,0x06,0x13,0x00,0x1f,0x05,0x12,0x02,0x1e,0x01,0x04,0x00,
  0x31,0x0b,0x11,0x03,0x1d,0x0a,0x10,0x00,0x1c,0x09,0x0f,0x02,0x1b,0x01,0x08,0x00,
  0x30,0x07,0x0e,0x03,0x1a,0x06,0x0d,0x00,0x19,0x05,0x0c,0x02,0x18,0x01,0x04,0x00,
])
const EXTRA_BITS = new Uint8Array([8,5,6,4,7,5,6,3,7,5,6,4,7,4,5,3])

type Node = { weight: number; value: number; parent: number; left: number; right: number }

function createTree() {
  const nodes: Node[] = Array.from({ length: 641 }, (_, value) => ({ weight: 1, value, parent: -1, left: -1, right: -1 }))
  const leaves = Array.from({ length: 321 }, (_, index) => index)
  nodes[0x280].parent = 0x280
  for (let child = 0, parent = 0x141; parent <= 0x280; child += 2, parent += 1) {
    nodes[parent].left = child
    nodes[parent].right = child + 1
    nodes[child].parent = parent
    nodes[child + 1].parent = parent
    nodes[parent].weight = nodes[child].weight + nodes[child + 1].weight
  }
  return { nodes, leaves }
}

function swapNodes(nodes: Node[], leaves: number[], first: number, second: number) {
  const firstParent = nodes[first].parent
  nodes[first].parent = nodes[second].parent
  nodes[second].parent = firstParent

  for (const [from, to] of [[first, second], [second, first]] as const) {
    const node = nodes[from]
    if (node.value > 0x140) {
      nodes[node.left].parent = to
      nodes[node.right].parent = to
    } else {
      leaves[node.value] = to
    }
  }
  const temporary = nodes[first]
  nodes[first] = nodes[second]
  nodes[second] = temporary
}

function adjustTree(nodes: Node[], leaves: number[], value: number) {
  let current = leaves[value]
  while (nodes[current].value !== 0x280) {
    let last = current + 1
    while (last < nodes.length && nodes[last].weight === nodes[current].weight) last += 1
    last -= 1
    if (last !== current) {
      swapNodes(nodes, leaves, current, last)
      current = last
    }
    nodes[current].weight += 1
    current = nodes[current].parent
  }
  nodes[current].weight += 1
}

export function looksLikeYj2(bytes: Uint8Array): boolean {
  if (bytes.length < 8) return false
  const outputLength = readU32(bytes, 0)
  return outputLength > 0 && outputLength <= 256 * 1024 * 1024 && outputLength > bytes.length / 2
}

export function decompressYj2(bytes: Uint8Array): Uint8Array {
  assertReadable(bytes, 0, 5, 'YJ_2 文件头')
  const outputLength = readU32(bytes, 0)
  if (outputLength === 0 || outputLength > 256 * 1024 * 1024) throw new Yj2FormatError('YJ_2 解压尺寸异常')
  const output = new Uint8Array(outputLength)
  const { nodes, leaves } = createTree()
  let bit = 0
  let destination = 0
  let iterations = 0

  const readBit = () => {
    const byteOffset = 4 + (bit >>> 3)
    if (byteOffset >= bytes.length) throw new Yj2FormatError('YJ_2 位流意外结束')
    const value = (bytes[byteOffset] >>> (bit & 7)) & 1
    bit += 1
    return value
  }

  while (destination < outputLength) {
    if (iterations++ > outputLength * 4 + 4096) throw new Yj2FormatError('YJ_2 解压未能正常结束')
    let current = 0x280
    while (nodes[current].value > 0x140) current = readBit() !== 0 ? nodes[current].right : nodes[current].left
    const symbol = nodes[current].value

    if (nodes[0x280].weight === 0x8000) {
      for (let value = 0; value < 0x141; value += 1) {
        if ((nodes[leaves[value]].weight & 1) !== 0) adjustTree(nodes, leaves, value)
      }
      for (let index = 0; index <= 0x280; index += 1) nodes[index].weight >>>= 1
    }
    adjustTree(nodes, leaves, symbol)

    if (symbol <= 0xff) {
      output[destination++] = symbol
      continue
    }

    let encoded = 0
    let count = 0
    for (; count < 8; count += 1) encoded |= readBit() << count
    const low = encoded & 0xff
    const requiredBits = EXTRA_BITS[low & 0xf] + 6
    for (; count < requiredBits; count += 1) encoded |= readBit() << count
    encoded >>>= EXTRA_BITS[low & 0xf]
    const distanceCode = (encoded & 0x3f) | (OFFSET_HIGH[low] << 6)
    if (distanceCode === 0xfff) break

    const distance = distanceCode + 1
    const length = symbol - 0xfd
    if (distance > destination || destination + length > output.length) throw new Yj2FormatError('YJ_2 LZSS 回引无效')
    for (let index = 0; index < length; index += 1) {
      output[destination] = output[destination - distance]
      destination += 1
    }
  }

  if (destination !== outputLength) throw new Yj2FormatError(`YJ_2 解压长度不符：预期 ${outputLength}，实际 ${destination}`)
  return output
}
