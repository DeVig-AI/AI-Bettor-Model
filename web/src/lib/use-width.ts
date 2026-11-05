import { useLayoutEffect, useRef, useState } from 'react'

// The width of an element in CSS pixels, kept current as it resizes. Charts draw at this width (viewBox = real pixels)
// so their text stays the size it's set to instead of growing with a wide card on a computer.
export function useWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null)
  const [w, setW] = useState(fallback)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const set = () => { const v = el.clientWidth; if (v) setW(v) }
    set()
    const ro = new ResizeObserver(set)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}
