import type { Class5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import { getCurrentDirectSubclassSource } from './directSubclassSource'
import { optionalDeclarationObject as record } from './optionalClassDeclarationStructure'

export function hasTceBattleReady(character: Character, classes: readonly Class5e[] | undefined) {
  const owner = character.classProgression.find(
    (entry) =>
      entry.name === 'Artificer' &&
      entry.source === 'TCE' &&
      entry.subclass === 'Battle Smith' &&
      entry.subclassSource === 'TCE',
  )
  const current = owner && getCurrentDirectSubclassSource(character, owner, classes, 'Artificer')
  const feature = current?.getFeature('Battle Ready')
  return (
    feature?.entries
      .map(record)
      .some(
        (row) =>
          row.type === 'list' &&
          Array.isArray(row.items) &&
          row.items.includes(
            'When you attack with a magic weapon, you can use your Intelligence modifier, instead of Strength or Dexterity modifier, for the attack and damage rolls.',
          ),
      ) === true
  )
}
