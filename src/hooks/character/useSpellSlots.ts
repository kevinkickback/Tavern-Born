import { useMemo } from 'react'
import { useFilteredGameData } from '@/hooks/data/useFilteredGameData'
import { useClasses, useClassLookup } from '@/hooks/data/useGameData'
import {
  buildSpellcastingClassDetails,
  calculateCharacterSpellSlots,
  collectKnownSpells,
  ensureSpellProfiles,
  type SpellcastingClassDetail,
  toClassProfileId,
} from '@/lib/calculations/spellProfiles'
import { useCharacterStore } from '@/store/characterStore'
import type { Class5e, Race5e } from '@/types/5etools'
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
  const classes = useClasses()
  const classLookup = useClassLookup()
  const { races: allRaces } = useFilteredGameData()

  const classesById = useMemo(() => {
    const map = new Map<string, Class5e>()
    for (const cls of classes) {
      map.set(toClassProfileId(cls.name, cls.source), cls)
      if (!map.has(toClassProfileId(cls.name))) {
        map.set(toClassProfileId(cls.name), cls)
      }
    }
    for (const cls of Object.values(classLookup)) {
      if (!cls) continue
      map.set(toClassProfileId(cls.name, cls.source), cls)
      if (!map.has(toClassProfileId(cls.name))) {
        map.set(toClassProfileId(cls.name), cls)
      }
    }
    return map
  }, [classes, classLookup])

  const selectedRaceData = useMemo(() => {
    if (!character?.race) return undefined

    const parentMatch = allRaces.find(
      (r) =>
        r.name === character.race &&
        (!character.raceSource || (r.source ?? '') === (character.raceSource ?? '')),
    )

    let subraceMatch: Race5e | undefined
    let subraceIsNested = false
    if (character.subrace && parentMatch?.subraces) {
      subraceMatch = parentMatch.subraces.find(
        (sr) =>
          sr.name === character.subrace &&
          (!character.subraceSource || (sr.source ?? '') === (character.subraceSource ?? '')),
      )
      if (subraceMatch) subraceIsNested = true
    }

    if (!subraceMatch && character.subrace) {
      const topLevel = allRaces.find(
        (r) =>
          r.name === character.subrace &&
          (!character.subraceSource || (r.source ?? '') === (character.subraceSource ?? '')),
      )
      if (topLevel) subraceMatch = topLevel
    }

    const parentSpells = parentMatch?.additionalSpells ?? []
    const filteredParentSpells =
      character.subrace && parentSpells.some((s) => !!s.name)
        ? parentSpells.filter(
            (s) => !s.name || s.name.toLowerCase() === character.subrace?.toLowerCase(),
          )
        : parentSpells
    const subraceSpells = subraceMatch?.additionalSpells ?? []
    const mergedSpells = [...filteredParentSpells, ...subraceSpells]

    if (mergedSpells.length === 0) return undefined

    const displayName =
      subraceIsNested && subraceMatch
        ? `${subraceMatch.name} ${parentMatch?.name ?? character.race ?? ''}`
        : (subraceMatch?.name ?? character.subrace ?? parentMatch?.name ?? character.race)
    const displaySource = subraceMatch?.source ?? parentMatch?.source

    return { name: displayName, source: displaySource, additionalSpells: mergedSpells }
  }, [
    character?.race,
    character?.subrace,
    character?.raceSource,
    character?.subraceSource,
    allRaces,
  ])

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
