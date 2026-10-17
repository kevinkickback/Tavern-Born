import { getRaceDefenseField, RACE_DEFENSE_FIELDS } from '@/lib/calculations/raceDefenseFields'
import { normalizeOwnerIdentity } from '@/lib/provenance/normalization'
import type { Race5e } from '@/types/5etools'
import type { Character, RacialDefenseState } from '@/types/character'
import type { CharacterEffect } from '@/types/effects'

/** Store only the current fixed grants and exact owners, never dormant rule catalogs. */
export function buildRacialDefenseState(race: Race5e, subrace?: Race5e): RacialDefenseState {
  const field = (key: (typeof RACE_DEFENSE_FIELDS)[number]) => {
    const { ownerType, value } = getRaceDefenseField(race, subrace, key)
    return {
      ownerType,
      values: Array.isArray(value)
        ? [
            ...new Set(
              value
                .filter((v): v is string => typeof v === 'string')
                .map((v) => v.trim().toLowerCase())
                .filter(Boolean),
            ),
          ]
        : [],
    }
  }
  return {
    context: {
      parent: { name: race.name, source: race.source },
      ...(subrace ? { child: { name: subrace.name, source: subrace.source } } : {}),
    },
    resist: field('resist'),
    immune: field('immune'),
    conditionImmune: field('conditionImmune'),
  }
}

/** Missing either exact reference freezes the whole last acknowledged snapshot. */
export function refreshRacialDefenseState(
  character: Character,
  race: Race5e | undefined,
  subrace: Race5e | undefined,
): Character {
  const same = (a?: string, b?: string) => normalizeOwnerIdentity(a) === normalizeOwnerIdentity(b)
  if (!character.race.trim())
    return character.racialDefenses ? { ...character, racialDefenses: undefined } : character
  if (
    !race ||
    !same(character.race, race.name) ||
    !same(character.raceSource, race.source) ||
    !same(character.subrace, subrace?.name) ||
    !same(character.subraceSource, subrace?.source) ||
    (subrace?.raceName !== undefined &&
      (typeof subrace.raceName !== 'string' || !same(subrace.raceName, race.name))) ||
    (subrace?.raceSource !== undefined &&
      (typeof subrace.raceSource !== 'string' || !same(subrace.raceSource, race.source)))
  )
    return character
  const snapshot = buildRacialDefenseState(
    { ...race, name: character.race, source: character.raceSource ?? race.source },
    subrace
      ? {
          ...subrace,
          name: character.subrace ?? subrace.name,
          source: character.subraceSource ?? subrace.source,
        }
      : undefined,
  )
  const previous = character.racialDefenses
  const sameState =
    previous &&
    same(previous.context.parent.name, snapshot.context.parent.name) &&
    same(previous.context.parent.source, snapshot.context.parent.source) &&
    same(previous.context.child?.name, snapshot.context.child?.name) &&
    same(previous.context.child?.source, snapshot.context.child?.source) &&
    RACE_DEFENSE_FIELDS.every(
      (field) =>
        previous[field].ownerType === snapshot[field].ownerType &&
        JSON.stringify(previous[field].values.map((value) => value.trim().toLowerCase()).sort()) ===
          JSON.stringify([...snapshot[field].values].sort()),
    )
  return sameState ? character : { ...character, racialDefenses: snapshot }
}

/** Every declaration has one exact owner; only the final effective display is deduplicated. */
export function deriveRacialDefenseEffects(
  state: RacialDefenseState | undefined,
): CharacterEffect[] {
  if (!state) return []
  return RACE_DEFENSE_FIELDS.flatMap((family) => {
    const record = state[family]
    const owner = record.ownerType === 'race' ? state.context.parent : state.context.child
    if (!owner) return []
    return record.values.map((label): CharacterEffect => {
      const value = label.trim().toLowerCase()
      const parts =
        record.ownerType === 'race'
          ? ['race', state.context.parent.name, state.context.parent.source]
          : [
              'subrace',
              state.context.parent.name,
              state.context.parent.source,
              owner.name,
              owner.source,
            ]
      return {
        id: `racial-defense:${JSON.stringify([...parts.map(normalizeOwnerIdentity), family, value])}`,
        label,
        source: { kind: record.ownerType, name: owner.name, source: owner.source },
        operation: { kind: 'grant' },
        target:
          family === 'conditionImmune'
            ? { kind: 'condition-immunity', condition: value }
            : {
                kind: family === 'resist' ? 'damage-resistance' : 'damage-immunity',
                damageType: value,
              },
      }
    })
  })
}
