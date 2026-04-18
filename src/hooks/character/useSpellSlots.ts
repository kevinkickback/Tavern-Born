import { useMemo } from 'react'
import { useSpellProfileMutations } from '@/hooks/character/useSpellProfileMutations'
import { useClasses, useClassLookup, useRaces } from '@/hooks/data/useGameData'
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
  syncProfiles: () => void
  addCantrip: (name: string, profileId?: string) => void
  removeCantrip: (name: string, profileId?: string) => void
  addSpellKnown: (name: string, profileId?: string) => void
  removeSpellKnown: (name: string, profileId?: string) => void
  addSpellToProfile: (profileId: string, name: string, kind: 'cantrip' | 'spell') => void
  setProfileSpells: (profileId: string, cantrips: string[], spellsKnown: string[]) => void
  removeSpellFromProfile: (profileId: string, name: string, kind: 'cantrip' | 'spell') => void
  togglePrepared: (profileId: string, name: string) => void
  selectRacialSpell: (profileId: string, choiceId: string, spellName: string) => void
  removeRacialSpell: (profileId: string, choiceId: string, spellName: string) => void
  setRacialCastingAbility: (profileId: string, ability: string) => void
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
  const allRaces = useRaces()

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

    // Find the parent race entry
    const parentMatch = allRaces.find(
      (r) =>
        r.name === character.race &&
        (!character.raceSource || (r.source ?? '') === (character.raceSource ?? '')),
    )

    // Find the subrace entry nested inside the parent
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

    // Also check for subraces promoted to top-level entries (e.g. MPMM lineage races)
    if (!subraceMatch && character.subrace) {
      const topLevel = allRaces.find(
        (r) =>
          r.name === character.subrace &&
          (!character.subraceSource || (r.source ?? '') === (character.subraceSource ?? '')),
      )
      if (topLevel) subraceMatch = topLevel
    }

    // Merge additionalSpells from parent and subrace (both can contribute)
    // When the parent has named additionalSpells blocks (keyed by subrace name),
    // filter to only include the block matching the selected subrace.
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

    // Use the most specific name for the profile label.
    // For nested subraces (e.g. "High" inside "Elf"), combine with the parent race name
    // so the card reads "High Elf" instead of just "High".
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

  const mutations = useSpellProfileMutations(spellProfiles, spellcastingDetailByProfileId)

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
    ...mutations,
  }
}
