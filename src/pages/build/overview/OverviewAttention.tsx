import { ArrowRight, CheckCircle, WarningCircle } from '@phosphor-icons/react'
import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { StartingEquipmentBlocks } from '@/components/character/StartingEquipmentBlocks'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useBackgroundProvenanceMutations } from '@/hooks/character/useBackgroundProvenanceMutations'
import { getEquipmentBlockSelection } from '@/lib/5etools/startingEquipment'
import { addReadinessFocus } from '@/lib/navigation/readinessFocus'
import type { CharacterReadinessResult } from '@/lib/readiness/types'
import { cn } from '@/lib/utils'
import { useBackgroundStartingEquipment } from '@/pages/build/background/model/useBackgroundStartingEquipment'
import type { Background5e } from '@/types/5etools'
import type { Character } from '@/types/character'

const ACTION_PREVIEW_LIMIT = 4

export function OverviewAttention({
  character,
  background,
  readiness,
}: {
  character: Character
  background: Background5e | undefined
  readiness: CharacterReadinessResult
}) {
  const [editing, setEditing] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const fullListHeading = useRef<HTMLHeadingElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const { applyBackgroundSelection } = useBackgroundProvenanceMutations()
  const { picker, ownerAvailable, resetDraft } = useBackgroundStartingEquipment(
    character,
    background,
    applyBackgroundSelection,
  )
  const equipmentIssue = 'starting-equipment:background'
  const equipmentPending = readiness.blockingIssues.find((issue) => issue.id === equipmentIssue)
  const canEditEquipment =
    ownerAvailable &&
    (picker.needsApplication ||
      picker.blocks.some(
        (block) =>
          (!block.isFixed &&
            (block.choiceKeys.length > 1 ||
              getEquipmentBlockSelection(block, picker.choices).needsReselection)) ||
          Object.values(block.options).some((option) =>
            option.genericChoices?.some((choice) => choice.candidates.length > 0),
          ),
      ))
  const blockingIssues =
    equipmentPending && canEditEquipment
      ? [
          equipmentPending,
          ...readiness.blockingIssues.filter((issue) => issue !== equipmentPending),
        ]
      : readiness.blockingIssues
  const issues = [...blockingIssues, ...readiness.recommendations]
  const needsAttention = blockingIssues.length > 0
  const hasSuggestions = readiness.recommendations.length > 0
  const previewLimit = needsAttention ? ACTION_PREVIEW_LIMIT : ACTION_PREVIEW_LIMIT - 1
  const setEquipmentDialogOpen = (open: boolean) => {
    if (!open) resetDraft()
    setEditing(open)
  }

  const renderIssues = (items: CharacterReadinessResult['issues'], preview = false) => (
    <ul aria-label="Setup items" className={cn('grid min-w-0', preview ? 'gap-1' : 'gap-1.5')}>
      {items.map((issue) => {
        const inlineEquipment = issue.id === equipmentIssue && canEditEquipment
        const required = issue.severity === 'blocking'
        const destination = addReadinessFocus(issue.navigationTarget, issue.id)
        const description = (
          <span className="min-w-0 flex-1 wrap-anywhere">
            <span
              className={cn('block font-medium', preview && 'truncate')}
              title={preview ? issue.title : undefined}
            >
              {issue.title}
              {inlineEquipment && (
                <span className="text-muted-foreground"> · {background?.name}</span>
              )}
            </span>
            {!preview && !required && (
              <span className="block text-xs font-medium text-info-foreground">Suggestion</span>
            )}
            <span
              className={cn('block text-xs text-muted-foreground', preview && 'truncate')}
              title={preview ? issue.explanation : undefined}
            >
              {preview && !required && <span className="text-info-foreground">Suggestion · </span>}
              {issue.explanation}
            </span>
          </span>
        )
        return (
          <li
            key={issue.id}
            className="overview-action min-w-0 rounded-md border"
            data-required={required || undefined}
          >
            {inlineEquipment ? (
              <div
                className={cn(
                  'flex items-center rounded-md px-2 transition-colors hover:bg-warning/10',
                  preview ? 'gap-2 py-1' : 'flex-wrap gap-x-4 gap-y-2 py-1.5',
                )}
              >
                {description}
                <div className={cn('flex items-center gap-1.5', !preview && 'flex-wrap')}>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="overview-choose-equipment hover:bg-warning/10"
                    aria-haspopup="dialog"
                    onClick={(event) => {
                      trigger.current = event.currentTarget
                      setEditing(true)
                    }}
                  >
                    Choose equipment here
                  </Button>
                  <Button asChild size="sm" variant="ghost" className="hover:bg-warning/10">
                    <Link to={destination} aria-label="Open Background" title="Open Background">
                      <span className={cn(preview && 'overview-background-label')}>
                        Open Background
                      </span>
                      <ArrowRight aria-hidden />
                    </Link>
                  </Button>
                </div>
              </div>
            ) : (
              <Link
                to={destination}
                className={cn(
                  'flex min-w-0 items-center gap-3 rounded-md px-2 text-left transition-colors hover:bg-warning/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
                  preview ? 'py-1' : 'py-1.5',
                )}
              >
                {description}
                <ArrowRight className="overview-action-arrow size-4 shrink-0" aria-hidden="true" />
              </Link>
            )}
          </li>
        )
      })}
    </ul>
  )

  return (
    <Card
      data-testid="overview-attention"
      className="overview-attention @container/attention min-w-0 gap-0 overflow-hidden border-l-4 bg-workspace-detail py-0 shadow-none"
      data-tone={needsAttention ? 'required' : hasSuggestions ? 'suggestions' : 'clear'}
    >
      <div className="overview-attention-header flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b bg-surface-raised px-3 py-3">
        <h2 ref={heading} tabIndex={-1} className="flex items-center gap-2 text-base font-semibold">
          {needsAttention ? (
            <WarningCircle className="size-5 shrink-0 text-warning" weight="fill" aria-hidden />
          ) : (
            <CheckCircle className="size-5 shrink-0 text-success" aria-hidden />
          )}
          Needs attention
        </h2>
        <p
          className={cn(
            'text-sm',
            needsAttention ? 'text-warning-foreground' : 'text-info-foreground',
            !issues.length && 'sr-only',
          )}
          aria-live="polite"
        >
          {readiness.blockingIssues.length} required
          {hasSuggestions &&
            ` · ${readiness.recommendations.length} ${readiness.recommendations.length === 1 ? 'suggestion' : 'suggestions'}`}
        </p>
      </div>
      {!needsAttention && (
        <p
          className={cn(
            'overview-attention-status grid place-items-center px-3 text-center text-sm',
            issues.length ? 'shrink-0 py-1' : 'flex-1 py-4',
          )}
        >
          No required actions
        </p>
      )}
      {issues.length > 0 && (
        <div className="px-3 pt-2.5 pb-1">{renderIssues(issues.slice(0, previewLimit), true)}</div>
      )}
      <Dialog>
        {issues.length > previewLimit && (
          <DialogTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              className={cn(
                'mx-3 mb-1 shrink-0 self-end hover:bg-warning/10 hover:text-foreground',
                needsAttention ? 'text-warning-foreground' : 'text-info-foreground',
              )}
            >
              View all {issues.length} actions <ArrowRight aria-hidden />
            </Button>
          </DialogTrigger>
        )}
        <DialogContent
          className="overview-list-dialog min-h-0"
          onCloseAutoFocus={(event) => {
            if (issues.length <= previewLimit) {
              event.preventDefault()
              heading.current?.focus()
            }
          }}
        >
          <DialogHeader>
            <DialogTitle ref={fullListHeading} tabIndex={-1}>
              Character setup
            </DialogTitle>
            <DialogDescription>Review all outstanding choices and suggestions.</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 overflow-y-auto overscroll-contain">{renderIssues(issues)}</div>
        </DialogContent>
      </Dialog>
      <Dialog open={editing} onOpenChange={setEquipmentDialogOpen}>
        <DialogContent
          className="max-h-[85vh] overflow-y-auto"
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            const target = trigger.current?.isConnected
              ? trigger.current
              : (fullListHeading.current ?? heading.current)
            target?.focus()
          }}
        >
          <DialogHeader>
            <DialogTitle>Background starting equipment</DialogTitle>
            <DialogDescription>
              {background?.name} · Choices apply to the current character.
            </DialogDescription>
          </DialogHeader>
          {canEditEquipment && <StartingEquipmentBlocks {...picker} />}
          {!ownerAvailable && (
            <p className="text-sm text-muted-foreground">
              The starting equipment rules are unavailable.
            </p>
          )}
          {ownerAvailable && equipmentPending && !canEditEquipment && (
            <p className="text-sm text-muted-foreground">
              Review this choice on the Background page.
            </p>
          )}
          {!equipmentPending && ownerAvailable && (
            <p role="status" className="text-sm text-success">
              Equipment choice resolved.
            </p>
          )}
          <DialogFooter>
            <Button type="button" size="sm" onClick={() => setEquipmentDialogOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
