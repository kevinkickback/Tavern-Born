import { useMemo } from 'react'
import { useCharacterCalculationContext } from '@/hooks/character/useCharacterCalculationContext'
import { useSkillList, useSkillToAbilityMap } from '@/hooks/data/useGameData'
import { ABILITY_NAMES, type AbilityName } from '@/lib/calculations/abilityScores'
import { getAbilityModifier, getProficiencyBonus } from '@/lib/calculations/gameRules'
import { ALL_SKILLS, deriveAllSkills, type SkillResult } from '@/lib/calculations/skills'
import { getTotalCharacterLevel } from '@/lib/characterUtils'
import { useCharacterStore } from '@/store/characterStore'

export interface SkillsState {
  skills: SkillResult[]
  passivePerception: number
}

export function useSkills(): SkillsState {
  const activeCharacter = useCharacterStore((s) => s.activeCharacter)
  const rawSkillToAbilityMap = useSkillToAbilityMap()
  const rawSkillList = useSkillList()

  const skillToAbilityMap =
    Object.keys(rawSkillToAbilityMap).length > 0 ? rawSkillToAbilityMap : undefined
  const parsedSkillList = rawSkillList.length > 0 ? rawSkillList : undefined

  const level = useMemo(() => getTotalCharacterLevel(activeCharacter), [activeCharacter])
  const calculationContext = useCharacterCalculationContext(activeCharacter)
  const effectiveCharacter = calculationContext?.character ?? activeCharacter
  const abilityModifiers = useMemo(() => {
    if (calculationContext) return calculationContext.abilityScores.modifiers
    return Object.fromEntries(
      ABILITY_NAMES.map((ability) => [ability, getAbilityModifier(10)]),
    ) as Record<AbilityName, number>
  }, [calculationContext])

  const proficiencyBonus = useMemo(() => getProficiencyBonus(level), [level])

  const proficientSkills = useMemo(
    () => effectiveCharacter?.proficiencies.skills ?? [],
    [effectiveCharacter?.proficiencies.skills],
  )
  const expertiseSkills = useMemo(
    () => effectiveCharacter?.proficiencies.expertise ?? [],
    [effectiveCharacter?.proficiencies.expertise],
  )

  const skills = useMemo(
    () =>
      deriveAllSkills(
        abilityModifiers,
        proficientSkills,
        expertiseSkills,
        proficiencyBonus,
        skillToAbilityMap,
        parsedSkillList ?? ALL_SKILLS,
        calculationContext?.effects.declarations,
        calculationContext?.effects.resolutionContext,
      ),
    [
      abilityModifiers,
      proficientSkills,
      expertiseSkills,
      proficiencyBonus,
      skillToAbilityMap,
      parsedSkillList,
      calculationContext,
    ],
  )

  const passivePerception = useMemo(() => {
    const perception = skills.find((s) => s.name === 'perception')
    return 10 + (perception?.modifier ?? abilityModifiers.wisdom ?? 0)
  }, [skills, abilityModifiers.wisdom])

  return {
    skills,
    passivePerception,
  }
}
