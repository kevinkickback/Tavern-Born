import { Warning } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface AdditionalContentBadgeProps {
  className?: string
  showLabel?: boolean
}

const EXPLANATION =
  'This character has saved choices missing from the current game data. Load their original source to review or edit them.'

export function AdditionalContentBadge({
  className,
  showLabel = false,
}: AdditionalContentBadgeProps) {
  const badgeStyle =
    'rounded-md border-primary bg-primary/85 text-primary-foreground shadow-sm backdrop-blur-sm'
  if (showLabel) {
    return (
      <Badge variant="outline" className={cn(badgeStyle, className)}>
        <Warning className="!size-4" weight="bold" aria-hidden />
        Additional content
      </Badge>
    )
  }
  return (
    <TooltipProvider delayDuration={250}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={cn(badgeStyle, 'size-6 p-0', className)}
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
