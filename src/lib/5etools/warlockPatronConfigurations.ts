import { formatSpellReference } from '@/lib/calculations/spellIdentity'
import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import type { Class5e, Subclass5e, SubclassFeature } from '@/types/5etools'
import type { CharacterClassChoiceSelection } from '@/types/character'
import type { NormalizedCharacterChoice, NormalizedChoiceOptionReference } from '@/types/classRules'
import { getSubclassFeatureIdentity, isExactSubclassFeatureReference } from './classFeatureIdentity'
import {
  decodeFeatureOptionReference,
  encodeSourceGroupOptionReference,
  getFeatureLiteralChoiceId,
} from './featureOptionIdentity'
import { getFeatureSourceDigest, matchesFeatureEntryDigest } from './featureSourceAudit'
import { getDirectSubclassFeatureReference } from './nativeSubclassFeatureSource'
import { matchesNativeSubclassGain } from './nativeSubclassGain'
import {
  decodeOptionalDeclaration,
  optionalDeclarationObject as record,
} from './optionalClassDeclarationStructure'
import { parseSpellToken } from './spellTokens'

const genieGroup = 'genie-patron-type'
const domainGroup = 'vestige-patron-domain'
const companionGroup = 'vestige-companion-type'

// These declarations supply choice semantics which are absent from the spell schedules.
const genieIntroDigest = 'ef97e5be56173c5b379fe11851703748a8b30d3978b5ca866e3f4aea2fcb050e'
const vestigeChoiceDigests = {
  [domainGroup]: 'e29162fa0338795b72404c8d611a9ff3fdf72630d4563ea708f3a34fbcbfb01a',
  [companionGroup]: 'd37d1bcc37eb157cbf79dd2cb6267b8902e6cd3fbf50efc75d1edbb99e4914bb',
}

function makeRule(
  source: 'PHB' | 'XPHB',
  group: string,
  featureName: string,
  label: string,
  names: readonly string[],
) {
  const genie = group === genieGroup
  const level = source === 'PHB' ? 1 : 3
  const owner = {
    type: 'subclass',
    name: 'Warlock',
    source,
    subclassName: genie ? 'The Genie' : 'Vestige Patron',
    subclassSource: genie ? 'TCE' : 'AU',
  } as const
  const intro = `subclass-feature|${norm(owner.subclassName)}|warlock|${norm(source)}|${genie ? 'genie|tce' : 'vestige|au'}|${level}|${norm(owner.subclassSource)}`
  const featureRef = genie
    ? `${featureName}|Warlock|PHB|Genie|TCE|1|TCE`
    : `${featureName}|Warlock|XPHB|Vestige|AU|3|AU`
  const ref = genie ? intro.slice('subclass-feature|'.length) : featureRef
  const target = `subclass-feature|${norm(ref)}`
  return {
    owner,
    level,
    intro,
    featureTarget: `subclass-feature|${norm(featureRef)}`,
    target,
    ref,
    group,
    label,
    names,
    id: getFeatureLiteralChoiceId(owner, target, group, target, level),
  }
}

const genieTypes = ['Dao', 'Djinni', 'Efreeti', 'Marid']
const rules = [
  ...(['PHB', 'XPHB'] as const).map((source) =>
    makeRule(source, genieGroup, "Genie's Vessel", 'Genie Patron Type', genieTypes),
  ),
  makeRule('XPHB', domainGroup, 'Vestige Spells', 'Vestige Domain', [
    'Life Domain',
    'Light Domain',
    'Trickery Domain',
    'War Domain',
  ]),
  makeRule('XPHB', companionGroup, 'Vestige Companion', 'Vestige Companion Type', [
    'Celestial',
    'Fiend',
    'Undead',
  ]),
]

type PatronRule = (typeof rules)[number]

export const getWarlockPatronConfigurationRule = (id: string) =>
  rules.find((rule) => rule.id === id)
export const isWarlockPatronConfigurationGroup = (group: string) =>
  group === genieGroup || group === domainGroup || group === companionGroup

export const isVestigePatron = (entry: {
  name: string
  source: string
  subclass?: string
  subclassSource?: string
}) =>
  norm(entry.name) === 'warlock' &&
  norm(entry.source) === 'xphb' &&
  norm(entry.subclass) === 'vestige patron' &&
  norm(entry.subclassSource) === 'au'

export function getWarlockPatronConfigurationRules(
  cls: { name?: string; source?: string },
  subclass?: { name?: string; source?: string },
) {
  if (norm(cls.name) !== 'warlock') return []
  return rules.filter(
    ({ owner }) =>
      norm(cls.source) === norm(owner.source) &&
      norm(subclass?.name) === norm(owner.subclassName) &&
      norm(subclass?.source) === norm(owner.subclassSource),
  )
}

export const hasWarlockPatronSpellConfiguration = (entry: {
  name: string
  source: string
  subclass?: string
  subclassSource?: string
}) =>
  getWarlockPatronConfigurationRules(entry, { name: entry.subclass, source: entry.subclassSource })
    .length > 0

