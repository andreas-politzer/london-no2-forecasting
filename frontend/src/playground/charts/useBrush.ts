import { useRef, useState, type PointerEvent } from 'react'
import { brushRange, clamp } from './svg'

type Options = {
  left: number // plot area in svg pixels
  right: number
  onBrush: (from: number, to: number) => void // pixel range of a drag
  onClick: (pixel: number) => void // a drag that was too short
  onMove: (pixel: number | null) => void // hover position, null when it leaves
}

// Pointer handling for a transparent rectangle that covers the plot area: drag
// to brush, click without moving, hover to inspect. The rectangle must start at
// x = left, so the pixel position is measured from the rectangle's edge.
export function useBrush({ left, right, onBrush, onClick, onMove }: Options) {
  const [drag, setDrag] = useState<[number, number] | null>(null)
  const start = useRef<number | null>(null)

  const position = (event: PointerEvent<SVGRectElement>) =>
    clamp(left + event.clientX - event.currentTarget.getBoundingClientRect().left, left, right)

  return {
    drag,
    handlers: {
      onPointerDown(event: PointerEvent<SVGRectElement>) {
        if (event.button !== 0) return
        event.currentTarget.setPointerCapture(event.pointerId)
        const x = position(event)
        start.current = x
        setDrag([x, x])
      },
      onPointerMove(event: PointerEvent<SVGRectElement>) {
        const x = position(event)
        onMove(x)
        if (start.current !== null) setDrag([start.current, x])
      },
      onPointerUp(event: PointerEvent<SVGRectElement>) {
        if (start.current === null) return
        const x = position(event)
        const range = brushRange(start.current, x)
        start.current = null
        setDrag(null)
        if (range) onBrush(range[0], range[1])
        else onClick(x)
      },
      onPointerCancel() {
        start.current = null
        setDrag(null)
      },
      onPointerLeave() {
        if (start.current === null) onMove(null)
      },
    },
  }
}
