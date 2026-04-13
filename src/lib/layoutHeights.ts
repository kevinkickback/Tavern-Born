export function getViewportBoundedMaxHeight(baseOffsetRem: number, extraOffsetPx = 0): string {
  const safeExtraOffset = Math.max(0, Math.round(extraOffsetPx))
  return `max(12rem, calc(100vh - ${baseOffsetRem}rem - ${safeExtraOffset}px))`
}
