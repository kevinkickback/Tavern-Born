import { cn } from '@/lib/utils'
import { WizardStep } from './types'

interface WizardNavigationProps {
  steps: WizardStep[]
  currentStep: number
}

export function WizardNavigation({ steps, currentStep }: WizardNavigationProps) {
  return (
    <div className="w-64 flex-shrink-0 border-r border-border bg-muted/30 p-6 overflow-y-auto">
      <div className="space-y-2">
        {steps.map((step) => {
          const Icon = step.icon
          const isActive = currentStep === step.id
          const isCompleted = currentStep > step.id
          
          return (
            <div
              key={step.id}
              className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-lg transition-colors',
                isActive && 'bg-primary text-primary-foreground',
                !isActive && isCompleted && 'text-foreground',
                !isActive && !isCompleted && 'text-muted-foreground'
              )}
            >
              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-background/20 flex-shrink-0">
                <span className="text-sm font-semibold">{step.id}</span>
              </div>
              <span className="font-medium">{step.label}</span>
              <Icon className="ml-auto" weight={isActive ? 'fill' : 'regular'} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
