import type { Character, CharacterClassChoiceSelection } from '@/types/character'
import { decodeClassFeatureReference, getClassFeatureIdentity } from './classFeatureIdentity'

export const DIVINE_ORDER_ID = 'class:cleric|xphb|choice:divine-order|1'
export const DIVINE_ORDER_TARGET = 'class-feature|divine order|cleric|xphb|1|xphb'
export const DIVINE_ORDER_OPTIONS = {
  protector: 'class-feature|protector|cleric|xphb|1|xphb',
  thaumaturge: 'class-feature|thaumaturge|cleric|xphb|1|xphb',
} as const
export type DivineOrderOption = keyof typeof DIVINE_ORDER_OPTIONS

export function divineOrderKey(value?: string) {
  return value?.trim().toLowerCase()
}

export function getDivineOrderOption(
  selection: CharacterClassChoiceSelection,
): DivineOrderOption | undefined {
  const [option] = selection.selected
  if (
    selection.choiceId !== DIVINE_ORDER_ID ||
    selection.kind !== 'class-feature' ||
    divineOrderKey(selection.className) !== 'cleric' ||
    divineOrderKey(selection.classSource) !== 'xphb' ||
    selection.classLevel !== 1 ||
    selection.subclassName !== undefined ||
    selection.subclassSource !== undefined ||
    selection.selected.length !== 1 ||
    option?.entityType !== 'classFeature' ||
    divineOrderKey(option.source) !== 'xphb' ||
    option.slotLevel !== 1 ||
    !option.ref
  )
    return undefined
  const branch = divineOrderKey(option.name)
  if (branch !== 'protector' && branch !== 'thaumaturge') return undefined
  const fields = option.ref.split('|').length
  return (fields === 4 || fields === 5) &&
    getClassFeatureIdentity(decodeClassFeatureReference(option.ref)) ===
      DIVINE_ORDER_OPTIONS[branch]
    ? branch
    : undefined
}

export function getSavedDivineOrder(character: Pick<Character, 'classChoiceSelections'>) {
  const matches = character.classChoiceSelections?.filter((row) => row.choiceId === DIVINE_ORDER_ID)
  const selection = matches?.length === 1 ? matches[0] : undefined
  const branch = selection && getDivineOrderOption(selection)
  return selection && branch ? { selection, branch } : undefined
}
