import {
  type ClassChoiceFeatureCatalogs,
  scopeClassChoiceFeatureCatalogs,
} from '@/lib/character/classChoiceFeatureCatalogs'
import { getFeatureOwnerKey } from '@/lib/character/classChoiceIdentity'
import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import type { AbilityScores, Character, CharacterClassEntry } from '@/types/character'
import type { ClassResourceDef } from '@/types/classRules'
import { getCurrentSelectedClass, permitsClassRuleSource } from './earnedClassFeatureSource'
import { isInheritedClassicSubclass } from './nativeSubclassFeatureSource'
import { getOwnedSubclassFeature } from './ownedSubclassFeature'

const rules = [
  ['warlock', 'phb', 'celestial', 'xge', 'Healing Light', 1, 'level-plus-one'],
  ['warlock', 'phb', 'fathomless', 'tce', 'Tentacle of the Deeps', 1, 'proficiency'],
  ['warlock', 'phb', 'genie', 'tce', 'Elemental Gift', 6, 'proficiency'],
  ['warlock', 'phb', 'undead', 'vrgr', 'Form of Dread', 1, 'proficiency'],
  ['druid', 'phb', 'dreams', 'xge', 'Balm of the Summer Court', 2, 'level'],
  ['druid', 'phb', 'dreams', 'xge', 'Hidden Paths', 10, 'wisdom'],
  ['druid', 'phb', 'stars', 'tce', 'Cosmic Omen', 6, 'proficiency'],
  ['druid', 'xphb', 'stars', 'xphb', 'Cosmic Omen', 6, 'wisdom'],
  ['druid', 'phb', 'spores', 'tce', 'Fungal Infestation', 6, 'wisdom'],
  ['druid', 'phb', 'wildfire', 'tce', 'Cauterizing Flames', 10, 'proficiency'],
  ['cleric', 'phb', 'light', 'phb', 'Warding Flare', 1, 'wisdom'],
  ['cleric', 'xphb', 'light', 'xphb', 'Warding Flare', 3, 'wisdom'],
  ['cleric', 'phb', 'tempest', 'phb', 'Wrath of the Storm', 1, 'wisdom'],
  ['cleric', 'phb', 'war', 'phb', 'War Priest', 1, 'wisdom'],
  ['cleric', 'xphb', 'war', 'xphb', 'War Priest', 3, 'wisdom'],
  ['cleric', 'phb', 'grave', 'xge', 'Eyes of the Grave', 1, 'wisdom'],
  ['cleric', 'phb', 'order', 'tce', 'Embodiment of the Law', 6, 'wisdom'],
  ['cleric', 'phb', 'peace', 'tce', 'Emboldening Bond', 1, 'proficiency'],
  ['cleric', 'phb', 'twilight', 'tce', 'Steps of Night', 6, 'proficiency'],
  ['wizard', 'phb', 'bladesinging', 'tce', 'Bladesong', 2, 'proficiency'],
  ['wizard', 'phb', 'chronurgy', 'egw', 'Momentary Stasis', 6, 'intelligence'],
  ['wizard', 'phb', 'graviturgy', 'egw', 'Violent Attraction', 10, 'intelligence'],
  ['artificer', 'tce', 'battle smith', 'tce', 'Arcane Jolt', 9, 'intelligence'],
  ['sorcerer', 'phb', 'clockwork soul', 'tce', 'Restore Balance', 1, 'proficiency'],
  ['bard', 'phb', 'eloquence', 'tce', 'Infectious Inspiration', 14, 'charisma'],
] as const

const improvedFlare = 'subclass-feature|improved warding flare|cleric|xphb|light|xphb|6|xphb'
type Formula = (typeof rules)[number][6]

function prose(entries: unknown[] | undefined) {
  return (entries ?? [])
    .filter((line): line is string => typeof line === 'string')
    .join(' ')
    .replace(/\{@variantrule ([^|}]+)\|XPHB(?:\|[^}]+)?\}/g, '$1')
    .toLowerCase()
}

