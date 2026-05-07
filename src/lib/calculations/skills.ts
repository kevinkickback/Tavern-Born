import type { Skills } from '@/types/character'
import { ABILITY_ABBREV_TO_FULL } from './abilityNames'
import { ABILITY_NAMES, type AbilityName, formatModifier } from './abilityScores'

export { formatModifier }

/**
 * FALLBACK: static skill→ability map used when parsed game data is unavailable
 * (e.g. before data/skills.json has loaded or in tests). Validated against the
 * parsed data in DEV mode via validateSkillToAbilityMap(). When GameDataLookups
 * is available, prefer skillToAbilityMap from there — it is derived directly
 * from data/skills.json and takes precedence over this constant.
 */
export const SKILL_TO_ABILITY: Readonly<Record<string, AbilityName>> = {
  acrobatics: 'dexterity',
  'animal handling': 'wisdom',
  arcana: 'intelligence',
  athletics: 'strength',
  deception: 'charisma',
  history: 'intelligence',
  insight: 'wisdom',
  intimidation: 'charisma',
  investigation: 'intelligence',
  medicine: 'wisdom',
  nature: 'intelligence',
  perception: 'wisdom',
  performance: 'charisma',
  persuasion: 'charisma',
  religion: 'intelligence',
  'sleight of hand': 'dexterity',
  stealth: 'dexterity',
  survival: 'wisdom',
}

export const ALL_SKILLS = Object.keys(SKILL_TO_ABILITY) as readonly string[]

/**
 * Validate that the static SKILL_TO_ABILITY map matches skills loaded from
 * `data/skills.json` at runtime. Call once after game data is loaded in dev mode.
 * Logs warnings for any discrepancies so they surface during development.
 */
export function validateSkillToAbilityMap(parsedSkills: unknown[]): void {
  const seen = new Set<string>()

  for (const skill of parsedSkills) {
    if (!skill || typeof skill !== 'object') continue
    const s = skill as Record<string, unknown>
    const name = typeof s.name === 'string' ? s.name.toLowerCase().trim() : null
    const abbrv = typeof s.ability === 'string' ? s.ability.toLowerCase().trim() : null
    if (!name || !abbrv) continue
    if (seen.has(name)) continue // deduplicate PHB/XPHB entries
    seen.add(name)

    const fullAbility = ABILITY_ABBREV_TO_FULL[abbrv] as AbilityName | undefined
    if (!fullAbility) {
      console.warn(
        `[skills] validateSkillToAbilityMap: unknown ability abbreviation "${abbrv}" for skill "${name}"`,
      )
      continue
    }

    const staticAbility = SKILL_TO_ABILITY[name]
    if (!staticAbility) {
      console.warn(
        `[skills] validateSkillToAbilityMap: skill "${name}" found in JSON but missing from SKILL_TO_ABILITY`,
      )
    } else if (staticAbility !== fullAbility) {
      console.warn(
        `[skills] validateSkillToAbilityMap: mismatch for "${name}": static=${staticAbility}, json=${fullAbility}`,
      )
    }
  }

  for (const staticSkill of ALL_SKILLS) {
    if (!seen.has(staticSkill)) {
      console.warn(
        `[skills] validateSkillToAbilityMap: skill "${staticSkill}" in SKILL_TO_ABILITY but not found in JSON`,
      )
    }
  }
}

/**
 * Resolve the governing ability for a skill by name.
 * Prefers the parsed map from GameDataLookups when provided;
 * falls back to the static FALLBACK SKILL_TO_ABILITY constant.
 */
export function getSkillAbility(
  skillName: string,
  parsedMap?: Readonly<Record<string, string>>,
): AbilityName | null {
  const key = skillName.toLowerCase().trim()
  const resolved = parsedMap ?? SKILL_TO_ABILITY
  return (resolved[key] as AbilityName | undefined) ?? null
}

export const SAVING_THROW_ABILITIES: readonly AbilityName[] = ABILITY_NAMES

export function calculateSavingThrowModifier(
  abilityModifier: number,
  proficiencyBonus: number,
  isProficient: boolean,
): number {
  return abilityModifier + (isProficient ? proficiencyBonus : 0)
}

export interface SavingThrowResult {
  ability: AbilityName
  proficient: boolean
  modifier: number
  modifierString: string
}

