import { getSpellNameKey, getSpellReferenceKey } from '@/lib/calculations/spellIdentity'
import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import type { Class5e, SubclassFeature } from '@/types/5etools'
import type { Character, CharacterClassEntry, SpellProfile } from '@/types/character'
import { getSubclassFeatureIdentity } from './classFeatureIdentity'
import { getFeatureSourceDigest } from './featureSourceAudit'
import { getDirectSubclassFeatureReference } from './nativeSubclassFeatureSource'
import { matchesNativeSubclassGain } from './nativeSubclassGain'
import {
  decodeOptionalDeclaration,
  exactOptionalDeclarationReference,
  optionalDeclarationObject as record,
} from './optionalClassDeclarationStructure'

export const wizardIllusionCantrips = [
  {
    source: 'phb',
    subclass: 'school of illusion',
    name: 'Improved Minor Illusion',
    level: 2,
    intro: 'subclass-feature|school of illusion|wizard|phb|illusion|phb|2|phb',
    target: 'subclass-feature|improved minor illusion|wizard|phb|illusion|phb|2|phb',
    gain: 'class-feature|arcane tradition|wizard|phb|2|phb',
    digest: '9dc8e522bec311cd8debb154801a8ee115618c4979e0795aaaa0e2338d5b2e8e',
  },
  {
    source: 'xphb',
    subclass: 'illusionist',
    name: 'Improved Illusions',
    level: 3,
    intro: 'subclass-feature|illusionist|wizard|xphb|illusionist|xphb|3|xphb',
    target: 'subclass-feature|improved illusions|wizard|xphb|illusionist|xphb|3|xphb',
    gain: 'class-feature|wizard subclass|wizard|xphb|3|xphb',
    digest: '431b59cf2b2d001db158ffece6f0b33c865f8a63b5ed4cd82946b71860696825',
  },
] as const

export const WIZARD_THIRD_EYE_TARGET =
  'subclass-feature|the third eye|wizard|xphb|diviner|xphb|10|xphb'

export function isDirectWizardTraditionSpellSource(target: string | undefined) {
  return (
    target === WIZARD_THIRD_EYE_TARGET ||
    wizardIllusionCantrips.some((row) => target === row.target || target === row.intro)
  )
}

type Rule = (typeof wizardIllusionCantrips)[number]

export function getWizardIllusionCantripOwner(entry: CharacterClassEntry) {
  return norm(entry.name) === 'wizard'
    ? wizardIllusionCantrips.find(
        (rule) =>
          norm(entry.source) === rule.source &&
          norm(entry.subclassSource) === rule.source &&
          norm(entry.subclass) === rule.subclass,
      )
    : undefined
}

export function knowsIndependentMinorIllusion(
  character: Character,
  rule: Rule,
  profiles: readonly SpellProfile[] | undefined,
) {
  return (
    profiles?.some((profile) => {
      const wizard =
        profile.type === 'class' &&
        norm(profile.className) === 'wizard' &&
        norm(profile.classSource) === rule.source
      if (!wizard)
        return profile.cantrips.some((spell) => getSpellNameKey(spell) === 'minor illusion')
      // The ordinary slot must also appear in the current projection after route validation.
      return character.managedClassSpellChoices?.some(
        ({ slot, target }) =>
          slot[0][0] === 'class' &&
          slot[0][1] === 'wizard' &&
          slot[0][2] === rule.source &&
          slot[1] === 'class-cantrip' &&
          slot[3] < rule.level &&
          getSpellNameKey(target.name) === 'minor illusion' &&
          profile.cantrips.some(
            (spell) =>
              getSpellReferenceKey(spell) === getSpellReferenceKey(target.name, target.source),
          ),
      )
    }) ?? false
  )
}

export function hasCurrentWizardIllusionCantrip(cls: Class5e, rule: Rule) {
  if (
    norm(cls.name) !== 'wizard' ||
    norm(cls.source) !== rule.source ||
    cls._copy ||
    cls.sourceIdentityConflict ||
    !matchesNativeSubclassGain(cls, rule.gain, rule.level)
  )
    return false
  const subclasses = cls.subclasses?.filter(
    (row) => norm(row.name) === rule.subclass && norm(row.source) === rule.source,
  )
  const subclass = subclasses?.[0]
  if (
    subclasses?.length !== 1 ||
    !subclass ||
    subclass.sourceIdentityConflict ||
    subclass._copy ||
    norm(subclass.className) !== 'wizard' ||
    norm(subclass.classSource) !== rule.source
  )
    return false
  const wrapper = getDirectSubclassFeatureReference(subclass, rule.intro)?.feature
  if (!wrapper || wrapper.featureOptionSourceConflict || wrapper.sourceIdentityConflict)
    return false
  const references = (wrapper.entries ?? [])
    .map(record)
    .filter(
      (row) =>
        typeof row.subclassFeature === 'string' &&
        decodeOptionalDeclaration(row.subclassFeature, 'subclassFeature')?.target === rule.target,
    )
  const reference = references[0]
  const feature = reference?.feature as SubclassFeature | undefined
  return (
    references.length === 1 &&
    reference.type === 'refSubclassFeature' &&
    typeof reference.subclassFeature === 'string' &&
    exactOptionalDeclarationReference(reference, reference.subclassFeature, 'subclassFeature') &&
    Object.keys(reference).every(
      (key) => key === 'type' || key === 'subclassFeature' || key === 'feature',
    ) &&
    !!feature &&
    !feature.sourceIdentityConflict &&
    !feature.featureOptionSourceConflict &&
    !feature.isClassFeatureVariant &&
    getSubclassFeatureIdentity(feature) === rule.target &&
    getFeatureSourceDigest(feature.entries ?? []) === rule.digest
  )
}
