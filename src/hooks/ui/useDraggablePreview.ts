import {
  type HTMLAttributes,
  type RefObject,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { clampPreviewPosition, type PreviewPosition } from '@/lib/overlayPosition'

interface UseDraggablePreviewOptions {
  enabled: boolean
  label: string
  position: PreviewPosition | null
  previewRef: RefObject<HTMLElement | null>
  safeTop: number
  onPositionChange: (position: PreviewPosition) => void
}

interface DragState {
  pointerId: number
  pointerX: number
  pointerY: number
  startPosition: PreviewPosition
}

export interface PreviewDragHandleProps extends HTMLAttributes<HTMLDivElement> {
  'aria-label': string
  role: 'button'
  tabIndex: number
}

function getClampedPosition(
  position: PreviewPosition,
  preview: HTMLElement,
  safeTop: number,
): PreviewPosition {
  const bounds = preview.getBoundingClientRect()
  return clampPreviewPosition(
    position,
    { width: bounds.width || preview.offsetWidth, height: bounds.height || preview.offsetHeight },
    { width: window.innerWidth, height: window.innerHeight },
    safeTop,
  )
}

export function useDraggablePreview({
  enabled,
  label,
  position,
  previewRef,
  safeTop,
  onPositionChange,
}: UseDraggablePreviewOptions): {
  dragHandleProps: PreviewDragHandleProps
  dragging: boolean
} {
  const dragStateRef = useRef<DragState | null>(null)
  const positionRef = useRef(position)
  const [dragging, setDragging] = useState(false)
  positionRef.current = position

  const finishDrag = useCallback((pointerId?: number) => {
    if (pointerId !== undefined && dragStateRef.current?.pointerId !== pointerId) return
    dragStateRef.current = null
    setDragging(false)
  }, [])

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!enabled || !position || event.button !== 0) return
      event.preventDefault()
      event.currentTarget.setPointerCapture?.(event.pointerId)
      dragStateRef.current = {
        pointerId: event.pointerId,
        pointerX: event.clientX,
        pointerY: event.clientY,
        startPosition: position,
      }
      setDragging(true)
    },
    [enabled, position],
  )

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const dragState = dragStateRef.current
      const preview = previewRef.current
      if (!dragState || dragState.pointerId !== event.pointerId || !preview) return
      event.preventDefault()
      onPositionChange(
        getClampedPosition(
          {
            left: dragState.startPosition.left + event.clientX - dragState.pointerX,
            top: dragState.startPosition.top + event.clientY - dragState.pointerY,
          },
          preview,
          safeTop,
        ),
      )
    },
    [onPositionChange, previewRef, safeTop],
  )

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (dragStateRef.current?.pointerId !== event.pointerId) return
      event.currentTarget.releasePointerCapture?.(event.pointerId)
      finishDrag(event.pointerId)
    },
    [finishDrag],
  )

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (!enabled || !position || !previewRef.current) return
      const step = event.shiftKey ? 1 : 10
      const delta = {
        ArrowLeft: { left: -step, top: 0 },
        ArrowRight: { left: step, top: 0 },
        ArrowUp: { left: 0, top: -step },
        ArrowDown: { left: 0, top: step },
      }[event.key]
      if (!delta) return
      event.preventDefault()
      event.stopPropagation()
      onPositionChange(
        getClampedPosition(
          { left: position.left + delta.left, top: position.top + delta.top },
          previewRef.current,
          safeTop,
        ),
      )
    },
    [enabled, onPositionChange, position, previewRef, safeTop],
  )

  useLayoutEffect(() => {
    if (!enabled) finishDrag()
  }, [enabled, finishDrag])

  useLayoutEffect(() => {
    const preview = previewRef.current
    if (!enabled || !preview) return

    const keepInBounds = () => {
      const current = positionRef.current
      if (!current) return
      const next = getClampedPosition(current, preview, safeTop)
      if (next.left !== current.left || next.top !== current.top) onPositionChange(next)
    }

    keepInBounds()
    window.addEventListener('resize', keepInBounds)
    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(keepInBounds)
    resizeObserver?.observe(preview)

    return () => {
      window.removeEventListener('resize', keepInBounds)
      resizeObserver?.disconnect()
    }
  }, [enabled, onPositionChange, previewRef, safeTop])

  return {
    dragging,
    dragHandleProps: {
      'aria-label': `Move ${label} preview. Use arrow keys to reposition; hold Shift for fine movement.`,
      role: 'button',
      tabIndex: 0,
      onKeyDown: handleKeyDown,
      onLostPointerCapture: () => finishDrag(),
      onPointerCancel: (event) => finishDrag(event.pointerId),
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
    },
  }
}
