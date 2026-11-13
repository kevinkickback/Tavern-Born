import { getSourceCompatibility } from '@/lib/sourceCompatibility'
import type { Class5e, ClassFeature, Subclass5e, SubclassFeature } from '@/types/5etools'
import type { Character, CharacterClassChoiceSelection } from '@/types/character'
import type {
  ClassChoiceDiagnostic,
  NormalizedCharacterChoice,
  NormalizedChoiceOptionReference,
} from '@/types/classRules'
import type { CharacterEffect } from '@/types/effects'
import { getSubclassFeatureIdentity } from './classFeatureIdentity'
import { permitsClassRuleSource } from './earnedClassFeatureSource'
import { getEntityLookupKey } from './entityIdentity'
import {
  decodeFeatureLiteralChoiceId,
  decodeFeatureOptionReference,
  encodeSourceGroupOptionReference,
  getFeatureLiteralChoiceId,
} from './featureOptionIdentity'
import { getFeatureSourceDigest, hasFeatureSourceShape } from './featureSourceAudit'
import {
  decodeOptionalDeclaration,
  exactOptionalDeclarationReference,
  optionalDeclarationObject as record,
} from './optionalClassDeclarationStructure'
import { getOwnedSubclassFeature } from './ownedSubclassFeature'

const featureName = 'Elemental Affinity'
const level = 6
const owner = {
  type: 'subclass',
  name: 'Sorcerer',
  source: 'XPHB',
  subclassName: 'Draconic Sorcery',
  subclassSource: 'XPHB',
} as const
const parent = {
  kind: 'subclassFeature',
  ref: 'Elemental Affinity|Sorcerer|XPHB|Draconic|XPHB|6|XPHB',
} as const
const target = `subclass-feature|${parent.ref.toLowerCase()}`

export { target as REVISED_AFFINITY_TARGET }

export const REVISED_AFFINITY_GROUP = 'elemental-affinity-damage-type'
type AffinityOwner = { name: string; source: string; subclassName: string; subclassSource: string }
const affinityId = (selected: AffinityOwner) =>
  getFeatureLiteralChoiceId(selected, target, REVISED_AFFINITY_GROUP, target, level)
export const REVISED_AFFINITY_ID = affinityId(owner)
const norm = (value?: string) => value?.trim().toLowerCase()
const isRevisedSorcerer = (cls: { name?: string; source?: string }) =>
  norm(cls.name) === 'sorcerer' && norm(cls.source) === 'xphb'
const damageTypes = ['acid', 'cold', 'fire', 'lightning', 'poison']
const sourceFields = new Set([
  'name',
  'source',
  'className',
  'classSource',
  'subclassShortName',
  'subclassSource',
  'level',
  'header',
  'entries',
  'page',
  'srd52',
  'basicRules2024',
])

type AffinitySubclass = {
  name?: string
  source?: string
  className?: string
  classSource?: string
  subclassFeatureRefs?: Subclass5e['subclassFeatureRefs']
}

export function isNativeAffinityOwner(
  cls: { name?: string; source?: string },
  subclass: AffinitySubclass | undefined,
) {
  return (
    isRevisedSorcerer(cls) &&
    norm(subclass?.name) === 'draconic sorcery' &&
    norm(subclass?.source) === 'xphb'
  )
}

function affinityOwner(
  cls: { name?: string; source?: string },
  subclass: AffinitySubclass | undefined,
) {
  if (!cls.name || !cls.source || !subclass?.name || !subclass.source) return undefined
  const native = isNativeAffinityOwner(cls, subclass)
  if (
    !native &&
    !(
      getSourceCompatibility(cls.source, '2024').compatible &&
      norm(subclass.className) === norm(cls.name) &&
      norm(subclass.classSource) === norm(cls.source) &&
      subclass.subclassFeatureRefs?.some((ref) => isAffinityUid(ref.ref))
    )
  )
    return undefined
  return {
    name: cls.name,
    source: cls.source,
    subclassName: subclass.name,
    subclassSource: subclass.source,
  }
}

function affinityOwnerFromId(id: string): AffinityOwner | undefined {
  const address = decodeFeatureLiteralChoiceId(id)
  if (!address || address.group !== REVISED_AFFINITY_GROUP) return undefined
  const [name, source, subclassName, subclassSource] = address.owner
  if (!subclassName || !subclassSource) return undefined
  const selected = { name, source, subclassName, subclassSource }
  return affinityId(selected) === id ? selected : undefined
}

export function isRevisedAffinityChoiceId(id: string) {
  return !!affinityOwnerFromId(id)
}

function affinityDamageType(option: NormalizedChoiceOptionReference) {
  const relation = decodeFeatureOptionReference(option)
  if (
    option.entityType === 'featureOption' &&
    norm(option.source) === 'xphb' &&
    relation?.format === 'source-group' &&
    relation.parentIdentity === target &&
    relation.group === REVISED_AFFINITY_GROUP &&
    damageTypes.includes(relation.literal)
  )
    return relation.literal
}

