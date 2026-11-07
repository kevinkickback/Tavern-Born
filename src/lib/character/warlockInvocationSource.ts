import { getClassChoiceSlotLevels } from '@/lib/5etools/classChoiceNormalization'
import { getCurrentDirectClassFeature } from '@/lib/5etools/directClassFeatureSource'
import { featureOptionRulesSignature } from '@/lib/5etools/featureRulesSignature'
import { getFeatureSourceDigest, hasFeatureSourceShape } from '@/lib/5etools/featureSourceAudit'
import {
  isCurrentRevisedInvocationCantripPool,
  REVISED_INVOCATION_POOL,
} from '@/lib/5etools/warlockInvocationCantripSource'
import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import { getSourceCompatibility } from '@/lib/sourceCompatibility'
import type { Class5e } from '@/types/5etools'
import type { Character, CharacterClassChoiceSelection } from '@/types/character'
import type { NormalizedCharacterChoice, NormalizedChoiceOptionReference } from '@/types/classRules'
import type { ClassChoiceFeatureCatalogs } from './classChoiceFeatureCatalogs'
import { getClassChoiceCatalogOptionKey } from './classChoiceIdentity'
import {
  getSavedRevisedInvocationOwner,
  hasEarnedRevisedInvocationSlots,
} from './warlockInvocationChoices'

export const CLASSIC_PACT_BOON_POOL = 'class:warlock|phb|choice:pact-boon|3'
export const CLASSIC_INVOCATION_POOL = 'class:warlock|phb|choice:eldritch-invocations|2'
export const PACT_BLADE_NAME = 'Pact of the Blade'
const bladeKey = norm(PACT_BLADE_NAME)
type NativeSource = 'phb' | 'xphb'

const classicBoonBodies = new Set([
  '877e4f7f9031d43f944ad634450b3a2d53416c175cc82d3523276d52a96821c9',
  'e5e22664c6aa9206e74747503158ba7cc9db448175c607b391904f4e7b64fa43',
])
const classicBladeBodies = new Set([
  'dc33f57d36f69c12ae70da881d9a5e048a34ca3f83a0516ea4d47f07e0f57619',
  '9884982a7fcef230d73ccf4ebce7cf0bf4bcd4f20206f97ed6b0f7b7507f3ac2',
])
const revisedBladeBody = '695476794d60d9d271ff80fc309ae7b556c46af553cb6e35f0647bac224e0b94'
const bladeFields = new Set([
  'name',
  'source',
  'page',
  'srd',
  'srd52',
  'reprintedAs',
  'featureType',
  'entries',
])
const invocationFields = new Set([...bladeFields, 'prerequisite', 'basicRules', 'basicRules2024'])
const classicPassiveInvocationNames = [
  'agonizing blast',
  "devil's sight",
  'eldritch spear',
  'repelling blast',
] as const

export function getClassicPassiveInvocationName(
  selection: CharacterClassChoiceSelection,
  option: NormalizedChoiceOptionReference,
) {
  if (
    selection.choiceId !== CLASSIC_INVOCATION_POOL ||
    selection.kind !== 'optional-feature' ||
    selection.classLevel !== 2 ||
    norm(selection.className) !== 'warlock' ||
    norm(selection.classSource) !== 'phb' ||
    norm(selection.subclassName) ||
    norm(selection.subclassSource) ||
    option.entityType !== 'optionalFeature' ||
    norm(option.source) !== 'phb'
  )
    return undefined
  const name = norm(option.name)
  return classicPassiveInvocationNames.find((candidate) => candidate === name)
}

