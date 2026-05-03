import { Check, Package } from '@phosphor-icons/react'
import { Fragment, useMemo } from 'react'
import {
  formatEquipmentOptionEntries,
  resolveClassEquipmentBlocks,
} from '@/lib/5etools/startingEquipment'
import { renderEntry } from '@/lib/renderer'
import { cn } from '@/lib/utils'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Class5e, Item5e } from '@/types/5etools'
import type { SelectedFeatureState } from './DetailsPanel'

const EMPTY_ITEM_LOOKUP = new Map<string, Item5e>()

const STARTING_EQUIPMENT_DESCRIPTION =
  'When you create your character, you receive equipment based on a combination of your class and background. Alternatively, you can start with a number of gold pieces based on your class and spend them on items from the lists in this section. See the Starting Wealth by Class table to determine how much gold you have to spend.\n\nYou decide how your character came by this starting equipment. It might have been an inheritance, or goods that the character purchased during his or her upbringing. You might have been equipped with a weapon, armor, and a backpack as part of military service. You might even have stolen your gear. A weapon could be a family heirloom, passed down from generation to generation until your character finally took up the mantle and followed in an ancestor\u2019s adventurous footsteps.'

interface BuildClassEquipmentSectionProps {
  viewingClassData?: Class5e
  blockChoices: string[]
  detailCollapsed: boolean
  onBlockChoiceChange: (blockIndex: number, choice: string) => void
  onSelectFeature: (feature: SelectedFeatureState) => void
  onExpandDetails: () => void
}

export function BuildClassEquipmentSection({
  viewingClassData,
  blockChoices,
  detailCollapsed,
  onBlockChoiceChange,
  onSelectFeature,
  onExpandDetails,
}: BuildClassEquipmentSectionProps) {
  const itemLookup = useGameDataStore((s) => s.gameData?.lookups?.itemLookup) ?? EMPTY_ITEM_LOOKUP
  const equipmentBlocks = useMemo(
    () => resolveClassEquipmentBlocks(viewingClassData?.startingEquipment, itemLookup),
    [viewingClassData?.startingEquipment, itemLookup],
  )

  const showEquipmentDetails = () => {
    onSelectFeature({
      name: 'Starting Equipment',
      source: viewingClassData?.source,
      entries: [STARTING_EQUIPMENT_DESCRIPTION],
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

          if (block.isFixed) {
            return (
              <div key={block.index} className="px-3 py-2 flex items-start gap-2">
                <span className="text-xs text-muted-foreground mt-0.5 shrink-0">•</span>
                {block.displayText ? (
                  <span
                    className="text-xs text-foreground equipment-entry"
                    dangerouslySetInnerHTML={{ __html: renderEntry(block.displayText) ?? '' }}
                  />
                ) : (
                  <span className="text-xs text-foreground">
                    {block.options._.items.map((i) => i.name).join(', ') || 'Fixed item'}
                  </span>
                )}
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
            </div>
          )
        })}
      </div>
    </div>
  )
}
