import { useBackgroundProvenanceMutations } from './useBackgroundProvenanceMutations'
import { useClassProvenanceMutations } from './useClassProvenanceMutations'
import { useFeatProvenanceMutations } from './useFeatProvenanceMutations'
import { useRaceProvenanceMutations } from './useRaceProvenanceMutations'
import { useSpellProvenanceMutations } from './useSpellProvenanceMutations'

/**
 * Aggregates the provenance hooks used by cross-domain integration tests.
 *
 * **Production pages** should call the individual `use*ProvenanceMutations` hooks directly.
 * This aggregator exists for `useProvenance`, which is the integration test harness:
 * it composes the domain hooks into one surface so tests can exercise cross-domain
 * provenance interactions without calling multiple separate hooks.
 * Do not add new mutation logic here; add it to the relevant `use*ProvenanceMutations` hook.
 */
export function useProvenanceMutations() {
  const race = useRaceProvenanceMutations()
  const cls = useClassProvenanceMutations()
  const background = useBackgroundProvenanceMutations()
  const spells = useSpellProvenanceMutations()
  const feats = useFeatProvenanceMutations()

  return {
    ...race,
    ...cls,
    ...background,
    ...spells,
    ...feats,
  }
}
