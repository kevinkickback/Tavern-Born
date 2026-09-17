import type {
  CharacterEffect,
  CharacterEffectRequirement,
  NumericEffectOperation,
  NumericEffectTarget,
  TraitEffectTarget,
} from '@/types/effects'

export interface EffectResolutionContext {
  equipment?: Readonly<Record<string, { equipped: boolean; attuned?: boolean }>>
  flags?: Readonly<Record<string, boolean>>
  suppressedEffectIds?: readonly string[]
}

interface NumericEffectBreakdownStep {
  effectId: string
  label: string
  source: CharacterEffect['source']
  operation: NumericEffectOperation
  valueBefore: number
  valueAfter: number
}

export interface ResolvedNumericEffect {
  baseValue: number
  value: number
  steps: NumericEffectBreakdownStep[]
  inactiveEffects: CharacterEffect[]
  conditionalNotes: Array<{ effectId: string; label: string; note: string }>
}

function requirementSatisfied(
  requirement: CharacterEffectRequirement,
  context: EffectResolutionContext,
): boolean {
  if (requirement.kind === 'flag') {
    return context.flags?.[requirement.key] === requirement.expected
  }
  const equipment = context.equipment?.[requirement.itemId]
  if (!equipment) return false
  if (requirement.state === 'equipped') return equipment.equipped
  if (requirement.state === 'attuned') return equipment.attuned === true
  return equipment.equipped && equipment.attuned === true
}

export function isCharacterEffectActive(
  effect: CharacterEffect,
  context: EffectResolutionContext = {},
): boolean {
  if (context.suppressedEffectIds?.includes(effect.id)) return false
  return (effect.requirements ?? []).every((requirement) =>
    requirementSatisfied(requirement, context),
  )
}

function targetsMatch(
  effectTarget: CharacterEffect['target'],
  requestedTarget: CharacterEffect['target'],
): boolean {
  if (effectTarget.kind !== requestedTarget.kind) return false
  const requested = requestedTarget as unknown as Record<string, unknown>
  return Object.entries(effectTarget).every(
    ([key, value]) => key === 'kind' || value === undefined || requested[key] === value,
  )
}

function effectOrder(left: CharacterEffect, right: CharacterEffect): number {
  return (left.priority ?? 0) - (right.priority ?? 0) || left.id.localeCompare(right.id)
}

function winningEffect<T extends CharacterEffect>(effects: readonly T[]): T | undefined {
  const sorted = [...effects].sort(effectOrder)
  return sorted[sorted.length - 1]
}

function highestBaseEffect(effects: readonly NumericCharacterEffect[]) {
  return [...effects].sort(
    (left, right) => left.operation.value - right.operation.value || effectOrder(left, right),
  )[effects.length - 1]
}

type NumericCharacterEffect = CharacterEffect & { operation: NumericEffectOperation }

function hasNumericOperation(effect: CharacterEffect): effect is NumericCharacterEffect {
  return 'value' in effect.operation
}

function conditionalNotes(effects: readonly CharacterEffect[]) {
  return effects.flatMap((effect) =>
    effect.operation.kind === 'conditional-note'
      ? [{ effectId: effect.id, label: effect.label, note: effect.operation.note }]
      : [],
  )
}

/** Resolves a numeric target with deterministic, inspectable stacking. */
export function resolveNumericEffect(
  baseValue: number,
  target: NumericEffectTarget,
  effects: readonly CharacterEffect[],
  context: EffectResolutionContext = {},
): ResolvedNumericEffect {
  const relevant = effects.filter((effect) => targetsMatch(effect.target, target))
  const active = relevant.filter((effect) => isCharacterEffectActive(effect, context))
  const inactiveEffects = relevant.filter((effect) => !isCharacterEffectActive(effect, context))
  const numeric = active.filter(hasNumericOperation)
  const byKind = (kind: NumericEffectOperation['kind']) =>
    numeric.filter((effect) => effect.operation.kind === kind).sort(effectOrder)
  const steps: NumericEffectBreakdownStep[] = []
  let value = baseValue

  const apply = (effect: NumericCharacterEffect, next: number) => {
    steps.push({
      effectId: effect.id,
      label: effect.label,
      source: effect.source,
      operation: effect.operation,
      valueBefore: value,
      valueAfter: next,
    })
    value = next
  }

  const setEffect = winningEffect(byKind('set'))
  if (setEffect) apply(setEffect, setEffect.operation.value)

  const baseEffect = highestBaseEffect(byKind('base'))
  if (baseEffect) {
    apply(baseEffect, Math.max(value, baseEffect.operation.value))
  }
  for (const effect of byKind('add')) {
    apply(effect, value + effect.operation.value)
  }
  for (const effect of byKind('multiply')) {
    apply(effect, value * effect.operation.value)
  }
  for (const effect of byKind('minimum')) {
    apply(effect, Math.max(value, effect.operation.value))
  }
  for (const effect of byKind('maximum')) {
    apply(effect, Math.min(value, effect.operation.value))
  }
  const overrideEffect = winningEffect(byKind('override'))
  if (overrideEffect) apply(overrideEffect, overrideEffect.operation.value)

  return {
    baseValue,
    value,
    steps,
    inactiveEffects,
    conditionalNotes: conditionalNotes(active),
  }
}

export function resolveGrantedTrait(
  target: TraitEffectTarget,
  effects: readonly CharacterEffect[],
  context: EffectResolutionContext = {},
): { granted: boolean; sources: CharacterEffect[]; inactiveEffects: CharacterEffect[] } {
  const relevant = effects.filter((effect) => targetsMatch(effect.target, target))
  const sources = relevant.filter(
    (effect) => effect.operation.kind === 'grant' && isCharacterEffectActive(effect, context),
  )
  return {
    granted: sources.length > 0,
    sources,
    inactiveEffects: relevant.filter((effect) => !isCharacterEffectActive(effect, context)),
  }
}
