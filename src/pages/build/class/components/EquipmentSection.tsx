import type { Ref } from 'react'
import { StartingEquipmentBlocks } from '@/components/character/StartingEquipmentBlocks'
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  getEquipmentBlockSelection,
  getSelectedEquipmentPackage,
  type ResolvedEquipmentBlock,
} from '@/lib/5etools/startingEquipment'
import { needsStartingEquipmentApplication } from '@/lib/character/startingEquipmentGrants'
import { cn } from '@/lib/utils'
import type { Class5e } from '@/types/5etools'
import type {
  Character,
  StartingEquipmentItemChoices,
  StartingItemReference,
} from '@/types/character'
import { ClassChoiceStatusBadge } from './ClassChoiceStatusBadge'
import type { SelectedFeatureState } from './DetailsPanel'

interface BuildClassEquipmentAccordionProps {
  character: Character
  viewingClassData?: Class5e
  equipmentBlocks: readonly ResolvedEquipmentBlock[]
  ownerAvailable: boolean
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
  choiceRef: Ref<HTMLDivElement>
  highlighted: boolean
}

export function BuildClassEquipmentAccordion({
  character,
  viewingClassData,
  equipmentBlocks,
  ownerAvailable,
  blockChoices,
  itemChoices,
  detailCollapsed,
  onBlockChoiceChange,
  onItemChoiceChange,
  onSelectFeature,
  onExpandDetails,
  choiceRef,
  highlighted,
}: BuildClassEquipmentAccordionProps) {
  const selectedPackage = getSelectedEquipmentPackage(equipmentBlocks, blockChoices)
  let choiceCount = 0
  let pending = 0
  let hasWithdrawnPackage = false
  for (const block of equipmentBlocks) {
    const { optionKey, needsReselection } = getEquipmentBlockSelection(block, blockChoices)
    const option = block.options[optionKey]
    hasWithdrawnPackage ||= needsReselection
    // Count the numbered Choice groups shown inside the accordion.
    if (!block.isFixed || option.genericChoices?.length) {
      choiceCount += 1
      if (needsReselection || option.issues?.length) pending += 1
    }
  }
  const needsApplication =
    !hasWithdrawnPackage &&
    ownerAvailable &&
    needsStartingEquipmentApplication(character, 'class', selectedPackage)
  const action = selectedPackage.issues?.length
    ? 'Needs attention'
    : needsApplication
      ? 'Apply package'
      : undefined

  return (
    <AccordionItem
      value="starting-equipment"
      className="overflow-hidden rounded-lg border border-border last:border-b data-[state=open]:border-primary/30 data-[state=open]:bg-surface-raised/40"
    >
      <AccordionTrigger className="px-3 text-sm hover:no-underline data-[state=open]:rounded-b-none data-[state=open]:bg-surface-raised">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">Starting Equipment</span>
          {choiceCount > 0 && (
            <Badge
              variant="outline"
              className="pointer-events-none h-5 border-primary/30 bg-primary/10 px-1.5 font-mono text-xs text-primary"
            >
              {choiceCount} {choiceCount === 1 ? 'Choice' : 'Choices'}
            </Badge>
          )}
          {(choiceCount > 0 || action) && (
            <ClassChoiceStatusBadge pending={pending} action={action} />
          )}
        </div>
      </AccordionTrigger>
      <AccordionContent>
        <div
          ref={choiceRef}
          className={cn('space-y-3 px-3 pb-2 pt-3', highlighted && 'animate-route-focus')}
        >
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
            needsApplication={needsApplication}
            onApply={() => {
              const first = equipmentBlocks[0]
              if (first)
                onBlockChoiceChange(
                  first.index,
                  getEquipmentBlockSelection(first, blockChoices).optionKey,
                )
            }}
          />
        </div>
      </AccordionContent>
    </AccordionItem>
  )
}
