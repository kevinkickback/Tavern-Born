import type { ProvenanceLedger } from '@/lib/provenance/types'
import type { Item5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import { useBackgroundProvenance } from './useBackgroundProvenance'
import { useClassProvenance } from './useClassProvenance'
import { useEquipmentProvenance } from './useEquipmentProvenance'
import { useFeatProvenance } from './useFeatProvenance'
import { useRaceProvenance } from './useRaceProvenance'
import { useSpellProvenance } from './useSpellProvenance'

interface UseProvenanceMutationsParams {
  character: Character | null
  ledger: ProvenanceLedger
  itemLookup: Map<string, Item5e>
  items: Item5e[]
  itemsBase: Item5e[]
  patch: (newLedger: ProvenanceLedger) => void
  updateCharacter: (id: string, updates: Partial<Character>) => void
}

export function useProvenanceMutations({
  character,
  ledger,
  itemLookup,
  items,
  itemsBase,
  patch,
  updateCharacter,
}: UseProvenanceMutationsParams) {
  const race = useRaceProvenance({ character, ledger, items, itemsBase, updateCharacter })
  const cls = useClassProvenance({ character, ledger, itemLookup, updateCharacter })
  const background = useBackgroundProvenance({ character, ledger, itemLookup, updateCharacter })
  const spells = useSpellProvenance({ character, ledger, patch })
  const feats = useFeatProvenance({ character, ledger, patch, updateCharacter })
  const equipment = useEquipmentProvenance({ character, ledger, patch })

  return {
    ...race,
    ...cls,
    ...background,
    ...spells,
    ...feats,
    ...equipment,
  }
}
