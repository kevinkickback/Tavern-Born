import { resolveItemReference } from '@/lib/5etools/itemResolvers'
import type { Feat5e, Item5e, Race5e } from '@/types/5etools'
import type {
  ArmorClassAdjustment,
  Character,
  Equipment,
  HitPointAdjustment,
  MovementAdjustment,
} from '@/types/character'
import type { CharacterEffect } from '@/types/effects'
import { ABILITY_NAMES } from './abilityScores'
import type { EffectResolutionContext } from './effects'

type EffectSettingsCharacter = Partial<
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

function projectSettingsEffects(
  character: EffectSettingsCharacter,
  characterLevel: number,
): CharacterEffect[] {
  const effects: CharacterEffect[] = []
  for (const adjustment of character.armorClassAdjustments ?? []) {
    effects.push({
      id: `settings:armor-class:${adjustment.id}`,
      label: adjustment.label,
      target: { kind: 'armor-class' },
      operation: { kind: 'add', value: adjustment.amount },
      source: adjustmentSource(adjustment),
    })
  }
  if (typeof character.armorClassOverride === 'number') {
    effects.push({
      id: 'settings:armor-class:override',
      label: 'Exact Armor Class override',
      target: { kind: 'armor-class' },
      operation: { kind: 'override', value: character.armorClassOverride },
      source: { kind: 'manual', name: 'Exact Armor Class override' },
    })
  }
  for (const adjustment of character.hitPointAdjustments ?? []) {
    effects.push({
      id: `settings:hit-points:${adjustment.id}`,
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
  const maximumHitPointsOverride = character.maxHitPointsOverride
  if (typeof maximumHitPointsOverride === 'number') {
    effects.push({
      id: 'settings:hit-points:override',
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
      id: `settings:speed:${adjustment.id}`,
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
      id: `settings:speed:override:${mode}`,
      label: `Exact ${mode} speed override`,
      target: { kind: 'speed', mode },
      operation: { kind: 'override', value },
      source: { kind: 'manual', name: `Exact ${mode} speed override` },
    })
  }
  return effects
}

function entityEffectId(
  kind: 'race' | 'feat',
  entity: Pick<Race5e | Feat5e, 'name' | 'source'>,
  suffix: string,
): string {
  return `${kind}:${encodeURIComponent(entity.name)}|${encodeURIComponent(entity.source)}:${suffix}`
}

function itemEffectId(item: Equipment, suffix: string): string {
  return `item:${encodeURIComponent(item.id)}:${suffix}`
}

function parseNumericBonus(value: string | number | undefined): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value !== 'string' || !/^[+-]?\d+(?:\.\d+)?$/.test(value.trim())) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function itemRequirement(
  item: Equipment,
  data: Item5e,
): NonNullable<CharacterEffect['requirements']> {
  return [
    {
      kind: 'equipment',
      itemId: item.id,
      state: item.reqAttune || data.reqAttune ? 'equipped-and-attuned' : 'equipped',
    },
  ]
}

/** Projects only documented, structured item fields; item rules prose is never interpreted. */
export function deriveStructuredItemEffects(
  equipment: readonly Equipment[],
  itemLookup: ReadonlyMap<string, Item5e> | undefined,
): CharacterEffect[] {
  const effects: CharacterEffect[] = []
  for (const item of equipment) {
    const data = resolveItemReference(item, itemLookup)
    if (!data) continue
    const source = {
      kind: 'item' as const,
      name: data.name,
      source: data.source,
      entityId: item.id,
    }
    const requirements = itemRequirement(item, data)
    const addNumeric = (
      suffix: string,
      label: string,
      target: CharacterEffect['target'],
      value: string | number | undefined,
    ) => {
      const bonus = parseNumericBonus(value)
      if (bonus === undefined) return
      effects.push({
        id: itemEffectId(item, suffix),
        label,
        target,
        operation: { kind: 'add', value: bonus },
        source,
        requirements,
      } as CharacterEffect)
    }

    addNumeric('armor-class', `${data.name} armor class`, { kind: 'armor-class' }, data.bonusAc)
    addNumeric(
      'spell-attack',
      `${data.name} spell attack`,
      { kind: 'spell-attack' },
      data.bonusSpellAttack,
    )
    addNumeric(
      'spell-save-dc',
      `${data.name} spell save DC`,
      { kind: 'spell-save-dc' },
      data.bonusSpellSaveDc,
    )
    for (const ability of ABILITY_NAMES) {
      addNumeric(
        `saving-throw:${ability}`,
        `${data.name} saving throws`,
        { kind: 'saving-throw-modifier', ability },
        data.bonusSavingThrow,
      )
      addNumeric(
        `ability-check:${ability}`,
        `${data.name} ability checks`,
        { kind: 'ability-check-modifier', ability },
        data.bonusAbilityCheck,
      )
    }

    const equalModes = new Set(Object.keys(data.modifySpeed?.equal ?? {}))
    for (const [mode, value] of Object.entries(data.modifySpeed?.static ?? {})) {
      if (!mode.trim() || !Number.isFinite(value)) continue
      effects.push({
        id: itemEffectId(item, `speed:minimum:${encodeURIComponent(mode)}`),
        label: `${data.name} ${mode} speed`,
        target: { kind: 'speed', mode },
        operation: { kind: 'minimum', value },
        source,
        requirements,
      })
    }
    for (const [mode, value] of Object.entries(data.modifySpeed?.multiply ?? {})) {
      if (!mode.trim() || !Number.isFinite(value) || equalModes.has(mode)) continue
      effects.push({
        id: itemEffectId(item, `speed:multiply:${encodeURIComponent(mode)}`),
        label: `${data.name} ${mode} speed`,
        target: { kind: 'speed', mode },
        operation: { kind: 'multiply', value },
        source,
        requirements,
      })
    }
    for (const [mode, value] of Object.entries(data.modifySpeed?.bonus ?? {})) {
      if (!Number.isFinite(value)) continue
      const normalizedMode = mode.trim()
      effects.push({
        id: itemEffectId(item, `speed:add:${encodeURIComponent(normalizedMode)}`),
        label: `${data.name} speed`,
        target: { kind: 'speed', ...(normalizedMode === '*' ? {} : { mode: normalizedMode }) },
        operation: { kind: 'add', value },
        source,
        requirements,
      })
    }

    const grants: Array<{
      values: readonly string[] | undefined
      target: (value: string) => CharacterEffect['target']
      suffix: string
    }> = [
      {
        values: data.resist,
        target: (damageType) => ({ kind: 'damage-resistance', damageType }),
        suffix: 'resistance',
      },
      {
        values: data.immune,
        target: (damageType) => ({ kind: 'damage-immunity', damageType }),
        suffix: 'immunity',
      },
      {
        values: data.conditionImmune,
        target: (condition) => ({ kind: 'condition-immunity', condition }),
        suffix: 'condition-immunity',
      },
    ]
    for (const grant of grants) {
      for (const value of grant.values ?? []) {
        if (typeof value !== 'string' || !value.trim()) continue
        effects.push({
          id: itemEffectId(item, `${grant.suffix}:${encodeURIComponent(value)}`),
          label: `${data.name}: ${value}`,
          target: grant.target(value),
          operation: { kind: 'grant' },
          source,
          requirements,
        } as CharacterEffect)
      }
    }
  }
  return effects
}

/** Projects only reliable structured race fields; arbitrary entries text is never interpreted. */
export function deriveStructuredRaceEffects(race: Race5e | undefined): CharacterEffect[] {
  if (!race) return []
  const source = { kind: 'race' as const, name: race.name, source: race.source }
  const effects: CharacterEffect[] = []
  if (typeof race.darkvision === 'number' && Number.isFinite(race.darkvision)) {
    effects.push({
      id: entityEffectId('race', race, 'sense:darkvision'),
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
      if (typeof value !== 'string' || !value.trim()) continue
      effects.push({
        id: entityEffectId('race', race, `${grant.suffix}:${encodeURIComponent(value)}`),
        label: value,
        target: grant.target(value),
        operation: { kind: 'grant' },
        source,
      } as CharacterEffect)
    }
  }
  return effects
}

/** Projects unconditional, structured feat grants; choice objects remain player-reviewed prose. */
export function deriveStructuredFeatEffects(feats: readonly Feat5e[]): CharacterEffect[] {
  const effects: CharacterEffect[] = []
  const seen = new Set<string>()
  for (const feat of feats) {
    const featKey = `${feat.name}|${feat.source}`
    if (seen.has(featKey)) continue
    seen.add(featKey)
    const source = { kind: 'feat' as const, name: feat.name, source: feat.source }
    const grants: Array<{
      values: readonly (string | Record<string, unknown>)[] | undefined
      target: (value: string) => CharacterEffect['target']
      suffix: string
    }> = [
      {
        values: feat.resist,
        target: (damageType) => ({ kind: 'damage-resistance', damageType }),
        suffix: 'resistance',
      },
      {
        values: feat.immune,
        target: (damageType) => ({ kind: 'damage-immunity', damageType }),
        suffix: 'immunity',
      },
      {
        values: feat.conditionImmune,
        target: (condition) => ({ kind: 'condition-immunity', condition }),
        suffix: 'condition-immunity',
      },
    ]
    for (const grant of grants) {
      for (const value of grant.values ?? []) {
        if (typeof value !== 'string' || !value.trim()) continue
        effects.push({
          id: entityEffectId('feat', feat, `${grant.suffix}:${encodeURIComponent(value)}`),
          label: `${feat.name}: ${value}`,
          target: grant.target(value),
          operation: { kind: 'grant' },
          source,
        } as CharacterEffect)
      }
    }
  }
  return effects
}

/** Combines runtime projections with persisted manual declarations using stable IDs. */
export function getCharacterEffects(
  character: EffectSettingsCharacter,
  characterLevel = 1,
  sourceEffects: readonly CharacterEffect[] = [],
): CharacterEffect[] {
  const byId = new Map<string, CharacterEffect>()
  for (const effect of [
    ...sourceEffects,
    ...projectSettingsEffects(character, characterLevel),
    ...(character.manualEffects ?? []),
  ]) {
    byId.set(effect.id, effect)
  }
  return [...byId.values()]
}

export function getCharacterEffectResolutionContext(
  character: EffectSettingsCharacter,
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
