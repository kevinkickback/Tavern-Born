import { extractProficiencyBlockNames } from '@/lib/5etools/parsers'
import { toAbilityName } from '@/lib/calculations/abilityNames'
import { mergeSkillState } from '@/lib/calculations/skills'
import { stripItemTag } from '@/lib/provenance'
import { normalizeKey } from '@/lib/provenance/normalization'
import type { Skills } from '@/types/character'

interface ClassProficiencyEntity {
  proficiency?: string[]
  startingProficiencies?: {
    armor?: string[]
    weapons?: string[]
    tools?: string[]
    toolProficiencies?: Record<
      string,
      number | boolean | { choose?: { from?: string[]; count?: number } }
    >[]
    skills?: Array<string | Record<string, unknown>>
  }
}

interface BackgroundProficiencyEntity {
  skillProficiencies?: unknown[]
  languageProficiencies?: unknown[]
  toolProficiencies?: unknown[]
}

export function normalizeSavingThrowName(name: string): string {
  const normalized = normalizeKey(name)
  return toAbilityName(normalized) ?? normalized
}

export function isNarrativeTool(value: string): boolean {
  return /of your choice|choose|one type of/i.test(value)
}

export function buildInitialCharacterProficiencies(
  cls: ClassProficiencyEntity | undefined,
  normalizedBackground: BackgroundProficiencyEntity | undefined,
): {
  proficiencies: {
    armor: string[]
    weapons: string[]
    tools: string[]
    skills: string[]
    languages: string[]
    savingThrows: string[]
  }
  skills: Skills
} {
  const clsProfs = cls?.startingProficiencies ?? {}
  const armor = (clsProfs.armor ?? [])
    .filter((value): value is string => typeof value === 'string')
    .map(stripItemTag)
  const weapons = (clsProfs.weapons ?? [])
    .filter((value): value is string => typeof value === 'string')
    .map(stripItemTag)
  const classTools = [
    ...(clsProfs.tools ?? [])
      .filter((value): value is string => typeof value === 'string')
      .map(stripItemTag)
      .filter((value) => value && !isNarrativeTool(value)),
    ...extractProficiencyBlockNames((clsProfs.toolProficiencies as unknown[]) ?? [], {
      includeAnyStandard: false,
    }),
  ]
  const savingThrows = [...new Set((cls?.proficiency ?? []).map(normalizeSavingThrowName))]
  const backgroundSkills = extractProficiencyBlockNames(
    normalizedBackground?.skillProficiencies ?? [],
    { includeAnyStandard: false },
  ).filter((name) => !name.toLowerCase().startsWith('choose '))
  const backgroundLanguages = extractProficiencyBlockNames(
    normalizedBackground?.languageProficiencies ?? [],
    { includeAnyStandard: false },
  )
  const backgroundTools = extractProficiencyBlockNames(
    normalizedBackground?.toolProficiencies ?? [],
    { includeAnyStandard: false },
  )
  const skills = [...new Set(backgroundSkills.map((skill) => skill.toLowerCase()))]
  const proficiencies = {
    armor,
    weapons,
    tools: [...new Set([...classTools, ...backgroundTools])],
    skills,
    languages: [...new Set(backgroundLanguages)],
    savingThrows,
  }

  return { proficiencies, skills: mergeSkillState({}, skills) }
}
