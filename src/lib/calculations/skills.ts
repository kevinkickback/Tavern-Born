// Skill and saving throw utility functions — pure, no React/Zustand dependencies.
// Ported from fizbanes-forge/src/ui/components/proficiencies/ProficiencyCalculator.js
// and fizbanes-forge/src/lib/5eToolsParser.js (SKILL_TO_ABILITY).

import { AbilityName } from './abilityScores';
import { formatModifier } from './abilityScores';

export { formatModifier };

// ── Skill → ability mapping ──────────────────────────────────────────────────

/** Map of lowercase skill name → governing ability. */
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
};

export const ALL_SKILLS = Object.keys(SKILL_TO_ABILITY) as readonly string[];

export function getSkillAbility(skillName: string): AbilityName | null {
  return SKILL_TO_ABILITY[skillName.toLowerCase().trim()] ?? null;
}

// ── Saving throw utilities ───────────────────────────────────────────────────

export const SAVING_THROW_ABILITIES: readonly AbilityName[] = [
  'strength',
  'dexterity',
  'constitution',
  'intelligence',
  'wisdom',
  'charisma',
];

export function calculateSavingThrowModifier(
  abilityModifier: number,
  proficiencyBonus: number,
  isProficient: boolean,
): number {
  return abilityModifier + (isProficient ? proficiencyBonus : 0);
}

export interface SavingThrowResult {
  ability: AbilityName;
  proficient: boolean;
  modifier: number;
  modifierString: string;
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
  const proficientSet = new Set(proficientSavingThrows.map((s) => s.toLowerCase()));
  return SAVING_THROW_ABILITIES.map((ability) => {
    const proficient = proficientSet.has(ability);
    const modifier = calculateSavingThrowModifier(
      abilityModifiers[ability] ?? 0,
      proficiencyBonus,
      proficient,
    );
    return { ability, proficient, modifier, modifierString: formatModifier(modifier) };
  });
}

// ── Skill utilities ──────────────────────────────────────────────────────────

export interface SkillResult {
  name: string;
  ability: AbilityName;
  proficient: boolean;
  expertise: boolean;
  modifier: number;
  modifierString: string;
}

export function calculateSkillModifier(
  abilityModifier: number,
  proficiencyBonus: number,
  isProficient: boolean,
  hasExpertise: boolean,
): number {
  if (hasExpertise) return abilityModifier + proficiencyBonus * 2;
  if (isProficient) return abilityModifier + proficiencyBonus;
  return abilityModifier;
}

/**
 * Derive all 18 skill modifiers from current state.
 *
 * @param abilityModifiers - Record of ability → current modifier
 * @param proficientSkills - Array of skill names from `character.proficiencies` / skill flags
 * @param expertiseSkills - Array of skill names where the character has expertise
 * @param proficiencyBonus - Current proficiency bonus
 */
export function deriveAllSkills(
  abilityModifiers: Record<AbilityName, number>,
  proficientSkills: string[],
  expertiseSkills: string[],
  proficiencyBonus: number,
): SkillResult[] {
  const proficientSet = new Set(proficientSkills.map((s) => s.toLowerCase()));
  const expertiseSet = new Set(expertiseSkills.map((s) => s.toLowerCase()));

  return ALL_SKILLS.map((name) => {
    const ability = SKILL_TO_ABILITY[name]!;
    const proficient = proficientSet.has(name);
    const expertise = expertiseSet.has(name);
    const modifier = calculateSkillModifier(
      abilityModifiers[ability] ?? 0,
      proficiencyBonus,
      proficient,
      expertise,
    );
    return { name, ability, proficient, expertise, modifier, modifierString: formatModifier(modifier) };
  });
}
