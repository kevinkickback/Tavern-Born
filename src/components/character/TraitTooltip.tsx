import type { ReactNode } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { renderEntry } from '@/lib/renderer'

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

    const getEntryBaseKey = (entry: unknown): string => {
      if (typeof entry === 'string') return entry
      if (entry && typeof entry === 'object') {
        const record = entry as { name?: unknown; source?: unknown }
        if (typeof record.name === 'string') {
          return `${record.name}|${typeof record.source === 'string' ? record.source : ''}`
        }
        return JSON.stringify(entry)
      }
      return String(entry)
    }

    const collisionCounts = new Map<string, number>()
    const content = entries.map((entry) => {
      const rendered = renderEntry(entry)
      const baseKey = getEntryBaseKey(entry)
      const seen = collisionCounts.get(baseKey) ?? 0
      collisionCounts.set(baseKey, seen + 1)
      const key = seen === 0 ? baseKey : `${baseKey}#${seen}`

      return (
        <div
          key={key}
          className="text-sm leading-relaxed"
          dangerouslySetInnerHTML={{ __html: rendered }}
        />
      )
    })

    return <div className="space-y-2">{content}</div>
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
