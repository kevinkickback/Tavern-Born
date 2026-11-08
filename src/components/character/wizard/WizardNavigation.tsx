import { Check } from '@phosphor-icons/react'
import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import type { WizardStep } from './types'

interface WizardNavigationProps {
  steps: WizardStep[]
  currentStep: number
  completedThrough: number
  onRevisit: (step: number) => void
  isPending: boolean
}

export function WizardNavigation({
  steps,
  currentStep,
  completedThrough,
  onRevisit,
  isPending,
}: WizardNavigationProps) {
  const track = useRef<HTMLElement>(null)

  useEffect(() => {
    const viewport = track.current
    const active = viewport?.querySelector<HTMLElement>(`[data-step="${currentStep}"]`)
    if (!viewport || !active || viewport.scrollWidth <= viewport.clientWidth) return
    viewport.scrollLeft = active.offsetLeft - (viewport.clientWidth - active.offsetWidth) / 2
  }, [currentStep])

  return (
    <nav
      ref={track}
      aria-label="Character creation progress"
      className="relative overflow-x-auto px-4 py-2.5 sm:px-6"
    >
      <ol className="mx-auto flex w-full min-w-max max-w-4xl items-center">
        {steps.map((step, index) => {
          const position = index + 1
          const isCurrent = currentStep === position
          const isCompleted = completedThrough >= position
          const chipClass = cn(
            'inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 text-xs leading-none',
            isCurrent
              ? 'border-foreground/55 bg-surface-raised font-semibold text-foreground'
              : isCompleted
                ? 'border-success/45 bg-success/10 text-success-foreground'
                : 'border-border-strong bg-workspace-pane text-muted-foreground',
          )
          const status = (
            <>
              {isCompleted && !isCurrent && (
                <Check className="size-3" weight="bold" aria-hidden="true" />
              )}
              {step.label}
              {isCompleted && !isCurrent && <span className="sr-only">, completed</span>}
            </>
          )

          return (
            <li
              key={step.id}
              className="flex items-center not-last:flex-1"
              data-step={position}
              aria-current={isCurrent ? 'step' : undefined}
            >
              {position < currentStep ? (
                <button
                  type="button"
                  aria-label={`${step.label}, completed`}
                  className={cn(chipClass, 'hover:bg-success/20 focus-visible:outline-ring')}
                  onClick={() => onRevisit(position)}
                  disabled={isPending}
                >
                  {status}
                </button>
              ) : (
                <span className={chipClass}>{status}</span>
              )}
              {position < steps.length && (
                <span
                  aria-hidden="true"
                  className={cn(
                    'h-px min-w-3 flex-1',
                    isCompleted ? 'bg-success/50' : 'bg-border-strong',
                  )}
                />
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
