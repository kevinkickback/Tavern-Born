import { useMemo } from 'react'
import { formatModifier } from '@/lib/calculations/abilityScores'
import {
  getAbilityModifier,
  getProficiencyBonus,
  MAX_CHARACTER_LEVEL,
} from '@/lib/calculations/gameRules'
import { getTotalCharacterLevel } from '@/lib/characterUtils'
import { useCharacterStore } from '@/store/characterStore'

export interface CharacterLevelState {
  level: number
  proficiencyBonus: number
  proficiencyBonusString: string
  isMaxLevel: boolean
  initiativeModifier: number
  initiativeString: string
}

export function useCharacterLevel(): CharacterLevelState {
  const activeCharacter = useCharacterStore((s) => s.activeCharacter)

  const level = useMemo(() => getTotalCharacterLevel(activeCharacter), [activeCharacter])
  const dexScore = activeCharacter?.abilityScores?.dexterity ?? 10

  const proficiencyBonus = useMemo(() => getProficiencyBonus(level), [level])
  const proficiencyBonusString = useMemo(() => formatModifier(proficiencyBonus), [proficiencyBonus])

  const initiativeModifier = useMemo(() => getAbilityModifier(dexScore), [dexScore])
  const initiativeString = useMemo(() => formatModifier(initiativeModifier), [initiativeModifier])

  const isMaxLevel = level >= MAX_CHARACTER_LEVEL

  return {
    level,
    proficiencyBonus,
    proficiencyBonusString,
    isMaxLevel,
    initiativeModifier,
    initiativeString,
  }
}
