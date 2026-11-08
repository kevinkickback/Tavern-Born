import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import type { Class5e, SubclassFeature } from '@/types/5etools'
import type { CharacterClassChoiceSelection } from '@/types/character'
import type { NormalizedCharacterChoice, NormalizedChoiceOptionReference } from '@/types/classRules'
import { decodeSubclassFeatureReference, getSubclassFeatureIdentity } from './classFeatureIdentity'
import {
  decodeFeatureLiteralChoiceId,
  decodeFeatureOptionReference,
  encodeSourceGroupOptionReference,
  getFeatureLiteralChoiceId,
} from './featureOptionIdentity'
import { getNativeSubclassIntroFeature } from './nativeSubclassFeatureSource'
import { getCurrentNativeSubclassGain } from './nativeSubclassGain'
import { optionalDeclarationObject as record } from './optionalClassDeclarationStructure'

export const ARMOR_MODEL_GROUP = 'artificer-armor-model'
const featureName = 'Armor Model'
const printings = ['TCE', 'EFA']

function choiceRule(source: string, level: number) {
  const owner = {
    type: 'subclass',
    name: 'Artificer',
    source,
    subclassName: 'Armorer',
    subclassSource: source,
    featureName,
    featureSource: source,
  } as const
  const ref = `${featureName}|Artificer|${source}|Armorer|${source}|${level}|${source}`
  const target = getSubclassFeatureIdentity(decodeSubclassFeatureReference(ref))!
  return {
    owner,
    ref,
    target,
    level,
    id: getFeatureLiteralChoiceId(owner, target, ARMOR_MODEL_GROUP, target, level),
  }
}

export function getArmorModelRule(id: string) {
  const decoded = decodeFeatureLiteralChoiceId(id)
  const source = printings.find((printing) => norm(printing) === decoded?.owner[1])
  if (!source || decoded?.group !== ARMOR_MODEL_GROUP) return undefined
  const rule = choiceRule(source, decoded.level)
  return rule.id === id ? rule : undefined
}

function matchesOption(
  option: NormalizedChoiceOptionReference,
  rule: ReturnType<typeof choiceRule>,
) {
  const ref = decodeFeatureOptionReference(option)
  return (
    option.entityType === 'featureOption' &&
    option.minimumClassLevel === undefined &&
    option.invocationCantrip === undefined &&
    norm(option.source) === norm(rule.owner.source) &&
    ref?.format === 'source-group' &&
    ref.kind === 'subclassFeature' &&
    ref.group === ARMOR_MODEL_GROUP &&
    ref.parentIdentity === rule.target &&
    !!norm(option.name) &&
    norm(option.name) === ref.literal
  )
}

export function isValidArmorModelSelection(selection: CharacterClassChoiceSelection) {
  const rule = getArmorModelRule(selection.choiceId)
  const [option] = selection.selected
  return (
    !!rule &&
    selection.kind === 'feature-option' &&
    !selection.favoredEnemy &&
    !selection.proficiencyAtGain &&
    selection.classLevel === rule.level &&
    selection.selected.length === 1 &&
    option.slotLevel === rule.level &&
    matchesOption(option, rule) &&
    norm(selection.className) === norm(rule.owner.name) &&
    norm(selection.classSource) === norm(rule.owner.source) &&
    norm(selection.subclassName) === norm(rule.owner.subclassName) &&
    norm(selection.subclassSource) === norm(rule.owner.subclassSource)
  )
}

function getModelFeature(value: unknown, rule: ReturnType<typeof choiceRule>) {
  const row = record(value)
  if (
    row.type !== 'refSubclassFeature' ||
    typeof row.subclassFeature !== 'string' ||
    row.sourceIdentityConflict
  )
    return undefined
  const ref = decodeSubclassFeatureReference(row.subclassFeature)
  const target = getSubclassFeatureIdentity(ref)
  if (
    !target ||
    target === rule.target ||
    norm(ref.className) !== 'artificer' ||
    norm(ref.subclassShortName) !== 'armorer' ||
    ref.level !== rule.level ||
    [ref.source, ref.classSource, ref.subclassSource].some(
      (source) => norm(source) !== norm(rule.owner.source),
    )
  )
    return undefined
  const feature = row.feature as SubclassFeature | undefined
  return feature &&
    !feature.sourceIdentityConflict &&
    !feature.featureOptionSourceConflict &&
    !feature.isClassFeatureVariant &&
    !('_copy' in feature) &&
    getSubclassFeatureIdentity(feature) === target &&
    Array.isArray(feature.entries)
    ? { name: feature.name, entries: feature.entries, uid: ref.ref }
    : undefined
}