// The classic pact token and revised optional-feature UID encode the same relationship
// through different source declarations. Keep their three supported targets exact.
const dependentRules = new Map([
  [
    'thirsting blade|phb',
    {
      entries: 'afb3dc56608dfa7951ecf0a2e40fd24ecbf288b2900805e90cd06d6665c4c6e7',
      prerequisite: '3681447e0bf84c3922e367c85fa0eab51ad152da9216e7b709139f8a5f532d0f',
    },
  ],
  [
    'thirsting blade|xphb',
    {
      entries: 'b2d9da58214c424f8dba11d36c8269ebe6e4a114e34e195e3bfcebbd796fa3ae',
      prerequisite: 'f18d3391920fd05396db1c76ab2469926ecf8a1d71806e248e7b34d18cecf386',
    },
  ],
  [
    'lifedrinker|xphb',
    {
      entries: '83239a0312f55ee53a4a0f1cde7ed169d73b494af4a75294d53bf1ea0568d396',
      prerequisite: 'faf37085ea4d6975707057f94a1f5e7d06e179a6c989f0f506de829c669f8891',
    },
  ],
])

export function getBladeInvocationSource(choiceId: string): NativeSource | undefined {
  if (choiceId === CLASSIC_INVOCATION_POOL) return 'phb'
  if (choiceId === REVISED_INVOCATION_POOL) return 'xphb'
}

function isExactNativeOption(option: NormalizedChoiceOptionReference, source: NativeSource) {
  return (
    option.entityType === 'optionalFeature' &&
    norm(option.source) === source &&
    option.ref === undefined &&
    option.invocationCantrip === undefined
  )
}

export function isPactBladeOption(option: NormalizedChoiceOptionReference, source: NativeSource) {
  return norm(option.name) === bladeKey && isExactNativeOption(option, source)
}

export function isBladeDependentInvocation(
  choiceId: string,
  option: NormalizedChoiceOptionReference,
) {
  const source = getBladeInvocationSource(choiceId)
  return !!source && dependentRules.has(`${norm(option.name)}|${source}`)
}

export function isExactBladeInvocationOption(
  choiceId: string,
  option: NormalizedChoiceOptionReference,
) {
  const source = getBladeInvocationSource(choiceId)
  return (
    !!source && isBladeDependentInvocation(choiceId, option) && isExactNativeOption(option, source)
  )
}

function getCurrentWarlock(
  character: Character,
  catalogs: ClassChoiceFeatureCatalogs,
  source: NativeSource,
) {
  if (!getSourceCompatibility(source, character.originSystem ?? '2014').compatible) return undefined
  const owns = (row: { name: string; source: string }) =>
    norm(row.name) === 'warlock' && norm(row.source) === source
  const owners = character.classProgression.filter(owns)
  const classes = catalogs.classes?.filter(owns)
  if (owners.length !== 1 || classes?.length !== 1) return undefined
  const cls = classes[0]
  return cls.sourceIdentityConflict || '_copy' in cls ? undefined : { cls, owner: owners[0] }
}

function getCurrentOptionalLeaf(
  catalogs: ClassChoiceFeatureCatalogs,
  option: NormalizedChoiceOptionReference,
  type: 'PB' | 'EI',
  fields: ReadonlySet<string>,
) {
  const candidates = catalogs.optionalFeatureCandidates
    ? (catalogs.optionalFeatureCandidates.get(getClassChoiceCatalogOptionKey(option)) ?? [])
    : (catalogs.optionalFeatures ?? []).filter(
        (row) => norm(row.name) === norm(option.name) && norm(row.source) === norm(option.source),
      )
  const leaf = candidates.length === 1 ? candidates[0] : undefined
  return leaf &&
    norm(leaf.name) === norm(option.name) &&
    norm(leaf.source) === norm(option.source) &&
    hasFeatureSourceShape(leaf, fields) &&
    Array.isArray(leaf.featureType) &&
    leaf.featureType.length === 1 &&
    leaf.featureType[0] === type &&
    Array.isArray(leaf.entries)
    ? { leaf, entries: leaf.entries }
    : undefined
}

