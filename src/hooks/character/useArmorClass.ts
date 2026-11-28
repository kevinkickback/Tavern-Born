import { useMemo } from 'react'
import { useCharacterCalculationContext } from '@/hooks/character/useCharacterCalculationContext'
import {
  type ArmorClassBaseBreakdown,
  getArmorClassBaseBreakdown,
} from '@/lib/calculations/armorClass'
import { type ResolvedNumericEffect, resolveNumericEffect } from '@/lib/calculations/effects'
import { getAbilityModifier } from '@/lib/calculations/gameRules'
import { type ArmorClassSettings, resolveArmorClassSettings } from '@/lib/calculations/statSettings'
import { useCharacterStore } from '@/store/characterStore'

export interface ArmorClassState {
  calculatedAC: number
  effectiveAC: number
  baseBreakdown: ArmorClassBaseBreakdown
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
    effectiveAC: Math.max(0, Math.trunc(resolution.value)),
    baseBreakdown,
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
