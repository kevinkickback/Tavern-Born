import { useCallback, useMemo } from 'react';
import { useCharacterStore } from '@/store/characterStore';
import type { Proficiencies, Skills } from '@/types/character';

export type ProficiencyCategory = keyof Proficiencies;

export interface ProficiencyEntry {
  name: string;
  /** Where this proficiency originates (may be unknown when added manually). */
  source: 'race' | 'class' | 'background' | 'feat' | 'manual' | 'unknown';
}

export interface ProficienciesState {
  proficiencies: Proficiencies;
  /** Add a proficiency to a category (noop if already present). */
  addProficiency: (category: ProficiencyCategory, name: string) => void;
  removeProficiency: (category: ProficiencyCategory, name: string) => void;
  toggleProficiency: (category: ProficiencyCategory, name: string) => void;
  setProficiencies: (category: ProficiencyCategory, names: string[]) => void;
  hasProficiency: (category: ProficiencyCategory, name: string) => boolean;
  applyRaceProficiencies: (raceData: RaceGrantData) => void;
  applyClassProficiencies: (classData: ClassGrantData) => void;
  applyBackgroundProficiencies: (bgData: BackgroundGrantData) => void;
}

export interface RaceGrantData {
  skillProficiencies?: Array<
    Record<string, boolean | { choose: { from: string[]; count: number } }>
  >;
  languageProficiencies?: Array<
    Record<
      string,
      boolean | { choose: { from: string[] } } | { anyStandard: number }
    >
  >;
}

export interface ClassGrantData {
  startingProficiencies?: {
    armor?: string[];
    weapons?: string[];
    tools?: string[];
    skills?: { choose?: { from: string[]; count: number } };
  };
}

export interface BackgroundGrantData {
  skillProficiencies?: Array<
    Record<string, boolean | { choose: { from: string[]; count: number } }>
  >;
  languageProficiencies?: Array<
    Record<
      string,
      boolean | { choose: { from: string[] } } | { anyStandard: number }
    >
  >;
  toolProficiencies?: Array<
    Record<string, boolean | { choose: { from: string[] } }>
  >;
}

