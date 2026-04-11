import {
  ABILITY_NAMES,
  type AbilityName,
  normalizeAbilityName,
} from '@/lib/calculations/abilityScores'
import { STANDARD_ARRAY } from '@/lib/calculations/gameRules'

export interface SkillDetail {
  name: string
  entries: unknown[]
  source?: string
  page?: number
}

export const DEFAULT_STANDARD_ARRAY_ASSIGNMENT: Partial<Record<AbilityName, number>> =
  ABILITY_NAMES.reduce(
    (acc, ability, idx) => {
      acc[ability] = STANDARD_ARRAY[idx] ?? 8
      return acc
    },
    {} as Partial<Record<AbilityName, number>>,
  )

export function formatTitleCase(input: string): string {
  return input.replace(/\b\w/g, (match) => match.toUpperCase())
}

export function buildRacialBonuses(
  raceAsiData: {
    fixed: Array<{ ability: AbilityName; value: number }>
    choices: Array<{ count: number; amount: number; from: AbilityName[] }>
  },
  raceAsiChoices: string[][],
): Partial<Record<AbilityName, number>> {
  const racialBonuses: Partial<Record<AbilityName, number>> = {}

  for (const fixedBonus of raceAsiData.fixed) {
    racialBonuses[fixedBonus.ability] = (racialBonuses[fixedBonus.ability] ?? 0) + fixedBonus.value
  }

  for (const [blockIdx, block] of raceAsiData.choices.entries()) {
    for (const rawChoice of raceAsiChoices[blockIdx] ?? []) {
      const ability = normalizeAbilityName(rawChoice)
      if (ability) {
        racialBonuses[ability] = (racialBonuses[ability] ?? 0) + block.amount
      }
    }
  }

  return racialBonuses
}

export function buildSkillDetailsMap(rawSkills: unknown): Record<string, SkillDetail> {
  const map: Record<string, SkillDetail> = {}

  const skillsList = Array.isArray(rawSkills)
    ? rawSkills
    : rawSkills && typeof rawSkills === 'object'
      ? Object.values(rawSkills)
      : []

  for (const skill of skillsList) {
    const skillObj = skill as {
      name?: unknown
      entries?: unknown[]
      source?: string
      page?: number
    }

    if (!skillObj?.name || !Array.isArray(skillObj.entries)) continue

    map[String(skillObj.name).toLowerCase()] = {
      name: String(skillObj.name),
      entries: skillObj.entries,
      source: skillObj.source,
      page: skillObj.page,
    }
  }

  return map
}

export function selectSkillDetails(
  selectedSkills: string[],
  skillDetailsMap: Record<string, SkillDetail>,
): SkillDetail[] {
  return selectedSkills
    .map((skill) => skillDetailsMap[skill.toLowerCase()])
    .filter((value): value is SkillDetail => Boolean(value))
}

export function buildSkillSourceTags(selectedSkillDetails: SkillDetail[]): string[] {
  return Array.from(
    new Set(
      selectedSkillDetails
        .map((skill) => {
          if (!skill.source) return null
          return skill.page ? `${skill.source}, p. ${skill.page}` : skill.source
        })
        .filter((value): value is string => Boolean(value)),
    ),
  )
}

export function updateRaceAsiChoices(
  raceAsiChoices: string[][],
  blockIdx: number,
  slotIdx: number,
  value: string,
): string[][] {
  const nextChoices = raceAsiChoices.map((arr) => [...arr])
  while (nextChoices.length <= blockIdx) nextChoices.push([])

  const blockSelections = [...(nextChoices[blockIdx] ?? [])]

  // Swap intra-block conflict: give displaced slot the current slot's old value
  const intraConflict = blockSelections.findIndex((s, i) => i !== slotIdx && s === value)
  if (intraConflict >= 0) {
    blockSelections[intraConflict] = blockSelections[slotIdx] ?? ''
  }

  // Clear cross-block conflict: same ability cannot appear in any other block
  for (let bi = 0; bi < nextChoices.length; bi++) {
    if (bi === blockIdx) continue
    const other = nextChoices[bi] ?? []
    for (let si = 0; si < other.length; si++) {
      if (other[si] === value) other[si] = ''
    }
    nextChoices[bi] = other
  }

  blockSelections[slotIdx] = value
  nextChoices[blockIdx] = blockSelections

  return nextChoices
}
