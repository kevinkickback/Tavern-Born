import { formatSpellReference } from '@/lib/calculations/spellIdentity'
import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import type { Class5e } from '@/types/5etools'
import type { CharacterClassChoiceSelection } from '@/types/character'
import type { NormalizedCharacterChoice, NormalizedChoiceOptionReference } from '@/types/classRules'
import {
  decodeFeatureOptionReference,
  encodeSourceGroupOptionReference,
  getFeatureLiteralChoiceId,
} from './featureOptionIdentity'
import { divineSoul, getCurrentDivineMagic } from './legacySorcererSubclassRules'

const group = 'divine-soul-affinity'
const affinities = ['Good', 'Evil', 'Law', 'Chaos', 'Neutrality']
const rules = (['PHB', 'XPHB'] as const).map((source) => {
  const level = source === 'PHB' ? 1 : 3
  const owner = {
    type: 'subclass',
    name: 'Sorcerer',
    source,
    subclassName: divineSoul.name,
    subclassSource: divineSoul.source,
  } as const
  const ref = `${divineSoul.name}|Sorcerer|${source}|${divineSoul.shortName}|${divineSoul.source}|${level}|${divineSoul.source}`
  const target = `subclass-feature|${norm(ref)}`
  return {
    owner,
    ref,
    target,
    level,
    id: getFeatureLiteralChoiceId(owner, target, group, target, level),
  }
})
type DivineSoulRule = (typeof rules)[number]

export const getDivineSoulConfigurationRule = (id: string) => rules.find((rule) => rule.id === id)
export const isDivineSoulConfigurationGroup = (value: string) => value === group

export function getDivineSoulOwnerRule(
  cls: { name?: string; source?: string },
  subclass?: { name?: string; source?: string },
) {
  if (
    norm(cls.name) !== 'sorcerer' ||
    norm(subclass?.name) !== norm(divineSoul.name) ||
    norm(subclass?.source) !== norm(divineSoul.source)
  )
    return undefined
  return rules.find(({ owner }) => norm(cls.source) === norm(owner.source))
}

function matchesOption(option: NormalizedChoiceOptionReference, rule: DivineSoulRule) {
  const target = decodeFeatureOptionReference(option)
  return (
    option.entityType === 'featureOption' &&
    option.invocationCantrip === undefined &&
    option.minimumClassLevel === undefined &&
    norm(option.source) === norm(divineSoul.source) &&
    target?.format === 'source-group' &&
    target.group === group &&
    target.parentIdentity === rule.target &&
    affinities.some((affinity) => norm(affinity) === target.literal)
  )
}

export function isValidDivineSoulSelection(selection: CharacterClassChoiceSelection) {
  const rule = getDivineSoulConfigurationRule(selection.choiceId)
  const option = selection.selected[0]
  return (
    !!rule &&
    selection.kind === 'feature-option' &&
    !selection.favoredEnemy &&
    !selection.proficiencyAtGain &&
    norm(selection.className) === 'sorcerer' &&
    norm(selection.classSource) === norm(rule.owner.source) &&
    norm(selection.subclassName) === norm(divineSoul.name) &&
    norm(selection.subclassSource) === norm(divineSoul.source) &&
    selection.classLevel === rule.level &&
    selection.selected.length === 1 &&
    option.slotLevel === rule.level &&
    matchesOption(option, rule)
  )
}

function getCurrentSetup(rule: DivineSoulRule, classes: readonly Class5e[] | undefined) {
  const matches = classes?.filter(
    (cls) => norm(cls.name) === 'sorcerer' && norm(cls.source) === norm(rule.owner.source),
  )
  if (matches?.length !== 1) return undefined
  const [cls] = matches
  const subclasses = cls.subclasses?.filter(
    (subclass) => getDivineSoulOwnerRule(cls, subclass) === rule,
  )
  const source = subclasses?.length === 1 ? getCurrentDivineMagic(cls, subclasses[0]) : undefined
  return source?.rules.blocks
}

export function getDivineSoulConfiguration(
  cls: { name?: string; source?: string },
  subclass: { name?: string; source?: string } | undefined,
  classes: readonly Class5e[] | undefined,
): NormalizedCharacterChoice | undefined {
  const rule = getDivineSoulOwnerRule(cls, subclass)
  const blocks = rule && getCurrentSetup(rule, classes)
  if (!rule || !blocks) return undefined
  return {
    id: rule.id,
    kind: 'feature-option',
    label: 'Divine Soul Affinity',
    owner: { ...rule.owner, featureName: divineSoul.name, featureSource: divineSoul.source },
    level: rule.level,
    minimumSelections: 1,
    maximumSelections: 1,
    selectionCountByLevel: Array.from({ length: 20 }, (_, index) =>
      Number(index + 1 >= rule.level),
    ),
    options: affinities.map((name) => ({
      entityType: 'featureOption',
      name,
      source: divineSoul.source,
      ref: encodeSourceGroupOptionReference(
        { kind: 'subclassFeature', ref: rule.ref },
        group,
        name,
      ),
    })),
    repeatable: false,
    replacement: { cadence: 'never' },
    source: { kind: 'class-feature-options', field: `subclassFeatureRefs:${rule.ref}:entries` },
  }
}

export function resolveDivineSoulConfigurationOption(
  option: NormalizedChoiceOptionReference,
  classes: readonly Class5e[] | undefined,
) {
  const rule = rules.find((row) => matchesOption(option, row))
  if (!rule || !option.ref) return undefined
  const block = getCurrentSetup(rule, classes)?.find((row) => norm(row.name) === norm(option.name))
  const spell = block?.known?.['1']?.[0]
  return spell
    ? {
        name: option.name,
        source: divineSoul.source,
        ref: option.ref,
        group,
        entries: [`Bonus spell: {@spell ${formatSpellReference(spell, rule.owner.source)}}.`],
      }
    : undefined
}

export function getChosenDivineSoulSpell(
  source: ReturnType<typeof getCurrentDivineMagic>,
  classSource: string,
  selections: readonly CharacterClassChoiceSelection[] = [],
) {
  if (!source) return undefined
  const rule = rules.find(({ owner }) => norm(owner.source) === norm(classSource))
  const matches = selections.filter((row) => row.choiceId === rule?.id)
  const selection = matches[0]
  if (matches.length !== 1 || selection.inactive || !isValidDivineSoulSelection(selection))
    return undefined
  const affinity = selection.selected[0].name
  return source.rules.blocks?.find((row) => norm(row.name) === norm(affinity))?.known?.['1']?.[0]
}
