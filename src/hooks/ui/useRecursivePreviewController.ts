import { useCallback, useEffect, useRef, useState } from 'react'
import {
  clampPreviewPosition,
  type PreviewBounds,
  type PreviewPosition,
} from '@/lib/overlayPosition'
import type { RecursiveHintState } from '@/lib/renderer/recursiveTooltip'

export interface PinnedPreviewState {
  depth: number
  position: PreviewPosition
}

interface RecursivePreviewControllerOptions {
  isRootOpen: boolean
  safeTop: number
  rootRef: React.RefObject<HTMLElement | null>
  onRootOpen: () => void
  onRootClose: () => void
  onCloseFocus?: () => void
  hideDelayMs?: number
}

export function useRecursivePreviewController({
  isRootOpen,
  safeTop,
  rootRef,
  onRootOpen,
  onRootClose,
  onCloseFocus,
  hideDelayMs = 200,
}: RecursivePreviewControllerOptions) {
  const [recursiveHints, setRecursiveHints] = useState<RecursiveHintState[]>([])
  const [pinnedPreview, setPinnedPreview] = useState<PinnedPreviewState | null>(null)
  const pinnedRef = useRef(false)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pinnedDepth = pinnedPreview?.depth ?? null

  const clearHide = useCallback(() => {
    if (hideTimerRef.current === null) return
    clearTimeout(hideTimerRef.current)
    hideTimerRef.current = null
  }, [])

  const closeAll = useCallback(() => {
    clearHide()
    pinnedRef.current = false
    setPinnedPreview(null)
    setRecursiveHints([])
    onRootClose()
    onCloseFocus?.()
  }, [clearHide, onCloseFocus, onRootClose])

  const scheduleHide = useCallback(() => {
    if (pinnedRef.current) return
    clearHide()
    hideTimerRef.current = setTimeout(() => {
      if (pinnedRef.current || rootRef.current?.matches(':hover')) return
      setRecursiveHints([])
      onRootClose()
    }, hideDelayMs)
  }, [clearHide, hideDelayMs, onRootClose, rootRef])

  useEffect(() => clearHide, [clearHide])

  const capturePinnedPosition = useCallback(
    (fallback: PreviewPosition, bounds?: PreviewBounds | null): PreviewPosition => {
      if (!bounds || (!bounds.width && !bounds.height)) return fallback
      return clampPreviewPosition(
        { left: bounds.left, top: bounds.top },
        { width: bounds.width, height: bounds.height },
        { width: window.innerWidth, height: window.innerHeight },
        safeTop,
      )
    },
    [safeTop],
  )

  const pinAtPosition = useCallback(
    (depth: number, fallback: PreviewPosition, bounds?: PreviewBounds | null) => {
      clearHide()
      pinnedRef.current = true
      setPinnedPreview({ depth, position: capturePinnedPosition(fallback, bounds) })
    },
    [capturePinnedPosition, clearHide],
  )

  const handlePinToggle = useCallback(
    (depth: number, bounds?: PreviewBounds) => {
      if (pinnedRef.current && pinnedPreview?.depth === depth) {
        pinnedRef.current = false
        setPinnedPreview(null)
        onRootOpen()
        scheduleHide()
        return
      }
      if (!bounds) return
      pinAtPosition(depth, { left: bounds.left, top: bounds.top }, bounds)
    },
    [onRootOpen, pinAtPosition, pinnedPreview?.depth, scheduleHide],
  )

  const handleNavigate = useCallback((depth: number) => {
    if (depth < 0) return
    if (pinnedRef.current) {
      setPinnedPreview((current) => (current ? { ...current, depth } : current))
      return
    }
    setRecursiveHints((current) => current.slice(0, depth))
  }, [])

  const appendRecursiveHint = useCallback((depth: number, hint: RecursiveHintState) => {
    setRecursiveHints((current) => [...current.slice(0, depth), hint])
    if (pinnedRef.current) {
      setPinnedPreview((current) => (current ? { ...current, depth: depth + 1 } : current))
    }
  }, [])

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (pinnedRef.current) return
      if (nextOpen) {
        clearHide()
        onRootOpen()
        return
      }
      if (recursiveHints.length > 0) {
        scheduleHide()
        return
      }
      setRecursiveHints([])
      onRootClose()
    },
    [clearHide, onRootClose, onRootOpen, recursiveHints.length, scheduleHide],
  )

  const handlePreviewKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      if (event.key !== 'Escape' || !isRootOpen) return
      event.preventDefault()
      event.stopPropagation()
      const activeDepth = pinnedPreview?.depth ?? recursiveHints.length
      if (activeDepth > 0) handleNavigate(activeDepth - 1)
      else closeAll()
    },
    [closeAll, handleNavigate, isRootOpen, pinnedPreview?.depth, recursiveHints.length],
  )

  const handlePinnedPositionChange = useCallback((position: PreviewPosition) => {
    setPinnedPreview((current) => (current ? { ...current, position } : current))
  }, [])

  return {
    appendRecursiveHint,
    capturePinnedPosition,
    clearHide,
    closeAll,
    handleNavigate,
    handleOpenChange,
    handlePinnedPositionChange,
    handlePinToggle,
    handlePreviewKeyDown,
    pinAtPosition,
    pinnedDepth,
    pinnedPreview,
    pinnedRef,
    recursiveHints,
    scheduleHide,
    setRecursiveHints,
  }
}
