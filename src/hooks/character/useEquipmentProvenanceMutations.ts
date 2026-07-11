import { useCallback, useMemo } from 'react'
import { useLedgerPatch } from '@/hooks/character/useLedgerPatch'
import { addGrant, makeSourceTag } from '@/lib/provenance'
import { normalizeKey } from '@/lib/provenance/normalization'
import type { ProvenanceLedger } from '@/lib/provenance/types'
import { emptyProvenance, useCharacterStore } from '@/store/characterStore'

export function useEquipmentProvenanceMutations() {
  // Domain mutation hook contract:
  // 1. Read character + ledger from store (via useLedgerPatch or direct store selectors).
  // 2. Reconcile: remove grants from the old source (reconcile* functions in lib/provenance).
  // 3. Apply: add grants from the new source (apply* functions in lib/provenance).
  // 4. Sync derived character fields (proficiencies, skills via mergeSkillState, equipment).
  // 5. Write via updateCharacter(character.id, patch) or patchLedger for ledger-only writes.
  const character = useCharacterStore((s) => s.activeCharacter)

  const ledger = useMemo<ProvenanceLedger>(
    () => character?.provenance ?? emptyProvenance(),
    [character],
  )

  const patch = useLedgerPatch()

  const applyManualEquipmentGrant = useCallback(
    (itemName: string) => {
      if (!character) return
      const tag = makeSourceTag('manual', 'User Choice', 'choice')
      patch(addGrant(ledger, 'equipment', itemName, tag))
    },
    [character, ledger, patch],
  )

  const removeEquipmentProvenance = useCallback(
    (itemName: string) => {
      if (!character) return
      const normKey = normalizeKey(itemName)
      const newEquipment = { ...ledger.equipment }
      delete newEquipment[normKey]
      patch({ ...ledger, equipment: newEquipment })
    },
    [character, ledger, patch],
  )

  const applyManualProficiencyToggle = useCallback(
    (
      domain: 'skills' | 'languages' | 'tools' | 'armor' | 'weapons' | 'savingThrows',
      itemName: string,
      added: boolean,
    ) => {
      if (!character) return
      if (added) {
        const tag = makeSourceTag('manual', 'User Choice', 'choice')
        patch(addGrant(ledger, domain, itemName, tag))
      } else {
        const normKey = normalizeKey(itemName)
        const map = ledger.proficiencies[domain]
        const filtered = (map[normKey] ?? []).filter((tag) => tag.sourceType !== 'manual')
        const newMap =
          filtered.length > 0
            ? { ...map, [normKey]: filtered }
            : Object.fromEntries(Object.entries(map).filter(([key]) => key !== normKey))
        patch({
          ...ledger,
          proficiencies: { ...ledger.proficiencies, [domain]: newMap },
        })
      }
    },
    [character, ledger, patch],
  )

  return { applyManualEquipmentGrant, removeEquipmentProvenance, applyManualProficiencyToggle }
}
