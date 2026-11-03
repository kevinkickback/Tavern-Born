import { useMemo } from 'react'
import { RulesPreviewButton } from '@/components/editor/RulesPreviewButton'
import { getEntryWithHoverTitles, type RecursiveLookup } from '@/lib/renderer/recursiveTooltip'

interface TraitTooltipProps {
  name: string
  previewKey: string
  source?: string
  entries: unknown[]
  recursiveLookup: RecursiveLookup
}

export function TraitTooltip({
  name,
  previewKey,
  source,
  entries,
  recursiveLookup,
}: TraitTooltipProps) {
  const descriptor = useMemo(
    () => ({
      kind: 'generic' as const,
      key: previewKey,
      title: name,
      subtitle: source,
      html: entries.map((entry) => getEntryWithHoverTitles(entry)).join(''),
      recursiveLookup,
    }),
    [entries, name, previewKey, recursiveLookup, source],
  )

  return (
    <RulesPreviewButton
      descriptor={descriptor}
      className="inline-flex items-center rounded-md border border-border bg-muted/40 px-3 py-1.5 text-sm font-medium transition-colors hover:border-accent hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {name}
    </RulesPreviewButton>
  )
}
