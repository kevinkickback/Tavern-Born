import { Button } from '@/components/ui/button'

interface WizardFooterProps {
  currentStep: number
  totalSteps: number
  onBack: () => void
  onNext: () => void
  onCancel: () => void
}

export function WizardFooter({
  currentStep,
  totalSteps,
  onBack,
  onNext,
  onCancel,
}: WizardFooterProps) {
  return (
    <div className="flex flex-shrink-0 items-center justify-between border-t border-border bg-surface-raised px-6 py-3">
      <Button variant="ghost" size="sm" onClick={onCancel}>
        Cancel
      </Button>
      <div className="flex items-center gap-2">
        <span className="mr-2 text-xs text-muted-foreground">
          Step {currentStep} of {totalSteps}
        </span>
        {currentStep > 1 && (
          <Button variant="outline" size="sm" onClick={onBack} className="min-w-24">
            Back
          </Button>
        )}
        <Button size="sm" onClick={onNext} className="min-w-24">
          {currentStep === totalSteps ? 'Create' : 'Next'}
        </Button>
      </div>
    </div>
  )
}
