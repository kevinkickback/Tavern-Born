import { Check } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getSpellNameKey, parseSpellReference } from '@/lib/calculations/spellIdentity'
import { cn } from '@/lib/utils'

export const creatorChoicePillClass =
  'h-7 max-w-full rounded-full border-primary/30 bg-primary/10 px-2.5 text-xs text-primary'

export function CreatorChoicePill({
  children,
  remove,
  pending,
  description,
}: {
  children: ReactNode
  remove?: { label: string; onClick: () => void }
  pending?: boolean
  description?: string
}) {
  return remove ? (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className={cn(creatorChoicePillClass, 'hover:bg-primary/20 hover:text-primary')}
      aria-label={remove.label}
      aria-description={description}
      title={description}
      data-creator-choice-control={pending || undefined}
      onClick={remove.onClick}
    >
      <span className="min-w-0 truncate">{children}</span>
      <span aria-hidden="true">×</span>
    </Button>
  ) : (
    <Badge variant="outline" className={creatorChoicePillClass} title={description}>
      <span className="min-w-0 truncate">{children}</span>
    </Badge>
  )
}

export function CreatorChoiceComplete() {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
      <Check className="size-3.5" weight="bold" aria-hidden="true" />
      Complete
    </span>
  )
}

export function CreatorSpellPills({
  spells,
  onChange,
}: {
  spells?: readonly string[]
  onChange?: (spells: string[]) => void
}) {
  const references = [...new Set(spells)]
  return references.map((reference) => {
    const { name, source } = parseSpellReference(reference)
    const duplicated = references.some(
      (other) => other !== reference && getSpellNameKey(other) === getSpellNameKey(reference),
    )
    const label = duplicated && source ? `${name} (${source})` : name
    return (
      <CreatorChoicePill
        key={reference}
        description={source ? `Source ${source}` : undefined}
        remove={
          onChange && {
            label: `Remove ${label}`,
            onClick: () => onChange((spells ?? []).filter((pick) => pick !== reference)),
          }
        }
      >
        {label}
      </CreatorChoicePill>
    )
  })
}

export function RaceChoiceRow({
  title,
  detail,
  pending,
  complete,
  children,
}: {
  title: string
  detail?: ReactNode
  pending?: boolean
  complete?: boolean
  children: ReactNode
}) {
  return (
    <section
      data-race-choice-pending={pending || undefined}
      className="grid min-w-0 gap-2 border-b border-border/70 py-3 @lg:grid-cols-[minmax(8rem,1fr)_minmax(0,1.7fr)] @lg:items-center @lg:gap-4"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h4 className="text-sm font-semibold">{title}</h4>
          {complete && !pending && <CreatorChoiceComplete />}
        </div>
        {detail && <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>}
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2 @lg:justify-end">{children}</div>
    </section>
  )
}
