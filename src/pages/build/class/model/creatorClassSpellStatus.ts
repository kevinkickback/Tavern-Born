import type { CharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { getSpellNameKey, getSpellReferenceKey } from '@/lib/calculations/spellIdentity'
import {
  managedClassSpellId,
  managedClassSpellUniquenessGroup,
} from '@/lib/character/managedClassSpellIdentity'
import { getManagedClassSpellSlots } from '@/lib/character/managedClassSpellSlots'
import { getManagedClassSpellPool } from '@/lib/character/managedClassSpells'
import type { Character, CharacterClassEntry } from '@/types/character'

export function getCreatorClassSpellStatus(
  character: Character,
  entry: CharacterClassEntry,
  calculation: CharacterCalculationContext,
) {
  const level = entry.levels
  const { spellContext, catalogs, prerequisites } = calculation.classChoices
  const statuses = calculation.managedClassSpellStatuses
  const active = new Set(
    statuses.filter((row) => row.active).map(({ choice }) => managedClassSpellId(choice.slot)),
  )
  const groups = new Map<string, Set<string>>()
  const slots = getManagedClassSpellSlots(entry, character, catalogs, prerequisites).filter(
    (slot) => slot[3] === level,
  )
  for (const slot of slots) {
    const id = managedClassSpellId(slot)
    if (active.has(id) || slot[1] === 'subclass-spell-replacement') continue
    const group = JSON.stringify(slot.slice(0, 4))
    let pool = groups.get(group)
    if (!pool) {
      const candidates = getManagedClassSpellPool(character, slot, spellContext, statuses)
      pool = new Set(
        candidates.spells
          .filter((spell) =>
            candidates.defaultReferences.has(getSpellReferenceKey(spell.name, spell.source)),
          )
          .map((spell) => getSpellNameKey(spell.name)),
      )
      groups.set(group, pool)
    }
    const peers = new Set(
      (character.managedClassSpellChoices ?? [])
        .filter(
          ({ slot: other }) =>
            managedClassSpellId(other) !== id &&
            other[0][1] === slot[0][1] &&
            other[0][2] === slot[0][2] &&
            managedClassSpellUniquenessGroup(other) === managedClassSpellUniquenessGroup(slot),
        )
        .map(({ target }) => getSpellNameKey(target.name)),
    )
    if ([...pool].some((name) => !peers.has(name)))
      return { available: true, pending: true, complete: false }
  }
  const required = slots.filter((slot) => slot[1] !== 'subclass-spell-replacement')
  return {
    available: slots.some((slot) => active.has(managedClassSpellId(slot))),
    pending: false,
    complete:
      required.length > 0 && required.every((slot) => active.has(managedClassSpellId(slot))),
  }
}
