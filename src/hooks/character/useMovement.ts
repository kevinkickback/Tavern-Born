import { useCallback, useMemo } from 'react'
import { useCharacterCalculationContext } from '@/hooks/character/useCharacterCalculationContext'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import {
  getBaseCharacterMovement,
  getEffectiveCharacterMovement,
} from '@/lib/calculations/movement'
import { getRacialSourceDisplayName } from '@/lib/calculations/raceDisplay'
import { getMovementSettingsPatch, type MovementSettings } from '@/lib/calculations/statSettings'
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

  const previewMovementSettings = useCallback(
    (settings: MovementSettings) => {
      if (!character) return fallbackMovement
      const draft = { ...character, ...getMovementSettingsPatch(settings) }
      if (!calculationContext) return getEffectiveCharacterMovement(draft)
      const { primary, raw, rawItemsAuthoritative } = calculationContext.lookups
      return createCharacterCalculationContext(
        draft,
        primary,
        rawItemsAuthoritative ? raw : { ...raw, itemLookup: undefined },
      ).movement
    },
    [character, calculationContext, fallbackMovement],
  )

  return {
    baseMovement,
    baseMovementSourceLabel: getRacialSourceDisplayName(character, baseMovement.source),
    effectiveMovement,
    adjustments: character?.movementAdjustments ?? EMPTY_ADJUSTMENTS,
    overrides: character?.movementOverrides ?? EMPTY_OVERRIDES,
    hoverOverride: character?.movementHoverOverride,
    previewMovementSettings,
    saveMovementSettings: (settings: MovementSettings) => {
      if (!character) return
      updateCharacter(character.id, getMovementSettingsPatch(settings))
    },
  }
}
