import { Check, Package } from '@phosphor-icons/react'
import { Fragment, useMemo } from 'react'
import { GenericEquipmentSelect } from '@/components/character/GenericEquipmentSelect'
import { GameContent } from '@/components/editor/GameContent'
import { useItemLookup } from '@/hooks/data/useGameData'
import {
  formatEquipmentOptionEntries,
  resolveClassEquipmentBlocks,
} from '@/lib/5etools/startingEquipment'
import { cn } from '@/lib/utils'
import type { Class5e } from '@/types/5etools'
import type { SelectedFeatureState } from './DetailsPanel'

const STARTING_EQUIPMENT_HELP =
  'Tavern-Born applies the equipment package selected below together with equipment granted by your background. Choose each alternative and any specific item requested by a generic equipment option.'

interface BuildClassEquipmentSectionProps {
  viewingClassData?: Class5e
  blockChoices: string[]
  itemChoices: Readonly<Record<string, string>>
  detailCollapsed: boolean
  onBlockChoiceChange: (blockIndex: number, choice: string) => void
  onItemChoiceChange: (blockIndex: number, choice: string, key: string, itemRef: string) => void
  onSelectFeature: (feature: SelectedFeatureState) => void
  onExpandDetails: () => void
}

export function BuildClassEquipmentSection({
  viewingClassData,
  blockChoices,
  itemChoices,
  detailCollapsed,
  onBlockChoiceChange,
  onItemChoiceChange,
  onSelectFeature,
  onExpandDetails,
}: BuildClassEquipmentSectionProps) {
  const itemLookup = useItemLookup()
  const equipmentBlocks = useMemo(
    () => resolveClassEquipmentBlocks(viewingClassData?.startingEquipment, itemLookup, itemChoices),
    [viewingClassData?.startingEquipment, itemLookup, itemChoices],
  )

  const showEquipmentDetails = () => {
    onSelectFeature({
      name: 'Starting Equipment',
      source: 'Tavern-Born',
      entries: [STARTING_EQUIPMENT_HELP],
    })
    if (detailCollapsed) onExpandDetails()
  }

  if (equipmentBlocks.length === 0) return null

  return (
    <div className="rounded-lg border border-border bg-muted/20 overflow-hidden">
      <button
        type="button"
        onClick={showEquipmentDetails}
        className="w-full flex items-center gap-2 px-3 py-2.5 border-b border-border/60 hover:bg-muted/40 transition-colors text-left"
      >
        <Package className="h-4 w-4 text-accent" weight="duotone" />
        <div className="min-w-0">
          <div className="text-sm font-semibold">Starting Equipment</div>
          <div className="text-xs text-muted-foreground">Choose your starting gear</div>
        </div>
      </button>

      <div className="divide-y divide-border/40">
        {equipmentBlocks.map((block) => {
          const currentChoice = blockChoices[block.index]?.toLowerCase() ?? 'a'
          const currentPackage = block.options[block.isFixed ? '_' : currentChoice]

          if (block.isFixed) {
            return (
              <div key={block.index} className="px-3 py-2">
                <div className="flex items-start gap-2">
                  <span className="text-xs text-muted-foreground mt-0.5 shrink-0">•</span>
                  {block.displayText ? (
                    <GameContent
                      entry={block.displayText}
                      className="text-xs text-foreground equipment-entry"
                    />
                  ) : (
                    <span className="text-xs text-foreground">
                      {formatEquipmentOptionEntries(block.options._).join(', ') || 'Fixed item'}
                    </span>
                  )}
                </div>
                {currentPackage?.genericChoices?.map((genericChoice) => (
                  <GenericEquipmentSelect
                    key={genericChoice.key}
                    choice={genericChoice}
                    value={itemChoices[genericChoice.key] ?? ''}
                    ariaLabel={`Starting equipment choice ${block.index + 1} specific item`}
                    onChange={(itemRef) =>
                      onItemChoiceChange(block.index, '_', genericChoice.key, itemRef)
                    }
                  />
                ))}
              </div>
            )
          }

          return (
            <div key={block.index} className="px-3 py-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {block.choiceKeys.map((key, i) => {
                  const isSelected = currentChoice === key
                  const optionData = block.options[key]
                  const itemLabel = optionData
                    ? formatEquipmentOptionEntries(optionData).join(', ')
                    : key.toUpperCase()
                  return (
                    <Fragment key={key}>
                      {i > 0 && <span className="text-xs text-muted-foreground">or</span>}
                      <button
                        type="button"
                        onClick={() => {
                          onBlockChoiceChange(block.index, key)
                          showEquipmentDetails()
                        }}
                        className={cn(
                          'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border transition-colors',
                          isSelected
                            ? 'border-success/40 bg-success/10 text-foreground'
                            : 'border-border bg-background hover:border-accent/50 hover:bg-accent/5',
                        )}
                      >
                        <span className="font-medium">{itemLabel}</span>
                        {isSelected && <Check className="h-3 w-3 text-success" />}
                      </button>
                    </Fragment>
                  )
                })}
              </div>
              {currentPackage?.genericChoices?.map((genericChoice) => (
                <GenericEquipmentSelect
                  key={genericChoice.key}
                  choice={genericChoice}
                  value={itemChoices[genericChoice.key] ?? ''}
                  ariaLabel={`Starting equipment choice ${block.index + 1} specific item`}
                  onChange={(itemRef) =>
                    onItemChoiceChange(block.index, currentChoice, genericChoice.key, itemRef)
                  }
                />
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
