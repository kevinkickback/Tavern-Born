import type { Race5e } from '@/types/5etools'
import type {
  ArmorClassAdjustment,
  Character,
  HitPointAdjustment,
  MovementAdjustment,
} from '@/types/character'
import type { CharacterEffect } from '@/types/effects'
import type { EffectResolutionContext } from './effects'

type LegacyEffectCharacter = Partial<
  Pick<
    Character,
    | 'armorClassAdjustments'
    | 'armorClassOverride'
    | 'effectFlags'
    | 'equipment'
    | 'hitPointAdjustments'
    | 'hitPoints'
    | 'manualEffects'
    | 'maxHitPointsOverride'
    | 'movementAdjustments'
    | 'movementOverrides'
    | 'suppressedEffectIds'
  >
>

function adjustmentSource(
  adjustment: ArmorClassAdjustment | HitPointAdjustment | MovementAdjustment,
): CharacterEffect['source'] {
  return {
    kind: adjustment.sourceType,
    name: adjustment.label,
    ...(adjustment.sourceRef ? { source: adjustment.sourceRef } : {}),
    entityId: adjustment.id,
  }
}

function projectLegacyEffects(
  character: LegacyEffectCharacter,
  characterLevel: number,
): CharacterEffect[] {
  const effects: CharacterEffect[] = []
  for (const adjustment of character.armorClassAdjustments ?? []) {
    effects.push({
      id: `legacy:armor-class:${adjustment.id}`,
      label: adjustment.label,
      target: { kind: 'armor-class' },
      operation: { kind: 'add', value: adjustment.amount },
      source: adjustmentSource(adjustment),
    })
  }
  if (typeof character.armorClassOverride === 'number') {
    effects.push({
      id: 'legacy:armor-class:override',
      label: 'Exact Armor Class override',
      target: { kind: 'armor-class' },
      operation: { kind: 'override', value: character.armorClassOverride },
      source: { kind: 'manual', name: 'Exact Armor Class override' },
    })
  }
  for (const adjustment of character.hitPointAdjustments ?? []) {
    effects.push({
      id: `legacy:hit-points:${adjustment.id}`,
      label: adjustment.label,
      target: { kind: 'hit-point-maximum' },
      operation: {
        kind: 'add',
        value:
          adjustment.mode === 'per-level'
            ? adjustment.amount * Math.max(1, characterLevel)
            : adjustment.amount,
      },
      source: adjustmentSource(adjustment),
    })
  }
  const maximumHitPointsOverride =
    typeof character.maxHitPointsOverride === 'number'
      ? character.maxHitPointsOverride
      : character.hitPoints && character.hitPoints.max > 0
        ? character.hitPoints.max
        : undefined
  if (typeof maximumHitPointsOverride === 'number') {
    effects.push({
      id: 'legacy:hit-points:override',
      label: 'Exact maximum Hit Points override',
      target: { kind: 'hit-point-maximum' },
      operation: { kind: 'override', value: maximumHitPointsOverride },
      source: { kind: 'manual', name: 'Exact maximum Hit Points override' },
    })
  }
  for (const adjustment of character.movementAdjustments ?? []) {
    const mode = adjustment.mode.trim().toLowerCase()
    if (!mode) continue
    effects.push({
      id: `legacy:speed:${adjustment.id}`,
      label: adjustment.label,
      target: { kind: 'speed', mode },
      operation: { kind: 'add', value: adjustment.amount },
      source: adjustmentSource(adjustment),
    })
  }
  for (const [rawMode, value] of Object.entries(character.movementOverrides ?? {})) {
    const mode = rawMode.trim().toLowerCase()
    if (!mode || !Number.isFinite(value)) continue
    effects.push({
      id: `legacy:speed:override:${mode}`,
      label: `Exact ${mode} speed override`,
      target: { kind: 'speed', mode },
      operation: { kind: 'override', value },
      source: { kind: 'manual', name: `Exact ${mode} speed override` },
    })
  }
  return effects
}

function entityEffectId(entity: Pick<Race5e, 'name' | 'source'>, suffix: string): string {
  return `race:${encodeURIComponent(entity.name)}|${encodeURIComponent(entity.source)}:${suffix}`
}

/** Projects only reliable structured race fields; arbitrary entries text is never interpreted. */
export function deriveStructuredRaceEffects(race: Race5e | undefined): CharacterEffect[] {
  if (!race) return []
  const source = { kind: 'race' as const, name: race.name, source: race.source }
  const effects: CharacterEffect[] = []
  if (typeof race.darkvision === 'number' && Number.isFinite(race.darkvision)) {
    effects.push({
      id: entityEffectId(race, 'sense:darkvision'),
      label: `${race.name} sense`,
      target: { kind: 'sense', sense: 'darkvision' },
      operation: { kind: 'base', value: Math.max(0, race.darkvision) },
      source,
    })
  }
  const grants: Array<{
    values: readonly string[] | undefined
    target: (value: string) => CharacterEffect['target']
    suffix: string
  }> = [
    {
      values: race.resist,
      target: (damageType) => ({ kind: 'damage-resistance', damageType }),
      suffix: 'resistance',
    },
    {
      values: race.immune,
      target: (damageType) => ({ kind: 'damage-immunity', damageType }),
      suffix: 'immunity',
    },
    {
      values: race.conditionImmune,
      target: (condition) => ({ kind: 'condition-immunity', condition }),
      suffix: 'condition-immunity',
    },
  ]
  for (const grant of grants) {
    for (const value of grant.values ?? []) {
      if (!value.trim()) continue
      effects.push({
        id: entityEffectId(race, `${grant.suffix}:${encodeURIComponent(value)}`),
        label: value,
        target: grant.target(value),
        operation: { kind: 'grant' },
        source,
      } as CharacterEffect)
    }
  }
  return effects
}

/** Combines runtime projections with persisted manual declarations using stable IDs. */
export function getCharacterEffects(
  character: LegacyEffectCharacter,
  characterLevel = 1,
  sourceEffects: readonly CharacterEffect[] = [],
): CharacterEffect[] {
  const byId = new Map<string, CharacterEffect>()
  for (const effect of [
    ...sourceEffects,
    ...projectLegacyEffects(character, characterLevel),
    ...(character.manualEffects ?? []),
  ]) {
    byId.set(effect.id, effect)
  }
  return [...byId.values()]
}

export function getCharacterEffectResolutionContext(
  character: LegacyEffectCharacter,
): EffectResolutionContext {
  return {
    equipment: Object.fromEntries(
      (character.equipment ?? []).map((item) => [
        item.id,
        { equipped: item.equipped, attuned: item.attuned },
      ]),
    ),
    flags: character.effectFlags,
    suppressedEffectIds: character.suppressedEffectIds,
  }
}
