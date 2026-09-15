import { SlidersHorizontal, Sword } from '@phosphor-icons/react'
import { useId } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ManualActionsEditor } from '@/components/character/ManualActionsEditor'
import { ManualEffectsEditor } from '@/components/character/ManualEffectsEditor'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { WorkspaceBody, WorkspacePage, WorkspacePaneHeader } from '@/components/workspace'
import { useCharacterActions } from '@/hooks/character/useCharacterActions'
import { useCharacterCalculationContext } from '@/hooks/character/useCharacterCalculationContext'
import { cn } from '@/lib/utils'
import {
  SourceDerivedActions,
  SourceDerivedEffects,
} from '@/pages/adjustments/components/DerivedMechanicsOverview'
import { useCharacterStore } from '@/store/characterStore'

type AdjustmentSection = 'actions' | 'effects'

export function AdjustmentsPage() {
  const character = useCharacterStore((state) => state.activeCharacter)
  const calculation = useCharacterCalculationContext(character)
  const actions = useCharacterActions(character)
  const [searchParams, setSearchParams] = useSearchParams()
  const tabIdPrefix = useId()
  const section: AdjustmentSection =
    searchParams.get('section') === 'effects' ? 'effects' : 'actions'

  const selectSection = (nextSection: string) => {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('section', nextSection)
    setSearchParams(nextParams, { replace: true })
  }

  return (
    <WorkspacePage>
      <WorkspacePaneHeader ariaLabel="Adjustment type">
        <div className="h-full min-w-0 flex-1 overflow-x-auto">
          <div
            className="inline-flex h-full min-w-max items-stretch gap-5"
            role="tablist"
            aria-label="Adjustment type"
          >
            {[
              { value: 'actions' as const, label: 'Actions', icon: Sword },
              { value: 'effects' as const, label: 'Effects', icon: SlidersHorizontal },
            ].map(({ value, label, icon: Icon }) => {
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
                </button>
              )
            })}
          </div>
        </div>
      </WorkspacePaneHeader>
      <WorkspaceBody className="overflow-y-auto bg-workspace-pane p-4">
        <div className="mx-auto w-full max-w-5xl space-y-4">
          <div>
            <h2 className="font-semibold">Actions and effects</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Review mechanics derived from the character, then add only what the configured source
              data cannot represent safely.
            </p>
          </div>
          <Tabs value={section} onValueChange={selectSection}>
            <TabsContent
              id={`${tabIdPrefix}-panel-actions`}
              value="actions"
              aria-labelledby={`${tabIdPrefix}-tab-actions`}
            >
              <div className="space-y-8 py-1">
                <SourceDerivedActions actions={actions} />
                <ManualActionsEditor />
              </div>
            </TabsContent>
            <TabsContent
              id={`${tabIdPrefix}-panel-effects`}
              value="effects"
              aria-labelledby={`${tabIdPrefix}-tab-effects`}
            >
              <div className="space-y-8 py-1">
                <SourceDerivedEffects
                  effects={calculation?.effects.declarations ?? []}
                  resolutionContext={calculation?.effects.resolutionContext ?? {}}
                />
                <ManualEffectsEditor />
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </WorkspaceBody>
    </WorkspacePage>
  )
}
