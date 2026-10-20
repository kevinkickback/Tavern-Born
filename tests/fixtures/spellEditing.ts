import { renderHook } from '@testing-library/react'
import { useRaceProvenanceMutations } from '@/hooks/character/useRaceProvenanceMutations'
import { useSpellProfileMutations } from '@/hooks/character/useSpellProfileMutations'
import { useSpellSlots } from '@/hooks/character/useSpellSlots'
import { SPECIAL_SPELL_PROFILE_ID } from '@/lib/calculations/spellProfiles.constants'
import { useCharacterStore } from '@/store/characterStore'

type BonusPicker = { setProfileSpells: (id: string, cantrips: string[], known: string[]) => void }

/** Finish an unchanged/current Bonus selection using the actual hook's sole picker API. */
export function finishBonusSelection(
  picker: BonusPicker,
  reference?: string,
  kind?: 'cantrip' | 'spell',
) {
  const bonus = useCharacterStore
    .getState()
    .activeCharacter?.spells.spellProfiles.find((row) => row.id === SPECIAL_SPELL_PROFILE_ID)
  picker.setProfileSpells(
    SPECIAL_SPELL_PROFILE_ID,
    [...(bonus?.cantrips ?? []), ...(reference && kind === 'cantrip' ? [reference] : [])],
    [...(bonus?.spellsKnown ?? []), ...(reference && kind === 'spell' ? [reference] : [])],
  )
}

/** Real adapter wiring; assertions and catalog changes remain in each scenario. */
export function renderSpellEditing() {
  return renderHook(() => {
    const slots = useSpellSlots()
    return {
      slots,
      mutations: useSpellProfileMutations(slots.spellProfiles),
      raceMutations: useRaceProvenanceMutations(),
    }
  })
}
