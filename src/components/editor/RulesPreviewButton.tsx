import type { ReactNode } from 'react'
import { useRulesPreview } from '@/components/editor/RulesPreviewManager'
import type { RulesPreviewDescriptor } from '@/components/editor/rulesPreviewState'

/** A focusable root trigger; all preview state and nested interaction stay in the manager. */
export function RulesPreviewButton({
  children,
  className,
  descriptor,
}: {
  children: ReactNode
  className?: string
  descriptor: RulesPreviewDescriptor
}) {
  const { cancelClose, openPreview, pinPreview, scheduleClose } = useRulesPreview()

  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-expanded={false}
      className={className}
      onMouseEnter={(event) => openPreview(descriptor, event.currentTarget)}
      onMouseMove={cancelClose}
      onMouseLeave={scheduleClose}
      onFocus={(event) => openPreview(descriptor, event.currentTarget)}
      onBlur={(event) => {
        const destination = event.relatedTarget
        if (
          destination instanceof HTMLElement &&
          destination.closest('[data-rules-preview-layer]')
        ) {
          cancelClose()
          return
        }
        scheduleClose()
      }}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        pinPreview(descriptor, event.currentTarget)
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        event.stopPropagation()
        pinPreview(descriptor, event.currentTarget, true)
      }}
    >
      {children}
    </button>
  )
}
