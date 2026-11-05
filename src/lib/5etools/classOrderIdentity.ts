import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import type { Character, CharacterClassChoiceSelection } from '@/types/character'
import type { NormalizedChoiceOptionReference } from '@/types/classRules'
import { decodeClassFeatureReference, getClassFeatureIdentity } from './classFeatureIdentity'

function defineOrder(
  className: string,
  name: string,
  training: string,
  armor: 'medium' | 'heavy',
  caster: string,
  secondSkill: 'nature' | 'religion',
) {
  const owner = norm(className)
  const target = (label: string) => `class-feature|${norm(label)}|${owner}|xphb|1|xphb`
  return {
    id: `class:${owner}|xphb|choice:${norm(name).replace(' ', '-')}|1`,
    owner,
    className,
    name,
    target: target(name),
    training: { name: training, target: target(training), armor },
    caster: { name: caster, target: target(caster), skills: ['arcana', secondSkill] },
  }
}

export const PRIMAL_ORDER = defineOrder(
  'Druid',
  'Primal Order',
  'Warden',
  'medium',
  'Magician',
  'nature',
)

export const CLASS_ORDERS = [
  defineOrder('Cleric', 'Divine Order', 'Protector', 'heavy', 'Thaumaturge', 'religion'),
  PRIMAL_ORDER,
]

export type ClassOrder = (typeof CLASS_ORDERS)[number]
export type ClassOrderBranch = 'training' | 'caster'
export const getClassOrderById = (id: string) => CLASS_ORDERS.find((order) => order.id === id)

export function getClassOrderBranch(reference: NormalizedChoiceOptionReference, order: ClassOrder) {
  if (
    reference.entityType !== 'classFeature' ||
    norm(reference.source) !== 'xphb' ||
    !reference.ref ||
    ![4, 5].includes(reference.ref.split('|').length)
  )
    return undefined
  const target = getClassFeatureIdentity(decodeClassFeatureReference(reference.ref))
  return (['training', 'caster'] as const).find(
    (branch) =>
      order[branch].target === target && norm(order[branch].name) === norm(reference.name),
  )
}

export function getClassOrderOption(
  selection: CharacterClassChoiceSelection,
  order: ClassOrder,
): ClassOrderBranch | undefined {
  const [option] = selection.selected
  if (
    selection.choiceId !== order.id ||
    selection.kind !== 'class-feature' ||
    norm(selection.className) !== order.owner ||
    norm(selection.classSource) !== 'xphb' ||
    selection.classLevel !== 1 ||
    selection.subclassName !== undefined ||
    selection.subclassSource !== undefined ||
    selection.selected.length !== 1 ||
    option?.slotLevel !== 1
  )
    return undefined
  return getClassOrderBranch(option, order)
}

export function getSavedClassOrder(
  character: Pick<Character, 'classChoiceSelections'>,
  order: ClassOrder,
) {
  const matches = character.classChoiceSelections?.filter((row) => row.choiceId === order.id)
  const selection = matches?.length === 1 ? matches[0] : undefined
  const branch = selection && getClassOrderOption(selection, order)
  return selection && branch ? { selection, branch } : undefined
}
