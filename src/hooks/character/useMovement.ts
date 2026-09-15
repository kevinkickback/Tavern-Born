import { useMemo } from 'react'
import { useCharacterCalculationContext } from '@/hooks/character/useCharacterCalculationContext'
import {
  getBaseCharacterMovement,
  getEffectiveCharacterMovement,
  getWalkingSpeed,
} from '@/lib/calculations/movement'
import { useCharacterStore } from '@/store/characterStore'
import type { MovementAdjustment } from '@/types/character'

const EMPTY_ADJUSTMENTS: MovementAdjustment[] = []
const EMPTY_OVERRIDES: Record<string, number> = {}
const EMPTY_MOVEMENT_CHARACTER = {
  speed: 0,
  movement: { speeds: {}, source: { kind: 'manual' as const, name: 'Unspecified movement' } },
}

export interface MovementSettings {
  adjustments: MovementAdjustment[]
  overrides: Record<string, number>
  hoverOverride?: boolean
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
    saveMovementSettings: (settings: MovementSettings) => {
      if (!character) return
      const nextCharacter = {
        ...character,
        movementAdjustments: settings.adjustments,
        movementOverrides: settings.overrides,
        movementHoverOverride: settings.hoverOverride,
      }
      updateCharacter(character.id, {
        movementAdjustments: settings.adjustments,
        movementOverrides: settings.overrides,
        movementHoverOverride: settings.hoverOverride,
        speed: getWalkingSpeed(getEffectiveCharacterMovement(nextCharacter)),
      })
    },
  }
}
