import { useCallback, useMemo } from 'react'
import { RenderedHtml } from '@/components/editor/RenderedHtml'
import { getRulesPreviewDescriptor, useRulesPreview } from '@/components/editor/RulesPreviewManager'
import { getEntryWithHoverTitles, type RecursiveLookup } from '@/lib/renderer/recursiveTooltip'

interface RenderedEntryWithTooltipProps {
  entry: unknown
  className?: string
  recursiveLookup: RecursiveLookup
}

export function RenderedEntryWithTooltip({
  entry,
  className,
  recursiveLookup,
}: RenderedEntryWithTooltipProps) {
  const { cancelClose, openPreview, pinPreview, scheduleClose } = useRulesPreview()
  const html = useMemo(
    () =>
      Array.isArray(entry)
        ? entry.map((item) => getEntryWithHoverTitles(item)).join('')
        : getEntryWithHoverTitles(entry),
    [entry],
  )

  const findTrigger = useCallback(
    (target: EventTarget | null) =>
      target instanceof HTMLElement ? target.closest<HTMLElement>('[data-recursive-title]') : null,
    [],
  )

  const showPreview = useCallback(
    (trigger: HTMLElement) => {
      const descriptor = getRulesPreviewDescriptor(trigger, recursiveLookup)
      if (descriptor) openPreview(descriptor, trigger)
    },
    [openPreview, recursiveLookup],
  )

  const pin = useCallback(
    (trigger: HTMLElement, focusPinned: boolean) => {
      const descriptor = getRulesPreviewDescriptor(trigger, recursiveLookup)
      if (descriptor) pinPreview(descriptor, trigger, focusPinned)
    },
    [pinPreview, recursiveLookup],
  )

  if (!html) return null

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: generated inline references provide button semantics and delegate to this boundary.
    <div
      onMouseMove={(event) => {
        const trigger = findTrigger(event.target)
        if (trigger && event.currentTarget.contains(trigger)) showPreview(trigger)
      }}
      onMouseLeave={scheduleClose}
      onFocus={(event) => {
        const trigger = findTrigger(event.target)
        if (trigger && event.currentTarget.contains(trigger)) showPreview(trigger)
      }}
      onBlur={(event) => {
        const destination = event.relatedTarget
        if (
          destination instanceof Node &&
          (event.currentTarget.contains(destination) ||
            (destination instanceof HTMLElement &&
              destination.closest('[data-rules-preview-layer]')))
        ) {
          cancelClose()
          return
        }
        scheduleClose()
      }}
      onClick={(event) => {
        const trigger = findTrigger(event.target)
        if (!trigger || !event.currentTarget.contains(trigger)) return
        event.preventDefault()
        event.stopPropagation()
        pin(trigger, false)
      }}
      onKeyDown={(event) => {
        const trigger = findTrigger(event.target)
        if (!trigger || (event.key !== 'Enter' && event.key !== ' ')) return
        event.preventDefault()
        event.stopPropagation()
        pin(trigger, true)
      }}
    >
      <RenderedHtml className={className} html={html} />
    </div>
  )
}
