import { useMemo } from 'react'
import { useCharacterCalculationContext } from '@/hooks/character/useCharacterCalculationContext'
import {
  getBaseCharacterMovement,
  getEffectiveCharacterMovement,
} from '@/lib/calculations/movement'
import { type MovementSettings, resolveMovementSettings } from '@/lib/calculations/statSettings'
import { useCharacterStore } from '@/store/characterStore'
import type { MovementAdjustment } from '@/types/character'

const EMPTY_ADJUSTMENTS: MovementAdjustment[] = []
const EMPTY_OVERRIDES: Record<string, number> = {}
const EMPTY_MOVEMENT_CHARACTER = {
  movement: { speeds: {}, source: { kind: 'manual' as const, name: 'Unspecified movement' } },
}

export function useMovement() {
  const character = useCharacterStore((state) => state.activeCharacter)
  const updateCharacter = useCharacterStore((state) => state.updateCharacter)
  const calculationContext = useCharacterCalculationContext(character)
  const fallbackMovement = useMemo(
    () => getEffectiveCharacterMovement(character ?? EMPTY_MOVEMENT_CHARACTER),
    [character],
  )
  const effectiveMovement = calculationContext?.movement ?? fallbackMovement
  const baseMovement = useMemo(
    () => getBaseCharacterMovement(character ?? EMPTY_MOVEMENT_CHARACTER),
    [character],
  )

  return {
    baseMovement,
    effectiveMovement,
    adjustments: character?.movementAdjustments ?? EMPTY_ADJUSTMENTS,
    overrides: character?.movementOverrides ?? EMPTY_OVERRIDES,
    hoverOverride: character?.movementHoverOverride,
    previewMovementSettings: (settings: MovementSettings) =>
      character
        ? resolveMovementSettings(
            character,
            settings,
            calculationContext?.effects.sourceDeclarations,
          )
        : fallbackMovement,
    saveMovementSettings: (settings: MovementSettings) => {
      if (!character) return
      updateCharacter(character.id, {
        movementAdjustments: settings.adjustments,
        movementOverrides: settings.overrides,
        movementHoverOverride: settings.hoverOverride,
      })
    },
  }
}
