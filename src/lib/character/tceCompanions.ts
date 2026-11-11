import {
  getCurrentSelectedClass,
  permitsClassRuleSource,
} from '@/lib/5etools/earnedClassFeatureSource'
import { isInheritedClassicSubclass } from '@/lib/5etools/nativeSubclassFeatureSource'
import { optionalDeclarationObject as record } from '@/lib/5etools/optionalClassDeclarationStructure'
import { getOwnedSubclassFeature } from '@/lib/5etools/ownedSubclassFeature'
import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import type { Character } from '@/types/character'
import {
  type ClassChoiceFeatureCatalogs,
  scopeClassChoiceFeatureCatalogs,
} from './classChoiceFeatureCatalogs'
import { getFeatureOwnerKey } from './classChoiceIdentity'

const companionRules = [
  ['Artificer', 'Battle Smith', 'Steel Defender', 'Steel Defender', 'tce', 3],
  ['Druid', 'Circle of Wildfire', 'Summon Wildfire Spirit', 'Wildfire Spirit', 'phb', 2],
  ['Bard', 'College of Creation', 'Animating Performance', 'Dancing Item', 'phb', 6],
] as const

const defenderImprovement =
  'subclass-feature|improved defender|artificer|tce|battle smith|tce|15|tce'
const defenderArmor = 'Your steel defender gains a +2 bonus to {@variantrule Armor Class|XPHB}.'
const defenderReaction =
  'Whenever your steel defender uses its Deflect Attack, the attacker takes force damage equal to {@damage 1d4} + your Intelligence modifier.'

export function getTceCompanions(
  character: Character,
  catalogs: ClassChoiceFeatureCatalogs | undefined,
) {
  if (!catalogs || !permitsClassRuleSource(character, 'TCE')) return []
  return character.classProgression.flatMap((entry) => {
    const rule = companionRules.find(
      ([className, subclass, , , printing]) =>
        entry.name === className &&
        entry.subclass === subclass &&
        entry.subclassSource === 'TCE' &&
        (norm(entry.source) === printing || (printing === 'phb' && entry.source === 'XPHB')),
    )
    if (!rule) return []
    const [, , feature, creatureName, origin, printedLevel] = rule
    const cls = getCurrentSelectedClass(character, entry, catalogs)
    const subclasses = cls?.subclasses?.filter(
      (row) =>
        row.name === entry.subclass && row.source === 'TCE' && row.classSource === entry.source,
    )
    if (!cls || subclasses?.length !== 1) return []
    const [subclass] = subclasses
    if (entry.source === 'XPHB' ? !isInheritedClassicSubclass(subclass) : '_copy' in subclass)
      return []
    const scoped = scopeClassChoiceFeatureCatalogs(
      catalogs,
      getFeatureOwnerKey(entry.name, entry.source, entry.subclass, entry.subclassSource),
    )
    const target = `subclass-feature|${norm(feature)}|${norm(entry.name)}|${origin}|${norm(subclass.shortName)}|tce|${printedLevel}|tce`
    const grant = getOwnedSubclassFeature(cls, subclass, target, scoped)
    if (!grant || grant.level > entry.levels) return []
    const references = (grant.feature.entries ?? []).flatMap((value) =>
      typeof value === 'string' ? [...value.matchAll(/\{@creature ([^{}|]+)\|([^{}|]+)\}/gu)] : [],
    )
    if (
      !references.some(
        ([, name, source]) => norm(name) === norm(creatureName) && norm(source) === 'tce',
      )
    )
      return []
    const creatures = catalogs.creatures?.filter(
      (row) => row.name === creatureName && row.source === 'TCE',
    )
    const base = creatures?.length === 1 ? creatures[0] : undefined
    if (!base || base.sourceIdentityConflict) return []
    const improved =
      creatureName === 'Steel Defender' && entry.levels >= 15
        ? getOwnedSubclassFeature(cls, subclass, defenderImprovement, scoped)
        : undefined
    const improvements = (improved?.feature.entries ?? [])
      .map(record)
      .flatMap((row) => (row.type === 'list' && Array.isArray(row.items) ? row.items : []))
    const creature = {
      ...base,
      ...(improvements.includes(defenderArmor) && {
        ac: base.ac?.map((ac) => {
          const armor = record(ac)
          if (typeof ac === 'number') return ac + 2
          return typeof armor.ac === 'number' ? { ...armor, ac: armor.ac + 2 } : ac
        }),
      }),
      ...(improvements.includes(defenderReaction) && {
        reaction: base.reaction?.map((row) =>
          row.name === 'Deflect Attack'
            ? { ...row, entries: [...(row.entries ?? []), defenderReaction] }
            : row,
        ),
      }),
    }
    return [
      {
        name: creature.name,
        source: creature.source,
        className: entry.name,
        classSource: entry.source,
        creature,
      },
    ]
  })
}
