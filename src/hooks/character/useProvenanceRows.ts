import { useCallback, useMemo } from 'react'
import {
  getAbilityBonusRows,
  getAllProficiencyRows,
  getEquipmentRows,
  getFeatRows,
  getFeatureRows,
  getSpellRows,
} from '@/lib/provenance'
import { getSourcesRowsBySectionId } from '@/lib/provenance/sectionRows'
import type { ProvenanceLedger, SourceRow } from '@/lib/provenance/types'
import { getCollapseState, setCollapseState } from '@/lib/storage/collapseState'

interface UseProvenanceRowsParams {
  ledger: ProvenanceLedger
}

export function useProvenanceRows({ ledger }: UseProvenanceRowsParams) {
  const proficiencyRows = useMemo(() => getAllProficiencyRows(ledger), [ledger])
  const abilityBonusRows = useMemo(() => getAbilityBonusRows(ledger), [ledger])
  const featRows = useMemo(() => getFeatRows(ledger), [ledger])
  const featureRows = useMemo(() => getFeatureRows(ledger), [ledger])
  const spellRows = useMemo(() => getSpellRows(ledger), [ledger])
  const equipmentRows = useMemo(() => getEquipmentRows(ledger), [ledger])

  const getSourcesRowsBySection = useCallback(
    (sectionId: string): SourceRow[] =>
      getSourcesRowsBySectionId({
        sectionId,
        proficiencyRows,
        abilityBonusRows,
        featRows,
        featureRows,
        spellRows,
        equipmentRows,
      }),
    [proficiencyRows, abilityBonusRows, featRows, featureRows, spellRows, equipmentRows],
  )

  const getCollapsedState = useCallback(
    (sectionId: string, defaultCollapsed = true) => getCollapseState(sectionId, defaultCollapsed),
    [],
  )

  const persistCollapsedState = useCallback((sectionId: string, collapsed: boolean) => {
    setCollapseState(sectionId, collapsed)
  }, [])

  return {
    proficiencyRows,
    abilityBonusRows,
    featRows,
    featureRows,
    spellRows,
    equipmentRows,
    getSourcesRowsBySection,
    getCollapsedState,
    persistCollapsedState,
  }
}