function readSetup(source: string, classes: readonly Class5e[] | undefined) {
  const parents = classes?.filter((cls) => cls.name === 'Artificer' && cls.source === source)
  if (parents?.length !== 1) return undefined
  const [cls] = parents
  const roots = cls.subclasses?.filter(
    (row) =>
      row.name === 'Armorer' &&
      row.source === source &&
      row.className === cls.name &&
      row.classSource === source &&
      row.shortName === 'Armorer',
  )
  if (roots?.length !== 1 || cls.sourceIdentityConflict || '_copy' in cls) return undefined
  const [subclass] = roots
  const level = getCurrentNativeSubclassGain(cls)?.level
  if (!level || subclass.sourceIdentityConflict || '_copy' in subclass) return undefined
  const rule = choiceRule(source, level)
  const feature = getNativeSubclassIntroFeature(cls, subclass, level, featureName)
  if (feature?.target !== rule.target || !feature.entries) return undefined
  const clauses = feature.entries.filter(
    (row): row is string =>
      typeof row === 'string' && row.includes('choose one of the following armor models: '),
  )
  const list =
    clauses.length === 1 &&
    /choose one of the following armor models: (.+)\. The model you choose gives you special benefits while you wear it\.$/.exec(
      clauses[0],
    )?.[1]
  if (!list) return undefined
  const entries = feature.entries.map(record).filter((row) => row.type)
  const models =
    source === 'EFA'
      ? entries.map((row) => {
          const model = getModelFeature(row, rule)
          return model && { ...model, label: `{@subclassFeature ${model.uid}}` }
        })
      : (entries.length === 1 && entries[0].type === 'entries' && Array.isArray(entries[0].entries)
          ? entries[0].entries
          : []
        ).map((value: unknown) => {
          const section = record(value)
          if (
            section.type !== 'entries' ||
            typeof section.name !== 'string' ||
            !Array.isArray(section.entries)
          )
            return undefined
          const body = section.entries.filter((line): line is string => typeof line === 'string')
          const lists = section.entries.map(record).filter((row) => row.type === 'list')
          const items =
            lists.length === 1 && Array.isArray(lists[0].items)
              ? lists[0].items.map((row) => getModelFeature(row, rule))
              : []
          if (!body.length || !items.length || items.some((row) => !row)) return undefined
          return {
            name: section.name,
            label: section.name,
            entries: [
              ...body,
              ...items.flatMap((row) =>
                row ? [{ type: 'entries', name: row.name, entries: row.entries }] : [],
              ),
            ],
          }
        })
  const rows = models.filter((row) => row !== undefined)
  const labels = rows.map((row) => row.label)
  const prose =
    labels.length > 2
      ? `${labels.slice(0, -1).join(', ')}, or ${labels[labels.length - 1]}`
      : labels.join(' or ')
  if (
    rows.length < 2 ||
    rows.length !== models.length ||
    new Set(rows.map(({ name }) => norm(name))).size !== rows.length ||
    prose !== list
  )
    return undefined
  return { rule, rows }
}

export function getArmorModelConfiguration(
  cls: { name?: string; source?: string },
  subclass: { name?: string; source?: string } | undefined,
  classes: readonly Class5e[] | undefined,
): NormalizedCharacterChoice | undefined {
  if (
    cls.name !== 'Artificer' ||
    !cls.source ||
    !printings.includes(cls.source) ||
    subclass?.name !== 'Armorer' ||
    subclass.source !== cls.source
  )
    return undefined
  const setup = readSetup(cls.source, classes)
  if (!setup) return undefined
  const { rule, rows } = setup
  return {
    id: rule.id,
    kind: 'feature-option',
    label: featureName,
    owner: rule.owner,
    level: rule.level,
    minimumSelections: 1,
    maximumSelections: 1,
    selectionCountByLevel: Array.from({ length: 20 }, (_, index) =>
      Number(index + 1 >= rule.level),
    ),
    options: rows.map(({ name }) => ({
      entityType: 'featureOption',
      name,
      source: rule.owner.source,
      ref: encodeSourceGroupOptionReference(
        { kind: 'subclassFeature', ref: rule.ref },
        ARMOR_MODEL_GROUP,
        name,
      ),
    })),
    repeatable: false,
    replacement: { cadence: 'never' },
    source: { kind: 'class-feature-options', field: `subclassFeatureRefs:${rule.ref}:entries` },
  }
}

export function resolveArmorModelOption(
  option: NormalizedChoiceOptionReference,
  classes: readonly Class5e[] | undefined,
) {
  const source = printings.find((printing) => norm(printing) === norm(option.source))
  const setup = source && readSetup(source, classes)
  if (!option.ref || !setup || !matchesOption(option, setup.rule)) return undefined
  const row = setup.rows.find(({ name }) => norm(name) === norm(option.name))
  return (
    row && {
      name: row.name,
      entries: row.entries,
      ref: option.ref,
      source,
      group: ARMOR_MODEL_GROUP,
    }
  )
}

export function getChosenArmorModel(
  source: string,
  classes: readonly Class5e[] | undefined,
  selections: readonly CharacterClassChoiceSelection[] = [],
) {
  if (!printings.includes(source)) return undefined
  const setup = readSetup(source, classes)
  if (!setup) return undefined
  const selectionsForGain = selections.filter((row) => row.choiceId === setup.rule.id)
  const [saved] = selectionsForGain
  const model =
    selectionsForGain.length === 1 && !saved.inactive && isValidArmorModelSelection(saved)
      ? setup.rows.find(({ name }) => norm(name) === norm(saved.selected[0].name))
      : undefined
  return { name: model?.name, alternatives: setup.rows.map(({ name }) => norm(name)) }
}
