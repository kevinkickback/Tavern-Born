import { useCallback } from 'react'
import { addGrant, makeSourceTag } from '@/lib/provenance'
import { normalizeKey } from '@/lib/provenance/normalization'
import type { ProvenanceLedger } from '@/lib/provenance/types'
import type { Character } from '@/types/character'

interface UseEquipmentProvenanceParams {
  character: Character | null
  ledger: ProvenanceLedger
  patch: (newLedger: ProvenanceLedger) => void
}

export function useEquipmentProvenance({ character, ledger, patch }: UseEquipmentProvenanceParams) {
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
