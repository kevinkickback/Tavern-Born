import { getTotalCharacterLevel } from '@/lib/characterUtils'
import type {
  ArmorClassAdjustment,
  Character,
  HitPointAdjustment,
  MovementAdjustment,
} from '@/types/character'
import type { CharacterEffect } from '@/types/effects'
import { getCharacterEffectResolutionContext, getCharacterEffects } from './characterEffects'
import { type ResolvedNumericEffect, resolveNumericEffect } from './effects'
import { type EffectiveMovement, getEffectiveCharacterMovement } from './movement'

export interface HitPointSettings {
  current: number
  temporary: number
  adjustments: HitPointAdjustment[]
  maxOverride?: number
}

export interface ArmorClassSettings {
  adjustments: ArmorClassAdjustment[]
  override?: number
}

export interface MovementSettings {
  adjustments: MovementAdjustment[]
  overrides: Record<string, number>
  hoverOverride?: boolean
}

function normalizePositiveInteger(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.trunc(value)
    : undefined
}

function normalizeNonNegativeInteger(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.trunc(value)
    : undefined
}

/** Resolves a draft maximum-HP configuration through the canonical effect pipeline. */
export function resolveHitPointSettings(
  character: Character,
  calculatedMaxHP: number,
  settings: HitPointSettings,
  sourceEffects: readonly CharacterEffect[] = [],
): ResolvedNumericEffect {
  const draftCharacter: Character = {
    ...character,
    hitPointAdjustments: settings.adjustments,
    maxHitPointsOverride: normalizePositiveInteger(settings.maxOverride),
  }
  return resolveNumericEffect(
    calculatedMaxHP,
    { kind: 'hit-point-maximum' },
    getCharacterEffects(draftCharacter, getTotalCharacterLevel(draftCharacter), sourceEffects),
    getCharacterEffectResolutionContext(draftCharacter),
  )
}

/** Resolves a draft Armor Class configuration through the canonical effect pipeline. */
export function resolveArmorClassSettings(
  character: Character,
  calculatedArmorClass: number,
  settings: ArmorClassSettings,
  sourceEffects: readonly CharacterEffect[] = [],
): ResolvedNumericEffect {
  const draftCharacter: Character = {
    ...character,
    armorClassAdjustments: settings.adjustments,
    armorClassOverride: normalizeNonNegativeInteger(settings.override),
  }
  return resolveNumericEffect(
    calculatedArmorClass,
    { kind: 'armor-class' },
    getCharacterEffects(draftCharacter, getTotalCharacterLevel(draftCharacter), sourceEffects),
    getCharacterEffectResolutionContext(draftCharacter),
  )
}

/** Resolves draft movement settings while preserving source and manual typed effects. */
export function resolveMovementSettings(
  character: Character,
  settings: MovementSettings,
  sourceEffects: readonly CharacterEffect[] = [],
): EffectiveMovement {
  return getEffectiveCharacterMovement(
    {
      ...character,
      movementAdjustments: settings.adjustments,
      movementOverrides: settings.overrides,
      movementHoverOverride: settings.hoverOverride,
    },
    sourceEffects,
  )
}
