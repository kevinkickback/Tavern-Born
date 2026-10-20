import { useMemo } from 'react'
import { useCharacterCalculationContext } from '@/hooks/character/useCharacterCalculationContext'
import { deriveEffectiveAbilityScores } from '@/lib/calculations/characterCalculationContext'
import {
  buildRacialSpellcastingDetails,
  collectKnownSpells,
  type RacialSpellcastingDetail,
  type SpellcastingClassDetail,
} from '@/lib/calculations/spellProfiles'
import { emptyProvenance } from '@/lib/provenance/ledger'
import type { ProvenanceLedger } from '@/lib/provenance/types'
import { useCharacterStore } from '@/store/characterStore'
import type { SpellProfile } from '@/types/character'

interface SpellSlotInfo {
  level: number
  max: number
  used: number
  available: number
  isPactMagic?: boolean
}

const EMPTY_SLOTS = { shared: {}, pact: {}, mergedSharedWithUsage: {}, mergedPactWithUsage: {} }
const EMPTY_DETAILS: SpellcastingClassDetail[] = []

export interface SpellSlotsState {
  slots: SpellSlotInfo[]
  sharedSlots: SpellSlotInfo[]
  pactSlots: SpellSlotInfo[]
  isSpellcaster: boolean
  cantrips: string[]
  spellsKnown: string[]
  preparedSpells: string[]
  spellProfiles: SpellProfile[]
  spellProvenance: ProvenanceLedger
  racialSpellcastingDetails: RacialSpellcastingDetail[]
  spellcastingDetails: SpellcastingClassDetail[]
  spellcastingDetailByProfileId: Map<string, SpellcastingClassDetail>
}

function toSlotRows(
  rows: Partial<Record<number, { max: number; used: number; isPactMagic?: boolean }>>,
): SpellSlotInfo[] {
  return Object.entries(rows)
    .map(([levelText, slot]) => ({
      level: Number(levelText),
      max: slot?.max ?? 0,
      used: slot?.used ?? 0,
      available: (slot?.max ?? 0) - (slot?.used ?? 0),
      isPactMagic: slot?.isPactMagic,
    }))
    .filter((slot) => slot.max > 0)
    .sort((a, b) => a.level - b.level)
}

export function useSpellSlots(): SpellSlotsState {
  const character = useCharacterStore((s) => s.activeCharacter)
  const calculationContext = useCharacterCalculationContext(character)
  const spellState = calculationContext?.character
  const spellProfiles = spellState?.spells.spellProfiles ?? []

  const slotsBreakdown = calculationContext?.classCasting.slots ?? EMPTY_SLOTS

  const sharedSlots = useMemo(
    () => toSlotRows(slotsBreakdown.mergedSharedWithUsage),
    [slotsBreakdown.mergedSharedWithUsage],
  )

  const pactSlots = useMemo(
    () => toSlotRows(slotsBreakdown.mergedPactWithUsage),
    [slotsBreakdown.mergedPactWithUsage],
  )

  const slots = useMemo(
    () => [...sharedSlots, ...pactSlots].sort((a, b) => a.level - b.level),
    [sharedSlots, pactSlots],
  )

  const known = useMemo(() => collectKnownSpells(spellProfiles), [spellProfiles])

  const spellcastingDetails = calculationContext?.classCasting.details ?? EMPTY_DETAILS

  const racialSpellcastingDetails = useMemo(
    () =>
      spellState
        ? buildRacialSpellcastingDetails(
            spellState,
            calculationContext?.abilityScores.total ??
              deriveEffectiveAbilityScores(spellState).total,
            calculationContext?.effects.declarations,
            calculationContext?.effects.resolutionContext,
          )
        : [],
    [spellState, calculationContext],
  )

  const spellcastingDetailByProfileId = useMemo(
    () => new Map(spellcastingDetails.map((detail) => [detail.profileId, detail] as const)),
    [spellcastingDetails],
  )

  return {
    slots,
    sharedSlots,
    pactSlots,
    isSpellcaster: spellcastingDetails.length > 0,
    cantrips: known.cantrips,
    spellsKnown: known.spellsKnown,
    preparedSpells: known.preparedSpells,
    spellProfiles,
    spellProvenance: spellState?.provenance ?? emptyProvenance(),
    spellcastingDetails,
    racialSpellcastingDetails,
    spellcastingDetailByProfileId,
  }
}
