import { arrow, autoUpdate, flip, offset, shift, useFloating } from '@floating-ui/react-dom'
import { X } from '@phosphor-icons/react'
import { type ReactNode, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { AnchoredHintPosition } from '@/hooks/ui/useAnchoredHintPosition'
import { getTitleBarSafeTop } from '@/lib/overlayPosition'
import { cn } from '@/lib/utils'
import { useAppPreferencesStore } from '@/store/appPreferencesStore'

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
  const uiScale = useAppPreferencesStore((state) => state.uiScale)
  const safeTop = getTitleBarSafeTop(uiScale)
  const arrowRef = useRef<HTMLDivElement>(null)
  const { refs, floatingStyles, middlewareData, placement } = useFloating({
    placement: position.placement,
    strategy: 'fixed',
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(position.gap),
      flip({ padding: { top: safeTop, right: 16, bottom: 16, left: 16 } }),
      shift({ padding: { top: safeTop, right: 16, bottom: 16, left: 16 } }),
      arrow({ element: arrowRef, padding: 14 }),
    ],
  })

  useEffect(() => {
    refs.setReference(position.reference)
  }, [position.reference, refs])

  const arrowX = middlewareData.arrow?.x
  const side = placement.split('-')[0]
  const placeAbove = side === 'top'

  return (
    <div
      ref={refs.setFloating}
      className={cn(
        'pointer-events-none z-[70] animate-in fade-in-0 zoom-in-95 duration-200',
        placeAbove ? 'slide-in-from-bottom-2' : 'slide-in-from-top-2',
      )}
      style={{ ...floatingStyles, width: `${width / 16}rem` }}
      role="status"
    >
      <div
        className={cn(
          'pointer-events-auto animate-hint-bounce relative rounded-lg border border-accent/50 bg-accent px-3 py-2 text-sm text-accent-foreground shadow-2xl ring-1 ring-accent/20',
          className,
        )}
      >
        <div
          ref={arrowRef}
          className={cn(
            'absolute size-3.5 rotate-45 border-accent/50 bg-accent',
            placeAbove ? '-bottom-[7px] border-r border-b' : '-top-[7px] border-l border-t',
          )}
          style={{ left: arrowX ?? 18 }}
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
