import { useMemo } from 'react'
import { RulesPreviewButton } from '@/components/editor/RulesPreviewButton'
import { getSpellPreviewDescriptor } from '@/components/editor/RulesPreviewManager'
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
  const displayName = formatSpellDisplayName(name, spell?.name)
  const descriptor = useMemo(
    () => (spell ? getSpellPreviewDescriptor(spell, recursiveLookup, sourceContext) : null),
    [recursiveLookup, sourceContext, spell],
  )

  if (!descriptor) {
    return <span className="truncate text-sm">{displayName}</span>
  }

  return (
    <RulesPreviewButton
      descriptor={descriptor}
      className="max-w-full cursor-help truncate border-b border-dotted border-muted-foreground/60 bg-transparent p-0 text-left text-sm hover:border-accent"
    >
      {displayName}
    </RulesPreviewButton>
  )
}
