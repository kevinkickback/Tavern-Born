import { useMemo } from 'react'
import { useFilteredGameData } from '@/hooks/data/useFilteredGameData'
import { useClassLookup } from '@/hooks/data/useGameData'
import { resolveClassReference } from '@/lib/5etools/entityResolvers'
import { buildClassLookup } from '@/lib/5etools/lookups'
import { getAbilityModifier, getHitDiceFromClass } from '@/lib/calculations/gameRules'
import { calculateHPBreakdown, getCharacterClassEntries } from '@/lib/characterUtils'
import { useCharacterStore } from '@/store/characterStore'
import type { HitPoints } from '@/types/character'

export interface HitPointsState {
  hitPoints: HitPoints
  calculatedMaxHP: number
  effectiveMaxHP: number
  hitDie: number
  conMod: number
  levelsHPBreakdown: number[]
  setCurrentHP: (hp: number) => void
  setTempHP: (hp: number) => void
  heal: (amount: number) => void
  damage: (amount: number) => void
}

export function useHitPoints(): HitPointsState {
  const character = useCharacterStore((s) => s.activeCharacter)
  const updateCharacter = useCharacterStore((s) => s.updateCharacter)
  const { classes } = useFilteredGameData()
  const rawClassLookup = useClassLookup()
  const filteredClassLookup = useMemo(() => buildClassLookup(classes), [classes])

  const resolvedProgression = useMemo(() => {
    return getCharacterClassEntries(character)
  }, [character])

  const hitDie = useMemo(() => {
    const primary = resolvedProgression[0]
    const name = primary?.name ?? character?.class ?? ''
    const source = primary?.source ?? character?.classSource
    const found = resolveClassReference(
      { name, source },
      { classesByKey: filteredClassLookup },
      { classesByKey: rawClassLookup },
    )
    return getHitDiceFromClass(found)
  }, [
    character?.class,
    character?.classSource,
    resolvedProgression,
    filteredClassLookup,
    rawClassLookup,
  ])

  const conMod = useMemo(
    () => getAbilityModifier(character?.abilityScores.constitution ?? 10),
    [character?.abilityScores.constitution],
  )

  const useAverage = character?.variantRules?.averageHitPoints !== false
  const levelsHPBreakdown = useMemo(() => {
    const resolvedClasses = resolvedProgression.flatMap((entry) => {
      const resolved = resolveClassReference(
        entry,
        { classesByKey: filteredClassLookup },
        { classesByKey: rawClassLookup },
      )
      return resolved ? [resolved] : []
    })
    const breakdown = calculateHPBreakdown({ classes: resolvedProgression }, conMod, {
      averageHp: useAverage,
      classesData: resolvedClasses,
    })
    if (breakdown.length === 1) {
      breakdown.push(Math.max(1, hitDie + conMod))
    }
    return breakdown
  }, [resolvedProgression, conMod, useAverage, filteredClassLookup, rawClassLookup, hitDie])

  const calculatedMaxHP = useMemo(
    () => levelsHPBreakdown.reduce((sum, v) => sum + v, 0),
    [levelsHPBreakdown],
  )

  const update = (patch: Partial<HitPoints>) => {
    if (!character) return
    updateCharacter(character.id, {
      hitPoints: { ...character.hitPoints, ...patch },
    })
  }

  const hitPoints = character?.hitPoints ?? { max: 0, current: 0, temporary: 0 }

  return {
    hitPoints,
    calculatedMaxHP,
    effectiveMaxHP: hitPoints.max > 0 ? hitPoints.max : calculatedMaxHP,
    hitDie,
    conMod,
    levelsHPBreakdown,
    setCurrentHP: (hp) =>
      update({
        current: Math.max(0, Math.min(hp, character?.hitPoints.max ?? 0)),
      }),
    setTempHP: (hp) => update({ temporary: Math.max(0, hp) }),
    heal: (amount) => {
      if (!character) return
      const max = character.hitPoints.max
      update({ current: Math.min(max, character.hitPoints.current + amount) })
    },
    damage: (amount) => {
      if (!character) return
      let remaining = amount
      const temp = character.hitPoints.temporary
      const tempAfter = Math.max(0, temp - remaining)
      remaining = Math.max(0, remaining - temp)
      update({
        temporary: tempAfter,
        current: Math.max(0, character.hitPoints.current - remaining),
      })
    },
  }
}
