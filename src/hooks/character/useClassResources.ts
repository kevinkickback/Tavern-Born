import { useCallback, useMemo } from 'react'
import { useCharacterCalculationContext } from '@/hooks/character/useCharacterCalculationContext'
import { useFilteredGameData } from '@/hooks/data/useFilteredGameData'
import { useClassLookup } from '@/hooks/data/useGameData'
import { getClassicArchdruidWildShapeRule } from '@/lib/5etools/archdruidSource'
import { resolveClassReference } from '@/lib/5etools/entityResolvers'
import { buildClassLookup } from '@/lib/5etools/lookups'
import { getCharacterClassResources } from '@/lib/calculations/classResources'
import { getCharacterClassEntries } from '@/lib/characterUtils'
import { useCharacterStore } from '@/store/characterStore'

export function useClassResources(): {
  resources: ReturnType<typeof getCharacterClassResources>
  unlimitedWildShape: boolean
  updateCurrent: (id: string, value: number) => void
  resetResource: (id: string) => void
  resetAll: () => void
} {
  const character = useCharacterStore((s) => s.activeCharacter)
  const updateCharacter = useCharacterStore((s) => s.updateCharacter)
  const calculationContext = useCharacterCalculationContext(character)
  const { classes } = useFilteredGameData()
  const rawClassLookup = useClassLookup()
  const filteredClassLookup = useMemo(() => buildClassLookup(classes), [classes])

  const unlimitedWildShape = !!getClassicArchdruidWildShapeRule(
    character ? getCharacterClassEntries(character) : [],
    classes,
    calculationContext?.lookups.primary.classChoiceFeatureCatalogs,
  )

  const resources = useMemo(() => {
    if (!character) return []
    return getCharacterClassResources(
      character,
      (entry) =>
        resolveClassReference(
          entry,
          { classesByKey: filteredClassLookup },
          { classesByKey: rawClassLookup },
        ),
      {
        catalogs: calculationContext?.lookups.primary.classChoiceFeatureCatalogs,
        charismaModifier: calculationContext?.abilityScores.modifiers.charisma ?? 0,
        abilityModifiers: calculationContext?.abilityScores.modifiers,
        effects: calculationContext?.effects.declarations,
        effectContext: calculationContext?.effects.resolutionContext,
        unlimitedWildShape,
      },
    )
  }, [character, calculationContext, filteredClassLookup, rawClassLookup, unlimitedWildShape])

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
    const next = { ...character.classResources }
    for (const res of resources) {
      next[res.id] = res.max
    }
    updateCharacter(character.id, { classResources: next })
  }, [character, resources, updateCharacter])

  return { resources, unlimitedWildShape, updateCurrent, resetResource, resetAll }
}
