import { useEffect, useRef, useState } from 'react'

const ROUTE_FOCUS_PULSE_DURATION_MS = 1_200

/** Scrolls a cross-route configuration target into view and briefly identifies it. */
export function useRouteFocusTarget<T extends HTMLElement>(active: boolean) {
  const ref = useRef<T>(null)
  const [highlighted, setHighlighted] = useState(false)

  useEffect(() => {
    if (!active) {
      setHighlighted(false)
      return
    }

    setHighlighted(false)
    let cancelled = false
    let nestedFrame: number | undefined
    let highlightFrame: number | undefined
    let timeout: number | undefined
    let observer: IntersectionObserver | undefined

    const startHighlight = () => {
      observer?.disconnect()
      highlightFrame = window.requestAnimationFrame(() => {
        if (cancelled) return
        setHighlighted(true)
        timeout = window.setTimeout(() => setHighlighted(false), ROUTE_FOCUS_PULSE_DURATION_MS)
      })
    }

    const frame = window.requestAnimationFrame(() => {
      nestedFrame = window.requestAnimationFrame(() => {
        const element = ref.current
        if (!element) return

        if (typeof element.scrollIntoView === 'function') {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }

        if (typeof IntersectionObserver === 'undefined') {
          startHighlight()
          return
        }

        observer = new IntersectionObserver(
          (entries) => {
            if (entries.some((entry) => entry.target === element && entry.isIntersecting)) {
              startHighlight()
            }
          },
          { threshold: 0.01 },
        )
        observer.observe(element)
      })
    })

    return () => {
      cancelled = true
      window.cancelAnimationFrame(frame)
      if (nestedFrame !== undefined) window.cancelAnimationFrame(nestedFrame)
      if (highlightFrame !== undefined) window.cancelAnimationFrame(highlightFrame)
      if (timeout !== undefined) window.clearTimeout(timeout)
      observer?.disconnect()
    }
  }, [active])

  return { ref, highlighted }
}
