import { useEffect, useState } from 'react'
import { Gamepad2, Link2, Unlink } from 'lucide-react'
import { RUNTIME_SPRITE_ARCHIVES, updateForgeAnimationBinding, type ForgeAnimationBinding, type ForgeAnimationDraft } from '../core/animationProject'
import { inspectRuntimeSprite, runtimeFrameIndices } from '../core/animationRuntime'
import type { GameProfile } from '../core/resourceDecoder'
import type { ImportedResource, PalPalette } from '../types'

export type AnimationSceneEvent = { spriteNumber: number; label: string }

type Props = {
  animation: ForgeAnimationDraft
  animations: ForgeAnimationDraft[]
  resources: ImportedResource[]
  palettes: PalPalette[]
  profile: GameProfile
  preferredPaletteKey: string
  sceneEvent?: AnimationSceneEvent
  canRun: boolean
  onChange: (animation: ForgeAnimationDraft) => void
  onRun: () => void
}

export function AnimationBindingPanel({ animation, animations, resources, palettes, profile, preferredPaletteKey, sceneEvent, canRun, onChange, onRun }: Props) {
  const binding = animation.runtimeBinding
  const [target, setTarget] = useState<{ frameCount: number; compression: string } | null>(null)
  const [error, setError] = useState('')
  const archive = resources.find((resource) => resource.name.toUpperCase() === binding?.archive)
  useEffect(() => {
    let cancelled = false
    setTarget(null)
    setError('')
    if (!binding) return
    const chunk = archive?.chunkIndex?.[binding.chunkIndex]
    if (!archive?.file || !chunk?.size) {
      setError('目标 chunk 不存在或尚未挂载，请检查游戏目录与编号')
      return
    }
    archive.file.slice(chunk.offset, chunk.offset + chunk.size).arrayBuffer().then((buffer) => {
      const result = inspectRuntimeSprite(new Uint8Array(buffer), archive.name, profile)
      if (!cancelled) setTarget(result)
    }).catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason)) })
    return () => { cancelled = true }
  }, [archive, binding?.archive, binding?.chunkIndex, profile])

  const patch = (next: Partial<ForgeAnimationBinding>) => {
    if (binding) onChange(updateForgeAnimationBinding(animation, { ...binding, ...next }))
  }
  const bind = (event?: AnimationSceneEvent) => {
    const source = /^pal:\/\/archives\/(MGO|F|ABC|FIRE)\.MKF\/chunks\/(\d+)$/i.exec(animation.source.originalUri ?? '')
    const preferred = palettes.find((palette) => `${palette.index}:${palette.variant}` === preferredPaletteKey) ?? palettes[0]
    const name = event ? 'MGO.MKF' : source ? `${source[1].toUpperCase()}.MKF` as ForgeAnimationBinding['archive'] : 'MGO.MKF'
    const chunkIndex = event?.spriteNumber ?? (source ? Number(source[2]) : resources.find((resource) => resource.name.toUpperCase() === name)?.chunkIndex?.find((chunk) => chunk.size > 0)?.index ?? 0)
    onChange(updateForgeAnimationBinding(animation, {
      archive: name, chunkIndex, paletteIndex: preferred?.index ?? 0, paletteVariant: preferred?.variant ?? 'day',
      frameMapping: 'exact', enabled: true,
    }))
  }
  let validation = error
  if (!validation && binding && target) {
    try { runtimeFrameIndices(animation.frames.length, target.frameCount, binding.frameMapping) }
    catch (reason) { validation = reason instanceof Error ? reason.message : String(reason) }
  }
  const conflict = binding?.enabled && animations.find((other) => other.id !== animation.id && other.runtimeBinding?.enabled
    && other.runtimeBinding.archive === binding.archive && other.runtimeBinding.chunkIndex === binding.chunkIndex)
  if (conflict) validation = `与“${conflict.name}”重复绑定，请禁用其中一个`

  return <section className="animation-binding-panel" aria-label="实机资源替换">
    <header><Link2 size={14} /><strong>实机资源替换</strong></header>
    {!binding ? <>
      <p>把工程动画绑定到原版精灵，启动 SDLPAL 时自动应用。</p>
      <button className="wide-button" onClick={() => bind()}>设置实机替换</button>
    </> : <>
      <label className="field switch-field"><span><b>启用此替换</b><small>保存工程及动画包时保留绑定</small></span><input type="checkbox" checked={binding.enabled} onChange={(event) => patch({ enabled: event.target.checked })} /></label>
      <label className="field"><span>目标资源库</span><select value={binding.archive} onChange={(event) => {
        const name = event.target.value as ForgeAnimationBinding['archive']
        patch({ archive: name, chunkIndex: resources.find((resource) => resource.name.toUpperCase() === name)?.chunkIndex?.find((chunk) => chunk.size > 0)?.index ?? 0 })
      }}>{RUNTIME_SPRITE_ARCHIVES.map((name) => <option key={name}>{name}</option>)}</select></label>
      <label className="field"><span>替换 Chunk 编号（从 0 开始）</span><input type="number" min={0} max={65535} value={binding.chunkIndex} onChange={(event) => patch({ chunkIndex: Math.max(0, Math.min(65535, Math.round(Number(event.target.value) || 0))) })} /></label>
      <label className="field"><span>颜色匹配到 PAT</span><select value={`${binding.paletteIndex}:${binding.paletteVariant}`} onChange={(event) => {
        const [index, variant] = event.target.value.split(':')
        patch({ paletteIndex: Number(index), paletteVariant: variant as 'day' | 'night' })
      }}>
        {!palettes.some((palette) => palette.index === binding.paletteIndex && palette.variant === binding.paletteVariant) && <option value={`${binding.paletteIndex}:${binding.paletteVariant}`}>PAT #{binding.paletteIndex} · 未挂载</option>}
        {palettes.filter((palette) => palette.index >= 0).map((palette) => <option key={`${palette.index}:${palette.variant}`} value={`${palette.index}:${palette.variant}`}>PAT #{palette.index} · {palette.variant === 'night' ? '夜间' : '日间'}</option>)}
      </select></label>
      <label className="field"><span>原版帧位映射</span><select value={binding.frameMapping} onChange={(event) => patch({ frameMapping: event.target.value as 'exact' | 'repeat' })}>
        <option value="exact">逐帧对应（帧数必须相同）</option>
        <option value="repeat">循环填满原版帧位</option>
      </select></label>
      <div className={`binding-status ${validation ? 'error' : ''}`} role="status">
        {target && <strong>原版 {target.frameCount} 帧 · 工程 {animation.frames.length} 帧 · {target.compression}</strong>}
        <span>{validation || (target ? '目标可替换；启动时将检查图片及编码大小' : '正在检查目标资源…')}</span>
      </div>
      <p>按原版方向与动作顺序排列。循环填充按序重复，不会自动生成方向。所有引用同一 chunk 的对象都会变化。</p>
      <p>实机帧速和循环由原版脚本控制；颜色会匹配到 256 色，透明度以 128 为界。测试场景应使用所选 PAT；昼夜切换仍由引擎决定。</p>
      <button className="primary-button wide-button" disabled={!canRun || !binding.enabled || !target || Boolean(validation)} onClick={onRun}><Gamepad2 size={14} /> 在当前场景实机测试</button>
      {!canRun && <p>先在地图页打开一个真实场景。战斗/法术资源需在游戏中触发对应动作才能看到。</p>}
      <button className="wide-button" onClick={() => onChange(updateForgeAnimationBinding(animation, undefined))}><Unlink size={13} /> 解除绑定</button>
    </>}
    {sceneEvent && <button className="wide-button" onClick={() => bind(sceneEvent)}>绑定所选事件 · {sceneEvent.label} / MGO #{sceneEvent.spriteNumber}</button>}
  </section>
}
