import { useMemo } from 'react'
import { useCharacterRaceData } from '@/hooks/character/useCharacterRaceData'
import { useClassesById } from '@/hooks/character/useClassesById'
import {
  buildSpellcastingClassDetails,
  calculateCharacterSpellSlots,
  collectKnownSpells,
  ensureSpellProfiles,
  type SpellcastingClassDetail,
} from '@/lib/calculations/spellProfiles'
import { useCharacterStore } from '@/store/characterStore'
import type { SpellProfile } from '@/types/character'

export interface SpellSlotInfo {
  level: number
  max: number
  used: number
  available: number
  isPactMagic?: boolean
}

export interface SpellSlotsState {
  slots: SpellSlotInfo[]
  sharedSlots: SpellSlotInfo[]
  pactSlots: SpellSlotInfo[]
  isSpellcaster: boolean
  cantrips: string[]
  spellsKnown: string[]
  preparedSpells: string[]
  spellProfiles: SpellProfile[]
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
  const classesById = useClassesById()
  const {
    mergedAdditionalSpells: raceAdditionalSpells,
    displayName: raceDisplayName,
    displaySource: raceDisplaySource,
  } = useCharacterRaceData(character)

  const selectedRaceData = useMemo(() => {
    if (raceAdditionalSpells.length === 0) return undefined
    return {
      name: raceDisplayName ?? '',
      source: raceDisplaySource,
      additionalSpells: raceAdditionalSpells,
    }
  }, [raceAdditionalSpells, raceDisplayName, raceDisplaySource])

  const spellProfiles = useMemo(() => {
    if (!character) return []
    return ensureSpellProfiles(character, classesById, selectedRaceData)
  }, [character, classesById, selectedRaceData])

  const slotsBreakdown = useMemo(() => {
    if (!character) {
      return {
        shared: {},
        pact: {},
        mergedSharedWithUsage: {},
        mergedPactWithUsage: {},
      }
    }
    return calculateCharacterSpellSlots(character, classesById)
  }, [character, classesById])

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

  const spellcastingDetails = useMemo(() => {
    if (!character) return []
    return buildSpellcastingClassDetails(character, classesById)
  }, [character, classesById])

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
    spellcastingDetails,
    spellcastingDetailByProfileId,
  }
}
