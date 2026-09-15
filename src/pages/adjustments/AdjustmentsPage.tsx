import { SlidersHorizontal, Sword } from '@phosphor-icons/react'
import { useId, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ManualActionsForm, ManualActionsList } from '@/components/character/ManualActionsEditor'
import { ManualEffectsForm, ManualEffectsList } from '@/components/character/ManualEffectsEditor'
import { type CompactPane, SplitPane } from '@/components/ui/SplitPane'
import { ScrollArea } from '@/components/ui/scroll-area'
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
  const [workbenchCollapsed, setWorkbenchCollapsed] = useState(false)
  const [detailCollapsed, setDetailCollapsed] = useState(false)
  const [compactPane, setCompactPane] = useState<CompactPane>('left')
  const tabIdPrefix = useId()
  const section: AdjustmentSection =
    searchParams.get('section') === 'effects' ? 'effects' : 'actions'

  const selectSection = (nextSection: string) => {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('section', nextSection)
    setSearchParams(nextParams, { replace: true })
  }

  return (
    <WorkspacePage className="p-3">
      <WorkspaceBody className="flex overflow-hidden">
        <Tabs value={section} onValueChange={selectSection} className="min-h-0 flex-1">
          <SplitPane
            className={cn(
              'my-0 h-full overflow-visible',
              !workbenchCollapsed && !detailCollapsed && 'gap-3',
            )}
            leftClassName={cn(
              'rounded-lg bg-workspace-pane',
              workbenchCollapsed ? 'border-0' : 'border border-border',
            )}
            rightClassName={cn(
              'rounded-lg bg-workspace-detail',
              detailCollapsed ? 'border-0' : 'border border-border',
            )}
            leftCollapsed={workbenchCollapsed}
            rightCollapsed={detailCollapsed}
            onLeftCollapsedChange={setWorkbenchCollapsed}
            onRightCollapsedChange={setDetailCollapsed}
            compactPane={compactPane}
            onCompactPaneChange={setCompactPane}
            compactLeftLabel="Add manual"
            compactRightLabel="Current mechanics"
            leftCollapseLabel="manual form"
            rightCollapseLabel="current mechanics"
            leftWidth="min(36rem, 45%)"
            left={
              <div className="flex h-full min-h-0 flex-col">
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
                <ScrollArea className="flex-1 overflow-hidden">
                  <div className="p-4">
                    <TabsContent
                      id={`${tabIdPrefix}-panel-actions`}
                      value="actions"
                      aria-labelledby={`${tabIdPrefix}-tab-actions`}
                    >
                      <ManualActionsForm />
                    </TabsContent>
                    <TabsContent
                      id={`${tabIdPrefix}-panel-effects`}
                      value="effects"
                      aria-labelledby={`${tabIdPrefix}-tab-effects`}
                    >
                      <ManualEffectsForm />
                    </TabsContent>
                  </div>
                </ScrollArea>
              </div>
            }
            right={
              <div className="flex h-full min-h-0 flex-col">
                <WorkspacePaneHeader
                  title={section === 'actions' ? 'Current actions' : 'Current effects'}
                  count={
                    section === 'actions'
                      ? actions.length
                      : (calculation?.effects.declarations.length ?? 0)
                  }
                  className="pr-20"
                />
                <ScrollArea className="flex-1 overflow-hidden">
                  <div className="space-y-8 p-5">
                    {section === 'actions' ? (
                      <>
                        <SourceDerivedActions actions={actions} />
                        <ManualActionsList />
                      </>
                    ) : (
                      <>
                        <SourceDerivedEffects
                          effects={calculation?.effects.declarations ?? []}
                          resolutionContext={calculation?.effects.resolutionContext ?? {}}
                        />
                        <ManualEffectsList />
                      </>
                    )}
                  </div>
                </ScrollArea>
              </div>
            }
          />
        </Tabs>
      </WorkspaceBody>
    </WorkspacePage>
  )
}
