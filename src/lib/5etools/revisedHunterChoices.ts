import type {
  Class5e,
  ClassFeature,
  Subclass5e,
  SubclassFeature,
  SubclassFeatureReference,
} from '@/types/5etools'
import type {
  ClassChoiceDiagnostic,
  NormalizedCharacterChoice,
  NormalizedChoiceOptionReference,
} from '@/types/classRules'
import { getClassFeatureIdentity, getSubclassFeatureIdentity } from './classFeatureIdentity'
import {
  decodeFeatureOptionReference,
  encodeSourceGroupOptionReference,
  normalizeFeatureOptionPart as norm,
} from './featureOptionIdentity'
import { featureOptionRulesSignature } from './featureRulesSignature'
import {
  decodeOptionalDeclaration,
  exactOptionalDeclarationReference,
  optionalDeclarationObject as record,
} from './optionalClassDeclarationStructure'
import {
  REVISED_HUNTER_GROUP,
  revisedHunterOwner,
  revisedHunterRules,
} from './revisedHunterIdentity'

type Rule = (typeof revisedHunterRules)[number]
interface Catalogs {
  classes?: readonly Class5e[]
  classFeatures: readonly ClassFeature[]
  classFeatureCandidates?: ReadonlyMap<string, readonly ClassFeature[]>
  subclassFeatures: readonly SubclassFeature[]
  subclassFeatureCandidates?: ReadonlyMap<string, readonly SubclassFeature[]>
}

const isRanger = (row: { name?: string; source?: string }) =>
  norm(row.name ?? '') === 'ranger' && norm(row.source ?? '') === 'xphb'
const isHunter = (row: { name?: string; source?: string }) =>
  norm(row.name ?? '') === 'hunter' && norm(row.source ?? '') === 'xphb'

function readOptions(feature: SubclassFeature) {
  const entries = feature.entries
  if (
    entries?.length !== 2 ||
    typeof entries[0] !== 'string' ||
    !entries[0].startsWith('You gain one of the following feature options of your choice.')
  )
    return undefined
  const block = record(entries[1])
  if (
    block.type !== 'entries' ||
    Object.keys(block).length !== 2 ||
    !Array.isArray(block.entries) ||
    block.entries.length !== 2
  )
    return undefined
  const options = block.entries
    .map(record)
    .flatMap((row) =>
      row.type === 'entries' &&
      Object.keys(row).length === 3 &&
      typeof row.name === 'string' &&
      row.name.trim() &&
      Array.isArray(row.entries) &&
      row.entries.length
        ? [{ name: row.name.trim(), entries: row.entries as unknown[] }]
        : [],
    )
  return options.length === 2 && norm(options[0].name) !== norm(options[1].name)
    ? { intro: entries[0], options }
    : undefined
}

