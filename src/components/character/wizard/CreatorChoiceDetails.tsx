import { Check } from '@phosphor-icons/react'
import {
  type ReactNode,
  type Ref,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { CreatorEntityDetails } from '../DetailCards'

export interface CreatorChoiceReview {
  check: () => boolean
}

export interface CreatorChoiceReviewProps {
  onChoicesPendingChange?: (pending: boolean) => void
  choicesReviewRef?: Ref<CreatorChoiceReview>
}

function flashChoice(target: HTMLElement) {
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  target
    .getAnimations?.()
    .find((animation) => animation.id === 'race-choice-flash')
    ?.cancel()
  const flash = 'inset 0 0 0 2px var(--primary)'
  const animation = target.animate?.(
    reduced
      ? [{ boxShadow: flash }, { boxShadow: 'none' }]
      : [
          { transform: 'translateX(0)', boxShadow: flash },
          { transform: 'translateX(-4px)', boxShadow: flash },
          { transform: 'translateX(4px)' },
          { transform: 'translateX(-2px)' },
          { transform: 'translateX(0)', boxShadow: 'none' },
        ],
    { duration: 400, easing: 'ease-out' },
  )
  if (animation) animation.id = 'race-choice-flash'
}

export function CreatorChoiceDetails({
  entity,
  kind,
  subtitle,
  description,
  choices,
  hasChoices = !!choices,
  keepChoicesMounted = false,
  pending = false,
  onChoicesPendingChange,
  choicesReviewRef,
}: CreatorChoiceReviewProps & {
  entity?: { name: string; source: string; page?: number }
  kind: 'Race' | 'Class' | 'Background'
  subtitle?: string
  description: ReactNode
  choices?: ReactNode
  hasChoices?: boolean
  keepChoicesMounted?: boolean
  pending?: boolean
}) {
  const [view, setView] = useState('description')
  const statusId = useId()
  const tabRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => onChoicesPendingChange?.(pending), [onChoicesPendingChange, pending])
  useImperativeHandle(choicesReviewRef, () => ({
    check: () => {
      if (!pending) return true
      if (view === 'description') {
        tabRef.current?.focus()
        if (tabRef.current) flashChoice(tabRef.current)
      } else {
        const rows = panelRef.current?.querySelectorAll<HTMLElement>('[data-race-choice-pending]')
        rows?.forEach(flashChoice)
        const first = rows?.[0]
        const control =
          first?.querySelector<HTMLElement>(
            '[data-creator-choice-control], [role="combobox"]:not(:disabled)',
          ) ?? first?.querySelector<HTMLElement>('button:not(:disabled)')
        const target = control ?? first
        target?.focus()
      }
      return false
    },
  }))
  return (
    <Tabs
      value={hasChoices ? view : 'description'}
      onValueChange={setView}
      activationMode="manual"
      className="min-h-0 min-w-0"
    >
      <CreatorEntityDetails
        entity={entity}
        subtitle={subtitle}
        placeholder={`Select a ${kind.toLowerCase()} to view details`}
        titleActions={
          hasChoices && (
            <TabsList aria-label={`${kind} details`}>
              <TabsTrigger value="description">Description</TabsTrigger>
              <TabsTrigger
                value="choices"
                ref={tabRef}
                aria-describedby={statusId}
                className={cn(
                  pending &&
                    'border-primary/45 bg-primary/15 text-primary hover:bg-primary/25 hover:text-primary',
                )}
              >
                {pending ? (
                  <span aria-hidden="true" className="size-1.5 rounded-full bg-primary" />
                ) : (
                  <Check
                    weight="bold"
                    className="size-3.5 text-emerald-700 dark:text-emerald-400"
                    aria-hidden="true"
                  />
                )}
                Choices
              </TabsTrigger>
            </TabsList>
          )
        }
      >
        {hasChoices && (
          <p id={statusId} className="sr-only" aria-live="polite">
            {pending
              ? `Complete the ${kind.toLowerCase()} choices to continue.`
              : `${kind} choices are ready.`}
          </p>
        )}
        {hasChoices ? (
          <TabsContent value="description" className="min-h-0 space-y-4 md:overflow-y-auto md:pr-2">
            {description}
          </TabsContent>
        ) : (
          description
        )}
        <TabsContent
          ref={panelRef}
          value="choices"
          forceMount={keepChoicesMounted || undefined}
          className="min-h-0 data-[state=inactive]:hidden md:overflow-y-auto md:pr-2"
        >
          {choices}
        </TabsContent>
      </CreatorEntityDetails>
    </Tabs>
  )
}
