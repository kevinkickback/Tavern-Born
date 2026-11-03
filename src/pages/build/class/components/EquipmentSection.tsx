import { useMemo } from 'react'
import { StartingEquipmentBlocks } from '@/components/character/StartingEquipmentBlocks'
import { Button } from '@/components/ui/button'
import { useItemLookup } from '@/hooks/data/useGameData'
import { useStartingEquipmentPolicy } from '@/hooks/data/useStartingEquipment'
import {
  getSelectedEquipmentPackage,
  resolveClassEquipmentBlocks,
} from '@/lib/5etools/startingEquipment'
import { needsStartingEquipmentApplication } from '@/lib/character/startingEquipmentGrants'
import { useCharacterStore } from '@/store/characterStore'
import type { Class5e } from '@/types/5etools'
import type { StartingEquipmentItemChoices, StartingItemReference } from '@/types/character'
import type { SelectedFeatureState } from './DetailsPanel'

interface BuildClassEquipmentSectionProps {
  viewingClassData?: Class5e
  blockChoices: string[]
  itemChoices: Readonly<StartingEquipmentItemChoices>
  detailCollapsed: boolean
  onBlockChoiceChange: (blockIndex: number, choice: string) => void
  onItemChoiceChange: (
    blockIndex: number,
    choice: string,
    key: string,
    items: StartingItemReference[],
  ) => void
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
  const character = useCharacterStore((state) => state.activeCharacter)
  const policy = useStartingEquipmentPolicy('class', viewingClassData)
  const equipmentBlocks = useMemo(
    () =>
      resolveClassEquipmentBlocks(
        viewingClassData?.startingEquipment,
        itemLookup,
        itemChoices,
        policy,
      ),
    [viewingClassData?.startingEquipment, itemLookup, itemChoices, policy],
  )
  if (!equipmentBlocks.length) return null
  return (
    <div className="space-y-3">
      <Button
        type="button"
        variant="link"
        className="h-auto p-0 text-xs"
        onClick={() => {
          const source = viewingClassData?.startingEquipment as
            | { default?: unknown[]; entries?: unknown[]; goldAlternative?: string }
            | undefined
          onSelectFeature({
            name: 'Equipment rules',
            source: viewingClassData?.source ?? '',
            entries: [
              'Choose each independent package and its requested items. Your Background grants its own starting equipment.',
              ...(source?.default ?? source?.entries ?? []),
              ...(source?.goldAlternative
                ? [
                    {
                      type: 'entries',
                      name: 'Rolled starting gold (manual setup)',
                      entries: [source.goldAlternative],
                    },
                  ]
                : []),
            ],
          })
          if (detailCollapsed) onExpandDetails()
        }}
      >
        Equipment rules and details
      </Button>
      <StartingEquipmentBlocks
        blocks={equipmentBlocks}
        choices={blockChoices}
        itemChoices={itemChoices}
        label="Class starting equipment"
        onBlockChange={onBlockChoiceChange}
        onItemChange={onItemChoiceChange}
        needsApplication={
          !!character &&
          !!policy?.ownerAvailable &&
          needsStartingEquipmentApplication(
            character,
            'class',
            getSelectedEquipmentPackage(equipmentBlocks, blockChoices),
          )
        }
        onApply={() => {
          const first = equipmentBlocks[0]
          if (first)
            onBlockChoiceChange(
              first.index,
              first.isFixed ? '_' : (blockChoices[first.index] ?? first.choiceKeys[0]),
            )
        }}
      />
    </div>
  )
}
