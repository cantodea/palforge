import { useEffect, useRef } from 'react'
import type { MapEvent, SceneMap, TerrainKind } from '../types'

type MapCanvasProps = {
  map: SceneMap
  zoom: number
  showGrid: boolean
  selectedTile: { x: number; y: number }
  selectedEventId: string
  activeTool: 'select' | 'paint' | 'event'
  brush: TerrainKind
  onSelectTile: (x: number, y: number) => void
  onSelectEvent: (event: MapEvent) => void
  onPaint: (x: number, y: number) => void
}

const palette: Record<TerrainKind, { top: string; edge: string }> = {
  grass: { top: '#527b55', edge: '#315139' },
  path: { top: '#ad9364', edge: '#6f593c' },
  water: { top: '#276a81', edge: '#174759' },
  stone: { top: '#6e7475', edge: '#444a4b' },
  flower: { top: '#647f55', edge: '#3b593c' },
}

function diamond(
  context: CanvasRenderingContext2D,
  centerX: number,
  topY: number,
  width: number,
  height: number,
) {
  context.beginPath()
  context.moveTo(centerX, topY)
  context.lineTo(centerX + width / 2, topY + height / 2)
  context.lineTo(centerX, topY + height)
  context.lineTo(centerX - width / 2, topY + height / 2)
  context.closePath()
}

