import { useEffect, useRef, useState, type RefObject } from 'react'

// Width of an element in pixels, updated when it is resized. Charts draw
// themselves at exactly this width.
export function useElementWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new ResizeObserver((entries) => {
      setWidth(Math.floor(entries[0]?.contentRect.width ?? 0))
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return [ref, width]
}
