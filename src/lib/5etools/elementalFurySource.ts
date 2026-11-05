import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import type { Class5e, ClassFeature } from '@/types/5etools'
import type { CharacterClassChoiceSelection } from '@/types/character'
import type { NormalizedChoiceOptionReference } from '@/types/classRules'
import { getNormalizedClassChoiceId } from './classChoiceId'
import { getClassFeatureIdentity } from './classFeatureIdentity'
import { featureOptionRulesSignature } from './featureRulesSignature'
import { type ClassFeatureSourceCatalog, hasFeatureSourceShape } from './featureSourceAudit'
import {
  decodeOptionalDeclaration,
  exactOptionalDeclarationReference,
  optionalDeclarationObject as record,
} from './optionalClassDeclarationStructure'

const owner = { type: 'class' as const, name: 'Druid', source: 'XPHB' }
export const ELEMENTAL_FURY_NAME = 'Elemental Fury'
export const ELEMENTAL_FURY_LEVEL = 7
export const IMPROVED_ELEMENTAL_FURY_NAME = 'Improved Elemental Fury'
export const IMPROVED_ELEMENTAL_FURY_LEVEL = 15
const identity = (name: string, level: number) =>
  `class-feature|${norm(name)}|druid|xphb|${level}|xphb`
export const ELEMENTAL_FURY_ID = getNormalizedClassChoiceId(
  owner,
  ELEMENTAL_FURY_NAME,
  ELEMENTAL_FURY_LEVEL,
)
export const ELEMENTAL_FURY_TARGET = identity(ELEMENTAL_FURY_NAME, ELEMENTAL_FURY_LEVEL)
export const IMPROVED_ELEMENTAL_FURY_TARGET = identity(
  IMPROVED_ELEMENTAL_FURY_NAME,
  IMPROVED_ELEMENTAL_FURY_LEVEL,
)
const optionTargets = new Set(
  ['Potent Spellcasting', 'Primal Strike'].map((name) => identity(name, ELEMENTAL_FURY_LEVEL)),
)
export const isElementalFuryOptionTarget = (target: string | undefined) =>
  target !== undefined && optionTargets.has(target)

const fields = new Set([
  'name',
  'className',
  'classSource',
  'source',
  'level',
  'entries',
  'page',
  'header',
  'srd52',
  'basicRules2024',
])
const uidTarget = (uid: unknown) =>
  typeof uid === 'string' ? decodeOptionalDeclaration(uid, 'classFeature')?.target : undefined
const rawTarget = (row: unknown) => uidTarget(row) ?? uidTarget(record(row).classFeature)
const optionTarget = (option: NormalizedChoiceOptionReference) => {
  const target = uidTarget(option.ref)
  return option.entityType === 'classFeature' &&
    norm(option.source) === 'xphb' &&
    identity(option.name, ELEMENTAL_FURY_LEVEL) === target &&
    isElementalFuryOptionTarget(target)
    ? target
    : undefined
}

export function getSavedElementalFury(rows: readonly CharacterClassChoiceSelection[]) {
  const selections = rows.filter((row) => row.choiceId === ELEMENTAL_FURY_ID)
  const saved = selections.length === 1 ? selections[0] : undefined
  return saved?.kind === 'class-feature' &&
    saved.classLevel === ELEMENTAL_FURY_LEVEL &&
    norm(saved.className) === 'druid' &&
    norm(saved.classSource) === 'xphb' &&
    saved.subclassName === undefined &&
    saved.subclassSource === undefined &&
    saved.selected.length === 1 &&
    saved.selected[0].slotLevel === ELEMENTAL_FURY_LEVEL &&
    optionTarget(saved.selected[0])
    ? saved
    : undefined
}

function currentFeature(
  catalogs: ClassFeatureSourceCatalog,
  target: string,
): ClassFeature | undefined {
  const rows = catalogs.classFeatureCandidates
    ? catalogs.classFeatureCandidates.get(target)
    : catalogs.classFeatures.filter((row) => getClassFeatureIdentity(row) === target)
  const feature = rows?.length === 1 ? rows[0] : undefined
  return feature &&
    getClassFeatureIdentity(feature) === target &&
    hasFeatureSourceShape(feature, fields)
    ? feature
    : undefined
}

function currentGain(catalogs: ClassFeatureSourceCatalog, druid: Class5e, target: string) {
  const raw = druid.classFeatures?.filter((row) => rawTarget(row) === target)
  const refs = druid.classFeatureRefs?.filter(
    (row) => uidTarget(row.ref) === target || getClassFeatureIdentity(row) === target,
  )
  const ref = refs?.length === 1 ? refs[0] : undefined
  const feature = currentFeature(catalogs, target)
  const signature = Array.isArray(feature?.entries)
    ? featureOptionRulesSignature(feature.entries)
    : undefined
  return raw?.length === 1 &&
    uidTarget(raw[0]) === target &&
    ref?.feature &&
    uidTarget(ref.ref) === target &&
    !ref.gainSubclassFeature &&
    !record(ref).sourceIdentityConflict &&
    exactOptionalDeclarationReference(record(ref), ref.ref, 'classFeature') &&
    getClassFeatureIdentity(ref.feature) === target &&
    hasFeatureSourceShape(ref.feature, fields) &&
    signature !== undefined &&
    Array.isArray(ref.feature.entries) &&
    featureOptionRulesSignature(ref.feature.entries) === signature
    ? feature
    : undefined
}