function matchesOption(option: NormalizedChoiceOptionReference, rule: PatronRule) {
  const target = decodeFeatureOptionReference(option)
  return (
    option.entityType === 'featureOption' &&
    option.invocationCantrip === undefined &&
    option.minimumClassLevel === undefined &&
    norm(option.source) === norm(rule.owner.subclassSource) &&
    target?.format === 'source-group' &&
    target.group === rule.group &&
    target.parentIdentity === rule.target &&
    rule.names.some((name) => norm(name) === target.literal)
  )
}

export function isValidWarlockPatronConfiguration(selection: CharacterClassChoiceSelection) {
  const rule = getWarlockPatronConfigurationRule(selection.choiceId)
  const option = selection.selected[0]
  return (
    !!rule &&
    selection.kind === 'feature-option' &&
    !selection.favoredEnemy &&
    !selection.proficiencyAtGain &&
    norm(selection.className) === 'warlock' &&
    norm(selection.classSource) === norm(rule.owner.source) &&
    norm(selection.subclassName) === norm(rule.owner.subclassName) &&
    norm(selection.subclassSource) === norm(rule.owner.subclassSource) &&
    selection.classLevel === rule.level &&
    selection.selected.length === 1 &&
    option.slotLevel === rule.level &&
    matchesOption(option, rule)
  )
}

function getCurrentSubclass(rule: PatronRule, classes: readonly Class5e[] | undefined) {
  const owners = classes?.filter(
    (row) => norm(row.name) === 'warlock' && norm(row.source) === norm(rule.owner.source),
  )
  if (owners?.length !== 1) return undefined
  const cls = owners[0]
  const subclasses = cls.subclasses?.filter(
    (subclass) =>
      norm(subclass.name) === norm(rule.owner.subclassName) &&
      norm(subclass.source) === norm(rule.owner.subclassSource),
  )
  return subclasses?.length === 1 ? { cls, subclass: subclasses[0] } : undefined
}

function getConfigurationFeature(cls: Class5e, subclass: Subclass5e, rule: PatronRule) {
  const legacy = rule.owner.source === 'PHB'
  const gain = legacy
    ? 'otherworldly patron|warlock|phb|1|phb'
    : 'warlock subclass|warlock|xphb|3|xphb'
  const copy = record(record(subclass)._copy)
  const copiedGenie =
    rule.group === genieGroup &&
    !legacy &&
    copy.name === 'The Genie' &&
    copy.source === 'TCE' &&
    copy.shortName === 'Genie' &&
    copy.className === 'Warlock' &&
    copy.classSource === 'PHB' &&
    !copy._mod
  if (
    subclass.sourceIdentityConflict ||
    ('_copy' in subclass && !copiedGenie) ||
    typeof subclass.shortName !== 'string' ||
    norm(subclass.shortName) !== (rule.group === genieGroup ? 'genie' : 'vestige') ||
    norm(subclass.className) !== 'warlock' ||
    norm(subclass.classSource) !== norm(rule.owner.source) ||
    !matchesNativeSubclassGain(cls, `class-feature|${gain}`, rule.level)
  )
    return undefined
  const intro = getDirectSubclassFeatureReference(subclass, rule.intro)?.feature
  if (
    !intro ||
    intro.sourceIdentityConflict ||
    intro.featureOptionSourceConflict ||
    intro.isClassFeatureVariant ||
    !Array.isArray(intro.entries) ||
    getSubclassFeatureIdentity(intro) !== rule.intro ||
    (rule.group === genieGroup && getFeatureSourceDigest(intro.entries) !== genieIntroDigest)
  )
    return undefined
  const refs = intro.entries
    .map(record)
    .filter(
      (row) =>
        (typeof row.subclassFeature === 'string' &&
          decodeOptionalDeclaration(row.subclassFeature, 'subclassFeature')?.target ===
            rule.featureTarget) ||
        getSubclassFeatureIdentity(record(row.feature)) === rule.featureTarget,
    )
  const ref = refs[0]
  if (
    refs.length !== 1 ||
    ref.type !== 'refSubclassFeature' ||
    typeof ref.subclassFeature !== 'string' ||
    decodeOptionalDeclaration(ref.subclassFeature, 'subclassFeature')?.target !==
      rule.featureTarget ||
    !isExactSubclassFeatureReference(ref, ref.subclassFeature) ||
    Object.keys(ref).some((key) => key !== 'type' && key !== 'subclassFeature' && key !== 'feature')
  )
    return undefined
  const feature = ref.feature as SubclassFeature | undefined
  const digest =
    rule.group === domainGroup || rule.group === companionGroup
      ? vestigeChoiceDigests[rule.group]
      : undefined
  return feature &&
    getSubclassFeatureIdentity(feature) === rule.featureTarget &&
    !feature.sourceIdentityConflict &&
    !feature.featureOptionSourceConflict &&
    !feature.isClassFeatureVariant &&
    Array.isArray(feature.entries) &&
    feature.entries.length &&
    (!digest || matchesFeatureEntryDigest(feature.entries, digest))
    ? feature
    : undefined
}

