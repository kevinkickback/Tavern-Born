import { SlidersHorizontal, Sword } from '@phosphor-icons/react'
import { useId } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ManualActionsEditor } from '@/components/character/ManualActionsEditor'
import { ManualEffectsEditor } from '@/components/character/ManualEffectsEditor'
import { Card } from '@/components/ui/card'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { WorkspaceBody, WorkspacePage, WorkspacePaneHeader } from '@/components/workspace'
import { cn } from '@/lib/utils'

type AdjustmentSection = 'effects' | 'actions'

export function AdjustmentsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tabIdPrefix = useId()
  const section: AdjustmentSection =
    searchParams.get('section') === 'actions' ? 'actions' : 'effects'

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
              { value: 'effects' as const, label: 'Effects', icon: SlidersHorizontal },
              { value: 'actions' as const, label: 'Actions', icon: Sword },
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
            <h2 className="font-semibold">Manual actions and effects</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Add only mechanics that cannot be represented safely by the configured source data.
              These changes are included in Builder calculations and character-sheet exports.
            </p>
          </div>
          <Tabs value={section} onValueChange={selectSection}>
            <TabsContent
              id={`${tabIdPrefix}-panel-effects`}
              value="effects"
              aria-labelledby={`${tabIdPrefix}-tab-effects`}
            >
              <Card className="p-5">
                <ManualEffectsEditor />
              </Card>
            </TabsContent>
            <TabsContent
              id={`${tabIdPrefix}-panel-actions`}
              value="actions"
              aria-labelledby={`${tabIdPrefix}-tab-actions`}
            >
              <Card className="p-5">
                <ManualActionsEditor />
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </WorkspaceBody>
    </WorkspacePage>
  )
}
