import { useMemo } from 'react'
import { useCharacterCalculationContext } from '@/hooks/character/useCharacterCalculationContext'
import {
  type ArmorClassBaseBreakdown,
  calculateArmorClassAdjustmentTotal,
  getArmorClassBaseBreakdown,
} from '@/lib/calculations/armorClass'
import { type ResolvedNumericEffect, resolveNumericEffect } from '@/lib/calculations/effects'
import { getAbilityModifier } from '@/lib/calculations/gameRules'
import { type ArmorClassSettings, resolveArmorClassSettings } from '@/lib/calculations/statSettings'
import { useCharacterStore } from '@/store/characterStore'

export interface ArmorClassState {
  calculatedAC: number
  adjustmentTotal: number
  adjustedAC: number
  overrideAC?: number
  effectiveAC: number
  resolution: ResolvedNumericEffect
  baseBreakdown: ArmorClassBaseBreakdown
  setAC: (ac: number) => void
  clearOverride: () => void
  previewArmorClassSettings: (settings: ArmorClassSettings) => ResolvedNumericEffect
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

  const baseBreakdown = useMemo(
    () => getArmorClassBaseBreakdown(character?.equipment ?? [], dexMod),
    [character?.equipment, dexMod],
  )
  const calculatedAC = baseBreakdown.total
  const adjustmentTotal = calculateArmorClassAdjustmentTotal(character?.armorClassAdjustments)
  const adjustedAC = Math.max(0, calculatedAC + adjustmentTotal)
  const resolution = useMemo(
    () =>
      resolveNumericEffect(
        calculatedAC,
        { kind: 'armor-class' },
        calculationContext?.effects.declarations ?? [],
        calculationContext?.effects.resolutionContext,
      ),
    [calculatedAC, calculationContext],
  )

  return {
    calculatedAC,
    adjustmentTotal,
    adjustedAC,
    overrideAC: character?.armorClassOverride,
    effectiveAC: Math.max(0, Math.trunc(resolution.value)),
    resolution,
    baseBreakdown,
    setAC: (ac) => {
      if (!character) return
      updateCharacter(character.id, { armorClassOverride: Math.max(0, ac) })
    },
    clearOverride: () => {
      if (!character) return
      updateCharacter(character.id, { armorClassOverride: undefined })
    },
    previewArmorClassSettings: (settings) =>
      character
        ? resolveArmorClassSettings(
            character,
            calculatedAC,
            settings,
            calculationContext?.effects.sourceDeclarations,
          )
        : resolution,
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
