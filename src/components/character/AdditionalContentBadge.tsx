import { Warning } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface AdditionalContentBadgeProps {
  className?: string
}

const EXPLANATION =
  'This character has saved choices that are not available in the Included SRD. Add the data used to create this character to review or edit them.'

export function AdditionalContentBadge({ className }: AdditionalContentBadgeProps) {
  return (
    <TooltipProvider delayDuration={250}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={cn(
              'size-6 rounded-md border-primary bg-primary/85 p-0 text-primary-foreground shadow-sm backdrop-blur-sm',
              className,
            )}
            aria-label={`Additional content. ${EXPLANATION}`}
          >
            <Warning className="!size-4" weight="bold" />
            <span className="sr-only">Additional content</span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={6} className="max-w-xs leading-relaxed">
          <span className="font-semibold">Additional content:</span> {EXPLANATION}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
