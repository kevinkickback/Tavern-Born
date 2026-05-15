import { memo } from 'react'
import { SelectionModal } from '@/components/modals/SelectionModal'
import { Badge } from '@/components/ui/badge'
import type { OptionalFeatureLike } from '@/lib/5etools/classData'
import { renderEntryCached } from '@/lib/entryRenderCache'
import { cn } from '@/lib/utils'

interface MetamagicCardProps {
  metamagic: OptionalFeatureLike
  isSelected: boolean
}

const MetamagicCard = memo(function MetamagicCard({ metamagic, isSelected }: MetamagicCardProps) {
  const firstEntry = metamagic.entries?.[0]
  const descHtml = firstEntry ? renderEntryCached(firstEntry) : ''

  return (
    <div className="p-3.5">
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <span className={cn('font-semibold text-sm leading-tight')}>{metamagic.name}</span>
        <div className="flex gap-1 flex-shrink-0">
          {metamagic.source && (
            <Badge variant="outline" className="text-xs px-1.5 py-0 h-5 text-muted-foreground">
              {metamagic.source}
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
          // eslint-disable-next-line react/no-danger -- HTML is generated from structured 5etools entries.
          dangerouslySetInnerHTML={{ __html: descHtml }}
        />
      )}
    </div>
  )
})

export interface MetamagicSelectionModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  metamagics: OptionalFeatureLike[]
  selectedNames?: string[]
  maxSelections?: number
  onConfirm: (metamagics: OptionalFeatureLike[]) => void
}

export function MetamagicSelectionModal({
  open,
  onOpenChange,
  title = 'Choose Your Metamagic',
  metamagics,
  selectedNames = [],
  maxSelections = Number.POSITIVE_INFINITY,
  onConfirm,
}: MetamagicSelectionModalProps) {
  return (
    <SelectionModal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      items={metamagics}
      getItemId={(m) => `${m.name}|${m.source ?? ''}`}
      initialSelectedIds={selectedNames.map((n) => {
        const item = metamagics.find((m) => m.name === n)
        return `${item?.name}|${item?.source ?? ''}`
      })}
      matchItem={(item, search) => {
        if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false
        return true
      }}
      renderCard={(item, isSelected) => <MetamagicCard metamagic={item} isSelected={isSelected} />}
      categories={
        maxSelections !== Number.POSITIVE_INFINITY
          ? [
              {
                key: 'metamagic',
                label: 'Metamagics',
                max: maxSelections,
                test: () => true,
              },
            ]
          : []
      }
      onConfirm={(_ids, items) => {
        onConfirm(items)
      }}
    />
  )
}
