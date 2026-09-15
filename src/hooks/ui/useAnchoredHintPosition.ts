import type { Placement } from '@floating-ui/react-dom'
import { useEffect, useState } from 'react'

export interface AnchoredHintPosition {
  reference: HTMLElement
  gap: number
  placement: Placement
}

interface UseAnchoredHintPositionOptions {
  enabled: boolean
  selector: string
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

export function useAnchoredHintPosition({
  enabled,
  selector,
  gap = 12,
  horizontalAlign = 'center',
}: UseAnchoredHintPositionOptions): AnchoredHintPosition | null {
  const [reference, setReference] = useState<HTMLElement | null>(null)

  useEffect(() => {
    if (!enabled) {
      setReference(null)
      return
    }

    let animationFrame: number | null = null
    const updateReference = () => {
      animationFrame = null
      const nextReference = Array.from(document.querySelectorAll<HTMLElement>(selector)).find(
        isHintAnchorVisible,
      )
      setReference((current) => (current === nextReference ? current : (nextReference ?? null)))
    }
    const scheduleUpdate = () => {
      if (typeof window.requestAnimationFrame !== 'function') {
        updateReference()
        return
      }
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame)
      animationFrame = window.requestAnimationFrame(updateReference)
    }

    updateReference()
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

    return () => {
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame)
      window.removeEventListener('scroll', scheduleUpdate, true)
      document.removeEventListener('transitionend', scheduleUpdate, true)
      document.removeEventListener('animationend', scheduleUpdate, true)
      document.removeEventListener('visibilitychange', scheduleUpdate)
      mutationObserver.disconnect()
    }
  }, [enabled, selector])

  return reference
    ? {
        reference,
        gap,
        placement: horizontalAlign === 'end' ? 'bottom-end' : 'bottom',
      }
    : null
}
