import { getSpellReferenceKey, parseSpellReference } from '@/lib/calculations/spellIdentity'
import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import type { Class5e, Subclass5e } from '@/types/5etools'
import type { Character, CharacterClassEntry } from '@/types/character'
import { getUnnamedRankedExpansion, parseAdditionalSpellBlocks } from './additionalSpells'
import type { ClassicSpellReprints } from './classicSpellReprints'
import { permitsClassRuleSource } from './earnedClassFeatureSource'
import { getFeatureSourceDigest } from './featureSourceAudit'
import {
  getDirectSubclassFeatureReference,
  isInheritedClassicSubclass,
} from './nativeSubclassFeatureSource'
import { getCurrentNativeSubclassGain, matchesNativeSubclassGain } from './nativeSubclassGain'
import { decodeOptionalDeclaration } from './optionalClassDeclarationStructure'
import { getOwnedSubclassFeature } from './ownedSubclassFeature'
import type { SubclassSpellGrant } from './subclassSpells'

const retainedGrants = [
  {
    className: 'bard',
    subclass: 'college of spirits',
    source: 'vrgr',
    shortName: 'Spirits',
    introClassSource: 'phb',
    target: 'subclass-feature|guiding whispers|bard|phb|spirits|vrgr|3|vrgr',
    digest: '04198cc57a4cabacba292d5465482b7b50ff16526cd5477ec473d20df66382b7',
    token: 'guidance#c',
    spell: 'Guidance|XPHB',
    rank: 0,
    castingNote: 'Guiding Whispers: You can cast Guidance at a range of 60 feet.',
  },
  {
    className: 'sorcerer',
    subclass: 'shadow magic',
    source: 'xge',
    shortName: 'Shadow',
    introClassSource: 'xphb',
    target: 'subclass-feature|eyes of the dark|sorcerer|phb|shadow|xge|1|xge',
    digest: 'cdcc6b3388960c66e2b28cc0f69517aa1d352a9364fd791e41da7287f1a85556',
    token: 'darkness',
    spell: 'Darkness|XPHB',
    rank: 2,
    castingNote:
      'Eyes of the Dark: You can spend 2 Sorcery Points to cast Darkness without a spell slot. You can see through the darkness created when you cast it this way.',
  },
] as const

function getRetainedGrant(entry: CharacterClassEntry) {
  if (norm(entry.source) !== 'xphb') return undefined
  return retainedGrants.find(
    (rule) =>
      rule.className === norm(entry.name) &&
      rule.subclass === norm(entry.subclass) &&
      rule.source === norm(entry.subclassSource),
  )
}

export function isRevisedRetainedSubclassSpellOwner(entry: CharacterClassEntry) {
  return !!getRetainedGrant(entry)
}

export function getRetainedRankedExpansion(subclass: Subclass5e) {
  if (
    !isInheritedClassicSubclass(subclass) ||
    subclass.sourceIdentityConflict ||
    !subclass.retainedExpandedSpellSourceDigest
  )
    return undefined
  const expansion = getUnnamedRankedExpansion(subclass.additionalSpells)
  return expansion &&
    getFeatureSourceDigest([expansion], false) === subclass.retainedExpandedSpellSourceDigest
    ? expansion
    : undefined
}

/** Rank-based lists inherited from classic subclasses extend the ordinary picker. */
export function getRetainedExpandedSubclassSpells(
  cls: Class5e,
  subclass: Subclass5e,
  classLevel: number,
  character: Character | undefined,
  catalogs: Parameters<typeof getOwnedSubclassFeature>[3],
  reprints: ClassicSpellReprints | undefined,
): SubclassSpellGrant[] {
  const expanded = getRetainedRankedExpansion(subclass)
  if (
    !expanded ||
    !character ||
    !catalogs ||
    !permitsClassRuleSource(character, cls.source) ||
    !permitsClassRuleSource(character, subclass.source)
  )
    return []
  const first = getCurrentNativeSubclassGain(cls)?.level
  if (!first || classLevel < first) return []
  const intro = decodeOptionalDeclaration(subclass.introFeatureRef ?? '', 'subclassFeature')
  const earned = intro && getOwnedSubclassFeature(cls, subclass, intro.target, catalogs)
  if (!earned || earned.level !== first || earned.refs.length !== 1) return []
  let schedule: ReturnType<typeof parseAdditionalSpellBlocks>[number]['expanded']
  try {
    schedule = parseAdditionalSpellBlocks([{ expanded }])[0].expanded
  } catch {
    return []
  }
  return (schedule ?? []).flatMap(({ reference, spellLevel }) => {
    const { source } = parseSpellReference(reference)
    let spellName = reference
    if (!source || norm(source) === 'phb') {
      const reprint = reprints?.byClassic.get(getSpellReferenceKey(reference, 'PHB'))
      if (!reprint || reprint.classic.level !== spellLevel) return []
      spellName = reprint.revised
    } else if (!permitsClassRuleSource(character, source)) return []
    return [
      {
        spellName,
        level: first,
        isCantrip: spellLevel === 0,
        expandedRank: spellLevel,
        mode: 'expanded',
      },
    ]
  })
}

export function getRetainedSubclassSpellGrants(
  cls: Class5e,
  subclass: Subclass5e,
  entry: CharacterClassEntry,
  classLevel: number,
  catalogs?: Parameters<typeof getOwnedSubclassFeature>[3],
): SubclassSpellGrant[] | undefined {
  const rule = getRetainedGrant(entry)
  if (!rule) return undefined
  if (
    classLevel < 3 ||
    subclass.shortName !== rule.shortName ||
    !isInheritedClassicSubclass(subclass) ||
    !matchesNativeSubclassGain(
      cls,
      `class-feature|${rule.className} subclass|${rule.className}|xphb|3|xphb`,
      3,
    ) ||
    getFeatureSourceDigest(subclass.additionalSpells ?? []) !==
      getFeatureSourceDigest([{ known: { '3': [rule.token] } }])
  )
    return []

  const intro = getDirectSubclassFeatureReference(
    subclass,
    `subclass-feature|${rule.subclass}|${rule.className}|${rule.introClassSource}|${norm(rule.shortName)}|${rule.source}|3|${rule.source}`,
  )
  const owned = getOwnedSubclassFeature(cls, subclass, rule.target, catalogs)
  if (
    !intro ||
    intro.ref !== subclass.introFeatureRef ||
    !owned ||
    owned.level !== 3 ||
    owned.refs.length !== 2 ||
    owned.refs[0] !== intro.ref ||
    getFeatureSourceDigest(owned.feature.entries ?? []) !== rule.digest
  )
    return []

  return [
    {
      spellName: rule.spell,
      level: owned.level,
      isCantrip: rule.rank === 0,
      expectedSpellLevel: rule.rank,
      requiresClassicReprint: true,
      mode: 'known',
      feature: {
        name: owned.feature.name,
        target: owned.target,
        castingNote: rule.castingNote,
      },
    },
  ]
}
