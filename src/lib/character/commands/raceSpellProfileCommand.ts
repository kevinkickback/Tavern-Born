import {
  deriveNativeRacialSpellProfiles,
  reconcileNativeRacialSpellLedger,
} from '@/lib/calculations/nativeRacialSpells'
import type { RaceSpellSelectionOptions } from '@/lib/calculations/raceSpellSelection'
import type { ProvenanceLedger } from '@/lib/provenance/types'
import type { Race5e } from '@/types/5etools'
import type { Character } from '@/types/character'

/** Commit the complete new context and all native owners together. */
export function reconcileRaceSpellProfileCommand(
  character: Character,
  ledger: ProvenanceLedger,
  race: Race5e,
  subrace: Race5e | undefined,
  options?: Pick<RaceSpellSelectionOptions, 'subraceIsNested'>,
) {
  const projected = {
    ...character,
    race: race.name,
    raceSource: race.source,
    subrace: subrace?.name,
    subraceSource: subrace?.source,
  }
  const native = deriveNativeRacialSpellProfiles(projected, {
    parentRace: race,
    subraceData: subrace,
    subraceIsNested: options?.subraceIsNested ?? false,
  })
  const profiles = [
    ...character.spells.spellProfiles.filter((profile) => profile.type !== 'racial'),
    ...native,
  ]
  return {
    spells: { ...character.spells, spellProfiles: profiles },
    provenanceUpdate: reconcileNativeRacialSpellLedger(ledger, profiles),
  }
}
