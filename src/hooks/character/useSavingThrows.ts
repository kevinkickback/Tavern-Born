import { useMemo } from 'react'
import { useCharacterCalculationContext } from '@/hooks/character/useCharacterCalculationContext'
import { ABILITY_NAMES, type AbilityName } from '@/lib/calculations/abilityScores'
import { getAbilityModifier, getProficiencyBonus } from '@/lib/calculations/gameRules'
import { deriveAllSavingThrows, type SavingThrowResult } from '@/lib/calculations/skills'
import { getTotalCharacterLevel } from '@/lib/characterUtils'
import { useCharacterStore } from '@/store/characterStore'

export interface SavingThrowsState {
  savingThrows: SavingThrowResult[]
}

export function useSavingThrows(): SavingThrowsState {
  const activeCharacter = useCharacterStore((s) => s.activeCharacter)

  const level = useMemo(() => getTotalCharacterLevel(activeCharacter), [activeCharacter])
  const calculationContext = useCharacterCalculationContext(activeCharacter)
  const proficientSavingThrows = activeCharacter?.proficiencies?.savingThrows ?? []

  const abilityModifiers = useMemo(() => {
    if (calculationContext) return calculationContext.abilityScores.modifiers
    return Object.fromEntries(
      ABILITY_NAMES.map((ability) => [ability, getAbilityModifier(10)]),
    ) as Record<AbilityName, number>
  }, [calculationContext])

  const proficiencyBonus = useMemo(() => getProficiencyBonus(level), [level])

  const savingThrows = useMemo(
    () =>
      deriveAllSavingThrows(
        abilityModifiers,
        proficientSavingThrows,
        proficiencyBonus,
        calculationContext?.effects.declarations,
        calculationContext?.effects.resolutionContext,
      ),
    [abilityModifiers, proficientSavingThrows, proficiencyBonus, calculationContext],
  )

  return { savingThrows }
}
