import {
  buildSpellNameKeySet,
  resolveSpellReferenceFromMap,
} from '@/lib/calculations/spellIdentity'
import { getSchoolName } from '@/lib/calculations/spellUtils'
import type { ProvenanceLedger, SpellSourceTag } from '@/lib/provenance/types'
import type { Spell5e } from '@/types/5etools'
import type { CharacterClassEntry, SpellProfile } from '@/types/character'

export const UNRESTRICTED_SCHOOL_CHOICE_VARIANT = 'unrestricted-school'

export interface ClassSpellSchoolRule {
  restrictedSchools: ReadonlySet<string>
  unrestrictedGrantLevels: ReadonlySet<number>
}

interface ClassSpellRuleContext {
  originSystem?: '2014' | '2024'
  className?: string
  classSource?: string
  subclassName?: string
  subclassSource?: string
}

const LEGACY_SUBCLASS_RULES: Readonly<
  Record<string, { subclassName: string; restrictedSchools: readonly string[] }>
> = {
  fighter: {
    subclassName: 'eldritch knight',
    restrictedSchools: ['A', 'V'],
  },
  rogue: {
    subclassName: 'arcane trickster',
    restrictedSchools: ['E', 'I'],
  },
}

const UNRESTRICTED_GRANT_LEVELS = new Set([3, 8, 14, 20])

function normalize(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? ''
}

/**
 * Structured fallback for PHB 2014 subclass school restrictions. The upstream
 * corpus exposes these quotas only in rules prose, not in spell-list metadata.
 */
export function getClassSpellSchoolRule(
  context: ClassSpellRuleContext,
): ClassSpellSchoolRule | undefined {
  if (context.originSystem === '2024') return undefined
  if (context.classSource && normalize(context.classSource) !== 'phb') return undefined
  if (context.subclassSource && normalize(context.subclassSource) !== 'phb') return undefined

  const definition = LEGACY_SUBCLASS_RULES[normalize(context.className)]
  if (!definition || normalize(context.subclassName) !== definition.subclassName) return undefined

  return {
    restrictedSchools: new Set(definition.restrictedSchools),
    unrestrictedGrantLevels: UNRESTRICTED_GRANT_LEVELS,
  }
}

export function isSpellInRestrictedSchools(
  school: string | undefined,
  rule: ClassSpellSchoolRule,
): boolean {
  return !!school && rule.restrictedSchools.has(school.trim().toUpperCase())
}

export function getMaximumUnrestrictedSchoolChoices(
  rule: ClassSpellSchoolRule | undefined,
  classLevel: number,
): number {
  return rule?.unrestrictedGrantLevels.has(classLevel) ? 1 : 0
}

export function getClassSpellSchoolGuidance(
  rule: ClassSpellSchoolRule | undefined,
  spellCount: number,
  maximumUnrestricted: number,
): string | undefined {
  if (!rule || spellCount <= 0) return undefined

  const schools = [...rule.restrictedSchools].map(getSchoolName).join(' or ')
  const unrestricted = Math.min(spellCount, Math.max(0, maximumUnrestricted))
  const restricted = spellCount - unrestricted

  if (restricted === 0) {
    return spellCount === 1
      ? 'This spell may be from any Wizard school.'
      : 'These spells may be from any Wizard school.'
  }
  if (unrestricted === 0) {
    return spellCount === 1
      ? `This spell must be an ${schools} spell.`
      : `All ${spellCount} spells must be ${schools} spells.`
  }

  const remainder = unrestricted === 1 ? 'spell' : `${unrestricted} spells`
  return `At least ${restricted} of your ${spellCount} spells must be ${schools} spells. The remaining ${remainder} may be from any Wizard school.`
}

export function getClassSpellRuleContext(
  originSystem: '2014' | '2024',
  entry: CharacterClassEntry | undefined,
): ClassSpellRuleContext {
  return {
    originSystem,
    className: entry?.name,
    classSource: entry?.source,
    subclassName: entry?.subclass,
    subclassSource: entry?.subclassSource,
  }
}

export function isClassChoiceSpellTag(
  tag: SpellSourceTag,
  className: string,
  classSource: string | undefined,
): boolean {
  return (
    tag.sourceType === 'class' &&
    tag.sourceName === className &&
    (tag.sourceRef ?? '') === (classSource ?? '') &&
    tag.grantType === 'choice'
  )
}

export function getClassChoiceSpellTag(
  ledger: ProvenanceLedger | undefined,
  spellName: string,
  className: string,
  classSource: string | undefined,
): SpellSourceTag | undefined {
  return (ledger?.spells[normalize(spellName)] ?? []).find((tag) =>
    isClassChoiceSpellTag(tag, className, classSource),
  )
}

/** Returns leveled class-profile spells that may be replaced when gaining a class level. */
export function getReplaceableClassSpellNames(
  profile: SpellProfile | undefined,
  ledger: ProvenanceLedger | undefined,
  className: string,
  classSource: string | undefined,
): string[] {
  if (!profile || profile.type !== 'class') return []

  const fixedSpellKeys = buildSpellNameKeySet(profile.fixedSpells ?? [])
  return profile.spellsKnown.filter(
    (name) =>
      !!getClassChoiceSpellTag(ledger, name, className, classSource) ||
      !fixedSpellKeys.has(normalize(name)),
  )
}

/** Resolves replacement eligibility from the character's current class level. */
export function getClassSpellReplacementLevelLimit(
  spellChoicesByLevel: ReadonlyMap<number, { maxSpellLevel: number }>,
  currentClassLevel: number,
  replaceableSpellNames: readonly string[],
  spellsByReference: ReadonlyMap<string, Spell5e>,
): number {
  const configuredMaximum = [...spellChoicesByLevel.entries()].reduce(
    (maximum, [classLevel, gain]) =>
      classLevel <= currentClassLevel ? Math.max(maximum, gain.maxSpellLevel) : maximum,
    0,
  )
  if (configuredMaximum > 0) return configuredMaximum

  return replaceableSpellNames.reduce((maximum, name) => {
    const spell = resolveSpellReferenceFromMap(name, spellsByReference)
    return spell && spell.level > 0 ? Math.max(maximum, spell.level) : maximum
  }, 0)
}
