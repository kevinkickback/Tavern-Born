import type { ReactNode } from 'react'
import { GameContent } from '@/components/editor/GameContent'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

interface TraitTooltipProps {
  name: string
  entries: unknown[]
  children: ReactNode
}

export function TraitTooltip({ name, entries, children }: TraitTooltipProps) {
  const renderContent = () => {
    if (!entries || entries.length === 0) {
      return <div className="text-muted-foreground text-sm">No description available</div>
    }

    return <GameContent entry={entries} className="space-y-2 text-sm leading-relaxed" />
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent
        side="top"
        collisionPadding={16}
        className="w-[min(32rem,calc(100vw-2rem))] max-h-[calc(100vh-2rem)] overflow-hidden p-0 bg-popover text-popover-foreground border border-border shadow-lg"
        sideOffset={8}
      >
        <div className="flex max-h-[calc(100vh-2rem)] flex-col">
          <div className="border-b border-border px-4 py-3">
            <div className="font-semibold text-base">{name}</div>
          </div>
          <div className="min-h-0 overflow-y-auto px-4 py-3 overscroll-contain">
            {renderContent()}
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  )
}
