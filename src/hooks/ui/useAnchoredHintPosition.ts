import { useEffect, useState } from 'react'

export interface AnchoredHintPosition {
  top: number
  left: number
  arrowLeft: number
}

interface UseAnchoredHintPositionOptions {
  enabled: boolean
  selector: string
  width: number
  gap?: number
  horizontalAlign?: 'center' | 'end'
}

function clipsAxis(value: string) {
  return value === 'auto' || value === 'clip' || value === 'hidden' || value === 'scroll'
}

export function isHintAnchorVisible(element: HTMLElement): boolean {
  if (!element.isConnected || element.hidden) return false

  const rect = element.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return false

  const centerX = rect.left + rect.width / 2
  const centerY = rect.top + rect.height / 2
  if (centerX < 0 || centerX > window.innerWidth || centerY < 0 || centerY > window.innerHeight) {
    return false
  }

  let current: HTMLElement | null = element
  while (current) {
    const style = window.getComputedStyle(current)
    if (
      style.display === 'none' ||
      style.contentVisibility === 'hidden' ||
      style.visibility === 'hidden' ||
      style.visibility === 'collapse' ||
      Number.parseFloat(style.opacity || '1') === 0
    ) {
      return false
    }

    if (current !== element) {
      const currentRect = current.getBoundingClientRect()
      const clipsX = clipsAxis(style.overflowX) || clipsAxis(style.overflow)
      const clipsY = clipsAxis(style.overflowY) || clipsAxis(style.overflow)
      if (clipsX && (centerX < currentRect.left || centerX > currentRect.right)) return false
      if (clipsY && (centerY < currentRect.top || centerY > currentRect.bottom)) return false
    }

    current = current.parentElement
  }

  const elementsAtAnchor = document.elementsFromPoint?.(centerX, centerY)
  if (!elementsAtAnchor || elementsAtAnchor.length === 0) return true

  const topmostElement = elementsAtAnchor[0]
  return element === topmostElement || element.contains(topmostElement)
}

function positionsMatch(current: AnchoredHintPosition | null, next: AnchoredHintPosition | null) {
  if (current === next) return true
  if (!current || !next) return false
  return (
    current.top === next.top && current.left === next.left && current.arrowLeft === next.arrowLeft
  )
}

export function useAnchoredHintPosition({
  enabled,
  selector,
  width,
  gap = 12,
  horizontalAlign = 'center',
}: UseAnchoredHintPositionOptions): AnchoredHintPosition | null {
  const [position, setPosition] = useState<AnchoredHintPosition | null>(null)

  useEffect(() => {
    if (!enabled) {
      setPosition(null)
      return
    }

    let animationFrame: number | null = null
    let resizeObserver: ResizeObserver | null = null
    const observedAnchors = new Set<HTMLElement>()

    const updatePosition = () => {
      animationFrame = null
      const anchors = Array.from(document.querySelectorAll<HTMLElement>(selector))
      if (resizeObserver) {
        for (const observedAnchor of observedAnchors) {
          if (!anchors.includes(observedAnchor)) {
            resizeObserver.unobserve(observedAnchor)
            observedAnchors.delete(observedAnchor)
          }
        }
        for (const currentAnchor of anchors) {
          if (!observedAnchors.has(currentAnchor)) {
            resizeObserver.observe(currentAnchor)
            observedAnchors.add(currentAnchor)
          }
        }
      }
      const anchor = anchors.find(isHintAnchorVisible)

      let nextPosition: AnchoredHintPosition | null = null
      if (anchor) {
        const rect = anchor.getBoundingClientRect()
        const centerX = rect.left + rect.width / 2
        const maxLeft = Math.max(16, window.innerWidth - width - 16)
        const preferredLeft = horizontalAlign === 'end' ? rect.right - width : centerX - width / 2
        const left = Math.min(Math.max(preferredLeft, 16), maxLeft)
        const arrowLeft = Math.min(Math.max(centerX - left, 18), width - 18)
        nextPosition = { top: rect.bottom + gap, left, arrowLeft }
      }

      setPosition((currentPosition) =>
        positionsMatch(currentPosition, nextPosition) ? currentPosition : nextPosition,
      )
    }

    const scheduleUpdate = () => {
      if (typeof window.requestAnimationFrame !== 'function') {
        updatePosition()
        return
      }
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame)
      animationFrame = window.requestAnimationFrame(updatePosition)
    }

    updatePosition()
    window.addEventListener('resize', scheduleUpdate)
    window.addEventListener('scroll', scheduleUpdate, true)
    document.addEventListener('transitionend', scheduleUpdate, true)
    document.addEventListener('animationend', scheduleUpdate, true)
    document.addEventListener('visibilitychange', scheduleUpdate)

    const mutationObserver = new MutationObserver(scheduleUpdate)
    mutationObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['aria-hidden', 'class', 'hidden', 'open', 'style'],
      childList: true,
      subtree: true,
    })

    resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleUpdate)
    if (resizeObserver) {
      for (const anchor of document.querySelectorAll<HTMLElement>(selector)) {
        resizeObserver.observe(anchor)
      }
    }

    return () => {
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame)
      window.removeEventListener('resize', scheduleUpdate)
      window.removeEventListener('scroll', scheduleUpdate, true)
      document.removeEventListener('transitionend', scheduleUpdate, true)
      document.removeEventListener('animationend', scheduleUpdate, true)
      document.removeEventListener('visibilitychange', scheduleUpdate)
      mutationObserver.disconnect()
      resizeObserver?.disconnect()
    }
  }, [enabled, gap, horizontalAlign, selector, width])

  return position
}
