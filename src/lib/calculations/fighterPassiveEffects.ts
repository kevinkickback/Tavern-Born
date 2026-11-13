import { getCurrentRetainedSubclassSource } from '@/lib/5etools/directSubclassSource'
import { getCurrentFighterSubclassSource } from '@/lib/5etools/fighterSubclassSource'
import type { ClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import { getTotalCharacterLevel } from '@/lib/characterUtils'
import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import type { Character, CharacterClassEntry } from '@/types/character'
import type { CharacterEffect } from '@/types/effects'
import { toAbilityName } from './abilityNames'
import { getProficiencyBonus } from './gameRules'
import { ALL_SKILLS, getSkillAbility } from './skillNames'

export function deriveFighterPassiveEffects(
  character: Character,
  catalogs: ClassChoiceFeatureCatalogs | undefined,
): CharacterEffect[] {
  return character.classProgression.flatMap((entry) => fighterEffects(character, entry, catalogs))
}

function fighterEffects(
  character: Character,
  owner: CharacterClassEntry,
  catalogs: ClassChoiceFeatureCatalogs | undefined,
): CharacterEffect[] {
  const current =
    getCurrentFighterSubclassSource(character, owner, catalogs?.classes) ??
    getCurrentRetainedSubclassSource(character, owner, catalogs, 'Fighter')
  if (!current) return []
  const { getFeature } = current
  const effects: CharacterEffect[] = []
  const declaration = (
    name: string,
    suffix: string,
    feature: NonNullable<ReturnType<typeof getFeature>>,
  ) => ({
    id: feature.id + ':' + suffix,
    label: name,
    source: { kind: 'subclass' as const, name, source: feature.source, entityId: feature.target },
  })
  const commander = getFeature('Inspiring Commander', 'Banneret', 'FRHoF')
  if (commander) {
    const feature = commander
    const sections = feature?.entries.filter(
      (entry): entry is { name: string; type: string; entries: unknown[] } =>
        !!entry &&
        typeof entry === 'object' &&
        'name' in entry &&
        entry.name === 'Unshakable Bravery' &&
        'type' in entry &&
        entry.type === 'entries' &&
        'entries' in entry &&
        Array.isArray(entry.entries),
    )
    const body =
      sections?.length === 1 && sections[0].entries.length === 1
        ? sections[0].entries[0]
        : undefined
    const match =
      typeof body === 'string' &&
      /^You have \{@variantrule Immunity\|XPHB\} to the \{@condition ([^{}|]+)\|XPHB\} and \{@condition ([^{}|]+)\|XPHB\} conditions\.$/.exec(
        body,
      )
    if (match && match[1] !== match[2])
      effects.push(
        ...match.slice(1).map(
          (condition): CharacterEffect => ({
            ...declaration('Inspiring Commander', condition, feature),
            target: { kind: 'condition-immunity', condition },
            operation: { kind: 'grant' },
          }),
        ),
      )
  }
  const guardedMind = getFeature('Guarded Mind', 'Psi Warrior')
  if (guardedMind) {
    const feature = guardedMind
    const clauses =
      feature?.entries.flatMap((entry) => (typeof entry === 'string' ? [entry] : [])) ?? []
    const matches = clauses.flatMap(
      (clause) =>
        /(?:^|\. )You have (?:resistance|\{@variantrule Resistance\|XPHB\}) to (\w+) damage\./i.exec(
          clause,
        )?.[1] ?? [],
    )
    if (matches.length === 1)
      effects.push({
        ...declaration('Guarded Mind', 'resistance', feature),
        target: { kind: 'damage-resistance', damageType: matches[0].toLowerCase() },
        operation: { kind: 'grant' },
      })
  }
  const feature = getFeature('Remarkable Athlete', 'Champion')
  if (!feature || typeof feature.entries[0] !== 'string') return effects
  const text = feature.entries[0]
  if (feature.source === 'XPHB') {
    const match =
      /^Thanks to your athleticism, you have \{@variantrule Advantage\|XPHB\} on \{@variantrule Initiative\|XPHB\} rolls and (\w+) \(\{@skill ([^{}|]+)\|XPHB\}\) checks\.$/.exec(
        text,
      )
    const ability = match && toAbilityName(match[1])
    if (!match || !ability) return effects
    const skill = match[2].toLowerCase()
    return [
      ...effects,
      {
        ...declaration('Remarkable Athlete', 'initiative', feature),
        target: { kind: 'initiative' },
        operation: { kind: 'conditional-note', note: 'Advantage on Initiative rolls.' },
      },
      {
        ...declaration('Remarkable Athlete', skill, feature),
        target: { kind: 'skill-modifier', skill, ability },
        operation: {
          kind: 'conditional-note',
          note: 'Advantage on ' + match[2] + ' checks using ' + match[1] + '.',
        },
      },
    ]
  }
  const match =
    /^Starting at (\d+)(?:st|nd|rd|th) level, you can add half your proficiency bonus \(round (up|down)\) to any (\w+), (\w+), or (\w+) check you make that doesn't already use your proficiency bonus\.$/.exec(
      text,
    )
  if (feature.source !== 'PHB' || !match || Number(match[1]) !== feature.level) return effects
  const abilities = match.slice(3).map(toAbilityName)
  if (abilities.some((ability) => !ability) || new Set(abilities).size !== abilities.length)
    return effects
  const proficient = new Set(character.proficiencies.skills.map(norm))
  const half = getProficiencyBonus(getTotalCharacterLevel(character)) / 2
  const value = match[2] === 'up' ? Math.ceil(half) : Math.floor(half)
  effects.push(
    ...ALL_SKILLS.flatMap((skill): CharacterEffect[] => {
      const ability = getSkillAbility(skill)
      return ability && abilities.includes(ability) && !proficient.has(skill)
        ? [
            {
              ...declaration('Remarkable Athlete', skill, feature),
              target: { kind: 'skill-modifier', skill, ability },
              operation: { kind: 'add', value },
            },
          ]
        : []
    }),
  )
  if (abilities.includes('dexterity'))
    effects.push({
      ...declaration('Remarkable Athlete', 'initiative', feature),
      target: { kind: 'initiative' },
      operation: { kind: 'add', value },
    })
  return effects
}
