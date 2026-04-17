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
    <div className="border-t border-border px-8 py-4 flex items-center justify-between bg-muted/20 flex-shrink-0">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <span className="text-xs text-muted-foreground">
          Step {currentStep} of {totalSteps}
        </span>
      </div>
      <div className="flex gap-3">
        {currentStep > 1 && (
          <Button variant="outline" onClick={onBack} className="min-w-24">
            Back
          </Button>
        )}
        <Button onClick={onNext} className="min-w-24 bg-accent hover:bg-accent/90">
          {currentStep === totalSteps ? 'Create' : 'Next'}
        </Button>
      </div>
    </div>
  )
}
