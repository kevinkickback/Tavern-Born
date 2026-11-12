import {
  getClassicSorcererBonusSpellSource,
  getClassicSorcererReplacementRule,
} from '@/lib/5etools/classicSorcererBonusSpells'
import {
  getCurrentSelectedClass,
  permitsClassRuleSource,
} from '@/lib/5etools/earnedClassFeatureSource'
import { matchesJoinedSpellClassFilter } from '@/lib/5etools/spellFilterSources'
import { auditSpellRouteMultiplicity } from '@/lib/5etools/spellRouteSources'
import { getSpellNameKey, getSpellReferenceKey } from '@/lib/calculations/spellIdentity'
import type { Spell5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import type { ManagedClassSpellChoice, ManagedClassSpellSlot } from '@/types/classCasting'
import { type ManagedClassSpellContext, permitted, sources } from './classSpellAuthority'
import { getManagedClassSpellOwnerEntry } from './managedClassSpellIdentity'

type Rule = NonNullable<ReturnType<typeof getClassicSorcererReplacementRule>>
const replacementDomain = 'subclass-spell-replacement'
const classLists = ['sorcerer', 'warlock', 'wizard']

export function indexSorcererReplacementTargets(context?: ManagedClassSpellContext) {
  const targets = new Map<string, Spell5e | undefined>()
  for (const spell of Object.values(context?.spellsByKey ?? {})) {
    const key = getSpellReferenceKey(spell.name, spell.source)
    targets.set(key, targets.has(key) ? undefined : spell)
  }
  return targets
}

function getCurrentOwner(
  character: Character,
  slot: ManagedClassSpellSlot,
  context?: ManagedClassSpellContext,
) {
  const entry = getManagedClassSpellOwnerEntry(slot, character.classProgression)
  if (
    character.originSystem !== '2014' ||
    !entry ||
    entry.levels < slot[3] ||
    !permitsClassRuleSource(character, entry.subclassSource)
  )
    return undefined
  const cls = getCurrentSelectedClass(character, entry, context?.catalogs)
  const subclasses = cls?.subclasses?.filter(
    (row) => row.name === entry.subclass && row.source === entry.subclassSource,
  )
  return cls && subclasses?.length === 1 && getClassicSorcererBonusSpellSource(cls, subclasses[0])
    ? entry
    : undefined
}

function eligibleSpell(spell: Spell5e, rule: Rule, allowed: ReturnType<typeof sources>) {
  if (
    spell.level !== rule.rank ||
    !rule.schools.includes(spell.school ?? '') ||
    !permitted(allowed, spell.source)
  )
    return false
  const [checked] = auditSpellRouteMultiplicity([spell])
  return (
    checked.classSpellRouteSource?.input.targetOccurrences.length === 1 &&
    checked.classSpellRouteDiagnostics?.length === 0 &&
    checked.classSpellRoutes?.some(
      (route) =>
        route[4] === 'phb' &&
        matchesJoinedSpellClassFilter(route, classLists) &&
        (route[6] === null || permitted(allowed, route[6])),
    ) === true
  )
}

/** Rebuild the feature's spells by class gain. An unavailable replacement leaves the previous spell earned. */
export function replaySorcererBonusSpellReplacements(
  character: Character,
  slot: ManagedClassSpellSlot,
  targets: ReadonlyMap<string, Spell5e | undefined>,
  context?: ManagedClassSpellContext,
  before = 21,
) {
  const current = new Map<number, ManagedClassSpellChoice>()
  const statuses = new Map<ManagedClassSpellChoice, string | undefined>()
  const entry = getCurrentOwner(character, slot, context)
  const allowed = sources(character)
  const choices = (character.managedClassSpellChoices ?? [])
    .filter(
      ({ slot: candidate }) =>
        candidate[1] === replacementDomain && candidate[2] === slot[2] && candidate[3] < before,
    )
    .sort((a, b) => a.slot[3] - b.slot[3])
  const duplicate = (rule: Rule, address: ManagedClassSpellSlot, name: string) =>
    rule.originals.some(
      (reference, ordinal) =>
        2 * Math.floor(ordinal / 2) + 1 <= address[3] &&
        getSpellNameKey(current.get(ordinal)?.target.name ?? reference) === name,
    ) ||
    (character.managedClassSpellChoices ?? []).some(
      (choice) =>
        choice.slot[1] === 'class-known' &&
        choice.slot[0][1] === slot[0][1] &&
        choice.slot[0][2] === slot[0][2] &&
        choice.slot[3] <= address[3] &&
        getSpellNameKey(choice.target.name) === name,
    )
  for (const choice of choices) {
    const rule = getClassicSorcererReplacementRule(choice.slot)
    const key = getSpellReferenceKey(choice.target.name, choice.target.source)
    const spell = targets.get(key)
    if (!entry || !rule || entry.levels < choice.slot[3]) {
      statuses.set(choice, 'Restore the original subclass and its bonus spell feature.')
    } else if (!spell || choice.policy !== 'default' || !eligibleSpell(spell, rule, allowed)) {
      statuses.set(
        choice,
        'Choose an eligible spell of the same level from the feature’s current spell lists.',
      )
    } else if (duplicate(rule, choice.slot, getSpellNameKey(spell.name))) {
      statuses.set(choice, 'Choose a spell this Sorcerer does not already know at this gain.')
    } else {
      statuses.set(choice, undefined)
      current.set(choice.slot[4], choice)
    }
  }
  return { entry, current, statuses, duplicate }
}

export function getSorcererBonusSpellReplacementPool(
  character: Character,
  slot: ManagedClassSpellSlot,
  context?: ManagedClassSpellContext,
) {
  const targets = indexSorcererReplacementTargets(context)
  const rule = getClassicSorcererReplacementRule(slot)
  const prior = replaySorcererBonusSpellReplacements(character, slot, targets, context, slot[3])
  const allowed = sources(character)
  const spells =
    rule && prior.entry
      ? [...targets.values()].filter(
          (spell): spell is Spell5e =>
            !!spell &&
            !prior.duplicate(rule, slot, getSpellNameKey(spell.name)) &&
            eligibleSpell(spell, rule, allowed),
        )
      : []
  return {
    spells,
    defaultReferences: new Set(
      spells.map((spell) => getSpellReferenceKey(spell.name, spell.source)),
    ),
    maxSpellLevel: rule?.rank ?? 0,
    allowedLevels: rule ? [rule.rank] : [],
    schools: rule?.schools,
    privileged: false,
    featureName: rule?.name,
    reason: prior.entry ? undefined : 'Restore the original subclass and its bonus spell feature.',
  }
}
