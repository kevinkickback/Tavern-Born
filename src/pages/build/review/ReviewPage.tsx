import { ArrowRight, CheckCircle, ClipboardText, WarningCircle } from '@phosphor-icons/react'
import { useId, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { handleTabListKeyDown } from '@/components/ui/tabKeyboardNavigation'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { WorkspaceBody, WorkspacePage, WorkspacePaneHeader } from '@/components/workspace'
import { useArmorClass } from '@/hooks/character/useArmorClass'
import { useCharacterActions } from '@/hooks/character/useCharacterActions'
import { useCharacterCalculationContext } from '@/hooks/character/useCharacterCalculationContext'
import { useCharacterReadiness } from '@/hooks/character/useCharacterReadiness'
import { useHitPoints } from '@/hooks/character/useHitPoints'
import { addReadinessFocus } from '@/lib/navigation/readinessFocus'
import { cn } from '@/lib/utils'
import { CharacterOverview } from '@/pages/build/review/CharacterOverview'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'

type ReviewSection = 'attention' | 'overview'

export function BuildReviewPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabIdPrefix = useId()
  const character = useCharacterStore((state) => state.activeCharacter)
  const calculation = useCharacterCalculationContext(character)
  const readiness = useCharacterReadiness(character)
  const actions = useCharacterActions(character)
  const { effectiveAC } = useArmorClass()
  const { effectiveMaxHP, hitDicePools } = useHitPoints()
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
            onKeyDown={handleTabListKeyDown}
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
                  tabIndex={active ? 0 : -1}
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
                        ? 'You can print this character sheet. Review any suggestions below if you like.'
                        : `${readiness.blockingIssues.length} ${readiness.blockingIssues.length === 1 ? 'item' : 'items'} to review. You can still save and print this character sheet.`}
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
            <CharacterOverview
              character={character}
              calculation={calculation}
              actions={actions}
              effectiveAC={effectiveAC}
              effectiveMaxHP={effectiveMaxHP}
              hitDicePools={hitDicePools}
              sourceNames={sourceNames}
              ready={readiness.status === 'ready'}
            />
          </TabsContent>
        </Tabs>
      </WorkspaceBody>
    </WorkspacePage>
  )
}
