import { useMemo } from 'react'
import { useClasses } from '@/hooks/data/useGameData'
import { getAbilityModifier, getHitDiceFromClass } from '@/lib/calculations/gameRules'
import { calculateHPBreakdown, getCharacterClassEntries } from '@/lib/characterUtils'
import { useCharacterStore } from '@/store/characterStore'
import type { HitPoints } from '@/types/character'

export interface HitPointsState {
  hitPoints: HitPoints
  /** Max HP as calculated from class hit die + CON mod × level. */
  calculatedMaxHP: number
  /** Hit die faces for the character's class (e.g. 8 for a Rogue). */
  hitDie: number
  conMod: number
  /** HP at each individual level: [0] unused, [1] = first level, etc. */
  levelsHPBreakdown: number[]
  setCurrentHP: (hp: number) => void
  setTempHP: (hp: number) => void
  setMaxHP: (hp: number) => void
  syncMaxHP: () => void
  heal: (amount: number) => void
  damage: (amount: number) => void
}

export function useHitPoints(): HitPointsState {
  const character = useCharacterStore((s) => s.activeCharacter)
  const updateCharacter = useCharacterStore((s) => s.updateCharacter)
  const classes = useClasses()

  const resolvedProgression = useMemo(() => {
    return getCharacterClassEntries(character)
  }, [character])

  const hitDie = useMemo(() => {
    const primary = resolvedProgression[0]
    const name = primary?.name ?? character?.class ?? ''
    const source = primary?.source ?? character?.classSource
    const found =
      classes.find((c) => c.name === name && (source == null || c.source === source)) ??
      classes.find((c) => c.name === name)
    return getHitDiceFromClass(found)
  }, [character?.class, character?.classSource, resolvedProgression, classes])

  const conMod = useMemo(
    () => getAbilityModifier(character?.abilityScores.constitution ?? 10),
    [character?.abilityScores.constitution],
  )

  const useAverage = character?.variantRules?.averageHitPoints !== false
  const levelsHPBreakdown = useMemo(() => {
    const breakdown = calculateHPBreakdown({ classes: resolvedProgression }, conMod, {
      averageHp: useAverage,
      classesData: classes,
    })
    if (breakdown.length === 1) {
      breakdown.push(Math.max(1, hitDie + conMod))
    }
    return breakdown
  }, [resolvedProgression, conMod, useAverage, classes, hitDie])

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

  return {
    hitPoints: character?.hitPoints ?? { max: 0, current: 0, temporary: 0 },
    calculatedMaxHP,
    hitDie,
    conMod,
    levelsHPBreakdown,
    setCurrentHP: (hp) =>
      update({
        current: Math.max(0, Math.min(hp, character?.hitPoints.max ?? 0)),
      }),
    setTempHP: (hp) => update({ temporary: Math.max(0, hp) }),
    setMaxHP: (hp) => update({ max: Math.max(1, hp) }),
    syncMaxHP: () => {
      if (!character) return
      update({
        max: calculatedMaxHP,
        current: Math.min(character.hitPoints.current, calculatedMaxHP),
      })
    },
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
