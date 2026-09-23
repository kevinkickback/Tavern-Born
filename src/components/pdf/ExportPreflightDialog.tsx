import { CheckCircle, Warning } from '@phosphor-icons/react'
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
import { Badge } from '@/components/ui/badge'
import type { ExportPreflightResult } from '@/lib/pdf/exportPreflight'

interface ExportPreflightDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  result: ExportPreflightResult
  onConfirm: () => void
}

const CATEGORY_LABELS = {
  readiness: 'Readiness',
  dependency: 'Missing content',
  unsupported: 'PDF support',
  truncation: 'Template capacity',
} as const

export function ExportPreflightDialog({
  open,
  onOpenChange,
  result,
  onConfirm,
}: ExportPreflightDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-h-[min(42rem,calc(100dvh-2rem))] min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden">
        <AlertDialogHeader>
          <AlertDialogTitle>PDF export preflight</AlertDialogTitle>
          <AlertDialogDescription>
            Review character readiness, unresolved content, unsupported mechanics, and fixed-form
            capacity before downloading.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div
          data-testid="preflight-issues-scroll"
          className="min-h-0 overflow-y-auto overscroll-contain pr-1"
        >
          {result.issues.length === 0 ? (
            <div className="flex items-start gap-3 rounded-lg border border-success/35 bg-success/5 p-3">
              <CheckCircle className="mt-0.5 size-5 shrink-0 text-success" weight="fill" />
              <div>
                <p className="text-sm font-semibold">No export issues found</p>
                <p className="text-xs text-muted-foreground">
                  Required choices, content references, supported mechanics, and template capacities
                  passed the preflight checks.
                </p>
              </div>
            </div>
          ) : (
            <ul className="space-y-2">
              {result.issues.map((issue) => (
                <li key={issue.id} className="rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Warning
                      className={
                        issue.severity === 'blocking'
                          ? 'size-4 text-destructive'
                          : 'size-4 text-warning'
                      }
                      weight="fill"
                    />
                    <span className="text-sm font-semibold">{issue.title}</span>
                    <Badge variant="outline">{CATEGORY_LABELS[issue.category]}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{issue.detail}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Go Back</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            {result.issues.length === 0 ? 'Download PDF' : 'Download with Warnings'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
