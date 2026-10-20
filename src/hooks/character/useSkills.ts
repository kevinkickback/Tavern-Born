import { useCallback, useMemo } from 'react'
import { useCharacterCalculationContext } from '@/hooks/character/useCharacterCalculationContext'
import { useClassLookup, useSkillList, useSkillToAbilityMap } from '@/hooks/data/useGameData'
import { ABILITY_NAMES, type AbilityName } from '@/lib/calculations/abilityScores'
import { getAbilityModifier, getProficiencyBonus } from '@/lib/calculations/gameRules'
import {
  ALL_SKILLS,
  deriveAllSkills,
  getExpertiseSlotsFromClasses,
  type SkillResult,
} from '@/lib/calculations/skills'
import { toggleExpertiseCommand } from '@/lib/character/commands/expertiseCommands'
import { emptyProvenance } from '@/lib/character/createCharacter'
import { getCharacterClassEntries, getTotalCharacterLevel } from '@/lib/characterUtils'
import { useCharacterStore } from '@/store/characterStore'

export interface SkillsState {
  skills: SkillResult[]
  passivePerception: number
  toggleExpertise: (skillName: string) => void
  availableExpertiseSlots: number
  usedExpertiseSlots: number
}

export function useSkills(): SkillsState {
  const activeCharacter = useCharacterStore((s) => s.activeCharacter)
  const updateCharacter = useCharacterStore((s) => s.updateCharacter)
  const rawSkillToAbilityMap = useSkillToAbilityMap()
  const rawSkillList = useSkillList()
  const classesByKey = useClassLookup()

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

  const availableExpertiseSlots = useMemo(
    () => getExpertiseSlotsFromClasses(getCharacterClassEntries(activeCharacter), classesByKey),
    [activeCharacter, classesByKey],
  )

  const usedExpertiseSlots =
    effectiveCharacter?.proficiencies.expertise.filter((name) => {
      const tags =
        effectiveCharacter.provenance?.proficiencies.expertise?.[name.trim().toLowerCase()] ?? []
      return (
        !tags.length ||
        tags.some((tag) => tag.sourceType === 'manual' && tag.sourceName === 'User Choice')
      )
    }).length ?? 0

  const toggleExpertise = useCallback(
    (skillName: string) => {
      if (!activeCharacter) return
      const result = toggleExpertiseCommand(
        activeCharacter,
        activeCharacter.provenance ?? emptyProvenance(),
        skillName,
        !effectiveCharacter?.proficiencies.expertise.some(
          (name) => name.trim().toLowerCase() === skillName.trim().toLowerCase(),
        ),
      )
      updateCharacter(activeCharacter.id, {
        ...result.characterPatch,
        provenance: result.provenanceUpdate,
      })
    },
    [activeCharacter, effectiveCharacter, updateCharacter],
  )

  return {
    skills,
    passivePerception,
    toggleExpertise,
    availableExpertiseSlots,
    usedExpertiseSlots,
  }
}
