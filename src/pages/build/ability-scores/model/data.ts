import {
  type AbilityName,
  makeDefaultStandardArrayAssignment,
} from '@/lib/calculations/abilityScores'

export { buildRacialBonuses } from '@/lib/calculations/abilityScores'

export interface SkillDetail {
  name: string
  entries: unknown[]
  source?: string
  page?: number
}

export const DEFAULT_STANDARD_ARRAY_ASSIGNMENT: Partial<Record<AbilityName, number>> =
  makeDefaultStandardArrayAssignment()

export function formatTitleCase(input: string): string {
  return input.replace(/\b\w/g, (match) => match.toUpperCase())
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
