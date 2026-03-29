// Armour class hook — derives AC from equipped items + DEX modifier.
// Covers item 10 (AC calculation) from the implementation plan.

import { useMemo } from 'react'
import { useCharacterStore } from '@/store/characterStore'
import { getAbilityModifier } from '@/lib/calculations/gameRules'
import { computeArmorClass } from '@/lib/calculations/armorClass'

export interface ArmorClassState {
  /** Derived AC from equipped armour + DEX (reflects game rules). */
  calculatedAC: number
  /** Stored AC on the character (may differ when overridden manually). */
  storedAC: number
  /** Sync stored AC to the calculated value. */
  syncAC: () => void
  /** Manually override the stored AC value. */
  setAC: (ac: number) => void
}

export function useArmorClass(): ArmorClassState {
  const character = useCharacterStore((s) => s.activeCharacter)
  const updateCharacter = useCharacterStore((s) => s.updateCharacter)

  const dexMod = useMemo(
    () => getAbilityModifier(character?.abilityScores.dexterity ?? 10),
    [character?.abilityScores.dexterity],
  )

  const calculatedAC = useMemo(
    () => computeArmorClass(character?.equipment ?? [], dexMod),
    [character?.equipment, dexMod],
  )

  return {
    calculatedAC,
    storedAC: character?.armorClass ?? 10,
    syncAC: () => {
      if (!character) return
      updateCharacter(character.id, { armorClass: calculatedAC })
    },
    setAC: (ac) => {
      if (!character) return
      updateCharacter(character.id, { armorClass: Math.max(0, ac) })
    },
  }
}
