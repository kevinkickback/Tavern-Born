import {
  ArrowRight,
  CheckCircle,
  ClipboardText,
  FilePdf,
  WarningCircle,
} from '@phosphor-icons/react'
import { useId, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { WorkspaceBody, WorkspacePage, WorkspacePaneHeader } from '@/components/workspace'
import { useArmorClass } from '@/hooks/character/useArmorClass'
import { useCharacterActions } from '@/hooks/character/useCharacterActions'
import { useCharacterCalculationContext } from '@/hooks/character/useCharacterCalculationContext'
import { useCharacterReadiness } from '@/hooks/character/useCharacterReadiness'
import { useHitPoints } from '@/hooks/character/useHitPoints'
import { useMovement } from '@/hooks/character/useMovement'
import {
  ABILITY_ABBREVIATIONS,
  ABILITY_NAMES,
  formatModifier,
} from '@/lib/calculations/abilityScores'
import { getProficiencyBonus } from '@/lib/calculations/gameRules'
import { getTotalCharacterLevel } from '@/lib/characterUtils'
import { addReadinessFocus } from '@/lib/navigation/readinessFocus'
import { cn } from '@/lib/utils'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { CharacterAction } from '@/types/actions'

const ACTION_GROUPS: Array<{ kind: CharacterAction['kind']; label: string }> = [
  { kind: 'attack', label: 'Attacks' },
  { kind: 'action', label: 'Actions' },
  { kind: 'bonus-action', label: 'Bonus Actions' },
  { kind: 'reaction', label: 'Reactions' },
  { kind: 'passive', label: 'Passive' },
  { kind: 'special', label: 'Rules & Special' },
]

type ReviewSection = 'attention' | 'overview'

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border bg-surface-raised/40 px-3 py-2">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
    </div>
  )
}

function actionMechanics(action: CharacterAction): string[] {
  const details: string[] = []
  if (action.attackBonus !== undefined) details.push(`${formatModifier(action.attackBonus)} to hit`)
  if (action.save?.dc !== undefined) {
    details.push(`DC ${action.save.dc}${action.save.ability ? ` ${action.save.ability}` : ''}`)
  }
  if (action.range) details.push(action.range)
  for (const damage of action.damage ?? []) {
    const amount = [damage.dice, damage.bonus ? formatModifier(damage.bonus) : '']
      .filter(Boolean)
      .join(' ')
    details.push([amount, damage.damageType].filter(Boolean).join(' '))
  }
  return details
}

