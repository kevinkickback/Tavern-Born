import { useMemo } from 'react'
import { getSpellPreviewDescriptor, useRulesPreview } from '@/components/editor/RulesPreviewManager'
import { formatSpellDisplayName } from '@/lib/calculations/spellUtils'
import type { RecursiveLookup } from '@/lib/renderer/recursiveTooltip'
import type { Spell5e } from '@/types/5etools'

interface SpellNameTooltipProps {
  name: string
  spell?: Spell5e
  recursiveLookup: RecursiveLookup
  sourceContext?: string
}

export function SpellNameTooltip({
  name,
  spell,
  recursiveLookup,
  sourceContext,
}: SpellNameTooltipProps) {
  const { cancelClose, openPreview, pinPreview, scheduleClose } = useRulesPreview()
  const displayName = formatSpellDisplayName(name, spell?.name)
  const descriptor = useMemo(
    () => (spell ? getSpellPreviewDescriptor(spell, recursiveLookup, sourceContext) : null),
    [recursiveLookup, sourceContext, spell],
  )

  if (!descriptor) {
    return <span className="truncate text-sm">{displayName}</span>
  }

  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-expanded="false"
      onMouseEnter={(event) => {
        openPreview(descriptor, event.currentTarget)
      }}
      onMouseLeave={scheduleClose}
      onFocus={(event) => {
        openPreview(descriptor, event.currentTarget)
      }}
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
      className="cursor-help truncate border-b border-dotted border-muted-foreground/60 bg-transparent p-0 text-left text-sm hover:border-accent"
    >
      {displayName}
    </button>
  )
}
