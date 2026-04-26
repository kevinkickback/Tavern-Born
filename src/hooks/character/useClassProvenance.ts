import { useCallback } from 'react'
import {
  getClassDefaultEquipmentBlocks,
  resolveEquipmentWithBlockChoices,
} from '@/lib/5etools/startingEquipment'
import { computeApplyClassSelectionUpdates } from '@/lib/character/commands/classSelectionOrchestrationCommand'
import { addGrant, makeSourceTag } from '@/lib/provenance'
import type { ProvenanceLedger, SourceTag } from '@/lib/provenance/types'
import type { Item5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import { removeSourceGrantedEquipment, upsertGrantedEquipment } from './provenanceHelpers'

function getClassChoiceKey(name: string, source?: string): string {
  return `${name}|${source ?? ''}`
}

function replaceClassEquipmentGrants(
  ledger: ProvenanceLedger,
  className: string,
  classSource: string | undefined,
  equipmentNames: string[],
): ProvenanceLedger {
  const nextEquipment: Record<string, SourceTag[]> = {}

  for (const [itemName, tags] of Object.entries(ledger.equipment)) {
    const retained = tags.filter(
      (tag) =>
        !(
          tag.sourceType === 'class' &&
          tag.sourceName === className &&
          (tag.sourceRef ?? '') === (classSource ?? '')
        ),
    )
    if (retained.length > 0) nextEquipment[itemName] = retained
  }

  let nextLedger: ProvenanceLedger = { ...ledger, equipment: nextEquipment }
  const classTag = makeSourceTag('class', className, 'fixed', classSource)
  for (const itemName of equipmentNames) {
    nextLedger = addGrant(nextLedger, 'equipment', itemName, classTag)
  }

  return nextLedger
}

interface UseClassProvenanceParams {
  character: Character | null
  ledger: ProvenanceLedger
  itemLookup: Map<string, Item5e>
  updateCharacter: (id: string, updates: Partial<Character>) => void
}

export function useClassProvenance({
  character,
  ledger,
  itemLookup,
  updateCharacter,
}: UseClassProvenanceParams) {
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
      // Ensure the array is big enough, then update the specific block index
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