export function BuildReviewPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabIdPrefix = useId()
  const character = useCharacterStore((state) => state.activeCharacter)
  const calculation = useCharacterCalculationContext(character)
  const readiness = useCharacterReadiness(character)
  const actions = useCharacterActions(character)
  const { effectiveAC } = useArmorClass()
  const { effectiveMaxHP } = useHitPoints()
  const { effectiveMovement } = useMovement()
  const sources = useGameDataStore((state) => state.gameData?.sources ?? [])

  const sourceNames = useMemo(() => {
    if (!character || (character.allowedSources?.length ?? 0) === 0) return []
    const namesByAbbreviation = new Map(
      sources.map((source) => [source.abbreviation.toUpperCase(), source.name]),
    )
    return (character.allowedSources ?? []).map(
      (source) => namesByAbbreviation.get(source.toUpperCase()) ?? source,
    )
  }, [character, sources])

  if (!character || !calculation || !readiness) return null

  const level = getTotalCharacterLevel(character)
  const proficiencyBonus = getProficiencyBonus(level)
  const unresolvedAutomation = actions.filter(
    (action) => action.kind === 'special' || !action.active,
  )
  const conditionalNotes = calculation.effects.declarations.filter(
    (effect) => effect.operation.kind === 'conditional-note',
  )
  const section: ReviewSection =
    searchParams.get('section') === 'overview' ? 'overview' : 'attention'
  const selectSection = (nextSection: string) => {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('section', nextSection)
    setSearchParams(nextParams, { replace: true })
  }

  return (
    <WorkspacePage>
      <WorkspacePaneHeader ariaLabel="Review section">
        <div className="h-full min-w-0 flex-1 overflow-x-auto">
          <div
            className="inline-flex h-full min-w-max items-stretch gap-5"
            role="tablist"
            aria-label="Review section"
          >
            {[
              {
                value: 'attention' as const,
                label: 'Needs attention',
                icon: readiness.issues.length > 0 ? WarningCircle : CheckCircle,
                count: readiness.issues.length,
              },
              {
                value: 'overview' as const,
                label: 'Character overview',
                icon: ClipboardText,
              },
            ].map(({ value, label, icon: Icon, count }) => {
              const active = section === value
              return (
                <button
                  key={value}
                  id={`${tabIdPrefix}-tab-${value}`}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-controls={`${tabIdPrefix}-panel-${value}`}
                  onClick={() => selectSection(value)}
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
                  {count !== undefined && (
                    <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary/15 px-1 text-[10px] font-bold leading-none text-primary">
                      {count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </WorkspacePaneHeader>
      <WorkspaceBody className="bg-workspace-pane p-4">
        <Tabs value={section} onValueChange={selectSection} className="mx-auto w-full max-w-6xl">
          <TabsContent
            id={`${tabIdPrefix}-panel-attention`}
            value="attention"
            aria-labelledby={`${tabIdPrefix}-tab-attention`}
          >
            <Card className="gap-4 p-4" data-testid="readiness-summary">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  {readiness.status === 'ready' ? (
                    <CheckCircle className="mt-0.5 size-6 text-success" weight="fill" />
                  ) : (
                    <WarningCircle className="mt-0.5 size-6 text-warning" weight="fill" />
                  )}
                  <div>
                    <h2 className="font-semibold">
                      {readiness.status === 'ready'
                        ? 'Character is ready'
                        : 'Character needs attention'}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {readiness.status === 'ready'
                        ? 'All required stored choices are complete.'
                        : `${readiness.blockingIssues.length} required ${readiness.blockingIssues.length === 1 ? 'choice remains' : 'choices remain'}. You can continue saving this character.`}
                    </p>
                  </div>
                </div>
                <Badge variant={readiness.status === 'ready' ? 'default' : 'outline'}>
                  {readiness.status === 'ready' ? 'Complete' : 'Needs attention'}
                </Badge>
              </div>

              {readiness.issues.length > 0 && (
                <div className="grid gap-2 md:grid-cols-2">
                  {readiness.issues.map((issue) => (
                    <button
                      key={issue.id}
                      type="button"
                      className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 text-left transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      onClick={() => navigate(addReadinessFocus(issue.navigationTarget, issue.id))}
                    >
                      {issue.severity === 'blocking' ? (
                        <WarningCircle className="size-4 shrink-0 text-warning" weight="fill" />
                      ) : (
                        <CheckCircle className="size-4 shrink-0 text-muted-foreground" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{issue.title}</span>
                        <span className="block text-xs text-muted-foreground">
                          {issue.explanation}
                        </span>
                      </span>
                      <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              )}
            </Card>
          </TabsContent>

          <TabsContent
            id={`${tabIdPrefix}-panel-overview`}
            value="overview"
            aria-labelledby={`${tabIdPrefix}-tab-overview`}
          >
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.72fr)]">
              <div className="space-y-4">
                <Card className="gap-4 p-4">
                  <div>
                    <h2 className="font-semibold">Calculated totals</h2>
                    <p className="text-xs text-muted-foreground">
                      Derived from the same calculation context used by the Builder and PDF export.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <StatCard label="Level" value={level} />
                    <StatCard label="Proficiency" value={formatModifier(proficiencyBonus)} />
                    <StatCard label="Armor Class" value={effectiveAC} />
                    <StatCard label="Max HP" value={effectiveMaxHP} />
                  </div>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                    {ABILITY_NAMES.map((ability) => (
                      <div
                        key={ability}
                        className="rounded-lg border border-border px-2 py-2 text-center"
                        data-testid={`review-ability-${ability}`}
                      >
                        <div className="text-[10px] font-semibold text-muted-foreground">
                          {ABILITY_ABBREVIATIONS[ability]}
                        </div>
                        <div className="font-semibold tabular-nums">
                          {calculation.abilityScores.total[ability]}
                        </div>
                        <div className="text-xs tabular-nums text-muted-foreground">
                          {formatModifier(calculation.abilityScores.modifiers[ability])}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(effectiveMovement.speeds).map(([mode, speed]) => (
                      <Badge
                        key={mode}
                        variant="outline"
                        className="capitalize"
                        data-testid={`review-movement-${mode}`}
                      >
                        {mode} {speed} ft.
                      </Badge>
                    ))}
                    {effectiveMovement.hover && <Badge variant="outline">Hover</Badge>}
                  </div>
                </Card>

                <Card className="gap-4 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="font-semibold">Actions</h2>
                      <p className="text-xs text-muted-foreground">
                        This is the shared action list used for sheet export.
                      </p>
                    </div>
                    <Badge variant="outline">{actions.length}</Badge>
                  </div>
                  {actions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No actions are currently available.
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {ACTION_GROUPS.map(({ kind, label }) => {
                        const grouped = actions.filter((action) => action.kind === kind)
                        if (grouped.length === 0) return null
                        return (
                          <section key={kind} aria-labelledby={`review-actions-${kind}`}>
                            <h3
                              id={`review-actions-${kind}`}
                              className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                            >
                              {label}
                            </h3>
                            <div className="divide-y divide-border rounded-lg border border-border">
                              {grouped.map((action) => (
                                <div key={action.id} className="px-3 py-2">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-medium">{action.name}</span>
                                    {!action.active && <Badge variant="outline">Inactive</Badge>}
                                    <span className="text-xs text-muted-foreground">
                                      {action.source.name}
                                    </span>
                                  </div>
                                  {actionMechanics(action).length > 0 && (
                                    <p className="mt-1 text-xs text-muted-foreground">
                                      {actionMechanics(action).join(' · ')}
                                    </p>
                                  )}
                                  {action.description && (
                                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                                      {action.description}
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                          </section>
                        )
                      })}
                    </div>
                  )}
                </Card>
              </div>

              <div className="space-y-4">
                <Card className="gap-3 p-4">
                  <h2 className="font-semibold">Automation notes</h2>
                  {unresolvedAutomation.length === 0 && conditionalNotes.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No inactive or rules-text-only mechanics need attention.
                    </p>
                  ) : (
                    <ul className="space-y-2 text-sm">
                      {unresolvedAutomation.map((action) => (
                        <li key={action.id} className="rounded-lg border border-border px-3 py-2">
                          <span className="font-medium">{action.name}</span>
                          <span className="block text-xs text-muted-foreground">
                            {action.inactiveReason ??
                              'Rules text is preserved, but its timing or mechanics are not automated.'}
                          </span>
                        </li>
                      ))}
                      {conditionalNotes.map((effect) => (
                        <li key={effect.id} className="rounded-lg border border-border px-3 py-2">
                          <span className="font-medium">{effect.label}</span>
                          <span className="block text-xs text-muted-foreground">
                            {effect.operation.kind === 'conditional-note' && effect.operation.note}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>

                <Card className="gap-3 p-4">
                  <h2 className="font-semibold">Enabled content sources</h2>
                  {sourceNames.length > 0 ? (
                    <ul className="space-y-1 text-sm">
                      {sourceNames.map((source) => (
                        <li key={source} className="rounded-md border border-border px-3 py-2">
                          {source}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      All sources in the configured data set are enabled.
                    </p>
                  )}
                  <Button variant="outline" size="sm" onClick={() => navigate('/sources')}>
                    Review sources <ArrowRight />
                  </Button>
                </Card>

                <Card className="gap-3 p-4">
                  <div className="flex items-center gap-2">
                    <FilePdf className="size-5 text-primary" weight="fill" />
                    <h2 className="font-semibold">PDF readiness</h2>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {readiness.status === 'ready'
                      ? 'Required choices are complete. The sheet can be exported without an incomplete marker.'
                      : 'The character can be saved, but required choices should be resolved before relying on an exported sheet.'}
                  </p>
                  <Button
                    size="sm"
                    variant={readiness.status === 'ready' ? 'default' : 'outline'}
                    onClick={() => navigate(`/character-sheet/${character.originSystem}`)}
                  >
                    Open character sheet <ArrowRight />
                  </Button>
                </Card>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </WorkspaceBody>
    </WorkspacePage>
  )
}
