const TITLE_BAR_BASE_HEIGHT = 32
const OVERLAY_VIEWPORT_MARGIN = 8
const OVERLAY_GAP = 4

export interface PreviewPosition {
  left: number
  top: number
}

export interface PreviewBounds extends PreviewPosition {
  width: number
  height: number
}

interface RectBounds {
  top: number
  right: number
  bottom: number
  left: number
}

interface OverlaySize {
  width: number
  height: number
}

interface ViewportSize {
  width: number
  height: number
}

type CollisionPadding = Partial<Record<'top' | 'right' | 'bottom' | 'left', number>>

export function getTitleBarOverlayHeight(uiScale: number): number {
  return Math.round(TITLE_BAR_BASE_HEIGHT * (uiScale / 100))
}

export function getTitleBarSafeTop(uiScale: number): number {
  return getTitleBarOverlayHeight(uiScale) + OVERLAY_VIEWPORT_MARGIN
}

export function getTitleBarCollisionPadding(
  collisionPadding: number | CollisionPadding | undefined,
  uiScale: number,
): CollisionPadding {
  const safeTop = getTitleBarSafeTop(uiScale)

  if (typeof collisionPadding === 'number') {
    return {
      top: Math.max(collisionPadding, safeTop),
      right: collisionPadding,
      bottom: collisionPadding,
      left: collisionPadding,
    }
  }

  return {
    top: Math.max(collisionPadding?.top ?? OVERLAY_VIEWPORT_MARGIN, safeTop),
    right: collisionPadding?.right ?? OVERLAY_VIEWPORT_MARGIN,
    bottom: collisionPadding?.bottom ?? OVERLAY_VIEWPORT_MARGIN,
    left: collisionPadding?.left ?? OVERLAY_VIEWPORT_MARGIN,
  }
}

export function clampPreviewPosition(
  position: PreviewPosition,
  overlay: OverlaySize,
  viewport: ViewportSize,
  safeTop: number,
): PreviewPosition {
  const maxLeft = Math.max(
    OVERLAY_VIEWPORT_MARGIN,
    viewport.width - overlay.width - OVERLAY_VIEWPORT_MARGIN,
  )
  const maxTop = Math.max(safeTop, viewport.height - overlay.height - OVERLAY_VIEWPORT_MARGIN)

  return {
    left: Math.max(OVERLAY_VIEWPORT_MARGIN, Math.min(position.left, maxLeft)),
    top: Math.max(safeTop, Math.min(position.top, maxTop)),
  }
}

export function getFloatingPreviewPosition(
  trigger: RectBounds,
  overlay: OverlaySize,
  viewport: ViewportSize,
  safeTop: number,
): { left: number; top: number } {
  const maxLeft = Math.max(
    OVERLAY_VIEWPORT_MARGIN,
    viewport.width - overlay.width - OVERLAY_VIEWPORT_MARGIN,
  )
  const left = Math.max(OVERLAY_VIEWPORT_MARGIN, Math.min(trigger.left, maxLeft))
  const aboveTop = trigger.top - OVERLAY_GAP - overlay.height
  const belowTop = Math.max(trigger.bottom + OVERLAY_GAP, safeTop)
  const maxTop = Math.max(safeTop, viewport.height - overlay.height - OVERLAY_VIEWPORT_MARGIN)

  if (aboveTop >= safeTop) return { left, top: aboveTop }
  if (belowTop <= maxTop) return { left, top: belowTop }

  const spaceAbove = trigger.top - OVERLAY_GAP - safeTop
  const spaceBelow = viewport.height - OVERLAY_VIEWPORT_MARGIN - belowTop
  const preferredTop = spaceAbove >= spaceBelow ? aboveTop : belowTop

  return { left, top: Math.max(safeTop, Math.min(preferredTop, maxTop)) }
}
