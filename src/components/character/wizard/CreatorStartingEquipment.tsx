import { useLayoutEffect } from 'react'
import { StartingEquipmentBlocks } from '@/components/character/StartingEquipmentBlocks'
import { useClassProvenanceMutations } from '@/hooks/character/useClassProvenanceMutations'
import { useItemLookup } from '@/hooks/data/useGameData'
import { useStartingEquipmentPolicy } from '@/hooks/data/useStartingEquipment'
import {
  getEquipmentBlockSelection,
  getSelectedEquipmentPackage,
  isStartingEquipmentItemChoiceComplete,
  needsStartingEquipmentPackageChoice,
  type ResolvedEquipmentBlock,
  resolveClassEquipmentBlocks,
} from '@/lib/5etools/startingEquipment'
import { applyBackgroundSelectionCommand } from '@/lib/character/commands/backgroundCommands'
import { needsStartingEquipmentApplication } from '@/lib/character/startingEquipmentGrants'
import { useBackgroundStartingEquipment } from '@/pages/build/background/model/useBackgroundStartingEquipment'
import { useCharacterEditingStore } from '@/store/characterEditingContext'
import type { Background5e, Class5e } from '@/types/5etools'
import type { Character } from '@/types/character'

export function CreatorStartingEquipment({
  character,
  rules,
  background,
  onStatusChange,
}: {
  character: Character
  rules?: Class5e
  background?: Background5e
  onStatusChange?: (available: boolean, pending: boolean) => void
}) {
  const editing = useCharacterEditingStore()
  const lookup = useItemLookup()
  const { applyClassEquipmentChoice } = useClassProvenanceMutations()
  const classPolicy = useStartingEquipmentPolicy('class', rules)
  const backgroundPolicy = useStartingEquipmentPolicy('background', background)
  const { picker, ownerAvailable } = useBackgroundStartingEquipment(
    character,
    background,
    (_owner, selected, items) => {
      if (!background || !backgroundPolicy || editing.getState().activeCharacter !== character)
        return
      const result = applyBackgroundSelectionCommand(
        character,
        character.provenance,
        background,
        selected ?? [],
        lookup,
        items ?? {},
        backgroundPolicy,
        true,
      )
      editing.getState().updateCharacter(character.id, {
        ...result.characterPatch,
        provenance: result.provenanceUpdate,
      })
    },
  )
  const entry = character.classProgression[0]
  const key = entry ? `${entry.name}|${entry.source}` : ''
  const choices = character.classEquipmentChoices?.[key] ?? []
  const itemChoices = character.classEquipmentItemChoices?.[key] ?? {}
  const blocks = rules
    ? resolveClassEquipmentBlocks(rules.startingEquipment, lookup, itemChoices, classPolicy)
    : []
  const needsApplication =
    !!classPolicy?.ownerAvailable &&
    needsStartingEquipmentApplication(
      character,
      'class',
      getSelectedEquipmentPackage(blocks, choices),
    )
  const actionable = (row: ResolvedEquipmentBlock) =>
    !row.isFixed || row.options._.genericChoices?.some((choice) => choice.candidates.length > 0)
  const activeBlocks = rules ? blocks : picker.blocks
  const activeSelections = rules ? choices : picker.choices
  const pkg = getSelectedEquipmentPackage(activeBlocks, activeSelections)
  const available =
    (rules ? !!classPolicy?.ownerAvailable : ownerAvailable) && activeBlocks.some(actionable)
  const pending =
    available &&
    (activeBlocks.some((block) => needsStartingEquipmentPackageChoice(block, activeSelections)) ||
      !!pkg.genericChoices?.some(
        (choice) =>
          choice.candidates.length > 0 &&
          !isStartingEquipmentItemChoiceComplete(
            choice,
            (rules ? itemChoices : picker.itemChoices)[choice.key],
          ),
      ) ||
      ((rules ? needsApplication : picker.needsApplication) && !pkg.issues?.length))
  useLayoutEffect(() => onStatusChange?.(available, pending), [available, pending, onStatusChange])
  return (
    <>
      {rules && available && (
        <section className="border-b border-border/70 py-3">
          <h4 className="mb-2 text-sm font-semibold">{rules.name} starting equipment</h4>
          <div className="mt-3">
            <StartingEquipmentBlocks
              label="Class starting equipment"
              blocks={blocks}
              choices={choices}
              itemChoices={itemChoices}
              needsApplication={needsApplication}
              markUnfilled
              onApply={() => {
                const first = blocks[0]
                if (first)
                  applyClassEquipmentChoice(
                    rules,
                    first.index,
                    getEquipmentBlockSelection(first, choices).optionKey,
                  )
              }}
              onBlockChange={(index, choice) => applyClassEquipmentChoice(rules, index, choice)}
              onItemChange={(index, choice, id, items) =>
                applyClassEquipmentChoice(rules, index, choice, { ...itemChoices, [id]: items })
              }
            />
          </div>
        </section>
      )}
      {background && available && (
        <section className="border-b border-border/70 py-3">
          <h4 className="mb-2 text-sm font-semibold">{background.name} starting equipment</h4>
          <div className="mt-3">
            <StartingEquipmentBlocks {...picker} markUnfilled />
          </div>
        </section>
      )}
    </>
  )
}
