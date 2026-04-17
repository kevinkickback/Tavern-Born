import { Check } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import type { WizardStep } from './types'

interface WizardNavigationProps {
  steps: WizardStep[]
  currentStep: number
}

export function WizardNavigation({ steps, currentStep }: WizardNavigationProps) {
  return (
    <div className="flex items-start pl-6 pr-12 pt-5 pb-4 border-b border-border bg-muted/20 flex-shrink-0">
      {steps.map((step, index) => {
        const Icon = step.icon
        const isActive = currentStep === step.id
        const isCompleted = currentStep > step.id
        const isLast = index === steps.length - 1

        return (
          <>
            <div key={step.id} className="flex flex-col items-center gap-1.5 flex-shrink-0">
              <div
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full border-2 transition-colors',
                  isActive && 'border-accent bg-accent text-accent-foreground',
                  isCompleted && 'border-accent/60 bg-accent/15 text-accent-foreground',
                  !isActive && !isCompleted && 'border-border bg-background text-muted-foreground',
                )}
              >
                {isCompleted ? (
                  <Check className="size-4" weight="bold" />
                ) : (
                  <Icon className="size-4" weight={isActive ? 'fill' : 'regular'} />
                )}
              </div>
              <span
                className={cn(
                  'text-xs font-medium whitespace-nowrap',
                  isActive && 'text-foreground',
                  isCompleted && 'text-muted-foreground',
                  !isActive && !isCompleted && 'text-muted-foreground/60',
                )}
              >
                {step.label}
              </span>
            </div>
            {!isLast && (
              <div
                className={cn(
                  'flex-1 h-px mx-2 mt-4 transition-colors',
                  isCompleted ? 'bg-accent/60' : 'bg-border',
                )}
              />
            )}
          </>
        )
      })}
    </div>
  )
}
