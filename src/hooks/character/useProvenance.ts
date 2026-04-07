import { useCallback, useMemo } from 'react';
import { useProvenanceMutations } from '@/hooks/character/useProvenanceMutations';
import { useProvenanceRows } from '@/hooks/character/useProvenanceRows';
import type { ProvenanceLedger } from '@/lib/provenance/types';
import { emptyProvenance, useCharacterStore } from '@/store/characterStore';
import type { Character } from '@/types/character';

function getLedger(character: Character | null): ProvenanceLedger {
  return character?.provenance ?? emptyProvenance();
}

export function useProvenance() {
  const character = useCharacterStore((s) => s.activeCharacter);
  const updateCharacter = useCharacterStore((s) => s.updateCharacter);

  const ledger = useMemo(
    () => getLedger(character),
    [character?.provenance, character],
  );

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