export function isRevisedAffinityOption(option: NormalizedChoiceOptionReference) {
  const relation = decodeFeatureOptionReference(option)
  return (
    relation?.parentIdentity === target ||
    (relation?.format === 'source-group' && relation.group === REVISED_AFFINITY_GROUP)
  )
}

export function getSavedAffinityDamageType(
  selection: CharacterClassChoiceSelection,
  progression?: Character['classProgression'],
) {
  const selected = affinityOwnerFromId(selection.choiceId)
  if (
    !selected ||
    affinityId({
      name: selection.className,
      source: selection.classSource,
      subclassName: selection.subclassName ?? '',
      subclassSource: selection.subclassSource ?? '',
    }) !== selection.choiceId
  )
    return undefined
  if (progression) {
    const owners = progression.filter(
      (entry) =>
        norm(entry.name) === norm(selected.name) && norm(entry.source) === norm(selected.source),
    )
    const [entry] = owners
    if (
      owners.length !== 1 ||
      entry.levels < level ||
      entry.name !== selection.className ||
      entry.source !== selection.classSource ||
      entry.subclass !== selection.subclassName ||
      entry.subclassSource !== selection.subclassSource
    )
      return undefined
  }
  if (
    selection.kind === 'feature-option' &&
    selection.classLevel === level &&
    selection.inactive === undefined &&
    !selection.favoredEnemy &&
    !selection.proficiencyAtGain &&
    selection.selected.length === 1 &&
    selection.selected[0].slotLevel === level
  )
    return affinityDamageType(selection.selected[0])
}

interface AffinityCatalog {
  classes?: readonly Class5e[]
  subclassFeatures: readonly SubclassFeature[]
  subclassFeatureCandidates?: ReadonlyMap<string, readonly SubclassFeature[]>
  subclassTargets?: {
    candidatesByOwner: ReadonlyMap<string, ReadonlyMap<string, readonly SubclassFeature[]>>
  }
}

function isAffinityUid(uid: unknown) {
  return (
    typeof uid === 'string' && decodeOptionalDeclaration(uid, 'subclassFeature')?.target === target
  )
}

function verifiesBody(
  feature: ClassFeature | undefined,
): feature is SubclassFeature & { entries: [string, string] } {
  return (
    !!feature &&
    norm(feature.source) === 'xphb' &&
    hasFeatureSourceShape(feature, sourceFields) &&
    getSubclassFeatureIdentity(feature) === target &&
    Array.isArray(feature.entries) &&
    // Both native catalogs carry the same choose-one and effect paragraphs.
    getFeatureSourceDigest(feature.entries, false) ===
      'f5cda8b790c9c298d243752677e2d8c0567ef848db75d6f39371548e822142bb'
  )
}

function currentAffinity(catalogs: AffinityCatalog | undefined, selected: AffinityOwner = owner) {
  const classes = catalogs?.classes?.filter(
    (cls) => norm(cls.name) === norm(selected.name) && norm(cls.source) === norm(selected.source),
  )
  if (classes?.length !== 1 || classes[0].sourceIdentityConflict || '_copy' in classes[0])
    return undefined
  const cls = classes[0]
  const subclasses = cls.subclasses?.filter(
    (row) =>
      norm(row.name) === norm(selected.subclassName) &&
      norm(row.source) === norm(selected.subclassSource),
  )
  if (subclasses?.length !== 1 || subclasses[0].sourceIdentityConflict) return undefined
  const subclass = subclasses[0]
  const ownerKey = JSON.stringify([
    getEntityLookupKey(selected.name, selected.source).toLowerCase(),
    getEntityLookupKey(selected.subclassName, selected.subclassSource).toLowerCase(),
  ])
  if (!isNativeAffinityOwner(cls, subclass)) {
    const candidates = catalogs?.subclassTargets?.candidatesByOwner.get(ownerKey)
    if (!candidates) return undefined
    const current = getOwnedSubclassFeature(cls, subclass, target, {
      subclassFeatures: [],
      subclassFeatureCandidates: candidates,
    })
    return current?.refs.length === 1 && current.level === level && verifiesBody(current.feature)
      ? current.feature
      : undefined
  }
  if (
    '_copy' in subclass ||
    norm(subclass.className) !== 'sorcerer' ||
    norm(subclass.classSource) !== 'xphb' ||
    typeof subclass.shortName !== 'string' ||
    norm(subclass.shortName) !== 'draconic' ||
    !Array.isArray(subclass.subclassFeatures) ||
    !Array.isArray(subclass.subclassFeatureRefs)
  )
    return undefined
  const declarations = subclass.subclassFeatures.filter((row) =>
    isAffinityUid(typeof row === 'string' ? row : record(row).subclassFeature),
  )
  const refs = subclass.subclassFeatureRefs.filter(
    (row) => isAffinityUid(row.ref) || getSubclassFeatureIdentity(row) === target,
  )
  const ref = refs[0]
  if (
    declarations.length !== 1 ||
    typeof declarations[0] !== 'string' ||
    refs.length !== 1 ||
    ref.sourceIdentityConflict ||
    !isAffinityUid(ref.ref) ||
    !exactOptionalDeclarationReference(record(ref), ref.ref, 'subclassFeature') ||
    !verifiesBody(ref.feature)
  )
    return undefined
  const candidates = catalogs?.subclassTargets
    ? catalogs.subclassTargets.candidatesByOwner.get(ownerKey)?.get(target)
    : catalogs?.subclassFeatureCandidates
      ? catalogs.subclassFeatureCandidates.get(target)
      : catalogs?.subclassFeatures.filter((row) => getSubclassFeatureIdentity(row) === target)
  if (candidates?.length && candidates.every(verifiesBody)) return candidates[0]
}

