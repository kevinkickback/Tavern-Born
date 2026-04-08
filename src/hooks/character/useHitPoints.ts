import { useCallback, useMemo } from 'react';
import { useClasses } from '@/hooks/data/useGameData';
import {
  getAbilityModifier,
  getHitDiceFromClass,
} from '@/lib/calculations/gameRules';
import { useCharacterStore } from '@/store/characterStore';
import type { Class5e } from '@/types/5etools';
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
  const classes = useClasses();

  const classByKey = useMemo(() => {
    const byKey = new Map<string, Class5e>();
    classes.forEach((cls) => {
      byKey.set(`${cls.name}|${cls.source ?? ''}`, cls);
    });
    return byKey;
  }, [classes]);

  const resolvedProgression = useMemo(() => {
    if (!character) return [];
    if (character.classProgression?.length) {
      return character.classProgression;
    }
    return [
      {
        name: character.class,
        source: character.classSource,
        levels: Math.max(1, character.level || 1),
      },
    ];
  }, [character]);

  const getClassHitDie = useCallback(
    (name: string, source?: string) => {
      const classData = classByKey.get(`${name}|${source ?? ''}`);
      if (classData) return getHitDiceFromClass(classData);
      const fallback = classes.find((cls) => cls.name === name);
      return getHitDiceFromClass(fallback);
    },
    [classByKey, classes],
  );

  const hitDie = useMemo(() => {
    const primary = resolvedProgression[0];
    return primary
      ? getClassHitDie(primary.name, primary.source)
      : getClassHitDie(character?.class ?? '', character?.classSource);
  }, [
    character?.class,
    character?.classSource,
    resolvedProgression,
    getClassHitDie,
  ]);

  const conMod = useMemo(
    () => getAbilityModifier(character?.abilityScores.constitution ?? 10),
    [character?.abilityScores.constitution],
  );

  const useAverage = character?.variantRules?.averageHitPoints !== false;
  const levelsHPBreakdown = useMemo(() => {
    const breakdown: number[] = [0]; // index 0 unused
    let firstLevel = true;

    for (const classEntry of resolvedProgression) {
      const classLevels = Math.max(0, classEntry.levels || 0);
      if (classLevels <= 0) continue;

      const classHitDie = getClassHitDie(classEntry.name, classEntry.source);
      const classAveragePerLevel = Math.floor(classHitDie / 2) + 1;

      for (let lv = 1; lv <= classLevels; lv++) {
        const dieRoll =
          firstLevel && lv === 1
            ? classHitDie
            : useAverage
              ? classAveragePerLevel
              : classHitDie;
        breakdown.push(Math.max(1, dieRoll + conMod));
        firstLevel = false;
      }
    }

    if (breakdown.length === 1) {
      breakdown.push(Math.max(1, hitDie + conMod));
    }

    return breakdown;
  }, [resolvedProgression, hitDie, conMod, useAverage, getClassHitDie]);

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
