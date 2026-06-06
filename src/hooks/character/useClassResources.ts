import { useCallback, useMemo } from 'react'
import { useClasses } from '@/hooks/data/useGameData'
import { getClassResourceDefs } from '@/lib/5etools/classData'
import { getCharacterClassEntries } from '@/lib/characterUtils'
import { useCharacterStore } from '@/store/characterStore'

export interface ComputedClassResource {
  id: string
  label: string
  current: number
  max: number
  restType: 'short' | 'long'
  className: string
}

export function useClassResources(): {
  resources: ComputedClassResource[]
  updateCurrent: (id: string, value: number) => void
  resetResource: (id: string) => void
  resetAll: () => void
} {
  const character = useCharacterStore((s) => s.activeCharacter)
  const updateCharacter = useCharacterStore((s) => s.updateCharacter)
  const classes = useClasses()

  const resources = useMemo((): ComputedClassResource[] => {
    if (!character) return []
    const stored = character.classResources ?? {}
    const progression = getCharacterClassEntries(character)
    const chaScore = character.abilityScores?.charisma ?? 10
    const chaMod = Math.max(1, Math.floor((chaScore - 10) / 2))

    return progression.flatMap((entry) => {
      const classData =
        classes.find((c) => c.name === entry.name && c.source === entry.source) ??
        classes.find((c) => c.name === entry.name)
      const defs = getClassResourceDefs(classData, entry.levels ?? 1)
      const levelIdx = Math.max(0, Math.min(19, (entry.levels ?? 1) - 1))
      return defs.map((def) => {
        const max = def.maxFormula === 'cha-mod' ? chaMod : (def.maxPerLevel[levelIdx] ?? 0)
        const restType = def.restTypeByLevel?.[levelIdx] ?? def.restType
        return {
          id: def.id,
          label: def.label,
          current: stored[def.id] ?? max,
          max,
          restType,
          className: entry.name,
        }
      })
    })
  }, [character, classes])

  const updateCurrent = useCallback(
    (id: string, value: number) => {
      if (!character) return
      const res = resources.find((r) => r.id === id)
      if (!res) return
      const clamped = Math.max(0, Math.min(res.max, value))
      updateCharacter(character.id, {
        classResources: { ...(character.classResources ?? {}), [id]: clamped },
      })
    },
    [character, resources, updateCharacter],
  )

  const resetResource = useCallback(
    (id: string) => {
      if (!character) return
      const res = resources.find((r) => r.id === id)
      if (!res) return
      updateCharacter(character.id, {
        classResources: { ...(character.classResources ?? {}), [id]: res.max },
      })
    },
    [character, resources, updateCharacter],
  )

  const resetAll = useCallback(() => {
    if (!character) return
    const next: Record<string, number> = {}
    for (const res of resources) {
      next[res.id] = res.max
    }
    updateCharacter(character.id, { classResources: next })
  }, [character, resources, updateCharacter])

  return { resources, updateCurrent, resetResource, resetAll }
}
