import { CopySimple, DownloadSimple, Trash } from '@phosphor-icons/react'
import { CHARACTER_CARD_REVEAL_CLASS } from '@/components/character/CharacterCardFrame'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface CharacterCardActionsProps {
  name?: string
  actions?: {
    duplicate: () => void
    export: () => void
    delete: () => void
  }
  pending?: boolean
}

const buttons = [
  { action: 'duplicate', label: 'Duplicate', icon: CopySimple },
  { action: 'export', label: 'Export', icon: DownloadSimple },
  { action: 'delete', label: 'Delete', icon: Trash },
] as const

export function CharacterCardActions({ name, actions, pending }: CharacterCardActionsProps) {
  return (
    <TooltipProvider delayDuration={300}>
      <div
        data-slot="character-card-actions"
        aria-hidden={!actions || undefined}
        inert={!actions}
        className={cn(
          'absolute bottom-3 left-2.5 z-10 grid w-[7.125rem] max-w-[calc(36%-0.625rem)] grid-cols-3 gap-[3px]',
          actions && CHARACTER_CARD_REVEAL_CLASS,
        )}
      >
        {buttons.map(({ action, label, icon: Icon }) => {
          const destructive = action === 'delete'
          const button = (
            <Button
              key={action}
              type="button"
              variant={destructive ? 'destructive' : 'outline'}
              size="icon"
              aria-label={`${label} ${name || 'character'}`}
              disabled={pending && action !== 'export'}
              className={cn(
                'size-auto aspect-square w-full p-0',
                destructive ? 'dark:bg-destructive/80' : 'bg-background/75 backdrop-blur-sm',
              )}
              onClick={actions?.[action]}
            >
              <Icon className="size-[18px]" aria-hidden="true" />
            </Button>
          )
          if (!actions) return button
          return (
            <Tooltip key={action}>
              <TooltipTrigger asChild>{button}</TooltipTrigger>
              <TooltipContent>{label} character</TooltipContent>
            </Tooltip>
          )
        })}
      </div>
    </TooltipProvider>
  )
}