export function useProficiencies(): ProficienciesState {
  const character = useCharacterStore((s) => s.activeCharacter);
  const updateCharacter = useCharacterStore((s) => s.updateCharacter);

  const mergeSkillState = useCallback(
    (current: Skills, proficiencies: string[]) => {
      const normalized = new Set(
        proficiencies.map((name) => name.toLowerCase()),
      );
      const next: Skills = {};

      for (const [name, entry] of Object.entries(current)) {
        const isProficient = normalized.has(name.toLowerCase());
        next[name] = {
          ...entry,
          proficient: isProficient,
          expertise: isProficient ? entry.expertise : false,
        };
      }

      for (const name of normalized) {
        if (next[name]) continue;
        next[name] = {
          proficient: true,
          expertise: false,
          bonus: 0,
        };
      }

      return next;
    },
    [],
  );

  const patch = useCallback(
    (category: ProficiencyCategory, names: string[]) => {
      if (!character) return;

      if (category === 'skills') {
        const normalized = [
          ...new Set(names.map((name) => name.toLowerCase())),
        ];
        updateCharacter(character.id, {
          proficiencies: {
            ...character.proficiencies,
            skills: normalized,
          },
          skills: mergeSkillState(character.skills ?? {}, normalized),
        });
        return;
      }

      updateCharacter(character.id, {
        proficiencies: { ...character.proficiencies, [category]: names },
      });
    },
    [character, mergeSkillState, updateCharacter],
  );

  const hasProficiency = useCallback(
    (category: ProficiencyCategory, name: string) => {
      return (character?.proficiencies[category] ?? []).includes(name);
    },
    [character?.proficiencies],
  );

  const addProficiency = useCallback(
    (category: ProficiencyCategory, name: string) => {
      if (!character) return;
      if (hasProficiency(category, name)) return;
      patch(category, [...(character.proficiencies[category] ?? []), name]);
    },
    [character, hasProficiency, patch],
  );

  const removeProficiency = useCallback(
    (category: ProficiencyCategory, name: string) => {
      if (!character) return;
      patch(
        category,
        (character.proficiencies[category] ?? []).filter((p) => p !== name),
      );
    },
    [character, patch],
  );

  const toggleProficiency = useCallback(
    (category: ProficiencyCategory, name: string) => {
      if (hasProficiency(category, name)) {
        removeProficiency(category, name);
      } else {
        addProficiency(category, name);
      }
    },
    [hasProficiency, removeProficiency, addProficiency],
  );

  const setProficiencies = useCallback(
    (category: ProficiencyCategory, names: string[]) => patch(category, names),
    [patch],
  );

  const applyRaceProficiencies = useCallback(
    (raceData: RaceGrantData) => {
      if (!character) return;
      const skills: string[] = [];
      const languages: string[] = [];

      for (const block of raceData.skillProficiencies ?? []) {
        for (const [key, val] of Object.entries(block)) {
          if (key !== 'choose' && val === true) skills.push(key);
        }
      }
      for (const block of raceData.languageProficiencies ?? []) {
        for (const [key, val] of Object.entries(block)) {
          if (key !== 'choose' && key !== 'anyStandard' && val === true)
            languages.push(key);
        }
      }

      const merged = (current: string[], additions: string[]) => [
        ...new Set([...current, ...additions]),
      ];
      updateCharacter(character.id, {
        proficiencies: {
          ...character.proficiencies,
          skills: merged(character.proficiencies.skills ?? [], skills),
          languages: merged(character.proficiencies.languages, languages),
        },
        skills: mergeSkillState(
          character.skills ?? {},
          merged(character.proficiencies.skills ?? [], skills),
        ),
      });
    },
    [character, mergeSkillState, updateCharacter],
  );

  const applyClassProficiencies = useCallback(
    (classData: ClassGrantData) => {
      if (!character) return;
      const sp = classData.startingProficiencies;
      if (!sp) return;
      const merged = (current: string[], additions: string[] = []) => [
        ...new Set([...current, ...additions]),
      ];
      updateCharacter(character.id, {
        proficiencies: {
          ...character.proficiencies,
          armor: merged(character.proficiencies.armor, sp.armor),
          weapons: merged(character.proficiencies.weapons, sp.weapons),
          tools: merged(character.proficiencies.tools, sp.tools),
        },
      });
    },
    [character, updateCharacter],
  );

  const applyBackgroundProficiencies = useCallback(
    (bgData: BackgroundGrantData) => {
      if (!character) return;
      const skills: string[] = [];
      const languages: string[] = [];
      const tools: string[] = [];

      for (const block of bgData.skillProficiencies ?? []) {
        for (const [key, val] of Object.entries(block)) {
          if (key !== 'choose' && val === true) skills.push(key);
        }
      }
      for (const block of bgData.languageProficiencies ?? []) {
        for (const [key, val] of Object.entries(block)) {
          if (key !== 'choose' && key !== 'anyStandard' && val === true)
            languages.push(key);
        }
      }
      for (const block of bgData.toolProficiencies ?? []) {
        for (const [key, val] of Object.entries(block)) {
          if (key !== 'choose' && val === true) tools.push(key);
        }
      }

      const merged = (current: string[], additions: string[]) => [
        ...new Set([...current, ...additions]),
      ];
      updateCharacter(character.id, {
        proficiencies: {
          ...character.proficiencies,
          skills: merged(character.proficiencies.skills ?? [], skills),
          languages: merged(character.proficiencies.languages, languages),
          tools: merged(character.proficiencies.tools, tools),
        },
        skills: mergeSkillState(
          character.skills ?? {},
          merged(character.proficiencies.skills ?? [], skills),
        ),
      });
    },
    [character, mergeSkillState, updateCharacter],
  );

  const proficiencies: Proficiencies = useMemo(
    () =>
      character?.proficiencies ?? {
        armor: [],
        weapons: [],
        tools: [],
        skills: [],
        languages: [],
        savingThrows: [],
      },
    [character?.proficiencies],
  );

  return {
    proficiencies,
    addProficiency,
    removeProficiency,
    toggleProficiency,
    setProficiencies,
    hasProficiency,
    applyRaceProficiencies,
    applyClassProficiencies,
    applyBackgroundProficiencies,
  };
}
