import type { CharacterClassChoiceSelection } from '@/types/character'
import { decodeFeatureOptionReference, getFeatureLiteralChoiceId } from './featureOptionIdentity'

export const revisedHunterOwner = {
  type: 'subclass',
  name: 'Ranger',
  source: 'XPHB',
  subclassName: 'Hunter',
  subclassSource: 'XPHB',
} as const

export const REVISED_HUNTER_GROUP = 'hunter-initial-option'

export const revisedHunterRules = (
  [
    ["Hunter's Prey", 3, 'Hunter', 'Ranger Subclass'],
    ['Defensive Tactics', 7, 'Defensive Tactics', 'Subclass Feature'],
  ] as const
).map(([name, level, rootName, gainName]) => {
  const suffix = `|Ranger|XPHB|Hunter|XPHB|${level}|XPHB`
  const ref = name + suffix
  const target = `subclass-feature|${ref.toLowerCase()}`
  return {
    name,
    level,
    ref,
    target,
    root: `subclass-feature|${(rootName + suffix).toLowerCase()}`,
    gain: `class-feature|${gainName.toLowerCase()}|ranger|xphb|${level}|xphb`,
    id: getFeatureLiteralChoiceId(revisedHunterOwner, target, REVISED_HUNTER_GROUP, target, level),
  }
})

export const getRevisedHunterRule = (id: string) => revisedHunterRules.find((row) => row.id === id)

export function isValidRevisedHunterSelection(selection: CharacterClassChoiceSelection): boolean {
  const rule = getRevisedHunterRule(selection.choiceId)
  const option = selection.selected[0]
  const target = option && decodeFeatureOptionReference(option)
  const norm = (value?: string) => value?.trim().toLowerCase()
  return (
    !!rule &&
    selection.kind === 'feature-option' &&
    !selection.favoredEnemy &&
    !selection.proficiencyAtGain &&
    norm(selection.className) === 'ranger' &&
    norm(selection.classSource) === 'xphb' &&
    norm(selection.subclassName) === 'hunter' &&
    norm(selection.subclassSource) === 'xphb' &&
    selection.classLevel === rule.level &&
    selection.selected.length === 1 &&
    option?.entityType === 'featureOption' &&
    option.slotLevel === rule.level &&
    norm(option.source) === 'xphb' &&
    target?.format === 'source-group' &&
    target.parentIdentity === rule.target &&
    target.group === REVISED_HUNTER_GROUP
  )
}