function getCurrentGroup(rule: Rule, catalogs?: Catalogs) {
  const classes = catalogs?.classes?.filter(isRanger)
  if (classes?.length !== 1 || classes[0].sourceIdentityConflict) return undefined
  const gains = classes[0].classFeatureRefs?.filter(
    (row) => decodeOptionalDeclaration(row.ref, 'classFeature')?.target === rule.gain,
  )
  const gain = gains?.length === 1 ? gains[0] : undefined
  const visibleGains = catalogs?.classFeatures.filter(
    (feature) => getClassFeatureIdentity(feature) === rule.gain,
  )
  const gainWitnesses = catalogs?.classFeatureCandidates
    ? catalogs.classFeatureCandidates.get(rule.gain)
    : visibleGains
  if (
    !gain ||
    gain.gainSubclassFeature !== true ||
    !exactOptionalDeclarationReference(record(gain), gain.ref, 'classFeature') ||
    !gain.feature ||
    visibleGains?.length !== 1 ||
    gainWitnesses?.length !== 1
  )
    return undefined
  const gainSignature = featureOptionRulesSignature(gain.feature.entries ?? [])
  if (
    [gain.feature, visibleGains[0], gainWitnesses[0]].some(
      (row) =>
        row.sourceIdentityConflict ||
        row.isClassFeatureVariant ||
        getClassFeatureIdentity(row) !== rule.gain ||
        featureOptionRulesSignature(row.entries ?? []) !== gainSignature,
    )
  )
    return undefined
  const subclasses = classes[0].subclasses?.filter(isHunter)
  if (
    subclasses?.length !== 1 ||
    subclasses[0].sourceIdentityConflict ||
    norm(subclasses[0].className) !== 'ranger' ||
    norm(subclasses[0].classSource ?? '') !== 'xphb'
  )
    return undefined
  const subclass = subclasses[0]
  const current = (target: string) => {
    const visible = catalogs?.subclassFeatures.filter(
      (feature) => getSubclassFeatureIdentity(feature) === target,
    )
    const witnesses = catalogs?.subclassFeatureCandidates?.get(target)
    const signature = visible?.[0]?.entries && featureOptionRulesSignature(visible[0].entries)
    return visible?.length === 1 &&
      signature &&
      !visible[0].isClassFeatureVariant &&
      !visible[0].sourceIdentityConflict &&
      !visible[0].featureOptionSourceConflict &&
      (!catalogs?.subclassFeatureCandidates ||
        (witnesses?.length &&
          witnesses.every(
            (row) =>
              !row.isClassFeatureVariant &&
              !row.sourceIdentityConflict &&
              !row.featureOptionSourceConflict &&
              getSubclassFeatureIdentity(row) === target &&
              row.entries &&
              featureOptionRulesSignature(row.entries) === signature,
          )))
      ? visible[0]
      : undefined
  }
  const roots = subclass.subclassFeatureRefs?.filter(
    (row) => decodeOptionalDeclaration(row.ref, 'subclassFeature')?.target === rule.root,
  )
  const root = roots?.length === 1 ? roots[0] : undefined
  const rootFeature = current(rule.root)
  const attached = root?.feature
  if (
    !root ||
    !attached ||
    !rootFeature ||
    root.sourceIdentityConflict ||
    attached.sourceIdentityConflict ||
    attached.isClassFeatureVariant ||
    !exactOptionalDeclarationReference(record(root), root.ref, 'subclassFeature') ||
    getSubclassFeatureIdentity(attached) !== rule.root
  )
    return undefined

  let declared: SubclassFeatureReference['feature'] = attached
  if (rule.root !== rule.target) {
    const children = (feature: SubclassFeature) =>
      (feature.entries ?? [])
        .map(record)
        .filter(
          (row) =>
            row.type === 'refSubclassFeature' &&
            typeof row.subclassFeature === 'string' &&
            decodeOptionalDeclaration(row.subclassFeature, 'subclassFeature')?.target ===
              rule.target,
        )
    const linked = children(attached)
    const live = children(rootFeature)
    if (
      linked.length !== 1 ||
      live.length !== 1 ||
      [linked[0], live[0]].some(
        (row) =>
          row.sourceIdentityConflict ||
          row.isClassFeatureVariant ||
          !exactOptionalDeclarationReference(
            record(row),
            String(row.subclassFeature),
            'subclassFeature',
          ),
      ) ||
      subclass.subclassFeatureRefs?.some(
        (row) => decodeOptionalDeclaration(row.ref, 'subclassFeature')?.target === rule.target,
      )
    )
      return undefined
    declared = linked[0].feature as SubclassFeatureReference['feature']
  }
  const feature = rule.root === rule.target ? rootFeature : current(rule.target)
  if (
    !feature ||
    !declared ||
    declared.isClassFeatureVariant ||
    declared.sourceIdentityConflict ||
    declared.featureOptionSourceConflict ||
    getSubclassFeatureIdentity(declared) !== rule.target ||
    !declared.entries ||
    featureOptionRulesSignature(declared.entries) !==
      featureOptionRulesSignature(feature.entries ?? [])
  )
    return undefined
  return readOptions(feature)
}

export function getRevisedHunterSetup(
  classData: { name?: string; source?: string },
  subclass: Partial<Pick<Subclass5e, 'name' | 'source'>> | undefined,
  catalogs?: Catalogs,
) {
  const choices: NormalizedCharacterChoice[] = []
  const diagnostics: ClassChoiceDiagnostic[] = []
  if (!isRanger(classData) || !subclass || !isHunter(subclass)) return { choices, diagnostics }
  for (const rule of revisedHunterRules) {
    const group = getCurrentGroup(rule, catalogs)
    if (!group) {
      diagnostics.push({
        code: 'unverified-required-choice',
        className: revisedHunterOwner.name,
        classSource: revisedHunterOwner.source,
        subclassName: revisedHunterOwner.subclassName,
        subclassSource: revisedHunterOwner.subclassSource,
        featureName: rule.name,
        level: rule.level,
        message: `Restore the exact ${rule.name} source to verify its initial choice.`,
      })
      continue
    }
    choices.push({
      id: rule.id,
      label: rule.name,
      kind: 'feature-option',
      owner: { ...revisedHunterOwner, featureName: rule.name, featureSource: 'XPHB' },
      level: rule.level,
      minimumSelections: 1,
      maximumSelections: 1,
      selectionCountByLevel: Array.from({ length: 20 }, (_, index) =>
        Number(index + 1 >= rule.level),
      ),
      options: group.options.map(({ name }) => ({
        entityType: 'featureOption',
        name,
        source: 'XPHB',
        ref: encodeSourceGroupOptionReference(
          { kind: 'subclassFeature', ref: rule.ref },
          REVISED_HUNTER_GROUP,
          name,
        ),
      })),
      repeatable: false,
      replacement: { cadence: 'never' },
      source: {
        kind: 'class-feature-options',
        field: `subclassFeatureRefs:${rule.ref}:entries.hunter-initial`,
      },
    })
  }
  return { choices, diagnostics }
}

export function resolveRevisedHunterOption(
  option: NormalizedChoiceOptionReference,
  catalogs?: Catalogs,
) {
  const target = decodeFeatureOptionReference(option)
  if (
    target?.format !== 'source-group' ||
    target.kind !== 'subclassFeature' ||
    target.group !== REVISED_HUNTER_GROUP ||
    norm(option.source ?? '') !== 'xphb'
  )
    return undefined
  const rule = revisedHunterRules.find((row) => row.target === target.parentIdentity)
  const group = rule && getCurrentGroup(rule, catalogs)
  const current = group?.options.find((row) => norm(row.name) === target.literal)
  return current && option.ref
    ? { ...current, ref: option.ref, source: 'XPHB', group: REVISED_HUNTER_GROUP }
    : undefined
}