function provesMaximum(text: string, formula: Formula) {
  if (formula === 'level') return text.includes('a number of {@dice d6}s equal to your druid level')
  if (formula === 'level-plus-one')
    return text.includes('number of dice in the pool equals 1 + your warlock level')
  if (formula === 'proficiency')
    return text.includes('a number of times equal to your proficiency bonus')
  return new RegExp(
    `a number of times equal to your ${formula} modifier \\((?:a )?minimum of once\\)`,
  ).test(text)
}

export function getStandardSubclassResources(
  character: Character,
  entry: CharacterClassEntry,
  catalogs: ClassChoiceFeatureCatalogs | undefined,
  modifiers: AbilityScores | undefined,
  proficiency: number,
  existing: readonly ClassResourceDef[],
): ClassResourceDef[] {
  const className = norm(entry.name)
  const relevant = rules.filter(
    ([name, , , source]) => name === className && source === norm(entry.subclassSource),
  )
  if (!catalogs || !relevant.length) return []
  const cls = getCurrentSelectedClass(character, entry, catalogs)
  const subclasses = cls?.subclasses?.filter(
    (row) =>
      norm(row.name) === norm(entry.subclass) && norm(row.source) === norm(entry.subclassSource),
  )
  if (!cls || subclasses?.length !== 1) return []
  const [subclass] = subclasses
  const inherited = isInheritedClassicSubclass(subclass)
  if (
    ('_copy' in subclass && !inherited) ||
    (!permitsClassRuleSource(character, entry.subclassSource) &&
      !(inherited && className === 'cleric' && norm(subclass.source) === 'phb'))
  )
    return []
  const origin = inherited ? 'phb' : norm(cls.source)
  const scoped = scopeClassChoiceFeatureCatalogs(
    catalogs,
    getFeatureOwnerKey(entry.name, entry.source, entry.subclass, entry.subclassSource),
  )
  return relevant.flatMap(([, printing, shortName, source, label, printedLevel, formula]) => {
    if (
      origin !== printing ||
      norm(subclass.shortName) !== shortName ||
      entry.levels < printedLevel ||
      existing.some((row) => norm(row.label) === norm(label))
    )
      return []
    const target = `subclass-feature|${norm(label)}|${className}|${printing}|${shortName}|${source}|${printedLevel}|${source}`
    const current = getOwnedSubclassFeature(cls, subclass, target, scoped)
    if (!current || current.level > entry.levels) return []
    const text = prose(current.feature.entries)
    if (
      !provesMaximum(text, formula) ||
      !text.includes('when you finish a') ||
      !text.includes('long rest.')
    )
      return []
    const improved =
      printing === 'xphb' && label === 'Warding Flare' && entry.levels >= 6
        ? getOwnedSubclassFeature(cls, subclass, improvedFlare, scoped)
        : undefined
    const shortRest =
      text.includes('short rest or long rest.') ||
      (!!improved &&
        prose(improved.feature.entries).includes(
          'you regain all expended uses of your warding flare when you finish a short rest or long rest.',
        ))
    const dice = formula === 'level' || formula === 'level-plus-one'
    const maximum =
      formula === 'proficiency' || dice ? proficiency : Math.max(1, modifiers?.[formula] ?? 0)
    return [
      {
        id: `feature-uses:${JSON.stringify([[className, norm(entry.source), norm(entry.subclass), source], target])}`,
        label,
        inheritedFeature: true,
        restType: shortRest ? 'short' : 'long',
        maxPerLevel: Array.from({ length: 20 }, (_, index) =>
          index + 1 < current.level ? 0 : dice ? index + (formula === 'level' ? 1 : 2) : maximum,
        ),
        ...(dice && {
          recovery: { longRest: 'all' as const, unit: 'dice' as const },
          usageText: `Up to ${formula === 'level' ? Math.floor(entry.levels / 2) : Math.max(1, modifiers?.charisma ?? 0)} dice per use (d6)`,
        }),
      },
    ]
  })
}
