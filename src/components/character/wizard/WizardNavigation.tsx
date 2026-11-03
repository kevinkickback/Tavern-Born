import { Check } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import type { WizardStep } from './types'

interface WizardNavigationProps {
  steps: WizardStep[]
  currentStep: number
}

export function WizardNavigation({ steps, currentStep }: WizardNavigationProps) {
  return (
    <>
      <div className="flex shrink-0 items-center gap-3 border-b border-border bg-workspace-pane px-4 py-3 pr-14 lg:hidden">
        <span className="text-xs tabular-nums text-muted-foreground">
          {currentStep} / {steps.length}
        </span>
        <span aria-current="step" className="text-sm font-semibold">
          {steps[currentStep - 1]?.label}
        </span>
      </div>
      <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-workspace-pane p-4 lg:flex">
        <div className="mb-5 px-2">
          <h2 className="text-base font-semibold">Create Character</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Guided setup for a playable character.
          </p>
        </div>
        <ol className="space-y-0.5">
          {steps.map((step, index) => {
            const Icon = step.icon
            const isActive = currentStep === index + 1
            const isCompleted = currentStep > index + 1

            return (
              <li key={step.id}>
                <div
                  aria-current={isActive ? 'step' : undefined}
                  className={cn(
                    'relative flex h-10 items-center gap-3 rounded-md px-2 text-sm transition-colors',
                    isActive && 'bg-secondary font-medium text-primary',
                    isCompleted && !isActive && 'text-foreground',
                    !isActive && !isCompleted && 'text-muted-foreground',
                  )}
                >
                  {isActive && (
                    <span className="absolute inset-y-2 left-0 w-0.5 rounded-r-full bg-primary" />
                  )}
                  <span
                    className={cn(
                      'flex size-7 shrink-0 items-center justify-center rounded-md border',
                      isActive && 'border-primary/50 bg-primary/10 text-primary',
                      isCompleted && !isActive && 'border-success/40 bg-success/10 text-success',
                      !isActive && !isCompleted && 'border-border bg-surface-raised',
                    )}
                  >
                    {isCompleted ? (
                      <Check className="size-3.5" weight="bold" />
                    ) : (
                      <Icon className="size-3.5" weight={isActive ? 'fill' : 'regular'} />
                    )}
                  </span>
                  <span className="min-w-0 leading-tight">{step.label}</span>
                  <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">
                    {index + 1}
                  </span>
                </div>
              </li>
            )
          })}
        </ol>
        <p className="mt-auto px-2 pt-4 text-xs text-muted-foreground">
          Step {currentStep} of {steps.length}
        </p>
      </aside>
    </>
  )
}
