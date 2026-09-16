import { useEffect, useRef, useState } from 'react'

const ROUTE_FOCUS_DURATION_MS = 1_800

/** Scrolls a cross-route configuration target into view and briefly identifies it. */
export function useRouteFocusTarget<T extends HTMLElement>(active: boolean) {
  const ref = useRef<T>(null)
  const [highlighted, setHighlighted] = useState(active)

  useEffect(() => {
    if (!active) {
      setHighlighted(false)
      return
    }

    setHighlighted(true)
    let nestedFrame: number | undefined
    const frame = window.requestAnimationFrame(() => {
      nestedFrame = window.requestAnimationFrame(() => {
        const element = ref.current
        if (element && typeof element.scrollIntoView === 'function') {
          const reduceMotion =
            window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
          element.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' })
        }
      })
    })

    const timeout = window.setTimeout(() => setHighlighted(false), ROUTE_FOCUS_DURATION_MS)
    return () => {
      window.cancelAnimationFrame(frame)
      if (nestedFrame !== undefined) window.cancelAnimationFrame(nestedFrame)
      window.clearTimeout(timeout)
    }
  }, [active])

  return { ref, highlighted }
}
