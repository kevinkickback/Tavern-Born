import { useCallback, useMemo } from 'react';
import { useCharacterStore } from '@/store/characterStore';
import { getAbilityModifier, getProficiencyBonus } from '@/lib/calculations/gameRules';
import { AbilityName, ABILITY_NAMES } from '@/lib/calculations/abilityScores';
import { deriveAllSkills, SkillResult, ALL_SKILLS } from '@/lib/calculations/skills';

export type { SkillResult };

export interface SkillsState {
  /** All 18 skills with derived modifiers. Never stale — always computed from current scores. */
  skills: SkillResult[];

  /** Passive Perception: 10 + Perception modifier. */
  passivePerception: number;

  /** Toggle proficiency on a skill. */
  toggleProficiency: (skillName: string) => void;

  /** Toggle expertise on a skill (only meaningful when already proficient). */
  toggleExpertise: (skillName: string) => void;
}

export function useSkills(): SkillsState {
  const activeCharacter = useCharacterStore((s) => s.activeCharacter);
  const updateCharacter = useCharacterStore((s) => s.updateCharacter);

  const level = activeCharacter?.level ?? 1;
  const abilityScores = activeCharacter?.abilityScores;
  // skills object: { [skillName]: { proficient, expertise, bonus } }
  const storedSkills = activeCharacter?.skills ?? {};

  const abilityModifiers = useMemo(
    () =>
      Object.fromEntries(
        ABILITY_NAMES.map((a) => [a, getAbilityModifier(abilityScores?.[a] ?? 10)]),
      ) as Record<AbilityName, number>,
    [abilityScores],
  );

  const proficiencyBonus = useMemo(() => getProficiencyBonus(level), [level]);

  // Derive the proficient / expertise skill lists from the stored flags
  const proficientSkills = useMemo(
    () => ALL_SKILLS.filter((name) => storedSkills[name]?.proficient),
    [storedSkills],
  );
  const expertiseSkills = useMemo(
    () => ALL_SKILLS.filter((name) => storedSkills[name]?.expertise),
    [storedSkills],
  );

  const skills = useMemo(
    () => deriveAllSkills(abilityModifiers, proficientSkills, expertiseSkills, proficiencyBonus),
    [abilityModifiers, proficientSkills, expertiseSkills, proficiencyBonus],
  );

  const passivePerception = useMemo(() => {
    const perception = skills.find((s) => s.name === 'perception');
    return 10 + (perception?.modifier ?? abilityModifiers.wisdom ?? 0);
  }, [skills, abilityModifiers.wisdom]);

  const toggleProficiency = useCallback(
    (skillName: string) => {
      if (!activeCharacter) return;
      const key = skillName.toLowerCase();
      const current = activeCharacter.skills?.[key] ?? { proficient: false, expertise: false, bonus: 0 };
      const proficient = !current.proficient;
      // Clearing expertise when removing proficiency
      updateCharacter(activeCharacter.id, {
        skills: {
          ...activeCharacter.skills,
          [key]: { ...current, proficient, expertise: proficient ? current.expertise : false },
        },
      });
    },
    [activeCharacter, updateCharacter],
  );

  const toggleExpertise = useCallback(
    (skillName: string) => {
      if (!activeCharacter) return;
      const key = skillName.toLowerCase();
      const current = activeCharacter.skills?.[key] ?? { proficient: false, expertise: false, bonus: 0 };
      if (!current.proficient) return; // Expertise requires proficiency
      updateCharacter(activeCharacter.id, {
        skills: {
          ...activeCharacter.skills,
          [key]: { ...current, expertise: !current.expertise },
        },
      });
    },
    [activeCharacter, updateCharacter],
  );

  return { skills, passivePerception, toggleProficiency, toggleExpertise };
}
