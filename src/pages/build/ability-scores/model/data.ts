export interface SkillDetail {
  name: string
  entries: unknown[]
  source?: string
  page?: number
}

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
