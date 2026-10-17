import type { CharacterEffect } from '@/types/effects'
import { type EffectResolutionContext, isCharacterEffectActive } from './effects'

/** One active union for Review and export; independent equal-valued owners remain declarations. */
export function getEffectiveDefensiveTraits(
  effects: readonly CharacterEffect[],
  context: EffectResolutionContext,
) {
  const damageResistances = new Map<string, string>()
  const damageImmunities = new Map<string, string>()
  const conditionImmunities = new Map<string, string>()
  const add = (values: Map<string, string>, value: string) => {
    const trimmed = value.trim()
    const key = trimmed.toLowerCase()
    if (key && !values.has(key)) values.set(key, trimmed)
  }
  for (const effect of effects) {
    if (effect.operation.kind !== 'grant' || !isCharacterEffectActive(effect, context)) continue
    const target = effect.target
    if (target.kind === 'damage-resistance') add(damageResistances, target.damageType)
    else if (target.kind === 'damage-immunity') add(damageImmunities, target.damageType)
    else if (target.kind === 'condition-immunity') add(conditionImmunities, target.condition)
  }
  return {
    damageResistances: [...damageResistances.values()],
    damageImmunities: [...damageImmunities.values()],
    conditionImmunities: [...conditionImmunities.values()],
  }
}