export function getRevisedAffinitySetup(
  cls: Parameters<typeof affinityOwner>[0],
  subclass: Parameters<typeof affinityOwner>[1],
  catalogs: AffinityCatalog | undefined,
): NormalizedCharacterChoice | undefined {
  const selected = affinityOwner(cls, subclass)
  const feature = selected && currentAffinity(catalogs, selected)
  if (!selected || !feature) return undefined
  const [choiceText] = feature.entries
  const options: NormalizedChoiceOptionReference[] = choiceText
    .slice(choiceText.indexOf(': ') + 2, -1)
    .replace(', or ', ', ')
    .split(', ')
    .map((name) => ({
      entityType: 'featureOption',
      name,
      source: owner.source,
      ref: encodeSourceGroupOptionReference(parent, REVISED_AFFINITY_GROUP, name),
    }))
  return {
    id: affinityId(selected),
    label: featureName,
    kind: 'feature-option',
    owner: { ...selected, type: 'subclass', featureName, featureSource: owner.source },
    level,
    minimumSelections: 1,
    maximumSelections: 1,
    selectionCountByLevel: Array.from({ length: 20 }, (_, index) => Number(index + 1 >= level)),
    options,
    repeatable: false,
    replacement: { cadence: 'never' },
    source: { kind: 'class-feature-options', field: parent.ref },
  }
}

export function getRevisedAffinityDiagnostic(
  cls: Parameters<typeof affinityOwner>[0],
  subclass: Parameters<typeof affinityOwner>[1],
  catalogs: AffinityCatalog | undefined,
): ClassChoiceDiagnostic | undefined {
  const selected = affinityOwner(cls, subclass)
  if (!selected || currentAffinity(catalogs, selected)) return undefined
  return {
    code: 'unverified-required-choice',
    className: selected.name,
    classSource: selected.source,
    subclassName: selected.subclassName,
    subclassSource: selected.subclassSource,
    featureName,
    level,
    message: 'Restore the exact Elemental Affinity source to choose a damage type.',
  }
}

export function isRevisedAffinitySourceEnabled(character: Character, id: string) {
  const selected = affinityOwnerFromId(id)
  return (
    !!selected &&
    [selected.source, selected.subclassSource, owner.source].every((source) =>
      permitsClassRuleSource(character, source),
    )
  )
}

export function resolveRevisedAffinityOption(
  option: NormalizedChoiceOptionReference,
  catalogs: AffinityCatalog,
  id = REVISED_AFFINITY_ID,
) {
  const damageType = affinityDamageType(option)
  const selected = affinityOwnerFromId(id)
  const feature = damageType && selected && currentAffinity(catalogs, selected)
  if (!feature || !option.ref) return undefined
  const [, rules] = feature.entries
  return {
    name: option.name,
    source: owner.source,
    ref: option.ref,
    group: REVISED_AFFINITY_GROUP,
    entries: [
      rules
        .replace('to that damage type', `to ${damageType} damage`)
        .replace('damage of that type', `${damageType} damage`),
    ],
  }
}

export function deriveRevisedAffinityEffects(
  character: Character,
  catalogs: AffinityCatalog | undefined,
): CharacterEffect[] {
  const selections = character.classChoiceSelections ?? []
  return selections.flatMap((selection) => {
    const selected = affinityOwnerFromId(selection.choiceId)
    if (
      !selected ||
      selections.filter((row) => row.choiceId === selection.choiceId).length !== 1 ||
      !isRevisedAffinitySourceEnabled(character, selection.choiceId) ||
      !currentAffinity(catalogs, selected)
    )
      return []
    const damageType = getSavedAffinityDamageType(selection, character.classProgression)
    return damageType
      ? [
          {
            id: `${selection.choiceId}:resistance`,
            label: featureName,
            source: {
              kind: 'subclass',
              name: featureName,
              source: owner.source,
              entityId: target,
              provenance: { choiceId: selection.choiceId },
            },
            target: { kind: 'damage-resistance', damageType },
            operation: { kind: 'grant' },
          },
        ]
      : []
  })
}
