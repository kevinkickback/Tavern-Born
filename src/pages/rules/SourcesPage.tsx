import { useSearchParams } from 'react-router-dom'
import { WorkspaceBody, WorkspacePage } from '@/components/workspace'
import { getReadinessFocus } from '@/lib/navigation/readinessFocus'
import { SourcesPanel } from '@/pages/rules/SourcesPanel'

export function SourcesPage() {
  const [searchParams] = useSearchParams()

  return (
    <WorkspacePage>
      <WorkspaceBody className="flex flex-col overflow-hidden">
        <SourcesPanel readinessFocus={getReadinessFocus(searchParams)} />
      </WorkspaceBody>
    </WorkspacePage>
  )
}
