import type { CharacterEffect } from '@/types/effects'
import { type EffectResolutionContext, resolveNumericEffect } from './effects'
import { getCarryCapacity } from './gameRules'

/** Resolves carrying capacity through the same typed-effect pipeline as other derived statistics. */
export function getEffectiveCarryCapacity(
  strengthScore: number,
  effects: readonly CharacterEffect[] = [],
  context: EffectResolutionContext = {},
): number {
  return Math.max(
    0,
    Math.trunc(
      resolveNumericEffect(
        getCarryCapacity(strengthScore),
        { kind: 'carrying-capacity' },
        effects,
        context,
      ).value,
    ),
  )
}
