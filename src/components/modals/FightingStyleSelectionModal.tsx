import { memo } from 'react'
import { SelectionModal } from '@/components/modals/SelectionModal'
import { Badge } from '@/components/ui/badge'
import type { OptionalFeatureLike } from '@/lib/5etools/classData'
import { renderEntryCached } from '@/lib/entryRenderCache'
import { cn } from '@/lib/utils'

interface FightingStyleCardProps {
  style: OptionalFeatureLike
  isSelected: boolean
}

const FightingStyleCard = memo(function FightingStyleCard({
  style,
  isSelected,
}: FightingStyleCardProps) {
  const firstEntry = style.entries?.[0]
  const descHtml = firstEntry ? renderEntryCached(firstEntry) : ''

  return (
    <div className="p-3.5">
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <span className={cn('font-semibold text-sm leading-tight')}>{style.name}</span>
        <div className="flex gap-1 flex-shrink-0">
          {style.source && (
            <Badge variant="outline" className="text-xs px-1.5 py-0 h-5 text-muted-foreground">
              {style.source}
            </Badge>
          )}
          {isSelected && (
            <Badge className="text-xs px-1.5 py-0 h-5 bg-accent text-accent-foreground">✓</Badge>
          )}
        </div>
      </div>

      {descHtml && (
        <div
          className="text-sm text-muted-foreground line-clamp-3 leading-snug"
          // renderEntry outputs safe HTML from structured 5etools entries.
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: descHtml }}
        />
      )}
    </div>
  )
})

export interface FightingStyleSelectionModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  styles: OptionalFeatureLike[]
  selectedName?: string
  onConfirm: (style: OptionalFeatureLike) => void
}

export function FightingStyleSelectionModal({
  open,
  onOpenChange,
  title = 'Choose Your Fighting Style',
  styles,
  selectedName,
  onConfirm,
}: FightingStyleSelectionModalProps) {
  // Map the stored bare name to the composite name|source key used as the item id.
  const selectedId = selectedName
    ? (() => {
        const match = styles.find((s) => s.name === selectedName)
        return match ? `${match.name}|${match.source ?? ''}` : `${selectedName}|`
      })()
    : undefined

  return (
    <SelectionModal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      items={styles}
      getItemId={(s) => `${s.name}|${s.source ?? ''}`}
      initialSelectedIds={selectedId ? [selectedId] : []}
      matchItem={(item, search) => {
        if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false
        return true
      }}
      renderCard={(item, isSelected) => <FightingStyleCard style={item} isSelected={isSelected} />}
      onConfirm={(_ids, items) => {
        if (items.length > 0) onConfirm(items[0])
      }}
    />
  )
}
