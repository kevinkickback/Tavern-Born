import type { Class5e } from '@/types/5etools'
import type { Character, CharacterClassEntry } from '@/types/character'
import { getCurrentDirectSubclassSource } from './directSubclassSource'

export function getCurrentFighterSubclassSource(
  character: Character,
  entry: CharacterClassEntry,
  classes: readonly Class5e[] | undefined,
) {
  return getCurrentDirectSubclassSource(character, entry, classes, 'Fighter')
}
