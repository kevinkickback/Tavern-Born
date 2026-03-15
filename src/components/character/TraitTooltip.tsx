import { ReactNode } from 'react'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { renderEntry } from '@/lib/renderer'

interface TraitTooltipProps {
  name: string
  entries: any[]
  children: ReactNode
}

export function TraitTooltip({ name, entries, children }: TraitTooltipProps) {
  const renderContent = () => {
    if (!entries || entries.length === 0) {
      return <div className="text-muted-foreground text-sm">No description available</div>
    }

    const content = entries.map((entry, idx) => {
      const rendered = renderEntry(entry)
      return (
        <div
          key={idx}
          className="text-sm leading-relaxed"
          dangerouslySetInnerHTML={{ __html: rendered }}
        />
      )
    })

    return <div className="space-y-2 max-w-sm">{content}</div>
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {children}
      </TooltipTrigger>
      <TooltipContent 
        side="top" 
        className="max-w-md p-4 bg-popover text-popover-foreground border border-border shadow-lg"
        sideOffset={8}
      >
        <div className="font-semibold mb-2 text-base">{name}</div>
        {renderContent()}
      </TooltipContent>
    </Tooltip>
  )
}
