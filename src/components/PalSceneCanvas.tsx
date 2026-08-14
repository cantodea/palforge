import { useEffect, useRef } from 'react'
import { grayscalePalette } from '../core/palette'
import { indexedToRgba } from '../core/rle'
import { selectEventFrame, type LoadedPalEvent, type LoadedPalScene } from '../core/sceneLoader'
import type { PalEventObject } from '../core/scene'
import type { SpriteFrame } from '../core/sprite'
import type { PalPalette } from '../types'

export type PalTileSelection = { x: number; y: number; half: number }

type PalSceneCanvasProps = {
  scene: LoadedPalScene
  palette?: PalPalette
  zoom: number
  showGrid: boolean
  selectedTile: PalTileSelection
  selectedEventIndex: number | null
  eventOverrides?: Record<string, PalEventObject>
  debugParty?: { x: number; y: number; direction: number }
  onSelectTile: (tile: PalTileSelection) => void
  onSelectEvent: (event: LoadedPalEvent) => void
}

const MARGIN_X = 72
const MARGIN_Y = 72
const WORLD_WIDTH = 64 * 32 + 32
const WORLD_HEIGHT = 128 * 16 + 16

function imageCanvas(frame: { image: LoadedPalEvent['frames'][number]['image'] }, palette: PalPalette) {
  const canvas = document.createElement('canvas')
  canvas.width = frame.image.width
  canvas.height = frame.image.height
  const context = canvas.getContext('2d')
  if (!context) return canvas
  const rgba = indexedToRgba(frame.image, palette)
  context.putImageData(new ImageData(rgba, frame.image.width, frame.image.height), 0, 0)
  return canvas
}

function tileDiamond(context: CanvasRenderingContext2D, centerX: number, centerY: number, zoom: number) {
  context.beginPath()
  context.moveTo(centerX, centerY - 8 * zoom)
  context.lineTo(centerX + 16 * zoom, centerY)
  context.lineTo(centerX, centerY + 8 * zoom)
  context.lineTo(centerX - 16 * zoom, centerY)
  context.closePath()
}

