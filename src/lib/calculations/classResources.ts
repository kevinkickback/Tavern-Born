import type { ClassResourceDef } from '@/types/classRules'
import type { CharacterEffect } from '@/types/effects'
import { type EffectResolutionContext, resolveNumericEffect } from './effects'

/** Resolve one class resource's maximum from its rule definition and active effects. */
export function getEffectiveClassResourceMaximum(
  definition: ClassResourceDef,
  levelIndex: number,
  charismaModifier: number,
  effects: readonly CharacterEffect[] = [],
  context: EffectResolutionContext = {},
): number {
  const baseMaximum =
    definition.maxFormula === 'cha-mod'
      ? Math.max(1, charismaModifier)
      : (definition.maxPerLevel[levelIndex] ?? 0)
  return Math.max(
    0,
    Math.trunc(
      resolveNumericEffect(
        baseMaximum,
        { kind: 'resource-maximum', resourceId: definition.id },
        effects,
        context,
      ).value,
    ),
  )
}
