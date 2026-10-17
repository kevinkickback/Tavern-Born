import type { Character } from '@/types/character'
import { normalizeOwnerIdentity } from './normalization'

export const isReservedRacialDefenseId = (id: string) => id.trim().startsWith('racial-defense:')

/** Validate saved ownership without borrowing loaded rules or inferring historical grants. */
export function hasValidRacialDefenseContext(character: Character): boolean {
  const state = character.racialDefenses
  if (!character.race.trim()) return state === undefined
  if (!state) return false
  const same = (a?: string, b?: string) => normalizeOwnerIdentity(a) === normalizeOwnerIdentity(b)
  return (
    same(state.context.parent.name, character.race) &&
    same(state.context.parent.source, character.raceSource) &&
    !!state.context.child === !!character.subrace &&
    same(state.context.child?.name, character.subrace) &&
    same(state.context.child?.source, character.subraceSource) &&
    (['resist', 'immune', 'conditionImmune'] as const).every(
      (key) => state[key].ownerType === 'race' || !!state.context.child,
    )
  )
}