/**
 * Derive all saving throw modifiers from current state.
 *
 * @param abilityModifiers - Record of ability → current modifier (from `useAbilityScores` or `getAllAbilityModifiers`)
 * @param proficientSavingThrows - Array of ability names that are proficient (from `character.proficiencies.savingThrows`)
 * @param proficiencyBonus - Current proficiency bonus (from `useCharacterLevel`)
 */
export function deriveAllSavingThrows(
  abilityModifiers: Record<AbilityName, number>,
  proficientSavingThrows: string[],
  proficiencyBonus: number,
): SavingThrowResult[] {
  const proficientSet = new Set(proficientSavingThrows.map((s) => s.toLowerCase()))
  return SAVING_THROW_ABILITIES.map((ability) => {
    const proficient = proficientSet.has(ability)
    const modifier = calculateSavingThrowModifier(
      abilityModifiers[ability] ?? 0,
      proficiencyBonus,
      proficient,
    )
    return {
      ability,
      proficient,
      modifier,
      modifierString: formatModifier(modifier),
    }
  })
}

export interface SkillResult {
  name: string
  ability: AbilityName
  proficient: boolean
  expertise: boolean
  modifier: number
  modifierString: string
}

export function calculateSkillModifier(
  abilityModifier: number,
  proficiencyBonus: number,
  isProficient: boolean,
  hasExpertise: boolean,
): number {
  if (hasExpertise) return abilityModifier + proficiencyBonus * 2
  if (isProficient) return abilityModifier + proficiencyBonus
  return abilityModifier
}

/**
 * Derive all skill modifiers from current state.
 *
 * @param abilityModifiers - Record of ability → current modifier
 * @param proficientSkills - Array of skill names from `character.proficiencies` / skill flags
 * @param expertiseSkills - Array of skill names where the character has expertise
 * @param proficiencyBonus - Current proficiency bonus
 * @param parsedSkillToAbilityMap - Parsed map from GameDataLookups.skillToAbilityMap.
 *   When provided this takes precedence over the static SKILL_TO_ABILITY fallback.
 * @param parsedSkillList - Parsed ordered skill names from GameDataLookups.skillList.
 *   When provided this takes precedence over the static ALL_SKILLS fallback.
 */
export function deriveAllSkills(
  abilityModifiers: Record<AbilityName, number>,
  proficientSkills: string[],
  expertiseSkills: string[],
  proficiencyBonus: number,
  parsedSkillToAbilityMap?: Readonly<Record<string, string>>,
  parsedSkillList?: readonly string[],
): SkillResult[] {
  const resolvedMap = parsedSkillToAbilityMap ?? SKILL_TO_ABILITY
  const resolvedSkillList = parsedSkillList ?? ALL_SKILLS
  const proficientSet = new Set(proficientSkills.map((s) => s.toLowerCase()))
  const expertiseSet = new Set(expertiseSkills.map((s) => s.toLowerCase()))

  return resolvedSkillList.map((name) => {
    const ability = (resolvedMap[name] as AbilityName | undefined) ?? 'strength'
    const proficient = proficientSet.has(name)
    const expertise = expertiseSet.has(name)
    const modifier = calculateSkillModifier(
      abilityModifiers[ability] ?? 0,
      proficiencyBonus,
      proficient,
      expertise,
    )
    return {
      name,
      ability,
      proficient,
      expertise,
      modifier,
      modifierString: formatModifier(modifier),
    }
  })
}

/**
 * Produce a new `character.skills` map that reflects the given list of proficient skill names.
 *
 * Preserves existing expertise and per-skill bonus values. The `proficient` flag is updated
 * to match `proficiencies`; `expertise` is cleared if proficiency is being removed.
 *
 * Use this whenever `character.proficiencies.skills` changes so both structures stay in sync.
 */
export function mergeSkillState(current: Skills, proficiencies: string[]): Skills {
  const normalized = new Set(proficiencies.map((name) => name.toLowerCase()))
  const next: Skills = {}

  for (const [name, entry] of Object.entries(current)) {
    const isProficient = normalized.has(name.toLowerCase())
    next[name] = {
      ...entry,
      proficient: isProficient,
      expertise: isProficient ? entry.expertise : false,
    }
  }

  for (const name of normalized) {
    if (next[name]) continue
    next[name] = { proficient: true, expertise: false, bonus: 0 }
  }

  return next
}
