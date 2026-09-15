import { useEffect, useRef } from 'react'

/** Scrolls a cross-route configuration target into view when its brief highlight begins. */
export function useRouteFocusTarget<T extends HTMLElement>(active: boolean) {
  const ref = useRef<T>(null)

  useEffect(() => {
    const element = ref.current
    if (!active || !element || typeof element.scrollIntoView !== 'function') return
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    element.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' })
  }, [active])

  return ref
}
