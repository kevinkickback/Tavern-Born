import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import type { Class5e, Subclass5e, SubclassFeature } from '@/types/5etools'
import type {
  ClassChoiceDiagnostic,
  NormalizedCharacterChoice,
  NormalizedChoiceOptionReference,
} from '@/types/classRules'
import {
  getBarbarianPathChoiceGroup,
  WILD_HEART_ASPECT,
  ZEALOT_DIVINE_FURY,
} from './barbarianPathChoiceIdentity'
import { getSubclassFeatureIdentity } from './classFeatureIdentity'
import { findClassReference } from './classReference'
import {
  decodeFeatureOptionReference,
  encodeSourceGroupOptionReference,
} from './featureOptionIdentity'
import { getFeatureSourceDigest } from './featureSourceAudit'
import { getDirectSubclassFeatureReference } from './nativeSubclassFeatureSource'
import { matchesNativeSubclassGain } from './nativeSubclassGain'
import {
  exactOptionalDeclarationReference,
  optionalDeclarationObject as record,
} from './optionalClassDeclarationStructure'

interface PathCatalog {
  classes?: readonly Class5e[]
  subclassFeatures: readonly SubclassFeature[]
  subclassFeatureCandidates?: ReadonlyMap<string, readonly SubclassFeature[]>
}

const zealotIntro = 'subclass-feature|path of the zealot|barbarian|phb|zealot|xge|3|xge'
export const isBarbarianPathChoiceSource = (target?: string) =>
  target === WILD_HEART_ASPECT.target ||
  target === ZEALOT_DIVINE_FURY.target ||
  target === zealotIntro

function exact(feature: SubclassFeature | undefined, target: string, body: string) {
  return (
    !!feature &&
    !('_copy' in feature) &&
    !feature.sourceIdentityConflict &&
    !feature.featureOptionSourceConflict &&
    !feature.isClassFeatureVariant &&
    getSubclassFeatureIdentity(feature) === target &&
    getFeatureSourceDigest(feature.entries ?? []) === body
  )
}

function currentOptions(rule: typeof WILD_HEART_ASPECT, catalog?: PathCatalog) {
  const classes = catalog?.classes?.filter((row) => findClassReference(rule.owner, [row]))
  if (classes?.length !== 1) return []
  const cls = classes[0]
  const wild = rule === WILD_HEART_ASPECT
  const gain = wild
    ? 'class-feature|barbarian subclass|barbarian|xphb|3|xphb'
    : 'class-feature|primal path|barbarian|phb|3|phb'
  if (
    !matchesNativeSubclassGain(cls, gain, 3) ||
    (wild &&
      !matchesNativeSubclassGain(
        cls,
        'class-feature|subclass feature|barbarian|xphb|6|xphb',
        6,
        'at-level',
      ))
  )
    return []

  const subclasses = cls.subclasses?.filter((row) =>
    findClassReference(
      {
        name: rule.owner.subclassName,
        source: rule.owner.subclassSource,
      },
      [row],
    ),
  )
  const subclass = subclasses?.[0]
  if (
    subclasses?.length !== 1 ||
    !subclass ||
    subclass._copy ||
    subclass.sourceIdentityConflict ||
    norm(subclass.className) !== 'barbarian' ||
    norm(subclass.classSource) !== norm(rule.owner.source) ||
    norm(subclass.shortName) !== (wild ? 'wild heart' : 'zealot')
  )
    return []

  let attached = getDirectSubclassFeatureReference(subclass, rule.target)?.feature
  if (!wild) {
    const intro = getDirectSubclassFeatureReference(subclass, zealotIntro)
    if (
      !intro ||
      intro.ref !== subclass.introFeatureRef ||
      !exact(
        intro.feature,
        zealotIntro,
        '6871af3413a4434e23bcca106cbb07e6b9271ff58a806ac1dab6c7958d2eddd3',
      )
    )
      return []
    const refs = (intro.feature?.entries ?? [])
      .map(record)
      .filter(
        (row) =>
          row.type === 'refSubclassFeature' &&
          getSubclassFeatureIdentity(record(row.feature)) === rule.target,
      )
    const ref = refs[0]
    if (
      refs.length !== 1 ||
      typeof ref.subclassFeature !== 'string' ||
      !exactOptionalDeclarationReference(ref, ref.subclassFeature, 'subclassFeature')
    )
      return []
    attached = ref.feature as SubclassFeature
  }
  const body = wild
    ? 'ce8e7d75b8664866be54fe7b44336ad0684e096e9739a61db18a5e337a98e1bd'
    : '54fb692e3ebdcbe5ee610441f93b8680229b310f45d51e3b071e9244e69572dd'
  const candidates =
    catalog?.subclassFeatureCandidates?.get(rule.target) ??
    catalog?.subclassFeatures.filter((row) => getSubclassFeatureIdentity(row) === rule.target)
  if (
    !attached ||
    !exact(attached, rule.target, body) ||
    !candidates?.length ||
    !candidates.every((row) => exact(row, rule.target, body))
  )
    return []
  const makeOption = (name: string, entries: unknown[]) => ({
    name,
    entries,
    source: rule.owner.subclassSource,
    group: rule.group,
  })
  if (!wild) return rule.options.map((name) => makeOption(name, attached.entries ?? []))
  return (attached.entries ?? [])
    .slice(1)
    .map(record)
    .flatMap((row) =>
      typeof row.name === 'string' && Array.isArray(row.entries)
        ? [makeOption(row.name, row.entries)]
        : [],
    )
}