/** The choice is structured. The upgrade links to its selected branch through its named source sections. */
export function getCurrentElementalFury(
  catalogs: (ClassFeatureSourceCatalog & { classes?: readonly Class5e[] }) | undefined,
) {
  const rows = catalogs?.classes?.filter(
    (row) => norm(row.name) === 'druid' && norm(row.source) === 'xphb',
  )
  const druid = rows?.length === 1 ? rows[0] : undefined
  if (
    !catalogs ||
    !druid ||
    druid.sourceIdentityConflict ||
    druid._copy ||
    druid.classFeatures?.some((row) => isElementalFuryOptionTarget(rawTarget(row))) ||
    druid.classFeatureRefs?.some(
      (ref) =>
        isElementalFuryOptionTarget(uidTarget(ref.ref)) ||
        isElementalFuryOptionTarget(getClassFeatureIdentity(ref)),
    )
  )
    return undefined
  const root = currentGain(catalogs, druid, ELEMENTAL_FURY_TARGET)
  const entries = root?.entries
  const wrapper = record(entries?.[1])
  const block = record(Array.isArray(wrapper.entries) ? wrapper.entries[0] : undefined)
  if (
    entries?.length !== 2 ||
    typeof entries[0] !== 'string' ||
    wrapper.type !== 'entries' ||
    Object.keys(wrapper).length !== 2 ||
    !Array.isArray(wrapper.entries) ||
    wrapper.entries.length !== 1 ||
    block.type !== 'options' ||
    Object.keys(block).length !== 3 ||
    block.count !== 1 ||
    !Array.isArray(block.entries) ||
    block.entries.length !== optionTargets.size
  )
    return undefined
  const branches = block.entries.map((value) => {
    const row = record(value)
    const uid = row.classFeature
    const target = uidTarget(uid)
    return row.type === 'refClassFeature' &&
      typeof uid === 'string' &&
      !row.sourceIdentityConflict &&
      !row.featureOptionSourceConflict &&
      (row.feature === undefined || getClassFeatureIdentity(record(row.feature)) === target) &&
      exactOptionalDeclarationReference(row, uid, 'classFeature')
      ? target
      : undefined
  })
  if (new Set(branches).size !== optionTargets.size || !branches.every(isElementalFuryOptionTarget))
    return undefined

  const choices = druid.normalizedRules?.choices.filter((row) => row.id === ELEMENTAL_FURY_ID)
  const choice = choices?.length === 1 ? choices[0] : undefined
  if (
    !choice ||
    choice.kind !== 'class-feature' ||
    choice.level !== ELEMENTAL_FURY_LEVEL ||
    choice.owner.type !== 'class' ||
    norm(choice.owner.name) !== 'druid' ||
    norm(choice.owner.source) !== 'xphb' ||
    choice.owner.subclassName !== undefined ||
    choice.owner.subclassSource !== undefined ||
    choice.minimumSelections !== 1 ||
    choice.maximumSelections !== 1 ||
    choice.repeatable ||
    choice.source.kind !== 'class-feature-options' ||
    uidTarget(/^classFeatureRefs:(.+):entries$/.exec(choice.source.field)?.[1]) !==
      ELEMENTAL_FURY_TARGET ||
    choice.options.length !== branches.length ||
    new Set(choice.options.map(optionTarget)).size !== branches.length ||
    !choice.options.every((option) => branches.includes(optionTarget(option)))
  )
    return undefined

  return {
    rootIntro: entries[0],
    option(option: NormalizedChoiceOptionReference) {
      const target = optionTarget(option)
      const feature = target && currentFeature(catalogs, target)
      return feature && Array.isArray(feature.entries) && feature.entries.length > 0
        ? feature
        : undefined
    },
    improvementFor(option: NormalizedChoiceOptionReference) {
      const upgrade = currentGain(catalogs, druid, IMPROVED_ELEMENTAL_FURY_TARGET)?.entries
      const group = record(upgrade?.[1])
      if (
        upgrade?.length !== 2 ||
        upgrade[0] !==
          'The option you chose for Elemental Fury grows more powerful, as detailed below.' ||
        group.type !== 'entries' ||
        Object.keys(group).length !== 2 ||
        !Array.isArray(group.entries) ||
        group.entries.length !== branches.length
      )
        return []
      const children = group.entries.map(record)
      const targets = children.map((row) =>
        row.type === 'entries' &&
        Object.keys(row).length === 3 &&
        typeof row.name === 'string' &&
        Array.isArray(row.entries) &&
        row.entries.length > 0
          ? identity(row.name, ELEMENTAL_FURY_LEVEL)
          : undefined,
      )
      if (new Set(targets).size !== branches.length || !targets.every(isElementalFuryOptionTarget))
        return []
      const selected = children[targets.indexOf(optionTarget(option))]
      return selected ? [upgrade[0], selected] : []
    },
  }
}
