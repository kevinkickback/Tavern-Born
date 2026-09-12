import { RenderedEntryWithTooltip } from '@/components/editor/RenderedEntryWithTooltip'
import { useRecursiveLookup } from '@/hooks/data/useRecursiveLookup'
import type { RecursiveLookup } from '@/lib/renderer/recursiveTooltip'

interface GameContentProps {
  entry: unknown
  className?: string
  recursiveLookup?: RecursiveLookup
}

function CharacterScopedGameContent({
  entry,
  className,
}: Omit<GameContentProps, 'recursiveLookup'>) {
  const recursiveLookup = useRecursiveLookup()

  return (
    <RenderedEntryWithTooltip
      entry={entry}
      className={className}
      recursiveLookup={recursiveLookup}
    />
  )
}

/** Canonical interactive renderer for user-facing 5etools rules text. */
export function GameContent({ entry, className, recursiveLookup }: GameContentProps) {
  if (!recursiveLookup) return <CharacterScopedGameContent entry={entry} className={className} />

  return (
    <RenderedEntryWithTooltip
      entry={entry}
      className={className}
      recursiveLookup={recursiveLookup}
    />
  )
}
