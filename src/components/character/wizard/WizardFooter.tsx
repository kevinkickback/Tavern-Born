import { Button } from '@/components/ui/button'

interface WizardFooterProps {
  currentStep: number
  totalSteps: number
  onBack: () => void
  onNext: () => void
  onCancel: () => void
  isPending?: boolean
}

export function WizardFooter({
  currentStep,
  totalSteps,
  onBack,
  onNext,
  onCancel,
  isPending = false,
}: WizardFooterProps) {
  return (
    <div className="flex flex-shrink-0 items-center justify-between border-t border-border bg-surface-raised px-4 py-3 sm:px-6">
      <Button variant="ghost" size="sm" onClick={onCancel} disabled={isPending}>
        Cancel
      </Button>
      <div className="flex items-center gap-2">
        <span className="mr-2 hidden text-xs text-muted-foreground sm:inline">
          Step {currentStep} of {totalSteps}
        </span>
        {currentStep > 1 && (
          <Button
            variant="outline"
            size="sm"
            onClick={onBack}
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
  )
}
