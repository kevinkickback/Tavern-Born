import { SKILL_CATALOG_FALLBACK } from '@/lib/5etools/rulesetMetadata'
import type { AbilityName } from '@/types/character'

export const skillToAbility: Readonly<Record<string, AbilityName>> = Object.fromEntries(
  SKILL_CATALOG_FALLBACK.map((skill) => [skill.name, skill.ability]),
) as Readonly<Record<string, AbilityName>>

export const ALL_SKILLS = Object.keys(skillToAbility) as readonly string[]

/** Use the parsed skill catalog when available, or the bundled name map during data loading. */
export function getSkillAbility(
  skillName: string,
  parsedMap?: Readonly<Record<string, string>>,
): AbilityName | null {
  const key = skillName.toLowerCase().trim()
  return ((parsedMap ?? skillToAbility)[key] as AbilityName | undefined) ?? null
}
