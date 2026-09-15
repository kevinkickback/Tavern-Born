import { useMemo } from 'react'
import { useCharacterCalculationContext } from '@/hooks/character/useCharacterCalculationContext'
import {
  calculateArmorClassAdjustmentTotal,
  computeArmorClass,
  computeEffectiveCharacterArmorClass,
} from '@/lib/calculations/armorClass'
import { getAbilityModifier } from '@/lib/calculations/gameRules'
import { useCharacterStore } from '@/store/characterStore'
import type { ArmorClassAdjustment } from '@/types/character'

interface ArmorClassSettings {
  adjustments: ArmorClassAdjustment[]
  override?: number
}

export interface ArmorClassState {
  calculatedAC: number
  adjustmentTotal: number
  adjustedAC: number
  overrideAC?: number
  effectiveAC: number
  setAC: (ac: number) => void
  clearOverride: () => void
  saveArmorClassSettings: (settings: ArmorClassSettings) => void
}

export function useArmorClass(): ArmorClassState {
  const character = useCharacterStore((s) => s.activeCharacter)
  const updateCharacter = useCharacterStore((s) => s.updateCharacter)
  const calculationContext = useCharacterCalculationContext(character)
  const effectiveAbilityScores = calculationContext?.abilityScores.total

  const dexMod = useMemo(
    () => getAbilityModifier(effectiveAbilityScores?.dexterity ?? 10),
    [effectiveAbilityScores?.dexterity],
  )

  const calculatedAC = useMemo(
    () => computeArmorClass(character?.equipment ?? [], dexMod),
    [character?.equipment, dexMod],
  )
  const adjustmentTotal = calculateArmorClassAdjustmentTotal(character?.armorClassAdjustments)
  const adjustedAC = Math.max(0, calculatedAC + adjustmentTotal)

  return {
    calculatedAC,
    adjustmentTotal,
    adjustedAC,
    overrideAC: character?.armorClassOverride,
    effectiveAC: computeEffectiveCharacterArmorClass(character ?? {}, effectiveAbilityScores),
    setAC: (ac) => {
      if (!character) return
      updateCharacter(character.id, { armorClassOverride: Math.max(0, ac) })
    },
    clearOverride: () => {
      if (!character) return
      updateCharacter(character.id, { armorClassOverride: undefined })
    },
    saveArmorClassSettings: (settings) => {
      if (!character) return
      const nextOverride =
        typeof settings.override === 'number' && settings.override >= 0
          ? Math.trunc(settings.override)
          : undefined
      updateCharacter(character.id, {
        armorClassAdjustments: settings.adjustments,
        armorClassOverride: nextOverride,
      })
    },
  }
}
