import { useMemo } from 'react';
import {
  getAbilityModifier,
  getHitDiceFromClass,
} from '@/lib/calculations/gameRules';
import { useCharacterStore } from '@/store/characterStore';
import { useGameDataStore } from '@/store/gameDataStore';
import type { HitPoints } from '@/types/character';

export interface HitPointsState {
  hitPoints: HitPoints;
  /** Max HP as calculated from class hit die + CON mod × level. */
  calculatedMaxHP: number;
  /** Hit die faces for the character's class (e.g. 8 for a Rogue). */
  hitDie: number;
  conMod: number;
  /** HP at each individual level: [0] unused, [1] = first level, etc. */
  levelsHPBreakdown: number[];
  setCurrentHP: (hp: number) => void;
  setTempHP: (hp: number) => void;
  setMaxHP: (hp: number) => void;
  syncMaxHP: () => void;
  heal: (amount: number) => void;
  damage: (amount: number) => void;
}

export function useHitPoints(): HitPointsState {
  const character = useCharacterStore((s) => s.activeCharacter);
  const updateCharacter = useCharacterStore((s) => s.updateCharacter);
  const classes = useGameDataStore((s) => s.gameData?.classes ?? []);

  const hitDie = useMemo(
    () => getHitDiceFromClass(classes.find((c) => c.name === character?.class)),
    [character?.class, classes],
  );

  const conMod = useMemo(
    () => getAbilityModifier(character?.abilityScores.constitution ?? 10),
    [character?.abilityScores.constitution],
  );

  const useAverage = character?.variantRules?.averageHitPoints !== false;
  const averagePerLevel = Math.floor(hitDie / 2) + 1;

  const levelsHPBreakdown = useMemo(() => {
    const level = character?.level ?? 1;
    const breakdown: number[] = [0]; // index 0 unused
    for (let lv = 1; lv <= level; lv++) {
      const dieRoll = lv === 1 ? hitDie : useAverage ? averagePerLevel : hitDie;
      breakdown.push(dieRoll + conMod);
    }
    return breakdown;
  }, [character?.level, hitDie, conMod, useAverage, averagePerLevel]);

  const calculatedMaxHP = useMemo(
    () => levelsHPBreakdown.reduce((sum, v) => sum + v, 0),
    [levelsHPBreakdown],
  );

  const update = (patch: Partial<HitPoints>) => {
    if (!character) return;
    updateCharacter(character.id, {
      hitPoints: { ...character.hitPoints, ...patch },
    });
  };

  return {
    hitPoints: character?.hitPoints ?? { max: 0, current: 0, temporary: 0 },
    calculatedMaxHP,
    hitDie,
    conMod,
    levelsHPBreakdown,
    setCurrentHP: (hp) => update({ current: Math.max(0, hp) }),
    setTempHP: (hp) => update({ temporary: Math.max(0, hp) }),
    setMaxHP: (hp) => update({ max: Math.max(1, hp) }),
    syncMaxHP: () => {
      if (!character) return;
      update({
        max: calculatedMaxHP,
        current: Math.min(character.hitPoints.current, calculatedMaxHP),
      });
    },
    heal: (amount) => {
      if (!character) return;
      const max = character.hitPoints.max;
      update({ current: Math.min(max, character.hitPoints.current + amount) });
    },
    damage: (amount) => {
      if (!character) return;
      let remaining = amount;
      const temp = character.hitPoints.temporary;
      const tempAfter = Math.max(0, temp - remaining);
      remaining = Math.max(0, remaining - temp);
      update({
        temporary: tempAfter,
        current: Math.max(0, character.hitPoints.current - remaining),
      });
    },
  };
}
