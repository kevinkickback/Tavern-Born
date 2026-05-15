import { memo, useCallback, useMemo } from 'react'
import { type ActiveFilters, SelectionModal } from '@/components/modals/SelectionModal'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

type SubclassOption = {
  name: string
  source?: string
  entries?: unknown[]
}

interface SubclassCardProps {
  subclass: SubclassOption
  isSelected: boolean
}

const SubclassCard = memo(function SubclassCard({ subclass, isSelected }: SubclassCardProps) {
  const introText: string | undefined = Array.isArray(subclass.entries)
    ? (subclass.entries.find((e) => typeof e === 'string') as string | undefined)
    : undefined

  return (
    <div className="p-3.5">
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <span className={cn('font-semibold text-base leading-tight')}>{subclass.name}</span>
        <div className="flex gap-1 flex-shrink-0">
          {subclass.source && (
            <Badge variant="outline" className="text-xs px-1.5 py-0 h-5 text-muted-foreground">
              {subclass.source}
            </Badge>
          )}
          {isSelected && (
            <Badge className="text-xs px-1.5 py-0 h-5 bg-accent text-accent-foreground">✓</Badge>
          )}
        </div>
      </div>
      {introText && <p className="text-sm text-muted-foreground leading-snug">{introText}</p>}
    </div>
  )
})

export interface SubclassSelectionModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  subclasses: SubclassOption[]
  selectedName?: string
  onConfirm: (subclass: SubclassOption) => void
}

export function SubclassSelectionModal({
  open,
  onOpenChange,
  title,
  subclasses,
  selectedName,
  onConfirm,
}: SubclassSelectionModalProps) {
  const matchItem = useCallback((item: SubclassOption, search: string, _filters: ActiveFilters) => {
    if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  }, [])

  const renderCard = useCallback(
    (item: SubclassOption, isSelected: boolean) => (
      <SubclassCard subclass={item} isSelected={isSelected} />
    ),
    [],
  )

  const categories = useMemo(
    () => [{ key: 'all', label: 'selected', max: 1, test: () => true }],
    [],
  )

  const canSelect = useCallback((item: SubclassOption, selectedIds: Set<string>) => {
    if (selectedIds.has(`${item.name}|${item.source ?? ''}`)) return true
    return selectedIds.size < 1
  }, [])

  const initialSelectedIds = useMemo(
    () => {
      if (!selectedName) return []
      const selectedId = subclasses
        .map((subclass) => `${subclass.name}|${subclass.source ?? ''}`)
        .find((id) => id.startsWith(`${selectedName}|`))
      return selectedId ? [selectedId] : []
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only selection inputs should trigger recompute.
    [selectedName, subclasses],
  )

  return (
    <SelectionModal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      items={subclasses}
      getItemId={(sc) => `${sc.name}|${sc.source ?? ''}`}
      renderCard={renderCard}
      matchItem={matchItem}
      categories={categories}
      canSelect={canSelect}
      initialSelectedIds={initialSelectedIds}
      onConfirm={(_ids, items) => {
        if (items.length > 0) onConfirm(items[0])
      }}
    />
  )
}
