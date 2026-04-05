import { useMemo } from 'react';
import { computeArmorClass } from '@/lib/calculations/armorClass';
import { getAbilityModifier } from '@/lib/calculations/gameRules';
import { useCharacterStore } from '@/store/characterStore';

export interface ArmorClassState {
  calculatedAC: number;
  /** Stored AC on the character (may differ when overridden manually). */
  storedAC: number;
  syncAC: () => void;
  setAC: (ac: number) => void;
}

export function useArmorClass(): ArmorClassState {
  const character = useCharacterStore((s) => s.activeCharacter);
  const updateCharacter = useCharacterStore((s) => s.updateCharacter);

  const dexMod = useMemo(
    () => getAbilityModifier(character?.abilityScores.dexterity ?? 10),
    [character?.abilityScores.dexterity],
  );

  const calculatedAC = useMemo(
    () => computeArmorClass(character?.equipment ?? [], dexMod),
    [character?.equipment, dexMod],
  );

  return {
    calculatedAC,
    storedAC: character?.armorClass ?? 10,
    syncAC: () => {
      if (!character) return;
      updateCharacter(character.id, { armorClass: calculatedAC });
    },
    setAC: (ac) => {
      if (!character) return;
      updateCharacter(character.id, { armorClass: Math.max(0, ac) });
    },
  };
}
