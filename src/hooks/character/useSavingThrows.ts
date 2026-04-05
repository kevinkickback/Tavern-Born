import { useMemo } from 'react';
import {
  ABILITY_NAMES,
  type AbilityName,
} from '@/lib/calculations/abilityScores';
import {
  getAbilityModifier,
  getProficiencyBonus,
} from '@/lib/calculations/gameRules';
import {
  deriveAllSavingThrows,
  type SavingThrowResult,
} from '@/lib/calculations/skills';
import { useCharacterStore } from '@/store/characterStore';

export type { SavingThrowResult };

export interface SavingThrowsState {
  /** All six saving throws with derived modifiers. Never stale — derived from scores + proficiency. */
  savingThrows: SavingThrowResult[];

  /** Toggle proficiency on a saving throw (adds/removes from character.proficiencies.savingThrows). */
  toggleProficiency: (ability: AbilityName) => void;
}

export function useSavingThrows(): SavingThrowsState {
  const activeCharacter = useCharacterStore((s) => s.activeCharacter);
  const updateCharacter = useCharacterStore((s) => s.updateCharacter);

  const level = activeCharacter?.level ?? 1;
  const abilityScores = activeCharacter?.abilityScores;
  const proficientSavingThrows =
    activeCharacter?.proficiencies?.savingThrows ?? [];

  const abilityModifiers = useMemo(() => {
    return Object.fromEntries(
      ABILITY_NAMES.map((a) => [
        a,
        getAbilityModifier(abilityScores?.[a] ?? 10),
      ]),
    ) as Record<AbilityName, number>;
  }, [abilityScores]);

  const proficiencyBonus = useMemo(() => getProficiencyBonus(level), [level]);

  const savingThrows = useMemo(
    () =>
      deriveAllSavingThrows(
        abilityModifiers,
        proficientSavingThrows,
        proficiencyBonus,
      ),
    [abilityModifiers, proficientSavingThrows, proficiencyBonus],
  );

  const toggleProficiency = (ability: AbilityName) => {
    if (!activeCharacter) return;
    const current = activeCharacter.proficiencies?.savingThrows ?? [];
    const updated = current.includes(ability)
      ? current.filter((a) => a !== ability)
      : [...current, ability];
    updateCharacter(activeCharacter.id, {
      proficiencies: {
        ...activeCharacter.proficiencies,
        savingThrows: updated,
      },
    });
  };

  return { savingThrows, toggleProficiency };
}
