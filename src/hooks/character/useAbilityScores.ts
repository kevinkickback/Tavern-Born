import { useCallback, useMemo } from 'react'
import { useCharacterStore } from '@/store/characterStore'
import type { AbilityName } from '@/types/character'

export function useAbilityScores() {
  const activeCharacter = useCharacterStore((s) => s.activeCharacter)
  const updateCharacter = useCharacterStore((s) => s.updateCharacter)

  const scores = useMemo(() => {
    const raw = activeCharacter?.abilityScores
    return {
      strength: raw?.strength ?? 8,
      dexterity: raw?.dexterity ?? 8,
      constitution: raw?.constitution ?? 8,
      intelligence: raw?.intelligence ?? 8,
      wisdom: raw?.wisdom ?? 8,
      charisma: raw?.charisma ?? 8,
    }
  }, [activeCharacter?.abilityScores])

  const setScore = useCallback(
    (ability: AbilityName, score: number) => {
      if (!activeCharacter) return
      updateCharacter(activeCharacter.id, {
        abilityScores: { ...scores, [ability]: score },
      })
    },
    [activeCharacter, updateCharacter, scores],
  )

  const setAllScores = useCallback(
    (newScores: Partial<Record<AbilityName, number>>) => {
      if (!activeCharacter) return
      updateCharacter(activeCharacter.id, {
        abilityScores: { ...scores, ...newScores },
      })
    },
    [activeCharacter, updateCharacter, scores],
  )

  return { scores, setScore, setAllScores }
}