export function MapCanvas({
  map,
  zoom,
  showGrid,
  selectedTile,
  selectedEventId,
  activeTool,
  onSelectTile,
  onSelectEvent,
  onPaint,
}: MapCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const metricsRef = useRef({ originX: 0, originY: 60, tileWidth: 64, tileHeight: 32 })

  useEffect(() => {
    const canvas = canvasRef.current
    const box = boxRef.current
    if (!canvas || !box) return

    const draw = () => {
      const ratio = window.devicePixelRatio || 1
      const bounds = box.getBoundingClientRect()
      const width = Math.max(660, bounds.width)
      const height = Math.max(440, bounds.height)
      canvas.width = width * ratio
      canvas.height = height * ratio
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`

      const context = canvas.getContext('2d')
      if (!context) return
      context.scale(ratio, ratio)
      context.clearRect(0, 0, width, height)

      const tileWidth = 64 * zoom
      const tileHeight = 32 * zoom
      const mapPixelWidth = ((map.width + map.height) * tileWidth) / 2
      const originX = Math.max(width / 2, mapPixelWidth / 2 + 24)
      const originY = 58
      metricsRef.current = { originX, originY, tileWidth, tileHeight }

      const glow = context.createRadialGradient(
        width / 2,
        height / 2,
        20,
        width / 2,
        height / 2,
        Math.max(width, height) / 1.4,
      )
      glow.addColorStop(0, 'rgba(44, 80, 83, .22)')
      glow.addColorStop(1, 'rgba(10, 15, 20, 0)')
      context.fillStyle = glow
      context.fillRect(0, 0, width, height)

      for (let y = 0; y < map.height; y += 1) {
        for (let x = 0; x < map.width; x += 1) {
          const tile = map.tiles[y][x]
          const screenX = originX + (x - y) * (tileWidth / 2)
          const baseY = originY + (x + y) * (tileHeight / 2)
          const lift = tile.elevation * tileHeight * 0.35
          const screenY = baseY - lift

          if (tile.elevation > 0) {
            context.fillStyle = palette[tile.terrain].edge
            context.beginPath()
            context.moveTo(screenX - tileWidth / 2, screenY + tileHeight / 2)
            context.lineTo(screenX, screenY + tileHeight)
            context.lineTo(screenX, baseY + tileHeight)
            context.lineTo(screenX - tileWidth / 2, baseY + tileHeight / 2)
            context.closePath()
            context.fill()
            context.fillStyle = '#263f31'
            context.beginPath()
            context.moveTo(screenX + tileWidth / 2, screenY + tileHeight / 2)
            context.lineTo(screenX, screenY + tileHeight)
            context.lineTo(screenX, baseY + tileHeight)
            context.lineTo(screenX + tileWidth / 2, baseY + tileHeight / 2)
            context.closePath()
            context.fill()
          }

          diamond(context, screenX, screenY, tileWidth, tileHeight)
          context.fillStyle = palette[tile.terrain].top
          context.fill()

          if (tile.terrain === 'water') {
            context.strokeStyle = 'rgba(132, 213, 224, .25)'
            context.lineWidth = 1
            context.beginPath()
            context.moveTo(screenX - tileWidth * 0.18, screenY + tileHeight * 0.43)
            context.lineTo(screenX + tileWidth * 0.12, screenY + tileHeight * 0.58)
            context.stroke()
          }
          if (tile.terrain === 'flower') {
            context.fillStyle = '#e0be66'
            context.beginPath()
            context.arc(screenX - 4, screenY + tileHeight / 2, 1.8 * zoom, 0, Math.PI * 2)
            context.fill()
            context.fillStyle = '#d77b71'
            context.beginPath()
            context.arc(screenX + 6, screenY + tileHeight / 2 + 2, 1.5 * zoom, 0, Math.PI * 2)
            context.fill()
          }

          if (showGrid) {
            diamond(context, screenX, screenY, tileWidth, tileHeight)
            context.strokeStyle = 'rgba(225, 235, 225, .13)'
            context.lineWidth = 1
            context.stroke()
          }

          if (selectedTile.x === x && selectedTile.y === y) {
            diamond(context, screenX, screenY - 1, tileWidth - 3, tileHeight - 2)
            context.strokeStyle = '#f0be65'
            context.lineWidth = 2
            context.stroke()
          }
        }
      }

      for (const event of map.events) {
        const tile = map.tiles[event.y][event.x]
        const screenX = originX + (event.x - event.y) * (tileWidth / 2)
        const screenY =
          originY + (event.x + event.y) * (tileHeight / 2) -
          tile.elevation * tileHeight * 0.35
        const active = event.id === selectedEventId

        context.shadowColor = active ? '#f0be65' : 'rgba(0, 0, 0, .5)'
        context.shadowBlur = active ? 14 : 6
        context.fillStyle = active ? '#f0be65' : '#dfe8de'
        context.beginPath()
        context.arc(screenX, screenY + tileHeight * 0.23, active ? 8 : 6, 0, Math.PI * 2)
        context.fill()
        context.shadowBlur = 0
        context.fillStyle = active ? '#2c2415' : '#1d2a2e'
        context.font = `600 ${Math.max(8, 9 * zoom)}px system-ui`
        context.textAlign = 'center'
        context.fillText(
          event.icon === 'door' ? '门' : event.icon === 'chest' ? '箱' : '人',
          screenX,
          screenY + tileHeight * 0.23 + 3,
        )
      }
    }

    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(box)
    return () => observer.disconnect()
  }, [map, selectedEventId, selectedTile, showGrid, zoom])

  const handlePointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const bounds = canvas.getBoundingClientRect()
    const pointerX = event.clientX - bounds.left
    const pointerY = event.clientY - bounds.top
    const { originX, originY, tileWidth, tileHeight } = metricsRef.current
    const horizontal = (pointerX - originX) / (tileWidth / 2)
    const vertical = (pointerY - originY - tileHeight / 2) / (tileHeight / 2)
    const x = Math.round((vertical + horizontal) / 2)
    const y = Math.round((vertical - horizontal) / 2)

    if (x < 0 || y < 0 || x >= map.width || y >= map.height) return
    const nearbyEvent = map.events.find((item) => item.x === x && item.y === y)
    if (nearbyEvent && activeTool !== 'paint') {
      onSelectEvent(nearbyEvent)
      return
    }
    onSelectTile(x, y)
    if (activeTool === 'paint') onPaint(x, y)
  }

  return (
    <div className="map-canvas" ref={boxRef}>
      <canvas ref={canvasRef} onPointerDown={handlePointer} />
      <div className="canvas-hint">拖动画布 · 滚轮缩放 · 点击选择</div>
    </div>
  )
}
