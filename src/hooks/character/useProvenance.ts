import { useCallback, useMemo } from 'react';
import { useProvenanceMutations } from '@/hooks/character/useProvenanceMutations';
import { useProvenanceRows } from '@/hooks/character/useProvenanceRows';
import { buildItemLookup } from '@/lib/5etools/startingEquipment';
import type { ProvenanceLedger } from '@/lib/provenance/types';
import { emptyProvenance, useCharacterStore } from '@/store/characterStore';
import { useGameDataStore } from '@/store/gameDataStore';
import type { Character } from '@/types/character';

const EMPTY_ITEMS: never[] = [];

function getLedger(character: Character | null): ProvenanceLedger {
  return character?.provenance ?? emptyProvenance();
}

export function useProvenance() {
  const character = useCharacterStore((s) => s.activeCharacter);
  const updateCharacter = useCharacterStore((s) => s.updateCharacter);
  const gameData = useGameDataStore((s) => s.gameData);
  const items = gameData?.items ?? EMPTY_ITEMS;

  const ledger = useMemo(
    () => getLedger(character),
    [character?.provenance, character],
  );

  const itemLookup = useMemo(() => buildItemLookup(items), [items]);

  const patch = useCallback(
    (newLedger: ProvenanceLedger) => {
      if (!character) return;
      updateCharacter(character.id, { provenance: newLedger });
    },
    [character, updateCharacter],
  );

  const mutations = useProvenanceMutations({
    character,
    ledger,
    itemLookup,
    patch,
    updateCharacter,
  });

  const rows = useProvenanceRows({
    ledger,
    raceAsiChoices: character?.raceAsiChoices,
    backgroundAsiChoices: character?.backgroundAsiChoices,
  });

  return {
    ledger,
    ...mutations,
    ...rows,
  };
}
