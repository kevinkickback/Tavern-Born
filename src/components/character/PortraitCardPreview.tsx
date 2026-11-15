import { useLayoutEffect, useRef, useState } from 'react'
import { CharacterCardFrame } from '@/components/character/CharacterCardFrame'
import {
  CHARACTER_CARD_LOGICAL_HEIGHT,
  CHARACTER_CARD_LOGICAL_WIDTH,
} from '@/lib/portraitConstants'
import { cn } from '@/lib/utils'
import type { CharacterClassEntry, OriginSystem, PortraitTransform } from '@/types/character'

interface PortraitCardPreviewProps {
  image?: string | null
  name?: string
  level?: number
  race?: string
  classes?: readonly CharacterClassEntry[]
  originSystem?: OriginSystem
  gender?: string
  lastModified?: string
  transform?: PortraitTransform
  className?: string
  fit?: 'width' | 'contain'
  onWidthChange?: (width: number) => void
}

export function PortraitCardPreview({
  image,
  name,
  level,
  race,
  classes,
  originSystem,
  gender,
  lastModified,
  transform,
  className,
  fit = 'width',
  onWidthChange,
}: PortraitCardPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [previewWidth, setPreviewWidth] = useState<number | null>(null)

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return

    const updateWidth = () => {
      const bounds = container.getBoundingClientRect()
      const availableWidth = container.clientWidth || bounds.width
      const availableHeight = container.clientHeight || bounds.height
      if (availableWidth <= 0) return

      const nextWidth =
        fit === 'contain' && availableHeight > 0
          ? Math.min(
              availableWidth,
              availableHeight * (CHARACTER_CARD_LOGICAL_WIDTH / CHARACTER_CARD_LOGICAL_HEIGHT),
            )
          : availableWidth
      onWidthChange?.(nextWidth)
      setPreviewWidth((currentWidth) =>
        currentWidth !== null && Math.abs(currentWidth - nextWidth) < 0.5
          ? currentWidth
          : nextWidth,
      )
    }

    updateWidth()
    const observer = new ResizeObserver(updateWidth)
    observer.observe(container)
    return () => observer.disconnect()
  }, [fit, onWidthChange])

  const previewScale = (previewWidth ?? CHARACTER_CARD_LOGICAL_WIDTH) / CHARACTER_CARD_LOGICAL_WIDTH

  return (
    <div
      ref={containerRef}
      data-slot="portrait-card-preview-container"
      className={cn(
        'flex min-w-0 w-full justify-center overflow-hidden',
        fit === 'contain' && 'h-full min-h-0 items-center',
        className,
      )}
    >
      <div
        data-slot="portrait-card-preview"
        className="relative aspect-[3/2] w-full shrink-0 overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm"
        style={previewWidth === null ? undefined : { width: previewWidth }}
      >
        <div
          data-slot="portrait-card-preview-canvas"
          className="@container absolute left-0 top-0 origin-top-left"
          style={{
            width: CHARACTER_CARD_LOGICAL_WIDTH,
            height: CHARACTER_CARD_LOGICAL_HEIGHT,
            transform: `scale(${previewScale})`,
          }}
        >
          <CharacterCardFrame
            image={image}
            imageAlt="Character portrait card preview"
            name={name}
            level={level}
            race={race}
            classes={classes}
            originSystem={originSystem}
            gender={gender}
            lastModified={lastModified}
            transform={transform}
            portraitTransition
          />
        </div>
      </div>
    </div>
  )
}
