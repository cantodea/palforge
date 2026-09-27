import { describe, expect, it } from 'vitest'
import { addForgeAnimationFrames, createForgeAnimationDraft, createForgeAnimationPack, parseForgeAnimationPack, updateForgeAnimationBinding, type ForgeAnimationBinding } from './animationProject'
import { prepareAnimationRuntime } from './animationRuntime'
import { encodeMkf, parseMkfIndex, readMkfChunk } from './mkf'
import { encodeSprite, encodeYj1 } from './palEncoder'
import { encodeYj2 } from './yj2'
import { inspectChunk } from './resourceDecoder'
import { grayscalePalette } from './palette'

const palette = { ...grayscalePalette(), index: 0 }
const binding: ForgeAnimationBinding = { archive: 'MGO.MKF', chunkIndex: 1, paletteIndex: 0, paletteVariant: 'day', frameMapping: 'exact', enabled: true }
function animation(name = 'Custom') {
  return updateForgeAnimationBinding(addForgeAnimationFrames(createForgeAnimationDraft(name), [{
    name: 'frame.png', dataUrl: 'data:image/png;base64,AA==', width: 2, height: 1, anchorX: 1, anchorY: 0, durationMs: 120,
  }]), binding)
}
const decodeFrame = async () => ({ width: 2, height: 1, data: new Uint8ClampedArray([99, 99, 99, 255, 88, 88, 88, 255]) })
function fixture(compression: 'dos' | 'win95' = 'dos', count = 1) {
  const frame = { width: 2, height: 1, pixels: new Uint8Array([1, 2]), alpha: new Uint8Array([255, 255]) }
  const sprite = encodeSprite(Array.from({ length: count }, () => frame))
  const compress = compression === 'dos' ? encodeYj1 : encodeYj2
  const mkf = encodeMkf([new Uint8Array([7, 8, 9]), compress(sprite), new Uint8Array(), new Uint8Array([3, 4])])
  return { mkf, file: new File([mkf], 'mGo.mkf'), other: new File(['original data'], 'SSS.MKF') }
}

describe('animation runtime replacement', () => {
  it.each(['dos', 'win95'] as const)('injects %s animation and preserves all other chunks, files and source bytes', async (profile) => {
    const { mkf, file, other } = fixture(profile)
    const result = await prepareAnimationRuntime({ files: [file, other], animations: [animation()], palettes: [palette], profile: 'auto', decodeFrame })
    expect(result.files[0]).not.toBe(file)
    expect(result.files[1]).toBe(other)
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(mkf)
    const buffer = await result.files[0].arrayBuffer()
    const chunks = parseMkfIndex(buffer).map((chunk) => readMkfChunk(buffer, chunk))
    expect(chunks[0]).toEqual(new Uint8Array([7, 8, 9]))
    expect(chunks[2]).toHaveLength(0)
    expect(chunks[3]).toEqual(new Uint8Array([3, 4]))
    const decoded = inspectChunk(chunks[1], 'MGO.MKF', 1, profile)
    expect([...decoded.frames[0].image.pixels]).toEqual([99, 88])
    expect(result.replacements[0]).toMatchObject({ archive: 'MGO.MKF', chunkIndex: 1, runtimeFrames: 1, compression: profile === 'dos' ? 'YJ_1' : 'YJ_2' })
  })

  it('requires explicit repeating when source and original frame counts differ', async () => {
    const { file } = fixture('dos', 4)
    const draft = animation()
    const options = { files: [file], animations: [draft], palettes: [palette], profile: 'auto' as const, decodeFrame }
    await expect(prepareAnimationRuntime(options)).rejects.toThrow(/帧数不匹配/)
    const result = await prepareAnimationRuntime({ ...options, animations: [updateForgeAnimationBinding(draft, { ...binding, frameMapping: 'repeat' })] })
    expect(result.replacements[0].runtimeFrames).toBe(4)
    const buffer = await result.files[0].arrayBuffer()
    const inspection = inspectChunk(readMkfChunk(buffer, parseMkfIndex(buffer)[1]), 'MGO.MKF', 1, 'auto')
    expect(inspection.frames).toHaveLength(4)
    expect(inspection.frames.map((frame) => [...frame.image.pixels])).toEqual(Array(4).fill([99, 88]))
  })

  it('blocks duplicate bindings, missing targets, missing palettes and damaged images', async () => {
    const { file } = fixture()
    const options = { files: [file], animations: [animation()], palettes: [palette], profile: 'auto' as const, decodeFrame }
    await expect(prepareAnimationRuntime({ ...options, animations: [animation('a'), animation('b')] })).rejects.toThrow(/多个工程动画/)
    await expect(prepareAnimationRuntime({ ...options, animations: [updateForgeAnimationBinding(animation(), { ...binding, chunkIndex: 2 })] })).rejects.toThrow(/为空/)
    await expect(prepareAnimationRuntime({ ...options, palettes: [] })).rejects.toThrow(/PAT/)
    await expect(prepareAnimationRuntime({ ...options, decodeFrame: async () => { throw new Error('损坏图片') } })).rejects.toThrow(/损坏图片/)
    await expect(prepareAnimationRuntime({ ...options, files: [] })).rejects.toThrow(/游戏目录/)
    await expect(prepareAnimationRuntime({ ...options, files: [file, new File([await file.arrayBuffer()], 'MGO.MKF')] })).rejects.toThrow(/唯一/)
  })

  it('keeps disabled bindings out of the runtime and round-trips bindings in packs', async () => {
    const { file } = fixture()
    const draft = updateForgeAnimationBinding(animation(), { ...binding, enabled: false })
    expect(parseForgeAnimationPack(createForgeAnimationPack([draft]))).toEqual([draft])
    const result = await prepareAnimationRuntime({ files: [file], animations: [draft], palettes: [], profile: 'auto', decodeFrame })
    expect(result.files[0]).toBe(file)
    expect(result.replacements).toEqual([])
    expect(parseForgeAnimationPack({ ...createForgeAnimationPack([draft]), animations: [{ ...draft, runtimeBinding: { ...binding, archive: 'RNG.MKF' } }] })).toEqual([])
  })
})
