import type { Race5e } from '@/types/5etools'

export const RACE_DEFENSE_FIELDS = ['resist', 'immune', 'conditionImmune'] as const

/** These are ordinary overwrite fields in the pinned upstream subrace merger. */
export function getRaceDefenseField(
  parent: Race5e,
  child: Race5e | undefined,
  field: (typeof RACE_DEFENSE_FIELDS)[number],
) {
  const childOwns =
    !!child &&
    (child._isVersion === true || Object.getOwnPropertyDescriptor(child, field) !== undefined)
  const owner = childOwns ? child : parent
  return {
    ownerType: childOwns ? ('subrace' as const) : ('race' as const),
    value: owner?.[field],
  }
}
