import { Button } from '@/components/ui/button'
import { WIZARD_STEPS } from './constants'
import { WizardNavigation } from './WizardNavigation'

interface WizardFooterProps {
  currentStep: number
  completedThrough: number
  onRevisit: (step: number) => void
  onNext: () => void
  onCancel: () => void
  isPending?: boolean
}

export function WizardFooter({
  currentStep,
  completedThrough,
  onRevisit,
  onNext,
  onCancel,
  isPending = false,
}: WizardFooterProps) {
  const totalSteps = WIZARD_STEPS.length
  return (
    <footer className="shrink-0 border-t border-border bg-workspace-pane">
      <WizardNavigation
        steps={WIZARD_STEPS}
        currentStep={currentStep}
        completedThrough={completedThrough}
        onRevisit={onRevisit}
        isPending={isPending}
      />
      <div className="flex items-center justify-between px-4 pb-3 sm:px-6">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={isPending}>
          Cancel
        </Button>
        <div className="flex items-center gap-2">
          <span className="mr-1 text-xs text-muted-foreground sm:mr-2">
            Step {currentStep} of {totalSteps}
          </span>
          {currentStep > 1 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onRevisit(currentStep - 1)}
              className="min-w-16 sm:min-w-24"
              disabled={isPending}
            >
              Back
            </Button>
          )}
          <Button
            size="sm"
            onClick={onNext}
            className="min-w-16 sm:min-w-24"
            disabled={isPending}
            aria-busy={isPending}
          >
            {isPending ? 'Creating…' : currentStep === totalSteps ? 'Create' : 'Next'}
          </Button>
        </div>
      </div>
    </footer>
  )
}
