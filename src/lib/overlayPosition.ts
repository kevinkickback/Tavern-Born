const TITLE_BAR_BASE_HEIGHT = 32
const OVERLAY_VIEWPORT_MARGIN = 8

export interface PreviewPosition {
  left: number
  top: number
}

export interface PreviewBounds extends PreviewPosition {
  width: number
  height: number
}

interface OverlaySize {
  width: number
  height: number
}

interface ViewportSize {
  width: number
  height: number
}

export type AnchoredPreviewPlacement = 'top-start' | 'right-start'

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

/**
 * Provides a synchronous, collision-aware position while Floating UI calculates its final
 * placement. This prevents a newly opened rules preview from briefly rendering at (0, 0),
 * where it could otherwise be pinned before its asynchronous position resolves.
 */
export function getAnchoredPreviewFallbackPosition(
  trigger: PreviewBounds,
  overlay: OverlaySize,
  viewport: ViewportSize,
  safeTop: number,
  placement: AnchoredPreviewPlacement,
  gap: number,
): PreviewPosition {
  if (placement === 'right-start') {
    const right = trigger.left + trigger.width + gap
    const left = trigger.left - overlay.width - gap
    const fitsRight = right + overlay.width + OVERLAY_VIEWPORT_MARGIN <= viewport.width

    return clampPreviewPosition(
      { left: fitsRight ? right : left, top: trigger.top },
      overlay,
      viewport,
      safeTop,
    )
  }

  const above = trigger.top - overlay.height - gap
  const below = trigger.top + trigger.height + gap

  return clampPreviewPosition(
    { left: trigger.left, top: above >= safeTop ? above : below },
    overlay,
    viewport,
    safeTop,
  )
}

function getOverlapArea(
  position: PreviewPosition,
  overlay: OverlaySize,
  obstacle: PreviewBounds,
  gap: number,
): number {
  const left = Math.max(position.left, obstacle.left - gap)
  const right = Math.min(position.left + overlay.width, obstacle.left + obstacle.width + gap)
  const top = Math.max(position.top, obstacle.top - gap)
  const bottom = Math.min(position.top + overlay.height, obstacle.top + obstacle.height + gap)
  return Math.max(0, right - left) * Math.max(0, bottom - top)
}

/**
 * Keeps a nested preview clear of its visible ancestors. The preferred position is tried first,
 * followed by every side of the spawning surface; when the viewport cannot fit every window, the
 * position with the smallest overlap is used.
 */
export function getCollisionAvoidingPreviewPosition(
  preferredPosition: PreviewPosition,
  anchor: PreviewBounds,
  overlay: OverlaySize,
  viewport: ViewportSize,
  safeTop: number,
  obstacles: readonly PreviewBounds[],
  gap: number,
): PreviewPosition {
  if (obstacles.length === 0) {
    return clampPreviewPosition(preferredPosition, overlay, viewport, safeTop)
  }

  const candidates = [
    preferredPosition,
    { left: anchor.left + anchor.width + gap, top: anchor.top },
    { left: anchor.left - overlay.width - gap, top: anchor.top },
    { left: anchor.left, top: anchor.top + anchor.height + gap },
    { left: anchor.left, top: anchor.top - overlay.height - gap },
  ].map((position) => clampPreviewPosition(position, overlay, viewport, safeTop))

  const uniqueCandidates = candidates.filter(
    (candidate, index) =>
      candidates.findIndex(
        (other) => other.left === candidate.left && other.top === candidate.top,
      ) === index,
  )
  const scored = uniqueCandidates.map((position, index) => ({
    index,
    position,
    overlap: obstacles.reduce(
      (total, obstacle) => total + getOverlapArea(position, overlay, obstacle, gap),
      0,
    ),
  }))

  return (
    scored.find((candidate) => candidate.overlap === 0) ??
    scored.reduce((best, candidate) =>
      candidate.overlap < best.overlap ||
      (candidate.overlap === best.overlap && candidate.index < best.index)
        ? candidate
        : best,
    )
  ).position
}
