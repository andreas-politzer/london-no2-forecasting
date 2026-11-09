import { useRef, useState, type PointerEvent } from 'react'
import { clamp } from './svg'

type Plot = { left: number; right: number; top: number; bottom: number }

type Options = {
  plot: Plot
  onBrush: (x0: number, x1: number, y0: number, y1: number) => void // pixels, sorted
  onClick: () => void
}

// Rectangle brush for a plot area covered by a transparent rectangle that
// starts at (left, top). A drag smaller than 4 pixels in either direction is a
// click.
export function useBrush2D({ plot, onBrush, onClick }: Options) {
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const start = useRef<[number, number] | null>(null)

  const position = (event: PointerEvent<SVGRectElement>): [number, number] => {
    const rect = event.currentTarget.getBoundingClientRect()
    return [
      clamp(plot.left + event.clientX - rect.left, plot.left, plot.right),
      clamp(plot.top + event.clientY - rect.top, plot.top, plot.bottom),
    ]
  }

  return {
    drag,
    handlers: {
      onPointerDown(event: PointerEvent<SVGRectElement>) {
        if (event.button !== 0) return
        event.currentTarget.setPointerCapture(event.pointerId)
        const [x, y] = position(event)
        start.current = [x, y]
        setDrag({ x0: x, y0: y, x1: x, y1: y })
      },
      onPointerMove(event: PointerEvent<SVGRectElement>) {
        if (start.current === null) return
        const [x, y] = position(event)
        setDrag({ x0: start.current[0], y0: start.current[1], x1: x, y1: y })
      },
      onPointerUp(event: PointerEvent<SVGRectElement>) {
        if (start.current === null) return
        const [x, y] = position(event)
        const [sx, sy] = start.current
        start.current = null
        setDrag(null)
        if (Math.abs(x - sx) < 4 || Math.abs(y - sy) < 4) onClick()
        else onBrush(Math.min(sx, x), Math.max(sx, x), Math.min(sy, y), Math.max(sy, y))
      },
      onPointerCancel() {
        start.current = null
        setDrag(null)
      },
    },
  }
}
