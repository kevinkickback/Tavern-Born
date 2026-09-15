import { memo, useCallback, useMemo } from 'react'
import { GameContent } from '@/components/editor/GameContent'
import { type CategoryLimit, SelectionModal } from '@/components/modals/SelectionModal'
import { Badge } from '@/components/ui/badge'
import {
  type ClassChoiceOptionView,
  getClassChoiceOptionKey,
} from '@/lib/character/classChoiceOptions'
import type { NormalizedCharacterChoice } from '@/types/classRules'

const ENTITY_LABELS = {
  classFeature: 'Class feature',
  feat: 'Feat',
  item: 'Item',
  optionalFeature: 'Optional feature',
} as const

const ChoiceOptionCard = memo(function ChoiceOptionCard({
  option,
  selected,
}: {
  option: ClassChoiceOptionView
  selected: boolean
}) {
  return (
    <div className="p-3.5">
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <span className="font-semibold leading-tight">{option.reference.name}</span>
        <div className="flex shrink-0 gap-1">
          <Badge variant="outline" className="h-5 px-1.5 py-0 text-xs text-muted-foreground">
            {ENTITY_LABELS[option.reference.entityType]}
          </Badge>
          {option.reference.source && (
            <Badge variant="outline" className="h-5 px-1.5 py-0 text-xs text-muted-foreground">
              {option.reference.source}
            </Badge>
          )}
          {selected && <Badge className="h-5 bg-accent px-1.5 py-0 text-xs">Selected</Badge>}
        </div>
      </div>
      {option.entries[0] != null && (
        <GameContent
          entry={option.entries[0]}
          className="line-clamp-3 text-sm leading-snug text-muted-foreground"
        />
      )}
    </div>
  )
})

interface ClassChoiceSelectionModalProps {
  choice: NormalizedCharacterChoice
  options: ClassChoiceOptionView[]
  maximumSelections: number
  initialSelectedIds: string[]
  onClose: () => void
  onConfirm: (selected: ClassChoiceOptionView[]) => void
}

export function ClassChoiceSelectionModal({
  choice,
  options,
  maximumSelections,
  initialSelectedIds,
  onClose,
  onConfirm,
}: ClassChoiceSelectionModalProps) {
  const limits = useMemo<CategoryLimit<ClassChoiceOptionView>[]>(
    () => [
      {
        key: 'all',
        label: 'selections',
        max: maximumSelections,
        test: () => true,
      },
    ],
    [maximumSelections],
  )
  const matchItem = useCallback(
    (option: ClassChoiceOptionView, search: string) =>
      option.reference.name.toLowerCase().includes(search.trim().toLowerCase()),
    [],
  )
  const renderCard = useCallback(
    (option: ClassChoiceOptionView, selected: boolean) => (
      <ChoiceOptionCard option={option} selected={selected} />
    ),
    [],
  )

  return (
    <SelectionModal
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={`Choose ${choice.label}`}
      items={options}
      getItemId={(option) => getClassChoiceOptionKey(option.reference)}
      renderCard={renderCard}
      matchItem={matchItem}
      categories={limits}
      initialSelectedIds={initialSelectedIds}
      onConfirm={(_ids, selected) => onConfirm(selected)}
    />
  )
}
