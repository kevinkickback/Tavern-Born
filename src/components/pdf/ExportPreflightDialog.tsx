import { Warning } from '@phosphor-icons/react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { ExportPreflightResult } from '@/lib/pdf/exportPreflight'

interface ExportPreflightDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  result: ExportPreflightResult
  onConfirm: () => void
}

const CATEGORY_LABELS = {
  readiness: 'Character choices to review',
  dependency: 'Missing source content or artwork',
  unsupported: 'Details to track separately',
  truncation: 'Content that may not fit',
} as const

export function ExportPreflightDialog({
  open,
  onOpenChange,
  result,
  onConfirm,
}: ExportPreflightDialogProps) {
  const groups = Object.entries(CATEGORY_LABELS)
    .map(([category, label]) => ({
      category,
      label,
      issues: result.issues.filter((issue) => issue.category === category),
    }))
    .filter((group) => group.issues.length > 0)
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-h-[min(42rem,calc(100dvh-2rem))] min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden">
        <AlertDialogHeader>
          <AlertDialogTitle>Before you download</AlertDialogTitle>
          <AlertDialogDescription>
            Your PDF is ready. A few details may need attention. You can download it now or review
            the notes below.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div
          data-testid="preflight-issues-scroll"
          className="min-h-0 overflow-y-auto overscroll-contain pr-1"
        >
          <div className="space-y-2">
            {groups.map((group) => (
              <details key={group.category} className="rounded-lg border border-border p-3">
                <summary className="cursor-pointer text-sm font-medium">
                  <Warning className="mx-2 inline size-4 text-warning" weight="fill" />
                  {group.label} ({group.issues.length})
                </summary>
                <ul className="mt-3 space-y-3 border-t border-border pt-3">
                  {group.issues.map((issue) => (
                    <li key={issue.id}>
                      <p className="text-sm font-medium">{issue.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{issue.detail}</p>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Go Back</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Download PDF</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
