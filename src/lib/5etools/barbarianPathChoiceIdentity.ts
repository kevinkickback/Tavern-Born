import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import type { CharacterClassChoiceSelection } from '@/types/character'
import { decodeFeatureOptionReference, getFeatureLiteralChoiceId } from './featureOptionIdentity'

export const GIANT_POWER_TARGET = 'subclass-feature|giant power|barbarian|phb|giant|bgg|3|bgg'

function definePathChoice(
  source: string,
  subclassName: string,
  subclassSource: string,
  feature: string,
  ref: string,
  group: string,
  options: readonly string[],
  level: number,
) {
  const owner = {
    type: 'subclass' as const,
    name: 'Barbarian',
    source,
    subclassName,
    subclassSource,
  }
  const target = `subclass-feature|${norm(ref)}`
  return {
    owner,
    feature,
    ref,
    target,
    group,
    options,
    level,
    id: getFeatureLiteralChoiceId(owner, target, group, target, level),
  }
}

export const WILD_HEART_ASPECT = definePathChoice(
  'XPHB',
  'Path of the Wild Heart',
  'XPHB',
  'Aspect of the Wilds',
  'Aspect of the Wilds|Barbarian|XPHB|Wild Heart|XPHB|6|XPHB',
  'wild-heart-aspect',
  ['Owl', 'Panther', 'Salmon'],
  6,
)
export const ZEALOT_DIVINE_FURY = definePathChoice(
  'PHB',
  'Path of the Zealot',
  'XGE',
  'Divine Fury',
  'Divine Fury|Barbarian|PHB|Zealot|XGE|3|XGE',
  'zealot-divine-fury',
  ['Necrotic', 'Radiant'],
  3,
)
const pathChoices = [WILD_HEART_ASPECT, ZEALOT_DIVINE_FURY]
export const getBarbarianPathChoice = (id: string) => pathChoices.find((rule) => rule.id === id)
export const getBarbarianPathChoiceGroup = (group: string) =>
  pathChoices.find((rule) => rule.group === group)

export function getSavedBarbarianPathOption(selection: CharacterClassChoiceSelection | undefined) {
  if (!selection) return undefined
  const rule = getBarbarianPathChoice(selection.choiceId)
  if (
    !rule ||
    selection.kind !== 'feature-option' ||
    selection.classLevel !== rule.level ||
    selection.selected.length !== 1 ||
    selection.favoredEnemy ||
    selection.proficiencyAtGain ||
    norm(selection.className) !== 'barbarian' ||
    norm(selection.classSource) !== norm(rule.owner.source) ||
    norm(selection.subclassName) !== norm(rule.owner.subclassName) ||
    norm(selection.subclassSource) !== norm(rule.owner.subclassSource)
  )
    return undefined
  const option = selection.selected[0]
  const target = decodeFeatureOptionReference(option)
  return option.entityType === 'featureOption' &&
    norm(option.source) === norm(rule.owner.subclassSource) &&
    option.slotLevel === rule.level &&
    target?.format === 'source-group' &&
    target.kind === 'subclassFeature' &&
    target.group === rule.group &&
    target.parentIdentity === rule.target
    ? rule.options.find((name) => norm(name) === target.literal)
    : undefined
}
