import { getEffectiveSources } from '@/lib/sourceCompatibility'
import type { Class5e, ClassFeature, SubclassFeature } from '@/types/5etools'
import type { Character, CharacterClassChoiceSelection } from '@/types/character'
import type {
  ClassChoiceDiagnostic,
  NormalizedCharacterChoice,
  NormalizedChoiceOptionReference,
} from '@/types/classRules'
import type { CharacterEffect } from '@/types/effects'
import { getSubclassFeatureIdentity } from './classFeatureIdentity'
import { getEntityLookupKey } from './entityIdentity'
import {
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

const ownerKey = JSON.stringify([
  getEntityLookupKey(owner.name, owner.source).toLowerCase(),
  getEntityLookupKey(owner.subclassName, owner.subclassSource).toLowerCase(),
])
export const REVISED_AFFINITY_GROUP = 'elemental-affinity-damage-type'
export const REVISED_AFFINITY_ID = getFeatureLiteralChoiceId(
  owner,
  target,
  REVISED_AFFINITY_GROUP,
  target,
  level,
)
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

export function isRevisedAffinityOwner(
  cls: { name?: string; source?: string },
  subclass: { name?: string; source?: string } | undefined,
) {
  return (
    isRevisedSorcerer(cls) &&
    norm(subclass?.name) === 'draconic sorcery' &&
    norm(subclass?.source) === 'xphb'
  )
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
  if (progression) {
    const owners = progression.filter(isRevisedSorcerer)
    const [entry] = owners
    if (
      owners.length !== 1 ||
      entry.levels < level ||
      entry.name !== selection.className ||
      entry.source !== selection.classSource ||
      entry.subclass !== owner.subclassName ||
      entry.subclassSource !== owner.subclassSource ||
      entry.subclass !== selection.subclassName ||
      entry.subclassSource !== selection.subclassSource
    )
      return undefined
  }
  if (
    selection.choiceId === REVISED_AFFINITY_ID &&
    selection.kind === 'feature-option' &&
    selection.classLevel === level &&
    selection.inactive === undefined &&
    !selection.favoredEnemy &&
    !selection.proficiencyAtGain &&
    isRevisedAffinityOwner(
      { name: selection.className, source: selection.classSource },
      { name: selection.subclassName, source: selection.subclassSource },
    ) &&
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

function currentAffinity(catalogs: AffinityCatalog | undefined) {
  const classes = catalogs?.classes?.filter(isRevisedSorcerer)
  if (classes?.length !== 1 || classes[0].sourceIdentityConflict || '_copy' in classes[0])
    return undefined
  const cls = classes[0]
  const subclasses = cls.subclasses?.filter((row) => isRevisedAffinityOwner(cls, row))
  if (subclasses?.length !== 1 || subclasses[0].sourceIdentityConflict || '_copy' in subclasses[0])
    return undefined
  const subclass = subclasses[0]
  if (
    norm(subclass.className) !== 'sorcerer' ||
    norm(subclass.classSource) !== 'xphb' ||
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
  cls: Parameters<typeof isRevisedAffinityOwner>[0],
  subclass: Parameters<typeof isRevisedAffinityOwner>[1],
  catalogs: AffinityCatalog | undefined,
): NormalizedCharacterChoice | undefined {
  if (!isRevisedAffinityOwner(cls, subclass)) return undefined
  const feature = currentAffinity(catalogs)
  if (!feature) return undefined
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
    id: REVISED_AFFINITY_ID,
    label: featureName,
    kind: 'feature-option',
    owner: { ...owner, featureName, featureSource: owner.source },
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

export const revisedAffinityDiagnostic: ClassChoiceDiagnostic = {
  code: 'unverified-required-choice',
  className: owner.name,
  classSource: owner.source,
  subclassName: owner.subclassName,
  subclassSource: owner.subclassSource,
  featureName,
  level,
  message: 'Restore the exact Elemental Affinity source to choose a damage type.',
}

export function isRevisedAffinitySourceEnabled(character: Character) {
  return (
    character.allowedSources === undefined ||
    getEffectiveSources(character.allowedSources, character.originSystem).includes(owner.source)
  )
}

export function resolveRevisedAffinityOption(
  option: NormalizedChoiceOptionReference,
  catalogs: AffinityCatalog,
) {
  const damageType = affinityDamageType(option)
  const feature = damageType && currentAffinity(catalogs)
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
  const selections = character.classChoiceSelections?.filter(
    (s) => s.choiceId === REVISED_AFFINITY_ID,
  )
  if (selections?.length !== 1 || selections[0].inactive) return []
  const damageType = getSavedAffinityDamageType(selections[0], character.classProgression)
  if (!damageType || !isRevisedAffinitySourceEnabled(character) || !currentAffinity(catalogs))
    return []
  return [
    {
      id: `${REVISED_AFFINITY_ID}:resistance`,
      label: featureName,
      source: {
        kind: 'subclass',
        name: featureName,
        source: owner.source,
        entityId: target,
        provenance: { choiceId: REVISED_AFFINITY_ID },
      },
      target: { kind: 'damage-resistance', damageType },
      operation: { kind: 'grant' },
    },
  ]
}
