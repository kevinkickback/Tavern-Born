import {
  Flame,
  Heart,
  HeartBreak,
  Minus,
  Plus,
  SmileyXEyes,
  Sparkle,
  Wind,
} from '@phosphor-icons/react'
import { type ReactNode, useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { RenderedEntryWithTooltip } from '@/components/editor/RenderedEntryWithTooltip'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { WorkspaceBody, WorkspacePage, WorkspacePaneHeader } from '@/components/workspace'
import { useClassResources } from '@/hooks/character/useClassResources'
import { useHitPoints } from '@/hooks/character/useHitPoints'
import { useRitualCasting } from '@/hooks/character/useRitualCasting'
import { useConditions } from '@/hooks/data/useGameData'
import { useRecursiveLookup } from '@/hooks/data/useRecursiveLookup'
import { getTotalCharacterLevel } from '@/lib/characterUtils'
import type { RecursiveLookup } from '@/lib/renderer/recursiveTooltip'
import { getImplicitSource } from '@/lib/sourcePresets'
import { cn } from '@/lib/utils'
import { NoCharCard } from '@/pages/_shared'
import { useCharacterStore } from '@/store/characterStore'
import type { Condition5e } from '@/types/5etools'

interface ExhaustionTableRow {
  level: number
  effect: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function getExhaustionTableRows(entries: unknown[] | undefined): ExhaustionTableRow[] {
  if (!entries) return []
  const table = entries.find((entry) => isRecord(entry) && entry.type === 'table')
  if (!isRecord(table) || !Array.isArray(table.rows)) return []

  return table.rows.flatMap((row) => {
    if (!Array.isArray(row) || row.length < 2) return []
    const level = Number(row[0])
    return Number.isInteger(level) && level >= 1 && level <= 6 ? [{ level, effect: row[1] }] : []
  })
}

function selectRulesetConditions(records: readonly Condition5e[], source: string) {
  const byName = new Map<string, Condition5e>()
  for (const record of records) {
    if (record._sourceType === 'disease') continue
    const existing = byName.get(record.name)
    if (!existing || (record.source === source && existing.source !== source)) {
      byName.set(record.name, record)
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))
}

function RuleText({
  entries,
  className,
  recursiveLookup,
}: {
  entries?: unknown[]
  className?: string
  recursiveLookup: RecursiveLookup
}) {
  if (!entries?.length) {
    return <p className="text-xs italic text-muted-foreground">No description in loaded data.</p>
  }

  return (
    <RenderedEntryWithTooltip
      entry={entries}
      recursiveLookup={recursiveLookup}
      className={cn(
        'text-xs leading-relaxed text-muted-foreground [&_a]:text-primary [&_a]:underline [&_h3]:mt-2 [&_h3]:font-semibold [&_h3]:text-foreground [&_li]:my-1 [&_ol]:ml-4 [&_ol]:list-decimal [&_p]:my-1 [&_strong]:font-semibold [&_strong]:text-foreground [&_ul]:ml-4 [&_ul]:list-disc',
        className,
      )}
    />
  )
}

type ConditionsPanel = 'combat' | 'exhaustion' | 'conditions' | 'resources'

const CONDITION_PANELS = [
  { value: 'combat', label: 'Combat State', icon: Heart },
  { value: 'exhaustion', label: 'Exhaustion', icon: Wind },
  { value: 'conditions', label: 'Conditions', icon: HeartBreak },
  { value: 'resources', label: 'Class Resources', icon: Flame },
] as const

function getActivePanel(panel: string | null): ConditionsPanel {
  if (panel === 'exhaustion' || panel === 'conditions' || panel === 'resources') return panel
  return 'combat'
}

function PanelCard({
  icon,
  title,
  description,
  actions,
  children,
}: {
  icon: ReactNode
  title: string
  description: string
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="rounded-lg border border-border bg-workspace-pane">
      <div className="flex items-start gap-3 border-b border-border bg-surface-raised/45 px-4 py-3">
        <span className="mt-0.5 size-5 shrink-0 text-primary [&>svg]:size-full">{icon}</span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
      {children}
    </section>
  )
}

function SavePip({
  filled,
  variant,
  label,
  onClick,
}: {
  filled: boolean
  variant: 'success' | 'failure'
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={filled}
      className={cn(
        'flex size-7 cursor-pointer items-center justify-center rounded-full border-2 transition-colors',
        variant === 'success'
          ? filled
            ? 'bg-success border-success text-success-foreground'
            : 'border-success/40 hover:border-success/80'
          : filled
            ? 'bg-destructive border-destructive text-destructive-foreground'
            : 'border-destructive/40 hover:border-destructive/80',
      )}
    >
      {filled && <span className="block size-2.5 rounded-full bg-current opacity-80" />}
    </button>
  )
}

export function ConditionsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const character = useCharacterStore((s) => s.activeCharacter)
  const updateCharacter = useCharacterStore((s) => s.updateCharacter)
  const { hitDie } = useHitPoints()
  const ritualCasting = useRitualCasting()
  const { resources, updateCurrent, resetResource, resetAll } = useClassResources()
  const conditionRecords = useConditions()
  const recursiveLookup = useRecursiveLookup()
  const rulebookSource = getImplicitSource(character?.originSystem ?? '2014')
  const rulesetConditions = useMemo(
    () => selectRulesetConditions(conditionRecords, rulebookSource),
    [conditionRecords, rulebookSource],
  )
  const exhaustionRule = rulesetConditions.find(
    (condition) => condition.name.toLowerCase() === 'exhaustion',
  )
  const selectableConditions = rulesetConditions.filter(
    (condition) => condition.name.toLowerCase() !== 'exhaustion',
  )
  const exhaustionRows = useMemo(
    () => getExhaustionTableRows(exhaustionRule?.entries),
    [exhaustionRule?.entries],
  )
  const exhaustionRuleSections = useMemo(() => {
    const entries = exhaustionRule?.entries ?? []
    const tableIndex = entries.findIndex((entry) => isRecord(entry) && entry.type === 'table')
    if (tableIndex < 0) return { before: entries, after: [] }
    return {
      before: entries.slice(0, tableIndex),
      after: entries.slice(tableIndex + 1),
    }
  }, [exhaustionRule?.entries])
  const activePanel = getActivePanel(searchParams.get('section'))

  const update = useCallback(
    <K extends keyof NonNullable<typeof character>>(
      key: K,
      value: NonNullable<typeof character>[K],
    ) => {
      if (!character) return
      updateCharacter(character.id, { [key]: value })
    },
    [character, updateCharacter],
  )

  const setActivePanel = (panel: ConditionsPanel) => {
    setSearchParams(panel === 'combat' ? {} : { section: panel }, { replace: true })
  }

  if (!character)
    return <NoCharCard icon={<SmileyXEyes weight="duotone" />} noun="track conditions" />

  const inspiration = character.inspiration ?? false
  const deathSaves = character.deathSaves ?? { successes: 0, failures: 0 }
  const conditions = character.conditions ?? []
  const exhaustion = character.exhaustion ?? 0
  const hitDiceUsed = character.hitDiceUsed ?? 0
  const totalLevel = getTotalCharacterLevel(character) ?? 1
  const hitDiceRemaining = Math.max(0, totalLevel - hitDiceUsed)

  const toggleCondition = (name: string) => {
    const next = conditions.includes(name)
      ? conditions.filter((condition) => condition !== name)
      : [...conditions, name]
    update('conditions', next)
  }

  const setDeathSave = (type: 'successes' | 'failures', index: number) => {
    const current = deathSaves[type]
    const next = current === index + 1 ? index : index + 1
    update('deathSaves', { ...deathSaves, [type]: next })
  }

  const setExhaustion = (level: number) => {
    update('exhaustion', Math.max(0, Math.min(6, level)))
  }

  return (
    <WorkspacePage>
      <WorkspacePaneHeader ariaLabel="Condition category">
        <div className="h-full min-w-0 flex-1 overflow-x-auto">
          <div
            className="inline-flex h-full min-w-max items-stretch gap-5"
            role="tablist"
            aria-label="Condition category"
          >
            {CONDITION_PANELS.map(({ value, label, icon: Icon }) => {
              const active = activePanel === value
              return (
                <button
                  key={value}
                  id={`conditions-tab-${value}`}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-controls={`conditions-panel-${value}`}
                  onClick={() => setActivePanel(value)}
                  className={cn(
                    'relative flex h-full cursor-pointer items-center gap-2 border-b-2 px-1 text-xs font-semibold transition-colors',
                    active
                      ? 'border-primary text-foreground'
                      : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
                  )}
                >
                  <Icon
                    className={cn('size-4 shrink-0', active && 'text-primary')}
                    weight={active ? 'fill' : 'regular'}
                  />
                  <span>{label}</span>
                </button>
              )
            })}
          </div>
        </div>
      </WorkspacePaneHeader>

      <WorkspaceBody>
        <div
          id={`conditions-panel-${activePanel}`}
          role="tabpanel"
          aria-labelledby={`conditions-tab-${activePanel}`}
          className="mx-auto w-full max-w-5xl px-6 py-5"
        >
          {activePanel === 'combat' && (
            <PanelCard
              icon={<Heart weight="duotone" />}
              title="Combat State"
              description="Keep the character's most frequently changing combat trackers together."
            >
              <div className="grid gap-6 p-4 sm:grid-cols-3">
                <div className="flex flex-col gap-3">
                  <div>
                    <h3 className="text-sm font-semibold">Inspiration</h3>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      Track whether inspiration is ready to spend during play.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => update('inspiration', !inspiration)}
                    aria-pressed={inspiration}
                    className={cn(
                      'flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-md border text-sm font-semibold transition-colors',
                      inspiration
                        ? 'bg-accent border-accent text-accent-foreground'
                        : 'border-border text-muted-foreground hover:border-accent/50',
                    )}
                  >
                    <Sparkle className="size-4" weight={inspiration ? 'fill' : 'regular'} />
                    {inspiration ? 'Inspired' : 'No Inspiration'}
                  </button>
                </div>

                <div className="flex flex-col gap-3 sm:border-l sm:border-border-subtle sm:pl-6">
                  <div>
                    <h3 className="text-sm font-semibold">Death Saves</h3>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      Mark results while at 0 HP. Three successes stabilize; three failures mean
                      death.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="w-16 text-xs text-success">Successes</span>
                      <div className="flex gap-1.5">
                        {[0, 1, 2].map((index) => (
                          <SavePip
                            key={index}
                            filled={deathSaves.successes > index}
                            variant="success"
                            label={`Death save success ${index + 1}`}
                            onClick={() => setDeathSave('successes', index)}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-16 text-xs text-destructive">Failures</span>
                      <div className="flex gap-1.5">
                        {[0, 1, 2].map((index) => (
                          <SavePip
                            key={index}
                            filled={deathSaves.failures > index}
                            variant="failure"
                            label={`Death save failure ${index + 1}`}
                            onClick={() => setDeathSave('failures', index)}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-3 sm:border-l sm:border-border-subtle sm:pl-6">
                  <div>
                    <h3 className="text-sm font-semibold">Hit Dice</h3>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      Track hit dice spent to recover hit points during rests.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="size-8 p-0"
                      aria-label="Spend one hit die"
                      disabled={hitDiceUsed >= totalLevel}
                      onClick={() => update('hitDiceUsed', hitDiceUsed + 1)}
                    >
                      <Minus size={14} />
                    </Button>
                    <div className="flex-1 text-center">
                      <span className="text-lg font-bold tabular-nums">{hitDiceRemaining}</span>
                      <span className="text-sm text-muted-foreground">/{totalLevel}</span>
                      <div className="text-xs text-muted-foreground">d{hitDie} remaining</div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="size-8 p-0"
                      aria-label="Restore one hit die"
                      disabled={hitDiceUsed === 0}
                      onClick={() => update('hitDiceUsed', hitDiceUsed - 1)}
                    >
                      <Plus size={14} />
                    </Button>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-muted-foreground"
                    disabled={hitDiceUsed === 0}
                    onClick={() => update('hitDiceUsed', 0)}
                  >
                    Restore All
                  </Button>
                </div>
              </div>
            </PanelCard>
          )}

          {activePanel === 'exhaustion' && (
            <PanelCard
              icon={<Wind weight="duotone" />}
              title={exhaustionRule?.name ?? 'Exhaustion'}
              description="Choose the current level, then review the rules and active effects below."
              actions={
                exhaustionRule && (
                  <Badge variant="outline" className="font-mono text-xs">
                    {exhaustionRule.source}
                    {exhaustionRule.page ? ` · p.${exhaustionRule.page}` : ''}
                  </Badge>
                )
              }
            >
              <div className="space-y-5 p-4">
                <div className="grid items-end gap-4 border-b border-border-subtle pb-5 sm:grid-cols-[8rem_minmax(0,1fr)]">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Current level
                    </p>
                    <p
                      className={cn(
                        'mt-1 text-2xl font-bold tabular-nums',
                        exhaustion === 6
                          ? 'text-destructive'
                          : exhaustion > 0
                            ? 'text-primary'
                            : 'text-success',
                      )}
                    >
                      Level {exhaustion}
                    </p>
                  </div>
                  <div className="grid grid-cols-7 gap-2">
                    {[0, 1, 2, 3, 4, 5, 6].map((level) => {
                      const current = exhaustion === level
                      return (
                        <button
                          key={level}
                          type="button"
                          onClick={() => setExhaustion(level)}
                          aria-label={`Set exhaustion level ${level}`}
                          aria-pressed={current}
                          className={cn(
                            'flex h-10 cursor-pointer items-center justify-center rounded-md border text-sm font-bold tabular-nums transition-colors',
                            current && level === 6
                              ? 'border-destructive bg-destructive text-destructive-foreground'
                              : current
                                ? 'border-accent bg-accent text-accent-foreground'
                                : 'border-border text-muted-foreground hover:border-accent/50 hover:bg-surface-hover',
                          )}
                        >
                          {level}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {exhaustionRule ? (
                  <div className="space-y-5">
                    <RuleText
                      entries={exhaustionRuleSections.before}
                      recursiveLookup={recursiveLookup}
                    />

                    {exhaustionRows.length > 0 ? (
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Effects by level
                        </p>
                        <div className="divide-y divide-border-subtle border-y border-border-subtle">
                          {exhaustionRows.map((row) => {
                            const current = exhaustion === row.level
                            const active = row.level <= exhaustion
                            return (
                              <div
                                key={row.level}
                                className={cn(
                                  'grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 px-2 py-3 transition-colors',
                                  current && row.level === 6
                                    ? 'bg-destructive/15'
                                    : current
                                      ? 'bg-accent/15'
                                      : active
                                        ? 'bg-accent/5'
                                        : '',
                                )}
                              >
                                <span
                                  className={cn(
                                    'flex size-7 items-center justify-center rounded-full text-xs font-bold tabular-nums',
                                    current && row.level === 6
                                      ? 'bg-destructive text-destructive-foreground'
                                      : active
                                        ? 'bg-accent text-accent-foreground'
                                        : 'bg-surface-raised text-muted-foreground',
                                  )}
                                >
                                  {row.level}
                                </span>
                                <RuleText
                                  entries={[row.effect]}
                                  recursiveLookup={recursiveLookup}
                                  className="min-w-0"
                                />
                                {current && (
                                  <span className="text-xs font-semibold text-primary">
                                    Current
                                  </span>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ) : (
                      <p className="border-l-2 border-primary/50 pl-3 text-xs leading-relaxed text-muted-foreground">
                        This ruleset defines exhaustion with a level-based formula rather than a
                        different description for every level.
                      </p>
                    )}

                    {exhaustionRuleSections.after.length > 0 && (
                      <RuleText
                        entries={exhaustionRuleSections.after}
                        recursiveLookup={recursiveLookup}
                        className="border-t border-border-subtle pt-4"
                      />
                    )}
                  </div>
                ) : (
                  <div className="py-10 text-center">
                    <p className="text-sm font-medium">No exhaustion rules loaded</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Load condition data for this character’s ruleset to see its effects.
                    </p>
                  </div>
                )}
              </div>
            </PanelCard>
          )}

          {activePanel === 'conditions' && (
            <PanelCard
              icon={<HeartBreak weight="duotone" />}
              title="Active Conditions"
              description="Click anywhere on a condition card to apply it. Click it again to remove it."
              actions={
                conditions.length > 0 ? (
                  <Badge variant="destructive" className="text-xs">
                    {conditions.length} active
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-xs">
                    None active
                  </Badge>
                )
              }
            >
              <div className="p-4">
                {conditions.length > 0 ? (
                  <div className="mb-4 border-b border-border-subtle pb-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Affecting this character
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {conditions.map((condition) => (
                        <button
                          key={condition}
                          type="button"
                          onClick={() => toggleCondition(condition)}
                          className="cursor-pointer rounded-full bg-destructive px-2.5 py-1 text-xs font-semibold text-destructive-foreground transition-opacity hover:opacity-85"
                          aria-label={`Remove ${condition}`}
                        >
                          {condition} ×
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="mb-4 border-b border-border-subtle pb-4 text-sm text-muted-foreground">
                    This character currently has no active conditions.
                  </p>
                )}

                {selectableConditions.length > 0 ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {selectableConditions.map((condition) => {
                      const active = conditions.includes(condition.name)
                      return (
                        <label
                          key={`${condition.name}|${condition.source}`}
                          data-condition-card={condition.name}
                          onClick={(event) => {
                            const target = event.target
                            if (
                              target instanceof Element &&
                              target.closest('a, button, [data-recursive-title]')
                            ) {
                              event.preventDefault()
                            }
                          }}
                          onKeyDown={(event) => {
                            const target = event.target
                            if (
                              (event.key === 'Enter' || event.key === ' ') &&
                              target instanceof Element &&
                              target.closest('[data-recursive-title]')
                            ) {
                              event.stopPropagation()
                            }
                          }}
                          className={cn(
                            'cursor-pointer overflow-hidden rounded-md border transition-colors focus-within:ring-2 focus-within:ring-ring',
                            active
                              ? 'border-destructive bg-destructive/10'
                              : 'border-border hover:border-accent/50 hover:bg-surface-hover',
                          )}
                        >
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={active}
                            onChange={() => toggleCondition(condition.name)}
                            aria-label={`${condition.name} condition`}
                          />
                          <div className="flex w-full items-center justify-between gap-3 px-4 pb-2 pt-3 text-left">
                            <span
                              className={cn('text-sm font-semibold', active && 'text-destructive')}
                            >
                              {condition.name}
                            </span>
                            <span className="flex shrink-0 items-center gap-2">
                              <span className="font-mono text-[10px] text-muted-foreground">
                                {condition.source}
                              </span>
                              {active && (
                                <span className="text-xs font-semibold text-destructive">
                                  Active
                                </span>
                              )}
                            </span>
                          </div>
                          <RuleText
                            entries={condition.entries}
                            recursiveLookup={recursiveLookup}
                            className="px-4 pb-3"
                          />
                        </label>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No condition rules are available in the loaded game data.
                  </p>
                )}
              </div>
            </PanelCard>
          )}

          {activePanel === 'resources' && (
            <PanelCard
              icon={<Flame weight="duotone" />}
              title="Class Resources"
              description="Track limited class features and restore them when the character rests."
              actions={
                <div className="flex items-center gap-2">
                  {ritualCasting && (
                    <Badge variant="outline" className="gap-1 text-xs">
                      <Sparkle className="size-3" />
                      Ritual Casting
                    </Badge>
                  )}
                  {resources.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-muted-foreground"
                      onClick={resetAll}
                    >
                      Restore All
                    </Button>
                  )}
                </div>
              }
            >
              <div className="p-4">
                {resources.length === 0 ? (
                  <div className="flex min-h-40 flex-col items-center justify-center text-center">
                    <Flame className="mb-3 size-8 text-muted-foreground/60" weight="duotone" />
                    <p className="text-sm font-medium">No limited class resources yet</p>
                    <p className="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
                      Resources appear here when this character gains class features with a limited
                      number of uses.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-border-subtle">
                    {resources.map((resource) => (
                      <div
                        key={resource.id}
                        className="flex items-center gap-4 py-3 first:pt-0 last:pb-0"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold">{resource.label}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {resource.className} · Restores on a {resource.restType} rest
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            className="size-8 p-0"
                            aria-label={`Spend one ${resource.label}`}
                            disabled={resource.current <= 0}
                            onClick={() => updateCurrent(resource.id, resource.current - 1)}
                          >
                            <Minus size={12} />
                          </Button>
                          <span className="w-16 text-center text-sm font-bold tabular-nums">
                            {resource.current}
                            <span className="font-normal text-muted-foreground">
                              /{resource.max >= 999 ? '∞' : resource.max}
                            </span>
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            className="size-8 p-0"
                            aria-label={`Restore one ${resource.label}`}
                            disabled={resource.current >= resource.max}
                            onClick={() => updateCurrent(resource.id, resource.current + 1)}
                          >
                            <Plus size={12} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-xs text-muted-foreground"
                            onClick={() => resetResource(resource.id)}
                          >
                            Restore
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </PanelCard>
          )}
        </div>
      </WorkspaceBody>
    </WorkspacePage>
  )
}
