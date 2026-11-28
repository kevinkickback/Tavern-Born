import { type ComponentProps, useMemo, useState } from 'react'
import type { StartingEquipmentBlocks } from '@/components/character/StartingEquipmentBlocks'
import type { useBackgroundProvenanceMutations } from '@/hooks/character/useBackgroundProvenanceMutations'
import { useItemLookup } from '@/hooks/data/useGameData'
import { useStartingEquipmentPolicy } from '@/hooks/data/useStartingEquipment'
import {
  getBackgroundEquipmentBlocks,
  getSelectedEquipmentPackage,
  hasInvalidStartingEquipmentPackage,
  resolveBackgroundEquipmentBlocks,
} from '@/lib/5etools/startingEquipment'
import { needsStartingEquipmentApplication } from '@/lib/character/startingEquipmentGrants'
import type { Background5e } from '@/types/5etools'
import type { Character, StartingEquipmentItemChoices } from '@/types/character'

type EquipmentDraft = {
  character: Character
  background: Background5e
  choices: string[]
  itemChoices: StartingEquipmentItemChoices
}

export function useBackgroundStartingEquipment(
  character: Character | null,
  background: Background5e | undefined,
  applyBackgroundSelection: ReturnType<
    typeof useBackgroundProvenanceMutations
  >['applyBackgroundSelection'],
) {
  const [equipmentDraft, setEquipmentDraft] = useState<EquipmentDraft>()
  const itemLookup = useItemLookup()
  const policy = useStartingEquipmentPolicy('background', background)
  const draft =
    equipmentDraft?.character === character && equipmentDraft?.background === background
      ? equipmentDraft
      : undefined
  const choices = draft?.choices ?? character?.backgroundEquipmentChoices ?? []
  const itemChoices = draft?.itemChoices ?? character?.backgroundEquipmentItemChoices ?? {}
  const startingEquipment = background?.startingEquipment
  const blocks = useMemo(
    () => resolveBackgroundEquipmentBlocks(startingEquipment, itemLookup, itemChoices, policy),
    [startingEquipment, itemLookup, itemChoices, policy],
  )
  const needsApplication =
    !!character &&
    !!policy?.ownerAvailable &&
    needsStartingEquipmentApplication(
      character,
      'background',
      getSelectedEquipmentPackage(blocks, choices),
    )

  const applyPackage = (nextChoices: string[], nextItems: StartingEquipmentItemChoices) => {
    if (!character || !background) return
    const rawBlocks = getBackgroundEquipmentBlocks(startingEquipment)
    const active = rawBlocks.map((_, index) => {
      const block = blocks.find((row) => row.index === index)
      return block?.isFixed ? '' : nextChoices[index] || block?.choiceKeys[0] || ''
    })
    if (hasInvalidStartingEquipmentPackage(rawBlocks, active)) {
      setEquipmentDraft({ character, background, choices: active, itemChoices: nextItems })
      return
    }
    applyBackgroundSelection(background, active, active.length ? nextItems : {})
    setEquipmentDraft(undefined)
  }

  const picker = {
    blocks,
    choices,
    itemChoices,
    label: 'Background starting equipment',
    needsApplication,
    onApply: () => applyPackage(choices, itemChoices),
    onBlockChange: (block, value) => {
      const next = [...choices]
      while (next.length <= block) next.push('')
      next[block] = value
      applyPackage(next, itemChoices)
    },
    onItemChange: (_, __, key, items) => applyPackage(choices, { ...itemChoices, [key]: items }),
  } satisfies ComponentProps<typeof StartingEquipmentBlocks>
  return {
    picker,
    ownerAvailable: !!policy?.ownerAvailable,
    resetDraft: () => setEquipmentDraft(undefined),
  }
}