function getConfigurationBlocks(subclass: Subclass5e, rule: PatronRule) {
  const blocks = subclass.additionalSpells
  const keys =
    rule.group === genieGroup ? ['s1', 's2', 's3', 's4', 's5', '9'] : ['3', '5', '7', '9']
  if (!Array.isArray(blocks) || blocks.length !== rule.names.length) return undefined
  const schedules = rule.names.map((name) => {
    const matches = blocks.filter(
      (block) => typeof block?.name === 'string' && norm(block.name) === norm(name),
    )
    const block = matches[0]
    const field = rule.group === genieGroup ? 'expanded' : 'prepared'
    const schedule = record(block?.[field])
    const wish = schedule['9']
    if (
      matches.length !== 1 ||
      Object.keys(schedule).length !== keys.length ||
      Object.keys(block).some((key) => key !== 'name' && key !== field) ||
      !keys.every(
        (key) =>
          Array.isArray(schedule[key]) &&
          schedule[key].length &&
          schedule[key].every(
            (value) =>
              typeof value === 'string' &&
              parseSpellToken(value).name &&
              (rule.group === genieGroup ? !/[|#]/.test(value) : /^[^|#]+\|xphb$/i.test(value)),
          ),
      ) ||
      (rule.group === genieGroup &&
        (!Array.isArray(wish) || wish.length !== 1 || norm(wish[0]) !== 'wish'))
    )
      return undefined
    return block
  })
  return schedules.every((block) => block !== undefined) ? schedules : undefined
}

function getConfigurationSource(cls: Class5e, subclass: Subclass5e, rule: PatronRule) {
  const feature = getConfigurationFeature(cls, subclass, rule)
  const blocks = rule.group === companionGroup ? undefined : getConfigurationBlocks(subclass, rule)
  return feature && (rule.group === companionGroup || blocks) ? { feature, blocks } : undefined
}

export function getWarlockPatronConfigurations(
  cls: { name?: string; source?: string },
  subclass: { name?: string; source?: string } | undefined,
  classes: readonly Class5e[] | undefined,
): NormalizedCharacterChoice[] {
  return getWarlockPatronConfigurationRules(cls, subclass).flatMap((rule) => {
    const current = getCurrentSubclass(rule, classes)
    const proof = current && getConfigurationSource(current.cls, current.subclass, rule)
    if (!proof) return []
    return [
      {
        id: rule.id,
        kind: 'feature-option',
        label: rule.label,
        owner: {
          ...rule.owner,
          featureName: rule.group === genieGroup ? rule.owner.subclassName : proof.feature.name,
          featureSource: rule.owner.subclassSource,
        },
        level: rule.level,
        minimumSelections: 1,
        maximumSelections: 1,
        selectionCountByLevel: Array.from({ length: 20 }, (_, index) =>
          Number(index + 1 >= rule.level),
        ),
        options: rule.names.map((name) => ({
          entityType: 'featureOption',
          name,
          source: rule.owner.subclassSource,
          ref: encodeSourceGroupOptionReference(
            { kind: 'subclassFeature', ref: rule.ref },
            rule.group,
            name,
          ),
        })),
        repeatable: false,
        replacement: { cadence: 'never' },
        source: { kind: 'class-feature-options', field: `subclassFeatureRefs:${rule.ref}:entries` },
      },
    ]
  })
}

export function resolveWarlockPatronConfigurationOption(
  option: NormalizedChoiceOptionReference,
  classes: readonly Class5e[] | undefined,
) {
  const rule = rules.find((row) => matchesOption(option, row))
  const current = rule && getCurrentSubclass(rule, classes)
  const proof = current && getConfigurationSource(current.cls, current.subclass, rule)
  if (!rule || !proof || !option.ref) return undefined
  const block = proof.blocks?.find((row) => norm(row?.name) === norm(option.name))
  return {
    name: option.name,
    source: rule.owner.subclassSource,
    ref: option.ref,
    group: rule.group,
    entries: block
      ? Object.entries(block.expanded ?? block.prepared ?? {})
          .sort(([a], [b]) => Number(a.replace(/^s/, '')) - Number(b.replace(/^s/, '')))
          .map(
            ([key, spells]) =>
              `${block.expanded ? 'Spell rank' : 'Warlock level'} ${key.replace(/^s/, '')}: ${spells.map((spell) => `{@spell ${formatSpellReference(spell, block.expanded ? rule.owner.source : undefined)}}`).join(', ')}.`,
          )
      : (proof.feature.entries ?? []),
  }
}

export function getChosenWarlockSpellBlock(
  cls: Class5e,
  subclass: Subclass5e,
  selections: readonly CharacterClassChoiceSelection[] = [],
) {
  const rule = getWarlockPatronConfigurationRules(cls, subclass).find(
    (row) => row.group !== companionGroup,
  )
  if (!rule) return undefined
  const matches = selections.filter((row) => row.choiceId === rule.id)
  const selection = matches.length === 1 ? matches[0] : undefined
  const proof =
    selection && !selection.inactive && isValidWarlockPatronConfiguration(selection)
      ? getConfigurationSource(cls, subclass, rule)
      : undefined
  return {
    level: rule.level,
    block: proof?.blocks?.find((row) => norm(row?.name) === norm(selection?.selected[0].name)),
  }
}
