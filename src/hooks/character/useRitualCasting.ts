import { useMemo } from 'react'
import { useFilteredGameData } from '@/hooks/data/useFilteredGameData'
import { useClassLookup } from '@/hooks/data/useGameData'
import { getClassHasRitualCasting } from '@/lib/5etools/classData'
import { resolveClassReference } from '@/lib/5etools/entityResolvers'
import { buildClassLookup } from '@/lib/5etools/lookups'
import { getCharacterClassEntries } from '@/lib/characterUtils'
import { useCharacterStore } from '@/store/characterStore'

/**
 * Returns whether the character has ritual casting ability.
 * Derived from classProgression + 5etools class data.
 * `character.ritualCasting` acts as a manual override when explicitly set.
 */
export function useRitualCasting(): boolean {
  const character = useCharacterStore((s) => s.activeCharacter)
  const { classes } = useFilteredGameData()
  const rawClassLookup = useClassLookup()
  const filteredClassLookup = useMemo(() => buildClassLookup(classes), [classes])

  return useMemo(() => {
    if (!character) return false
    if (character.ritualCasting !== undefined) return character.ritualCasting

    const progression = getCharacterClassEntries(character)
    return progression.some((entry) => {
      const cls = resolveClassReference(
        entry,
        { classesByKey: filteredClassLookup },
        { classesByKey: rawClassLookup },
      )
      return getClassHasRitualCasting(cls)
    })
  }, [character, filteredClassLookup, rawClassLookup])
}
