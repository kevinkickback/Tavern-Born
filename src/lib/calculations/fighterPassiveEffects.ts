import { getCurrentFighterSubclassSource } from '@/lib/5etools/fighterSubclassSource'
import { getTotalCharacterLevel } from '@/lib/characterUtils'
import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import type { Class5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import type { CharacterEffect } from '@/types/effects'
import { toAbilityName } from './abilityNames'
import { getProficiencyBonus } from './gameRules'
import { ALL_SKILLS, getSkillAbility } from './skillNames'

export function deriveFighterPassiveEffects(
  character: Character,
  classes: readonly Class5e[] | undefined,
): CharacterEffect[] {
  const owner = character.classProgression.find((entry) => norm(entry.name) === 'fighter')
  const current = owner && getCurrentFighterSubclassSource(character, owner, classes)
  if (!current) return []
  const { getFeature, subclass } = current
  const declaration = (name: string, suffix: string, target: string) => ({
    id: target + ':' + suffix,
    label: name,
    source: { kind: 'subclass' as const, name, source: subclass.source, entityId: target },
  })
  if (subclass.shortName === 'Banneret' && subclass.source === 'FRHoF') {
    const feature = getFeature('Inspiring Commander')
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
    if (!feature || !match || match[1] === match[2]) return []
    return match.slice(1).map((condition) => ({
      ...declaration('Inspiring Commander', condition, feature.target),
      target: { kind: 'condition-immunity', condition },
      operation: { kind: 'grant' },
    }))
  }
  if (subclass.shortName === 'Psi Warrior') {
    const feature = getFeature('Guarded Mind')
    const clauses =
      feature?.entries.flatMap((entry) => (typeof entry === 'string' ? [entry] : [])) ?? []
    const matches = clauses.flatMap(
      (clause) =>
        /(?:^|\. )You have (?:resistance|\{@variantrule Resistance\|XPHB\}) to (\w+) damage\./i.exec(
          clause,
        )?.[1] ?? [],
    )
    return feature && matches.length === 1
      ? [
          {
            ...declaration('Guarded Mind', 'resistance', feature.target),
            target: { kind: 'damage-resistance', damageType: matches[0].toLowerCase() },
            operation: { kind: 'grant' },
          },
        ]
      : []
  }
  if (subclass.shortName !== 'Champion') return []
  const feature = getFeature('Remarkable Athlete')
  if (!feature || typeof feature.entries[0] !== 'string') return []
  const text = feature.entries[0]
  if (subclass.source === 'XPHB') {
    const match =
      /^Thanks to your athleticism, you have \{@variantrule Advantage\|XPHB\} on \{@variantrule Initiative\|XPHB\} rolls and (\w+) \(\{@skill ([^{}|]+)\|XPHB\}\) checks\.$/.exec(
        text,
      )
    const ability = match && toAbilityName(match[1])
    if (!match || !ability) return []
    const skill = match[2].toLowerCase()
    return [
      {
        ...declaration('Remarkable Athlete', 'initiative', feature.target),
        target: { kind: 'initiative' },
        operation: { kind: 'conditional-note', note: 'Advantage on Initiative rolls.' },
      },
      {
        ...declaration('Remarkable Athlete', skill, feature.target),
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
  if (subclass.source !== 'PHB' || !match || Number(match[1]) !== feature.level) return []
  const abilities = match.slice(3).map(toAbilityName)
  if (abilities.some((ability) => !ability) || new Set(abilities).size !== abilities.length)
    return []
  const proficient = new Set(character.proficiencies.skills.map(norm))
  const half = getProficiencyBonus(getTotalCharacterLevel(character)) / 2
  const value = match[2] === 'up' ? Math.ceil(half) : Math.floor(half)
  const effects: CharacterEffect[] = ALL_SKILLS.flatMap((skill) => {
    const ability = getSkillAbility(skill)
    return ability && abilities.includes(ability) && !proficient.has(skill)
      ? [
          {
            ...declaration('Remarkable Athlete', skill, feature.target),
            target: { kind: 'skill-modifier', skill, ability },
            operation: { kind: 'add', value },
          },
        ]
      : []
  })
  if (abilities.includes('dexterity'))
    effects.push({
      ...declaration('Remarkable Athlete', 'initiative', feature.target),
      target: { kind: 'initiative' },
      operation: { kind: 'add', value },
    })
  return effects
}
