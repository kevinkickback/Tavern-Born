import { useCallback, useMemo } from 'react';
import {
  ABILITY_ABBREVIATIONS,
  ABILITY_NAMES,
  type AbilityName,
  calculatePointBuyTotal,
  formatModifier,
  getRemainingPointBuy,
  getValidPointBuyScores,
  isValidPointBuyScore,
} from '@/lib/calculations/abilityScores';
import {
  getAbilityModifier,
  POINT_BUY_BUDGET,
  POINT_BUY_MIN,
} from '@/lib/calculations/gameRules';
import { useCharacterStore } from '@/store/characterStore';

/**
 * Derived ability score state for the active character.
 * Replaces manual modifier calculations scattered across components.
 */
export interface AbilityScoreState {
  scores: Record<AbilityName, number>;
  modifiers: Record<AbilityName, number>;
  modifierStrings: Record<AbilityName, string>;
  pointBuyTotal: number;
  pointBuyRemaining: number;
  validPointBuyScores: number[];
  setScore: (ability: AbilityName, score: number) => void;
  setAllScores: (scores: Partial<Record<AbilityName, number>>) => void;
  resetScores: (base?: number) => void;
}

export function useAbilityScores(): AbilityScoreState {
  const activeCharacter = useCharacterStore((s) => s.activeCharacter);
  const updateCharacter = useCharacterStore((s) => s.updateCharacter);

  const scores = useMemo(() => {
    const raw = activeCharacter?.abilityScores;
    return {
      strength: raw?.strength ?? 8,
      dexterity: raw?.dexterity ?? 8,
      constitution: raw?.constitution ?? 8,
      intelligence: raw?.intelligence ?? 8,
      wisdom: raw?.wisdom ?? 8,
      charisma: raw?.charisma ?? 8,
    };
  }, [activeCharacter?.abilityScores]);

  const modifiers = useMemo(
    () =>
      Object.fromEntries(
        ABILITY_NAMES.map((a) => [a, getAbilityModifier(scores[a])]),
      ) as Record<AbilityName, number>,
    [scores],
  );

  const modifierStrings = useMemo(
    () =>
      Object.fromEntries(
        ABILITY_NAMES.map((a) => [a, formatModifier(modifiers[a])]),
      ) as Record<AbilityName, string>,
    [modifiers],
  );

  const pointBuyTotal = useMemo(() => calculatePointBuyTotal(scores), [scores]);
  const pointBuyRemaining = useMemo(
    () => getRemainingPointBuy(scores, POINT_BUY_BUDGET),
    [scores],
  );

  const validPointBuyScores = useMemo(() => getValidPointBuyScores(), []);

  const setScore = useCallback(
    (ability: AbilityName, score: number) => {
      if (!activeCharacter) return;
      updateCharacter(activeCharacter.id, {
        abilityScores: { ...scores, [ability]: score },
      });
    },
    [activeCharacter, updateCharacter, scores],
  );

  const setAllScores = useCallback(
    (newScores: Partial<Record<AbilityName, number>>) => {
      if (!activeCharacter) return;
      updateCharacter(activeCharacter.id, {
        abilityScores: { ...scores, ...newScores },
      });
    },
    [activeCharacter, updateCharacter, scores],
  );

  const resetScores = useCallback(
    (base = POINT_BUY_MIN) => {
      if (!activeCharacter) return;
      updateCharacter(activeCharacter.id, {
        abilityScores: Object.fromEntries(
          ABILITY_NAMES.map((a) => [a, base]),
        ) as Record<AbilityName, number>,
      });
    },
    [activeCharacter, updateCharacter],
  );

  return {
    scores,
    modifiers,
    modifierStrings,
    pointBuyTotal,
    pointBuyRemaining,
    validPointBuyScores,
    setScore,
    setAllScores,
    resetScores,
  };
}

export { ABILITY_NAMES, ABILITY_ABBREVIATIONS };
export { isValidPointBuyScore };
