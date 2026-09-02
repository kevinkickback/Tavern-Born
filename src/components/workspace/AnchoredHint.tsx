import { X } from '@phosphor-icons/react'
import { type ReactNode, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { AnchoredHintPosition } from '@/hooks/ui/useAnchoredHintPosition'
import { cn } from '@/lib/utils'

interface AnchoredHintProps {
  position: AnchoredHintPosition | null
  width: number
  onDismiss: () => void
  children: ReactNode
  dismissLabel?: string
  className?: string
}

export function AnchoredHint({
  position,
  width,
  onDismiss,
  children,
  dismissLabel = 'Dismiss hint',
  className,
}: AnchoredHintProps) {
  if (!position || typeof document === 'undefined') return null

  return createPortal(
    <AnchoredHintContent
      position={position}
      width={width}
      onDismiss={onDismiss}
      dismissLabel={dismissLabel}
      className={className}
    >
      {children}
    </AnchoredHintContent>,
    document.body,
  )
}

function AnchoredHintContent({
  position,
  width,
  onDismiss,
  children,
  dismissLabel,
  className,
}: Omit<AnchoredHintProps, 'position'> & { position: AnchoredHintPosition }) {
  const contentRef = useRef<HTMLDivElement>(null)
  const [contentHeight, setContentHeight] = useState(0)

  useLayoutEffect(() => {
    const element = contentRef.current
    if (!element) return

    const measure = () => setContentHeight(element.getBoundingClientRect().height)
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(element)
    return () => observer?.disconnect()
  }, [])

  const placeAbove =
    contentHeight > 0 &&
    position.top + contentHeight > window.innerHeight - 16 &&
    position.anchorTop - position.gap - contentHeight >= 16
  const top = placeAbove ? position.anchorTop - position.gap - contentHeight : position.top

  return (
    <div
      className={cn(
        'pointer-events-none fixed z-[70] animate-in fade-in-0 zoom-in-95 duration-200',
        placeAbove ? 'slide-in-from-bottom-2' : 'slide-in-from-top-2',
      )}
      style={{ top, left: position.left }}
      role="status"
    >
      <div
        ref={contentRef}
        className={cn(
          'pointer-events-auto animate-hint-bounce relative rounded-lg border border-accent/50 bg-accent px-3 py-2 text-sm text-accent-foreground shadow-2xl ring-1 ring-accent/20',
          className,
        )}
        style={{ width: `${width / 16}rem` }}
      >
        <div
          className={cn(
            'absolute h-3.5 w-3.5 rotate-45 border-accent/50 bg-accent',
            placeAbove ? '-bottom-[7px] border-r border-b' : '-top-[7px] border-l border-t',
          )}
          style={{ left: position.arrowLeft - 7 }}
        />
        <button
          type="button"
          className="absolute top-1.5 right-1.5 inline-flex size-6 cursor-pointer items-center justify-center rounded-md border border-white/35 bg-black/25 text-accent-foreground shadow-sm transition-colors hover:bg-black/40 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
          onClick={onDismiss}
          aria-label={dismissLabel}
        >
          <X className="size-3.5" />
        </button>
        <div className="pr-8 leading-snug text-accent-foreground/95">{children}</div>
      </div>
    </div>
  )
}
