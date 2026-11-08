import { Button } from '@/components/ui/button'
import { WIZARD_STEPS } from './constants'
import { WizardNavigation } from './WizardNavigation'

interface WizardFooterProps {
  currentStep: number
  completedThrough: number
  onRevisit: (step: number) => void
  onNext: () => void
  isPending?: boolean
}

export function WizardFooter({
  currentStep,
  completedThrough,
  onRevisit,
  onNext,
  isPending = false,
}: WizardFooterProps) {
  const totalSteps = WIZARD_STEPS.length
  return (
    <footer className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-t border-border bg-workspace-canvas px-4 py-2.5 sm:px-6 xl:grid-cols-[auto_minmax(0,1fr)_auto]">
      <p className="col-start-1 row-start-2 text-xs text-muted-foreground xl:row-start-1">
        Step {currentStep} of {totalSteps}
      </p>
      <div className="col-span-2 row-start-1 min-w-0 xl:col-span-1 xl:col-start-2">
        <WizardNavigation
          steps={WIZARD_STEPS}
          currentStep={currentStep}
          completedThrough={completedThrough}
          onRevisit={onRevisit}
          isPending={isPending}
        />
      </div>
      <div className="col-start-2 row-start-2 flex justify-end gap-2 xl:col-start-3 xl:row-start-1">
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
    </footer>
  )
}
