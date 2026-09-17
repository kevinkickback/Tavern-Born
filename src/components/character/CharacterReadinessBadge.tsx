import { Badge } from '@/components/ui/badge'
import { useCharacterReadiness } from '@/hooks/character/useCharacterReadiness'
import { cn } from '@/lib/utils'
import type { Character } from '@/types/character'

interface CharacterReadinessBadgeProps {
  character: Character
  className?: string
  compact?: boolean
}

export function CharacterReadinessBadge({
  character,
  className,
  compact = false,
}: CharacterReadinessBadgeProps) {
  const readiness = useCharacterReadiness(character)
  if (!readiness) return null

  const ready = readiness.status === 'ready'
  return (
    <Badge
      variant={ready ? 'default' : 'outline'}
      className={cn(!ready && 'border-warning/50 bg-background/80 text-warning', className)}
      aria-label={ready ? 'Character ready' : `${readiness.blockingIssues.length} required choices`}
    >
      {ready
        ? 'Ready'
        : compact
          ? readiness.blockingIssues.length
          : `${readiness.blockingIssues.length} required`}
    </Badge>
  )
}
