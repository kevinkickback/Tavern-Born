import { SlidersHorizontal, Sword } from '@phosphor-icons/react'
import { useSearchParams } from 'react-router-dom'
import { ManualActionsEditor } from '@/components/character/ManualActionsEditor'
import { ManualEffectsEditor } from '@/components/character/ManualEffectsEditor'
import { Card } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { WorkspaceBody, WorkspacePage, WorkspacePaneHeader } from '@/components/workspace'

type AdjustmentSection = 'effects' | 'actions'

export function AdjustmentsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const section: AdjustmentSection =
    searchParams.get('section') === 'actions' ? 'actions' : 'effects'

  const selectSection = (nextSection: string) => {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('section', nextSection)
    setSearchParams(nextParams, { replace: true })
  }

  return (
    <WorkspacePage>
      <WorkspacePaneHeader
        title="Adjustments"
        icon={<SlidersHorizontal className="size-4 text-primary" weight="fill" />}
      />
      <WorkspaceBody className="overflow-y-auto bg-workspace-pane p-4">
        <div className="mx-auto w-full max-w-5xl space-y-4">
          <div>
            <h2 className="font-semibold">Character-specific corrections</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Add only mechanics that cannot be represented safely by the configured source data.
              These changes are included in Builder calculations and character-sheet exports.
            </p>
          </div>
          <Tabs value={section} onValueChange={selectSection}>
            <TabsList aria-label="Adjustment type">
              <TabsTrigger value="effects">
                <SlidersHorizontal /> Effects
              </TabsTrigger>
              <TabsTrigger value="actions">
                <Sword /> Actions
              </TabsTrigger>
            </TabsList>
            <TabsContent value="effects">
              <Card className="p-5">
                <ManualEffectsEditor />
              </Card>
            </TabsContent>
            <TabsContent value="actions">
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
