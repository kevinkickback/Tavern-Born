import { useEffect } from 'react'
import type { RecursiveHintState } from '@/lib/renderer/recursiveTooltip'
import { cn } from '@/lib/utils'

interface RecursiveTooltipChainProps {
  hints: RecursiveHintState[]
  index?: number
}

export function RecursiveTooltipChain({ hints, index = 0 }: RecursiveTooltipChainProps) {
  const hint = hints[index]
  const triggerElement = hint?.triggerElement

  useEffect(() => {
    if (!triggerElement) return
    triggerElement.setAttribute('data-recursive-preview-active', 'true')
    return () => triggerElement.removeAttribute('data-recursive-preview-active')
  }, [triggerElement])

  if (!hint) return null
  const totalCards = hints.length + 1
  const isNewest = index === hints.length - 1

  return (
    <div
      role="tooltip"
      data-recursive-tooltip-depth={index + 1}
      className={cn(
        'absolute w-[320px] max-w-[calc(100vw-1rem)] rounded border bg-card text-card-foreground transition-[box-shadow,border-color] duration-100',
        isNewest
          ? 'border-accent/80 ring-2 ring-accent/60 shadow-2xl'
          : 'border-border/80 shadow-md',
      )}
      style={{ left: hint.x, top: hint.y, zIndex: 100 + index }}
    >
      <div className="border-b border-border px-3 py-2">
        <div className="flex items-start justify-between gap-2">
          <div className="font-semibold text-base leading-tight">{hint.title}</div>
          {totalCards >= 3 ? (
            <span className="shrink-0 rounded-full border border-border bg-muted/30 px-1.5 py-0.5 font-mono text-[10px] leading-none text-muted-foreground">
              {index + 2} of {totalCards}
            </span>
          ) : null}
        </div>
        {hint.subtitle ? (
          <div className="mt-0.5 text-sm text-muted-foreground">{hint.subtitle}</div>
        ) : null}
      </div>
      <div className="max-h-[220px] overflow-y-auto px-3 pb-3 pt-2 text-sm leading-relaxed">
        {hint.html ? (
          <div
            // eslint-disable-next-line react/no-danger -- HTML is generated from structured 5etools entries.
            dangerouslySetInnerHTML={{ __html: hint.html }}
            className="[&_p]:my-0.5 [&_p+_p]:mt-1 [&_ul]:my-1 [&_ul]:ml-4 [&_ul]:list-disc [&_li]:my-0.5 [&_ol]:my-1 [&_ol]:ml-4 [&_ol]:list-decimal [&_table]:w-full [&_table]:border-collapse [&_table]:text-xs [&_th]:border [&_th]:border-border [&_th]:bg-muted/20 [&_th]:px-1.5 [&_th]:py-1 [&_td]:border [&_td]:border-border [&_td]:px-1.5 [&_td]:py-1 [&_.cursor-help]:underline [&_.cursor-help]:decoration-dotted [&_.cursor-help]:underline-offset-2"
          />
        ) : (
          <p className="text-xs text-muted-foreground italic">No description available.</p>
        )}
      </div>

      <RecursiveTooltipChain hints={hints} index={index + 1} />
    </div>
  )
}
