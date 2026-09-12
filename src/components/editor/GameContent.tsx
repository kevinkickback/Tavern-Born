import { RenderedEntryWithTooltip } from '@/components/editor/RenderedEntryWithTooltip'
import { useRecursiveLookup } from '@/hooks/data/useRecursiveLookup'
import type { RecursiveLookup } from '@/lib/renderer/recursiveTooltip'

interface GameContentProps {
  entry: unknown
  className?: string
  recursiveLookup?: RecursiveLookup
}

/** Canonical interactive renderer for user-facing 5etools rules text. */
export function GameContent({ entry, className, recursiveLookup }: GameContentProps) {
  const characterScopedLookup = useRecursiveLookup()

  return (
    <RenderedEntryWithTooltip
      entry={entry}
      className={className}
      recursiveLookup={recursiveLookup ?? characterScopedLookup}
    />
  )
}
