import { useMemo } from 'react';
import { useCharacterStore } from '@/store/characterStore';
import {
  getProficiencyBonus,
  getAbilityModifier,
  MAX_CHARACTER_LEVEL,
} from '@/lib/calculations/gameRules';
import { formatModifier } from '@/lib/calculations/abilityScores';

/**
 * Derived level and proficiency state for the active character.
 *
 * Uses the stored `level` field (which mirrors total level). When the
 * progression/multi-class system is added, this hook can be updated to
 * read from `character.progression` via `getTotalLevel()` without any
 * change to callers.
 */
export interface CharacterLevelState {
  level: number;
  proficiencyBonus: number;
  proficiencyBonusString: string;
  isMaxLevel: boolean;

  /** Initiative modifier — DEX modifier (no proficiency by default). */
  initiativeModifier: number;
  initiativeString: string;
}

export function useCharacterLevel(): CharacterLevelState {
  const activeCharacter = useCharacterStore((s) => s.activeCharacter);

  const level = activeCharacter?.level ?? 1;
  const dexScore = activeCharacter?.abilityScores?.dexterity ?? 10;

  const proficiencyBonus = useMemo(() => getProficiencyBonus(level), [level]);
  const proficiencyBonusString = useMemo(
    () => formatModifier(proficiencyBonus),
    [proficiencyBonus],
  );

  const initiativeModifier = useMemo(() => getAbilityModifier(dexScore), [dexScore]);
  const initiativeString = useMemo(
    () => formatModifier(initiativeModifier),
    [initiativeModifier],
  );

  const isMaxLevel = level >= MAX_CHARACTER_LEVEL;

  return {
    level,
    proficiencyBonus,
    proficiencyBonusString,
    isMaxLevel,
    initiativeModifier,
    initiativeString,
  };
}
