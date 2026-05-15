import { useCallback, useMemo } from 'react'
import { useClassLookup } from '@/hooks/data/useGameData'
import { ABILITY_NAMES, type AbilityName } from '@/lib/calculations/abilityScores'
import { getAbilityModifier, getProficiencyBonus } from '@/lib/calculations/gameRules'
import {
  ALL_SKILLS,
  deriveAllSkills,
  getExpertiseSlotsFromClasses,
  type SkillResult,
} from '@/lib/calculations/skills'
import { getCharacterClassEntries, getTotalCharacterLevel } from '@/lib/characterUtils'
import { addGrant, makeSourceTag } from '@/lib/provenance'
import { normalizeKey } from '@/lib/provenance/normalization'
import type { ProvenanceLedger } from '@/lib/provenance/types'
import { emptyProvenance, useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'

export type { SkillResult }

export interface SkillsState {
  skills: SkillResult[]
  passivePerception: number
  toggleProficiency: (skillName: string) => void
  toggleExpertise: (skillName: string) => void
  availableExpertiseSlots: number
  usedExpertiseSlots: number
}

export function useSkills(): SkillsState {
  const activeCharacter = useCharacterStore((s) => s.activeCharacter)
  const updateCharacter = useCharacterStore((s) => s.updateCharacter)
  const skillToAbilityMap = useGameDataStore((s) => s.gameData?.lookups?.skillToAbilityMap)
  const parsedSkillList = useGameDataStore((s) => s.gameData?.lookups?.skillList)
  const classesByKey = useClassLookup()

  const resolvedSkillList = parsedSkillList ?? ALL_SKILLS

  const level = useMemo(() => getTotalCharacterLevel(activeCharacter), [activeCharacter])
  const abilityScores = activeCharacter?.abilityScores
  const storedSkills = activeCharacter?.skills ?? {}

  const abilityModifiers = useMemo(
    () =>
      Object.fromEntries(
        ABILITY_NAMES.map((a) => [a, getAbilityModifier(abilityScores?.[a] ?? 10)]),
      ) as Record<AbilityName, number>,
    [abilityScores],
  )

  const proficiencyBonus = useMemo(() => getProficiencyBonus(level), [level])

  const proficientSkills = useMemo(
    () => resolvedSkillList.filter((name) => storedSkills[name]?.proficient),
    [resolvedSkillList, storedSkills],
  )
  const expertiseSkills = useMemo(
    () => resolvedSkillList.filter((name) => storedSkills[name]?.expertise),
    [resolvedSkillList, storedSkills],
  )

  const skills = useMemo(
    () =>
      deriveAllSkills(
        abilityModifiers,
        proficientSkills,
        expertiseSkills,
        proficiencyBonus,
        skillToAbilityMap,
        parsedSkillList,
      ),
    [
      abilityModifiers,
      proficientSkills,
      expertiseSkills,
      proficiencyBonus,
      skillToAbilityMap,
      parsedSkillList,
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

  const usedExpertiseSlots = useMemo(
    () => Object.values(activeCharacter?.skills ?? {}).filter((s) => s?.expertise).length,
    [activeCharacter?.skills],
  )

  const toggleProficiency = useCallback(
    (skillName: string) => {
      if (!activeCharacter) return
      const key = skillName.toLowerCase()
      const current = activeCharacter.skills?.[key] ?? {
        proficient: false,
        expertise: false,
        bonus: 0,
      }
      const proficient = !current.proficient
      const nextSkills = {
        ...activeCharacter.skills,
        [key]: {
          ...current,
          proficient,
          expertise: proficient ? current.expertise : false,
        },
      }
      const nextProficientSkills = resolvedSkillList.filter((name) => nextSkills[name]?.proficient)

      const ledger = activeCharacter.provenance ?? emptyProvenance()
      let nextLedger: ProvenanceLedger
      if (proficient) {
        const tag = makeSourceTag('manual', 'User Choice', 'choice')
        nextLedger = addGrant(ledger, 'skills', key, tag)
      } else {
        const normKey = normalizeKey(key)
        const skillMap = ledger.proficiencies.skills
        const filtered = (skillMap[normKey] ?? []).filter((tag) => tag.sourceType !== 'manual')
        const newMap =
          filtered.length > 0
            ? { ...skillMap, [normKey]: filtered }
            : Object.fromEntries(Object.entries(skillMap).filter(([k]) => k !== normKey))
        nextLedger = { ...ledger, proficiencies: { ...ledger.proficiencies, skills: newMap } }
      }

      updateCharacter(activeCharacter.id, {
        skills: nextSkills,
        proficiencies: {
          ...activeCharacter.proficiencies,
          skills: nextProficientSkills,
        },
        provenance: nextLedger,
      })
    },
    [activeCharacter, updateCharacter, resolvedSkillList],
  )

  const toggleExpertise = useCallback(
    (skillName: string) => {
      if (!activeCharacter) return
      const key = skillName.toLowerCase()
      const current = activeCharacter.skills?.[key] ?? {
        proficient: false,
        expertise: false,
        bonus: 0,
      }
      if (!current.proficient) return
      updateCharacter(activeCharacter.id, {
        skills: {
          ...activeCharacter.skills,
          [key]: { ...current, expertise: !current.expertise },
        },
      })
    },
    [activeCharacter, updateCharacter],
  )

  return {
    skills,
    passivePerception,
    toggleProficiency,
    toggleExpertise,
    availableExpertiseSlots,
    usedExpertiseSlots,
  }
}