export const getCurrentWildHeartAspects = (catalog?: PathCatalog) =>
  currentOptions(WILD_HEART_ASPECT, catalog)

export function getBarbarianPathSetup(
  classData: Pick<Partial<Class5e>, 'name' | 'source'>,
  subclass: Pick<Partial<Subclass5e>, 'name' | 'source'> | undefined,
  catalog?: PathCatalog,
): { choices: NormalizedCharacterChoice[]; diagnostics: ClassChoiceDiagnostic[] } {
  const choices: NormalizedCharacterChoice[] = []
  const diagnostics: ClassChoiceDiagnostic[] = []
  const rule = [WILD_HEART_ASPECT, ZEALOT_DIVINE_FURY].find(
    ({ owner }) =>
      findClassReference(owner, [classData]) &&
      findClassReference(
        {
          name: owner.subclassName,
          source: owner.subclassSource,
        },
        [subclass],
      ),
  )
  if (!rule) return { choices, diagnostics }
  const { owner, feature, level } = rule
  const options = currentOptions(rule, catalog)
  if (options.length !== rule.options.length) {
    diagnostics.push({
      code: 'unverified-required-choice',
      className: owner.name,
      classSource: owner.source,
      subclassName: owner.subclassName,
      subclassSource: owner.subclassSource,
      level,
      featureName: feature,
      message: `Restore the exact ${feature} source to choose its initial benefit.`,
    })
  } else {
    choices.push({
      id: rule.id,
      label: feature,
      kind: 'feature-option',
      owner: { ...owner, featureName: feature, featureSource: owner.subclassSource },
      level,
      minimumSelections: 1,
      maximumSelections: 1,
      selectionCountByLevel: Array.from({ length: 20 }, (_, index) => Number(index + 1 >= level)),
      options: options.map(({ name, source }) => ({
        entityType: 'featureOption',
        name,
        source,
        ref: encodeSourceGroupOptionReference(
          { kind: 'subclassFeature', ref: rule.ref },
          rule.group,
          name,
        ),
      })),
      repeatable: false,
      replacement: { cadence: 'never' },
      source: { kind: 'class-feature-options', field: `subclassFeatureRefs:${rule.ref}:entries` },
    })
  }
  return { choices, diagnostics }
}

export function resolveBarbarianPathOption(
  option: NormalizedChoiceOptionReference,
  catalog: PathCatalog,
) {
  const target = decodeFeatureOptionReference(option)
  if (!option.ref || target?.format !== 'source-group') return undefined
  const rule = getBarbarianPathChoiceGroup(target.group)
  if (
    !rule ||
    norm(option.source) !== norm(rule.owner.subclassSource) ||
    target.parentIdentity !== rule.target
  )
    return undefined
  const selected = currentOptions(rule, catalog).find((row) => norm(row.name) === target.literal)
  return selected ? { ...selected, ref: option.ref } : undefined
}