export function PalSceneCanvas({
  scene,
  palette = grayscalePalette(),
  zoom,
  showGrid,
  selectedTile,
  selectedEventIndex,
  eventOverrides,
  debugParty,
  onSelectTile,
  onSelectEvent,
}: PalSceneCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const centeredSceneRef = useRef<number | null>(null)
  const metricsRef = useRef({ zoom, width: 0, height: 0 })

  useEffect(() => {
    const canvas = canvasRef.current
    const box = boxRef.current
    if (!canvas || !box) return

    const draw = () => {
      const ratio = window.devicePixelRatio || 1
      const bounds = box.getBoundingClientRect()
      const nativeWidth = WORLD_WIDTH + MARGIN_X * 2
      const nativeHeight = WORLD_HEIGHT + MARGIN_Y * 2
      const width = Math.max(bounds.width, Math.ceil(nativeWidth * zoom))
      const height = Math.max(bounds.height, Math.ceil(nativeHeight * zoom))
      canvas.width = Math.ceil(width * ratio)
      canvas.height = Math.ceil(height * ratio)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      metricsRef.current = { zoom, width, height }

      const context = canvas.getContext('2d')
      if (!context) return
      context.scale(ratio, ratio)
      context.clearRect(0, 0, width, height)
      context.imageSmoothingEnabled = false

      const offsetX = Math.max(0, (width / zoom - nativeWidth) / 2) + MARGIN_X
      const offsetY = Math.max(0, (height / zoom - nativeHeight) / 2) + MARGIN_Y
      const toScreenX = (value: number) => (offsetX + value) * zoom
      const toScreenY = (value: number) => (offsetY + value) * zoom
      const frameCanvases = new Map<SpriteFrame, HTMLCanvasElement>()
      const tileFrames = new Map(scene.tileset.map((frame) => [frame.index, frame]))

      const getFrameCanvas = (frame: LoadedPalEvent['frames'][number]) => {
        const cached = frameCanvases.get(frame)
        if (cached) return cached
        const rendered = imageCanvas(frame, palette)
        frameCanvases.set(frame, rendered)
        return rendered
      }
      const drawFrame = (frame: LoadedPalEvent['frames'][number], x: number, y: number) => {
        const rendered = getFrameCanvas(frame)
        context.drawImage(rendered, toScreenX(x), toScreenY(y), rendered.width * zoom, rendered.height * zoom)
      }

      context.fillStyle = '#080d11'
      context.fillRect(0, 0, width, height)

      // SDLPAL first blits all bottom tiles at the staggered 32 x 16 coordinates.
      for (let y = 0; y < scene.map.height; y += 1) {
        for (let half = 0; half < 2; half += 1) {
          for (let x = 0; x < scene.map.width; x += 1) {
            const tile = scene.map.tiles[y][x][half]
            const frame = tileFrames.get(tile.bottomFrame) ?? scene.tileset[0]
            if (frame) drawFrame(frame, x * 32 + half * 16 - 16, y * 16 + half * 8 - 8)
          }
        }
      }

      // The top pass contains trees, roofs and other foreground graphics.
      for (let y = 0; y < scene.map.height; y += 1) {
        for (let half = 0; half < 2; half += 1) {
          for (let x = 0; x < scene.map.width; x += 1) {
            const frameIndex = scene.map.tiles[y][x][half].topFrame
            const frame = frameIndex === null ? undefined : tileFrames.get(frameIndex)
            if (frame) drawFrame(frame, x * 32 + half * 16 - 16, y * 16 + half * 8 - 8)
          }
        }
      }

      type Overlay = { sortY: number; draw: () => void }
      const overlays: Overlay[] = []

      // Height-bearing tiles are redrawn in the sprite depth queue, matching
      // the way SDLPAL lets roofs and cliffs cover event objects.
      for (let y = 0; y < scene.map.height; y += 1) {
        for (let half = 0; half < 2; half += 1) {
          for (let x = 0; x < scene.map.width; x += 1) {
            const tile = scene.map.tiles[y][x][half]
            for (const layer of [0, 1] as const) {
              const heightValue = layer === 0 ? tile.bottomHeight : tile.topHeight
              const frameIndex = layer === 0 ? tile.bottomFrame : tile.topFrame
              const frame = frameIndex === null ? undefined : tileFrames.get(frameIndex)
              if (!frame || heightValue <= 0) continue
              const baseX = x * 32 + half * 16 - 16
              const baseY = y * 16 + half * 8 + 7 - frame.image.height
              overlays.push({
                sortY: y * 16 + half * 8 + 7 + layer + heightValue * 8,
                draw: () => drawFrame(frame, baseX, baseY),
              })
            }
          }
        }
      }

      for (const event of scene.events) {
        const object = eventOverrides?.[String(event.object.index + 1)] ?? event.object
        const frame = selectEventFrame({ ...event, object })
        const visible = object.state > 0 && object.vanishTime <= 0
        if (frame && visible) {
          overlays.push({
            sortY: object.y + object.layer * 8 + 9,
            draw: () => {
              drawFrame(frame, object.x - frame.image.width / 2, object.y + 7 - frame.image.height)
              if (object.index === selectedEventIndex) {
                context.strokeStyle = '#f0be65'
                context.lineWidth = Math.max(1, 2 * zoom)
                context.strokeRect(
                  toScreenX(object.x - frame.image.width / 2) - 2,
                  toScreenY(object.y + 7 - frame.image.height) - 2,
                  frame.image.width * zoom + 4,
                  frame.image.height * zoom + 4,
                )
              }
            },
          })
        }
      }
      overlays.sort((left, right) => left.sortY - right.sortY).forEach((item) => item.draw())

      // Sprite-less and hidden events remain selectable editor markers.
      for (const event of scene.events) {
        const object = eventOverrides?.[String(event.object.index + 1)] ?? event.object
        if (selectEventFrame({ ...event, object }) && object.state > 0 && object.vanishTime <= 0) continue
        const x = toScreenX(object.x)
        const y = toScreenY(object.y)
        context.fillStyle = object.index === selectedEventIndex ? '#f0be65' : 'rgba(201, 218, 216, .65)'
        context.beginPath()
        context.arc(x, y, Math.max(3, 5 * zoom), 0, Math.PI * 2)
        context.fill()
      }

      if (debugParty) {
        const x = toScreenX(debugParty.x)
        const y = toScreenY(debugParty.y)
        context.save()
        context.translate(x, y)
        context.rotate((debugParty.direction % 4) * Math.PI / 2)
        context.fillStyle = '#69b8be'
        context.strokeStyle = '#d9ffff'
        context.lineWidth = Math.max(1, 1.5 * zoom)
        context.beginPath()
        context.moveTo(0, -Math.max(7, 10 * zoom))
        context.lineTo(Math.max(6, 8 * zoom), Math.max(5, 7 * zoom))
        context.lineTo(0, Math.max(2, 4 * zoom))
        context.lineTo(-Math.max(6, 8 * zoom), Math.max(5, 7 * zoom))
        context.closePath()
        context.fill()
        context.stroke()
        context.restore()
      }

      if (showGrid) {
        context.strokeStyle = 'rgba(223, 235, 232, .10)'
        context.lineWidth = 1
        for (let y = 0; y < scene.map.height; y += 1) {
          for (let half = 0; half < 2; half += 1) {
            for (let x = 0; x < scene.map.width; x += 1) {
              tileDiamond(context, toScreenX(x * 32 + half * 16), toScreenY(y * 16 + half * 8), zoom)
              context.stroke()
            }
          }
        }
      }

      tileDiamond(
        context,
        toScreenX(selectedTile.x * 32 + selectedTile.half * 16),
        toScreenY(selectedTile.y * 16 + selectedTile.half * 8),
        zoom,
      )
      context.strokeStyle = '#f0be65'
      context.lineWidth = 2
      context.stroke()

      if (centeredSceneRef.current !== scene.record.number) {
        centeredSceneRef.current = scene.record.number
        const focus = scene.events.find((event) => event.object.state > 0)?.object
        window.requestAnimationFrame(() => {
          const focusX = (offsetX + (focus?.x ?? WORLD_WIDTH / 2)) * zoom
          const focusY = (offsetY + (focus?.y ?? WORLD_HEIGHT / 2)) * zoom
          box.scrollLeft = Math.max(0, focusX - box.clientWidth / 2)
          box.scrollTop = Math.max(0, focusY - box.clientHeight / 2)
        })
      }
    }

    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(box)
    return () => observer.disconnect()
  }, [debugParty, eventOverrides, palette, scene, selectedEventIndex, selectedTile, showGrid, zoom])

  const handlePointer = (pointer: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    const box = boxRef.current
    if (!canvas || !box) return
    const bounds = canvas.getBoundingClientRect()
    const { width, height } = metricsRef.current
    const nativeWidth = WORLD_WIDTH + MARGIN_X * 2
    const nativeHeight = WORLD_HEIGHT + MARGIN_Y * 2
    const offsetX = Math.max(0, (width / zoom - nativeWidth) / 2) + MARGIN_X
    const offsetY = Math.max(0, (height / zoom - nativeHeight) / 2) + MARGIN_Y
    const worldX = (pointer.clientX - bounds.left) / zoom - offsetX
    const worldY = (pointer.clientY - bounds.top) / zoom - offsetY

    const event = scene.events
      .map((item) => {
        const object = eventOverrides?.[String(item.object.index + 1)] ?? item.object
        return { item, distance: Math.hypot(object.x - worldX, object.y - worldY) }
      })
      .filter(({ distance }) => distance <= 18 / Math.max(zoom, 0.25))
      .sort((left, right) => left.distance - right.distance)[0]?.item
    if (event) {
      onSelectEvent(event)
      return
    }

    let best: { tile: PalTileSelection; score: number } | undefined
    const halfRow = Math.round(worldY / 8)
    for (let row = halfRow - 2; row <= halfRow + 2; row += 1) {
      const half = ((row % 2) + 2) % 2
      const y = Math.floor(row / 2)
      if (y < 0 || y >= scene.map.height) continue
      const xGuess = Math.round((worldX - half * 16) / 32)
      for (let x = xGuess - 1; x <= xGuess + 1; x += 1) {
        if (x < 0 || x >= scene.map.width) continue
        const dx = Math.abs(worldX - (x * 32 + half * 16)) / 16
        const dy = Math.abs(worldY - (y * 16 + half * 8)) / 8
        const score = dx + dy
        if (score <= 1.2 && (!best || score < best.score)) best = { tile: { x, y, half }, score }
      }
    }
    if (best) onSelectTile(best.tile)
  }

  return (
    <div className="map-canvas pal-scene-canvas" ref={boxRef}>
      <canvas ref={canvasRef} onPointerDown={handlePointer} />
      <div className="canvas-hint">{debugParty ? '调试沙盒叠加中 · 青色标记为队伍位置 · 原资源未修改' : '真实 MAP/GOP 场景 · 滚动查看 · 点击图块或事件'}</div>
    </div>
  )
}
