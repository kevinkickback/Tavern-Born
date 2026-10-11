import { renderHook } from '@testing-library/react'
import { useRaceProvenanceMutations } from '@/hooks/character/useRaceProvenanceMutations'
import { useSpellProfileMutations } from '@/hooks/character/useSpellProfileMutations'
import { useSpellSlots } from '@/hooks/character/useSpellSlots'

/** Real adapter wiring; assertions and catalog changes remain in each scenario. */
export function renderSpellEditing() {
  return renderHook(() => {
    const slots = useSpellSlots()
    return {
      slots,
      mutations: useSpellProfileMutations(slots.spellProfiles, slots.spellcastingDetailByProfileId),
      raceMutations: useRaceProvenanceMutations(),
    }
  })
}