function getCurrentClassicPactBoon(
  cls: Class5e,
  choice: NormalizedCharacterChoice,
  catalogs: ClassChoiceFeatureCatalogs,
) {
  const slots = getClassChoiceSlotLevels(choice)
  return (
    choice.kind === 'optional-feature' &&
    choice.level === 3 &&
    choice.owner.type === 'class' &&
    choice.source.kind === 'optional-feature-progression' &&
    choice.source.field === 'optionalfeatureProgression[1]' &&
    choice.optionFilter?.entityType === 'optionalFeature' &&
    choice.optionFilter.featureTypes?.length === 1 &&
    choice.optionFilter.featureTypes[0] === 'PB' &&
    slots.length === 1 &&
    slots[0] === 3 &&
    cls.optionalfeatureProgression?.filter((row) => row.featureType?.includes('PB')).length === 1 &&
    getFeatureSourceDigest([cls.optionalfeatureProgression[1]], false) ===
      '7202031bd5effaef428f8623d37b9e89a4e4526f9b3d564a8a611314dd1158be' &&
    !!getCurrentDirectClassFeature(
      cls,
      catalogs,
      'class-feature|pact boon|warlock|phb|3|phb',
      (row) =>
        Array.isArray(row.entries) &&
        classicBoonBodies.has(getFeatureSourceDigest(row.entries, false) ?? ''),
    )
  )
}

function getCurrentPactBladeAuthority(
  character: Character,
  catalogs: ClassChoiceFeatureCatalogs | undefined,
  source: NativeSource,
) {
  if (!catalogs) return undefined
  const current = getCurrentWarlock(character, catalogs, source)
  if (!current) return undefined
  const { cls, owner } = current
  const revised = source === 'xphb'
  const poolId = revised ? REVISED_INVOCATION_POOL : CLASSIC_PACT_BOON_POOL
  const choices = cls.normalizedRules?.choices.filter((row) => row.id === poolId)
  const choice = choices?.length === 1 ? choices[0] : undefined
  if (
    !choice ||
    owner.levels < choice.level ||
    norm(choice.owner.name) !== 'warlock' ||
    norm(choice.owner.source) !== source ||
    choice.owner.subclassName ||
    choice.owner.subclassSource ||
    !(revised
      ? isCurrentRevisedInvocationCantripPool(choice, catalogs)
      : getCurrentClassicPactBoon(cls, choice, catalogs))
  )
    return undefined
  const reference = {
    entityType: 'optionalFeature',
    name: PACT_BLADE_NAME,
    source: cls.source,
  } as const
  const leaf = getCurrentOptionalLeaf(catalogs, reference, revised ? 'EI' : 'PB', bladeFields)
  const digest = leaf && getFeatureSourceDigest(leaf.entries, false)
  return leaf && (revised ? digest === revisedBladeBody : classicBladeBodies.has(digest ?? ''))
    ? { owner, choice, reference, entries: leaf.entries }
    : undefined
}

/** The provider has no prerequisite and can be verified without resolving its dependents. */
export function getCurrentPactBladeState(
  character: Character,
  catalogs: ClassChoiceFeatureCatalogs | undefined,
  source: NativeSource,
) {
  const authority = getCurrentPactBladeAuthority(character, catalogs, source)
  if (!authority) return undefined
  const { choice, owner } = authority
  const selections = character.classChoiceSelections?.filter((row) => row.choiceId === choice.id)
  const selection = selections?.length === 1 ? selections[0] : undefined
  const options = selection?.selected.filter((option) => isPactBladeOption(option, source))
  if (
    !selection ||
    options?.length !== 1 ||
    selection.kind !== choice.kind ||
    selection.classLevel !== choice.level ||
    norm(selection.className) !== 'warlock' ||
    norm(selection.classSource) !== source ||
    selection.subclassName ||
    selection.subclassSource ||
    (source === 'xphb'
      ? !getSavedRevisedInvocationOwner(character, selection) ||
        !hasEarnedRevisedInvocationSlots(choice, selection.selected, owner.levels)
      : selection.selected.length !== 1 || options[0].slotLevel !== choice.level)
  )
    return { ...authority, selection: undefined, option: undefined }
  return { ...authority, selection, option: options[0] }
}

