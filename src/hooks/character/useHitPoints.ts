import { useMemo } from 'react'
import { useCharacterCalculationContext } from '@/hooks/character/useCharacterCalculationContext'
import { useFilteredGameData } from '@/hooks/data/useFilteredGameData'
import { useClassLookup } from '@/hooks/data/useGameData'
import { resolveClassReference } from '@/lib/5etools/entityResolvers'
import { buildClassLookup } from '@/lib/5etools/lookups'
import { type ResolvedNumericEffect, resolveNumericEffect } from '@/lib/calculations/effects'
import { getAbilityModifier, getHitDiceFromClass } from '@/lib/calculations/gameRules'
import { getHitDiePoolId } from '@/lib/calculations/hitDice'
import { type HitPointSettings, resolveHitPointSettings } from '@/lib/calculations/statSettings'
import {
  calculateHitPointAdjustmentTotal,
  getCharacterClassEntries,
  getHitPointLevelLog,
  getMaxHitPointsOverride,
  getTotalCharacterLevel,
} from '@/lib/characterUtils'
import { useCharacterStore } from '@/store/characterStore'
import type { HitPointLevelOverride, HitPoints } from '@/types/character'

export interface HitPointsState {
  hitPoints: HitPoints
  calculatedMaxHP: number
  effectiveMaxHP: number
  hitDicePools: Array<{ id: string; label: string; die: number; max: number; used: number }>
  getLevelLog: (overrides?: HitPointLevelOverride[]) => ReturnType<typeof getHitPointLevelLog>
  previewHitPointSettings: (settings: HitPointSettings) => ResolvedNumericEffect
  saveHitPointSettings: (settings: HitPointSettings) => boolean
}

export function useHitPoints(): HitPointsState {
  const character = useCharacterStore((s) => s.activeCharacter)
  const updateCharacter = useCharacterStore((s) => s.updateCharacter)
  const calculationContext = useCharacterCalculationContext(character)
  const { classes } = useFilteredGameData()
  const rawClassLookup = useClassLookup()
  const filteredClassLookup = useMemo(() => buildClassLookup(classes), [classes])

  const resolvedProgression = useMemo(() => {
    return getCharacterClassEntries(character)
  }, [character])

  const hitDie = useMemo(() => {
    const primary = resolvedProgression[0]
    const name = primary?.name ?? ''
    const source = primary?.source
    const found = resolveClassReference(
      { name, source },
      { classesByKey: filteredClassLookup },
      { classesByKey: rawClassLookup },
    )
    return getHitDiceFromClass(found)
  }, [resolvedProgression, filteredClassLookup, rawClassLookup])

  const hitDicePools = useMemo(
    () =>
      resolvedProgression.map((entry) => {
        const classData = resolveClassReference(
          entry,
          { classesByKey: filteredClassLookup },
          { classesByKey: rawClassLookup },
        )
        const id = getHitDiePoolId(entry)
        return {
          id,
          label: entry.name,
          die: getHitDiceFromClass(classData),
          max: entry.levels,
          used: Math.min(entry.levels, Math.max(0, character?.hitDiceUsed?.[id] ?? 0)),
        }
      }),
    [character?.hitDiceUsed, filteredClassLookup, rawClassLookup, resolvedProgression],
  )

  const conMod = useMemo(
    () => getAbilityModifier(calculationContext?.abilityScores.total.constitution ?? 10),
    [calculationContext?.abilityScores.total.constitution],
  )

  const useAverage = character?.variantRules?.averageHitPoints !== false
  const resolvedClasses = useMemo(
    () =>
      resolvedProgression.flatMap((entry) => {
        const resolved = resolveClassReference(
          entry,
          { classesByKey: filteredClassLookup },
          { classesByKey: rawClassLookup },
        )
        return resolved ? [resolved] : []
      }),
    [filteredClassLookup, rawClassLookup, resolvedProgression],
  )
  const getLevelLog = (overrides = character?.hitPointLevelOverrides) =>
    getHitPointLevelLog(resolvedProgression, conMod, {
      averageHp: useAverage,
      classesData: resolvedClasses,
      hitPointGains: character?.hitPointGains,
      hitPointLevelOverrides: overrides,
      initialClass: character?.initialClass,
    })
  const levels = getLevelLog()
  const calculatedMaxHP = levels.length
    ? levels.reduce((sum, { hp }) => sum + hp, 0)
    : Math.max(1, hitDie + conMod)
  const draftBase = (settings: HitPointSettings) =>
    settings.levelOverrides && levels.length
      ? getLevelLog(settings.levelOverrides).reduce((sum, row) => sum + row.hp, 0)
      : calculatedMaxHP

  const characterLevel = getTotalCharacterLevel(character)
  const adjustmentTotal = calculateHitPointAdjustmentTotal(
    character?.hitPointAdjustments,
    characterLevel,
  )
  const adjustedMaxHP = Math.max(1, calculatedMaxHP + adjustmentTotal)
  const overrideMaxHP = character ? getMaxHitPointsOverride(character) : undefined
  const resolution = useMemo(
    () =>
      resolveNumericEffect(
        calculatedMaxHP,
        { kind: 'hit-point-maximum' },
        calculationContext?.effects.declarations ?? [],
        calculationContext?.effects.resolutionContext,
      ),
    [calculatedMaxHP, calculationContext],
  )
  const effectiveMaxHP = calculationContext
    ? Math.max(1, Math.trunc(resolution.value))
    : (overrideMaxHP ?? adjustedMaxHP)

  const hitPoints = character?.hitPoints ?? { current: 0, temporary: 0 }

  return {
    hitPoints,
    calculatedMaxHP,
    effectiveMaxHP,
    hitDicePools,
    getLevelLog,
    previewHitPointSettings: (settings) =>
      character
        ? resolveHitPointSettings(
            character,
            draftBase(settings),
            settings,
            calculationContext?.effects.sourceDeclarations,
          )
        : resolution,
    saveHitPointSettings: (settings) => {
      if (!character || useCharacterStore.getState().activeCharacter !== character) return false
      const nextOverride =
        typeof settings.maxOverride === 'number' && settings.maxOverride > 0
          ? Math.trunc(settings.maxOverride)
          : undefined
      const nextResolution = resolveHitPointSettings(
        character,
        draftBase(settings),
        { ...settings, maxOverride: nextOverride },
        calculationContext?.effects.sourceDeclarations,
      )
      const nextEffectiveMaxHP = Math.max(1, Math.trunc(nextResolution.value))
      updateCharacter(character.id, {
        ...(settings.levelOverrides && {
          hitPointLevelOverrides: settings.levelOverrides.length
            ? settings.levelOverrides
            : undefined,
        }),
        hitPointAdjustments: settings.adjustments,
        hitPointsInitialized: true,
        maxHitPointsOverride: nextOverride,
        hitPoints: {
          current: Math.max(0, Math.min(Math.trunc(settings.current), nextEffectiveMaxHP)),
          temporary: Math.max(0, Math.trunc(settings.temporary)),
        },
      })
      return useCharacterStore.getState().activeCharacter !== character
    },
  }
}
