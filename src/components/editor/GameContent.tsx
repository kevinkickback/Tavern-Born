import { RenderedEntryWithTooltip } from '@/components/editor/RenderedEntryWithTooltip'
import { useRecursiveLookup } from '@/hooks/data/useRecursiveLookup'

interface GameContentProps {
  entry: unknown
  className?: string
}

/** Canonical interactive renderer for user-facing 5etools rules text. */
export function GameContent({ entry, className }: GameContentProps) {
  const recursiveLookup = useRecursiveLookup()

  return (
    <RenderedEntryWithTooltip
      entry={entry}
      className={className}
      recursiveLookup={recursiveLookup}
    />
  )
}
