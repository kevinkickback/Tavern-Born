import { useCallback, useMemo } from 'react'
import { useCharacterCalculationContext } from '@/hooks/character/useCharacterCalculationContext'
import { useFilteredGameData } from '@/hooks/data/useFilteredGameData'
import { buildItemTypeLookup } from '@/lib/5etools/lookups'
import {
  createStartingEquipmentPolicy,
  type StartingEquipmentPolicy,
} from '@/lib/5etools/startingEquipmentPolicy'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { sameStartingReference } from '@/lib/character/startingEquipmentGrants'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Character } from '@/types/character'

type StartingOwner = {
  name: string
  source?: string
  startingEquipment?: unknown
  entries?: unknown[]
}

/** One named adapter supplies raw exact dependencies and the current character-filtered view. */
export function useStartingEquipmentAuthority() {
  const activeCharacter = useCharacterStore((state) => state.activeCharacter)
  const calculation = useCharacterCalculationContext(activeCharacter)
  const raw = useGameDataStore((state) => state.gameData)
  const filtered = useFilteredGameData()
  const rawItems = useMemo(() => [...(raw?.items ?? []), ...(raw?.itemsBase ?? [])], [raw])
  const availableItems = useMemo(() => [...filtered.items, ...filtered.itemsBase], [filtered])
  const itemTypes = useMemo(() => buildItemTypeLookup(raw?.itemTypes ?? []), [raw])
  const getPolicy = useCallback(
    (
      character: Character,
      kind: 'class' | 'background',
      owner: StartingOwner,
    ): StartingEquipmentPolicy => {
      const collection = kind === 'class' ? filtered.classes : filtered.backgrounds
      const currentOwner = collection.find((row) =>
        sameStartingReference(
          row.source ? { name: row.name, source: row.source } : undefined,
          owner.source ? { name: owner.name, source: owner.source } : undefined,
        ),
      )
      return createStartingEquipmentPolicy(
        calculation
          ? character === activeCharacter
            ? calculation.character
            : createCharacterCalculationContext(
                character,
                calculation.lookups.primary,
                calculation.lookups.raw,
              ).character
          : character,
        {
          name: owner.name,
          source: owner.source ?? '',
          kind,
          entries: Array.isArray(currentOwner?.entries) ? currentOwner.entries : undefined,
        },
        currentOwner?.startingEquipment,
        rawItems,
        availableItems,
        itemTypes,
        !!currentOwner,
      )
    },
    [filtered, rawItems, availableItems, itemTypes, activeCharacter, calculation],
  )
  return { getPolicy, sourceData: raw }
}

export function useStartingEquipmentPolicy(kind: 'class' | 'background', owner?: StartingOwner) {
  const character = useCharacterStore((state) => state.activeCharacter)
  const { getPolicy } = useStartingEquipmentAuthority()
  return useMemo(
    () => (character && owner ? getPolicy(character, kind, owner) : undefined),
    [character, owner, getPolicy, kind],
  )
}
