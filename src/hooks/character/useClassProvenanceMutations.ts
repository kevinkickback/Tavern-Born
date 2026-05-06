import { useCallback, useMemo } from 'react'
import {
  getClassDefaultEquipmentBlocks,
  resolveEquipmentWithBlockChoices,
} from '@/lib/5etools/startingEquipment'
import {
  computeApplyClassSelectionUpdates,
  replaceClassEquipmentGrants,
} from '@/lib/character/commands/classSelectionOrchestrationCommand'
import {
  removeSourceGrantedEquipment,
  upsertGrantedEquipment,
} from '@/lib/character/equipmentHelpers'
import type { ProvenanceLedger } from '@/lib/provenance/types'
import { emptyProvenance, useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Item5e } from '@/types/5etools'

const EMPTY_ITEM_LOOKUP = new Map<string, Item5e>()

function getClassChoiceKey(name: string, source?: string): string {
  return `${name}|${source ?? ''}`
}

export function useClassProvenanceMutations() {
  const character = useCharacterStore((s) => s.activeCharacter)
  const updateCharacter = useCharacterStore((s) => s.updateCharacter)
  const itemLookup = useGameDataStore((s) => s.gameData?.lookups?.itemLookup) ?? EMPTY_ITEM_LOOKUP

  const ledger = useMemo<ProvenanceLedger>(
    () => character?.provenance ?? emptyProvenance(),
    [character],
  )

  const applyClassSelection = useCallback(
    (
      cls: {
        name: string
        source?: string
        proficiency?: string[]
        startingEquipment?: unknown
        startingProficiencies?: {
          armor?: string[]
          weapons?: string[]
          tools?: string[]
          toolProficiencies?: Record<
            string,
            number | boolean | { choose?: { from?: string[]; count?: number } }
          >[]
          skills?: Array<string | Record<string, unknown>>
        }
      },
      subclass?: { name: string; source?: string },
    ) => {
      if (!character) return
      const updates = computeApplyClassSelectionUpdates(
        character,
        ledger,
        cls,
        subclass,
        itemLookup,
      )
      updateCharacter(character.id, updates)
    },
    [character, ledger, updateCharacter, itemLookup],
  )

  const applyClassEquipmentChoice = useCallback(
    (
      cls: {
        name: string
        source?: string
        startingEquipment?: unknown
      },
      blockIndex: number,
      choice: string,
    ) => {
      if (!character) return

      const classEquipmentToRemove = Object.entries(ledger.equipment)
        .filter(([, tags]) =>
          tags.some(
            (tag) =>
              tag.sourceType === 'class' &&
              tag.sourceName === cls.name &&
              (tag.sourceRef ?? '') === (cls.source ?? ''),
          ),
        )
        .map(([name]) => name)

      const nextEquipment = removeSourceGrantedEquipment(
        [...(character.equipment ?? [])],
        classEquipmentToRemove,
      )
      const classChoiceKey = getClassChoiceKey(cls.name, cls.source)
      const currentChoices = [...(character.classEquipmentChoices?.[classChoiceKey] ?? [])]
      while (currentChoices.length <= blockIndex) {
        currentChoices.push('a')
      }
      currentChoices[blockIndex] = choice.toLowerCase()

      const classBlocks = getClassDefaultEquipmentBlocks(cls.startingEquipment)
      const resolvedClassEquipment = resolveEquipmentWithBlockChoices(
        classBlocks,
        itemLookup,
        currentChoices,
      )
      const nextLedger = replaceClassEquipmentGrants(
        ledger,
        cls.name,
        cls.source,
        resolvedClassEquipment.items.map((item) => item.name),
      )

      updateCharacter(character.id, {
        provenance: nextLedger,
        equipment: upsertGrantedEquipment(nextEquipment, resolvedClassEquipment.items),
        classEquipmentChoices: {
          ...(character.classEquipmentChoices ?? {}),
          [classChoiceKey]: currentChoices,
        },
      })
    },
    [character, ledger, itemLookup, updateCharacter],
  )

  return { applyClassSelection, applyClassEquipmentChoice }
}
