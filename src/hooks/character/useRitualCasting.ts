import { useMemo } from 'react'
import { useClasses } from '@/hooks/data/useGameData'
import { getClassHasRitualCasting } from '@/lib/5etools/classData'
import { getCharacterClassEntries } from '@/lib/characterUtils'
import { useCharacterStore } from '@/store/characterStore'

/**
 * Returns whether the character has ritual casting ability.
 * Derived from classProgression + 5etools class data.
 * `character.ritualCasting` acts as a manual override when explicitly set.
 */
export function useRitualCasting(): boolean {
  const character = useCharacterStore((s) => s.activeCharacter)
  const classes = useClasses()

  return useMemo(() => {
    if (!character) return false
    if (character.ritualCasting !== undefined) return character.ritualCasting

    const progression = getCharacterClassEntries(character)
    return progression.some((entry) => {
      const cls =
        classes.find((c) => c.name === entry.name && c.source === entry.source) ??
        classes.find((c) => c.name === entry.name)
      return getClassHasRitualCasting(cls)
    })
  }, [character, classes])
}
