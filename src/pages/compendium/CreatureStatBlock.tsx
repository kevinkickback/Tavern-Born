import { GameContent } from '@/components/editor/GameContent'
import {
  buildCreatureStatBlock,
  type CreatureStatBlockModel,
} from '@/lib/5etools/creatureStatBlock'
import type { RecursiveLookup } from '@/lib/renderer/recursiveTooltip'
import type { Creature5e } from '@/types/5etools'

interface CreatureStatBlockProps {
  creature: Creature5e
  recursiveLookup: RecursiveLookup
}

function getContentKey(entry: unknown): string {
  if (typeof entry === 'string') return entry
  if (entry && typeof entry === 'object') {
    const namedEntry = entry as { name?: unknown }
    if (typeof namedEntry.name === 'string') return namedEntry.name
    return JSON.stringify(entry)
  }
  return String(entry)
}

function withStableContentKeys(entries: unknown[], prefix: string) {
  const occurrences = new Map<string, number>()
  return entries.map((entry) => {
    const contentKey = getContentKey(entry)
    const occurrence = occurrences.get(contentKey) ?? 0
    occurrences.set(contentKey, occurrence + 1)
    return { entry, key: `${prefix}:${contentKey}:${occurrence}` }
  })
}

function StatLine({
  line,
  recursiveLookup,
}: {
  line: CreatureStatBlockModel['core'][number]
  recursiveLookup: RecursiveLookup
}) {
  return (
    <div className="flex items-start gap-1.5 text-sm leading-relaxed">
      <span className="shrink-0 font-semibold text-foreground">{line.label}</span>
      <GameContent
        entry={line.value}
        recursiveLookup={recursiveLookup}
        className="min-w-0 text-foreground/90 [&_p]:inline"
      />
    </div>
  )
}

export function CreatureStatBlock({ creature, recursiveLookup }: CreatureStatBlockProps) {
  const statBlock = buildCreatureStatBlock(creature)

  return (
    <section
      aria-label={`${creature.name} stat block`}
      className="overflow-hidden rounded-lg border border-primary/35 bg-card shadow-sm"
    >
      <div className="h-1 bg-primary" />
      <div className="space-y-4 p-4 sm:p-5">
        {statBlock.subtitle && (
          <p className="border-b border-primary/30 pb-3 text-sm italic text-muted-foreground">
            {statBlock.subtitle}
          </p>
        )}

        <div className="space-y-1.5">
          {statBlock.core.map((line) => (
            <StatLine key={line.label} line={line} recursiveLookup={recursiveLookup} />
          ))}
        </div>

        <div className="grid grid-cols-3 gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-6">
          {statBlock.abilities.map((ability) => (
            <div
              key={ability.key}
              title={`${ability.label} ${ability.score ?? '—'} (${ability.modifier})`}
              className="bg-muted/80 px-2 py-2.5 text-center"
            >
              <div className="text-[11px] font-bold tracking-wider text-primary">
                {ability.label}
              </div>
              <div className="mt-0.5 text-sm font-medium tabular-nums">
                {ability.score ?? '—'}{' '}
                <span className="text-xs text-muted-foreground">({ability.modifier})</span>
              </div>
            </div>
          ))}
        </div>

        {statBlock.details.length > 0 && (
          <div className="space-y-1.5 border-y border-primary/30 py-3">
            {statBlock.details.map((line) => (
              <StatLine key={line.label} line={line} recursiveLookup={recursiveLookup} />
            ))}
          </div>
        )}

        {(statBlock.challenge || statBlock.proficiencyBonus) && (
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            {statBlock.challenge && (
              <div>
                <span className="font-semibold">Challenge</span>{' '}
                <span className="tabular-nums">{statBlock.challenge}</span>
              </div>
            )}
            {statBlock.proficiencyBonus && (
              <div>
                <span className="font-semibold">Proficiency Bonus</span>{' '}
                <span className="tabular-nums">{statBlock.proficiencyBonus}</span>
              </div>
            )}
          </div>
        )}

        {statBlock.sections.map((section) => (
          <section key={section.id} className="border-t border-primary/35 pt-4">
            <h3 className="mb-2 font-display text-lg font-bold text-primary">{section.title}</h3>
            {withStableContentKeys(section.intro, `${section.id}:intro`).map(({ entry, key }) => (
              <GameContent
                key={key}
                entry={entry}
                recursiveLookup={recursiveLookup}
                className="mb-2 text-sm leading-relaxed [&_p]:my-1"
              />
            ))}
            <div className="space-y-2.5">
              {withStableContentKeys(section.entries, `${section.id}:entry`).map(
                ({ entry, key }) => (
                  <GameContent
                    key={key}
                    entry={entry}
                    recursiveLookup={recursiveLookup}
                    className="text-sm leading-relaxed [&_p]:inline [&_strong]:font-semibold [&_strong]:text-foreground"
                  />
                ),
              )}
            </div>
          </section>
        ))}

        {statBlock.footer.length > 0 && (
          <div className="space-y-1.5 border-t border-primary/35 pt-3">
            {statBlock.footer.map((line) => (
              <StatLine key={line.label} line={line} recursiveLookup={recursiveLookup} />
            ))}
          </div>
        )}
      </div>
      <div className="h-1 bg-primary" />
    </section>
  )
}
