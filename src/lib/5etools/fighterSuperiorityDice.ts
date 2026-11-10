import {
  type ClassChoiceFeatureCatalogs,
  scopeClassChoiceFeatureCatalogs,
} from '@/lib/character/classChoiceFeatureCatalogs'
import { getFeatureOwnerKey } from '@/lib/character/classChoiceIdentity'
import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import { getSourceCompatibility } from '@/lib/sourceCompatibility'
import type { Class5e } from '@/types/5etools'
import type { Character, CharacterClassEntry } from '@/types/character'
import type { ClassResourceDef } from '@/types/classRules'
import { findClassReference } from './classReference'
import { getCurrentSelectedClass, permitsClassRuleSource } from './earnedClassFeatureSource'
import { getFeatureSourceDigest } from './featureSourceAudit'
import { getNativeSubclassIntroFeature } from './nativeSubclassFeatureSource'
import { getCurrentNativeSubclassGain } from './nativeSubclassGain'
import { optionalDeclarationObject as record } from './optionalClassDeclarationStructure'
import { getOwnedSubclassFeature } from './ownedSubclassFeature'

const counts = new Map(
  ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'].map(
    (word, index) => [word, index + 1],
  ),
)

function readDiceSchedule(entries: readonly unknown[], revised: boolean, gain: number) {
  const rows = entries
    .map(record)
    .flatMap((row) =>
      !row.name && row.type === 'entries' && Array.isArray(row.entries)
        ? row.entries.map(record)
        : [row],
    )
    .filter((row) => row.name === 'Superiority Dice')
  const [section] = rows
  if (
    rows.length !== 1 ||
    section.type !== 'entries' ||
    !Array.isArray(section.entries) ||
    section.entries.length !== 2
  )
    return undefined
  const [initial, increase] = section.entries
  if (typeof initial !== 'string' || typeof increase !== 'string') return undefined
  const start = revised
    ? /^You have (\w+) Superiority Dice, which are \{@dice d\d+\|d\d+s\}\. A Superiority Die is expended when you use it\. You regain all expended Superiority Dice when you finish a \{@variantrule Short Rest\|XPHB\|Short\} or \{@variantrule Long Rest\|XPHB\}\.$/.exec(
        initial,
      )
    : /^You have (\w+) superiority dice, which are \{@dice d\d+\}s\. A superiority die is expended when you use it\. You regain all of your expended superiority dice when you finish a short or long rest\.$/.exec(
        initial,
      )
  const initialCount = start && counts.get(start[1])
  if (!initialCount) return undefined
  const changes = revised
    ? /^You gain an additional Superiority Die when you reach Fighter levels (\d+) \((\w+) dice total\) and (\d+) \((\w+) dice total\)\.$/.exec(
        increase,
      )
    : /^You gain another superiority die at (\d+)(?:st|nd|rd|th) level and one more at (\d+)(?:st|nd|rd|th) level\.$/.exec(
        increase,
      )
  if (!changes) return undefined
  const first = Number(changes[1])
  const last = Number(changes[revised ? 3 : 2])
  if (
    first <= gain ||
    last <= first ||
    last > 20 ||
    (revised &&
      (counts.get(changes[2]) !== initialCount + 1 || counts.get(changes[4]) !== initialCount + 2))
  )
    return undefined
  return Array.from({ length: 20 }, (_, index) => {
    const level = index + 1
    return level < gain ? 0 : initialCount + Number(level >= first) + Number(level >= last)
  })
}

export function getFighterSuperiorityDice(
  character: Character,
  entry: CharacterClassEntry,
  classes: readonly Class5e[] | undefined,
): ClassResourceDef | undefined {
  const printing = norm(entry.source)
  if (
    norm(entry.name) !== 'fighter' ||
    norm(entry.subclass) !== 'battle master' ||
    (printing !== 'phb' && printing !== 'xphb') ||
    norm(entry.subclassSource) !== printing ||
    !getSourceCompatibility(printing, character.originSystem).compatible ||
    character.classProgression.filter((row) => norm(row.name) === 'fighter').length !== 1
  )
    return undefined
  const matches = classes?.filter(
    (row) => norm(row.name) === 'fighter' && norm(row.source) === printing,
  )
  if (matches?.length !== 1) return undefined
  const [cls] = matches
  const gain = getCurrentNativeSubclassGain(cls)?.level
  const archetypes = cls.subclasses?.filter(
    (row) => norm(row.name) === 'battle master' && norm(row.source) === printing,
  )
  const subclass = archetypes?.length === 1 ? archetypes[0] : undefined
  if (
    !gain ||
    entry.levels < gain ||
    !subclass ||
    subclass.sourceIdentityConflict ||
    '_copy' in subclass ||
    norm(subclass.className) !== 'fighter' ||
    norm(subclass.classSource) !== printing ||
    norm(subclass.shortName) !== 'battle master'
  )
    return undefined
  const rule = getNativeSubclassIntroFeature(cls, subclass, gain, 'Combat Superiority')
  const maxPerLevel =
    Array.isArray(rule?.entries) && readDiceSchedule(rule.entries, printing === 'xphb', gain)
  return maxPerLevel
    ? {
        id: 'fighter-battle-master-superiority-dice',
        label: 'Superiority Dice',
        maxPerLevel,
        restType: 'short',
      }
    : undefined
}

export function getInheritedSuperiorityDice(
  character: Character,
  entry: CharacterClassEntry,
  catalogs?: ClassChoiceFeatureCatalogs,
): ClassResourceDef | undefined {
  if (
    !catalogs ||
    !permitsClassRuleSource(character, entry.subclassSource) ||
    (norm(entry.name) === 'fighter' &&
      norm(entry.source) === 'xphb' &&
      norm(entry.subclassSource) === 'xphb')
  )
    return undefined
  const cls = getCurrentSelectedClass(character, entry, catalogs)
  const subclasses = cls?.subclasses?.filter((row) =>
    findClassReference({ name: entry.subclass, source: entry.subclassSource }, [row]),
  )
  if (!cls || subclasses?.length !== 1) return undefined
  const [subclass] = subclasses
  const target = 'subclass-feature|combat superiority|fighter|xphb|battle master|xphb|3|xphb'
  const current = getOwnedSubclassFeature(
    cls,
    subclass,
    target,
    scopeClassChoiceFeatureCatalogs(
      catalogs,
      getFeatureOwnerKey(cls.name, cls.source, subclass.name, subclass.source),
    ),
  )
  if (
    !current ||
    current.level > entry.levels ||
    !permitsClassRuleSource(character, 'XPHB') ||
    getFeatureSourceDigest(current.feature.entries ?? [], false) !==
      '35d03a1874a81dc77dcb3851bf511daf2667181236496b3073227019303b6615'
  )
    return undefined
  const maxPerLevel = readDiceSchedule(current.feature.entries ?? [], true, current.level)
  return maxPerLevel
    ? {
        id: `subclass-feature-resource:${JSON.stringify([norm(entry.name), norm(entry.source), norm(subclass.name), norm(subclass.source), target])}`,
        label: 'Superiority Dice',
        maxPerLevel,
        restType: 'short',
      }
    : undefined
}