function isCurrentClassicInvocationPool(
  cls: Class5e,
  choice: NormalizedCharacterChoice,
  catalogs: ClassChoiceFeatureCatalogs,
) {
  const current = cls.normalizedRules?.choices.filter((row) => row.id === choice.id)
  return (
    choice.id === CLASSIC_INVOCATION_POOL &&
    choice.kind === 'optional-feature' &&
    choice.level === 2 &&
    choice.owner.type === 'class' &&
    norm(choice.owner.name) === 'warlock' &&
    norm(choice.owner.source) === 'phb' &&
    !choice.owner.subclassName &&
    !choice.owner.subclassSource &&
    choice.source.kind === 'optional-feature-progression' &&
    choice.source.field === 'optionalfeatureProgression[0]' &&
    choice.optionFilter?.entityType === 'optionalFeature' &&
    choice.optionFilter.featureTypes?.length === 1 &&
    choice.optionFilter.featureTypes[0] === 'EI' &&
    current?.length === 1 &&
    (current[0] === choice ||
      featureOptionRulesSignature(current, false) ===
        featureOptionRulesSignature([choice], false)) &&
    cls.optionalfeatureProgression?.filter((row) => row.featureType?.includes('EI')).length === 1 &&
    getFeatureSourceDigest([cls.optionalfeatureProgression[0]], false) ===
      'd048ad23346e49766e30081a1fcd9b6c7153720d520c3c3d6035572bcfa353e6' &&
    getFeatureSourceDigest([...choice.selectionCountByLevel], false) ===
      '725d63777c17864b192ceeeb6683b123f2ac62e5e8b1e4a188b45a55bf3da2d0' &&
    !!getCurrentDirectClassFeature(
      cls,
      catalogs,
      'class-feature|eldritch invocations|warlock|phb|2|phb',
      (row) =>
        Array.isArray(row.entries) &&
        getFeatureSourceDigest(row.entries, false) ===
          '95ea8c6af4ba1e75c169a5f84d1845ff6918c9bde187ac41b6a8fe98c99c4a31',
    )
  )
}

export function getCurrentBladeInvocationRule(
  character: Character,
  choice: NormalizedCharacterChoice,
  option: NormalizedChoiceOptionReference,
  catalogs: ClassChoiceFeatureCatalogs,
) {
  const source = getBladeInvocationSource(choice.id)
  if (!source || !isExactBladeInvocationOption(choice.id, option)) return undefined
  const current = getCurrentWarlock(character, catalogs, source)
  if (!current) return undefined
  const { owner, cls } = current
  if (
    !(source === 'phb'
      ? isCurrentClassicInvocationPool(cls, choice, catalogs)
      : isCurrentRevisedInvocationCantripPool(choice, catalogs) &&
        getCurrentDirectClassFeature(
          cls,
          catalogs,
          'class-feature|eldritch invocation options|warlock|xphb|1|xphb',
          (row) =>
            Array.isArray(row.entries) &&
            getFeatureSourceDigest(row.entries, false) ===
              '23bac6db9b2b518a2e08674c3e7f31286575e05af2dd9b972ca23e1bf199eec9',
        ))
  )
    return undefined
  const expected = dependentRules.get(`${norm(option.name)}|${source}`)
  const currentLeaf = getCurrentOptionalLeaf(catalogs, option, 'EI', invocationFields)
  if (!expected || !currentLeaf) return undefined
  const { leaf, entries } = currentLeaf
  const level = leaf.prerequisite?.[0]?.level
  if (
    !Array.isArray(leaf.prerequisite) ||
    !level ||
    typeof level !== 'object' ||
    getFeatureSourceDigest(leaf.prerequisite, false) !== expected.prerequisite ||
    getFeatureSourceDigest(entries, false) !== expected.entries
  )
    return undefined
  return { source, owner, level, entries }
}

export function getCurrentClassicInvocationOwner(
  character: Character,
  choice: NormalizedCharacterChoice,
  catalogs: ClassChoiceFeatureCatalogs,
) {
  const current = getCurrentWarlock(character, catalogs, 'phb')
  return current && isCurrentClassicInvocationPool(current.cls, choice, catalogs)
    ? current.owner
    : undefined
}

export function getCurrentClassicInvocationLeaf(
  catalogs: ClassChoiceFeatureCatalogs,
  option: NormalizedChoiceOptionReference,
) {
  return isExactNativeOption(option, 'phb')
    ? getCurrentOptionalLeaf(catalogs, option, 'EI', invocationFields)
    : undefined
}
