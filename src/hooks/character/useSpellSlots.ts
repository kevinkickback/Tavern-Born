import { useCallback, useMemo } from 'react'
import { useClasses, useClassLookup, useRaces } from '@/hooks/data/useGameData'
import {
  buildSpellcastingClassDetails,
  calculateCharacterSpellSlots,
  collectKnownSpells,
  ensureSpellProfiles,
  SPECIAL_SPELL_PROFILE_ID,
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

function getDefaultProfileId(profiles: SpellProfile[]): string {
  const firstClass = profiles.find((profile) => profile.type === 'class')
  return firstClass?.id ?? SPECIAL_SPELL_PROFILE_ID
}

function upsertProfileSpell(
  profiles: SpellProfile[],
  profileId: string,
  name: string,
  kind: 'cantrip' | 'spell',
): SpellProfile[] {
  return profiles.map((profile) => {
    if (profile.id !== profileId) return profile

    if (kind === 'cantrip') {
      if (profile.cantrips.includes(name)) return profile
      return { ...profile, cantrips: [...profile.cantrips, name] }
    }

    if (profile.spellsKnown.includes(name)) return profile
    return { ...profile, spellsKnown: [...profile.spellsKnown, name] }
  })
}

function removeProfileSpell(
  profiles: SpellProfile[],
  profileId: string,
  name: string,
  kind: 'cantrip' | 'spell',
): SpellProfile[] {
  return profiles.map((profile) => {
    if (profile.id !== profileId) return profile

    if (kind === 'cantrip') {
      return {
        ...profile,
        cantrips: profile.cantrips.filter((spellName) => spellName !== name),
        preparedSpells: profile.preparedSpells.filter((spellName) => spellName !== name),
      }
    }

    return {
      ...profile,
      spellsKnown: profile.spellsKnown.filter((spellName) => spellName !== name),
      preparedSpells: profile.preparedSpells.filter((spellName) => spellName !== name),
    }
  })
}

function replaceProfileSpells(
  profiles: SpellProfile[],
  profileId: string,
  cantrips: string[],
  spellsKnown: string[],
): SpellProfile[] {
  return profiles.map((profile) => {
    if (profile.id !== profileId) return profile

    return {
      ...profile,
      cantrips: [...new Set(cantrips)],
      spellsKnown: [...new Set(spellsKnown)],
      preparedSpells: profile.alwaysPrepared
        ? []
        : profile.preparedSpells.filter((name) => spellsKnown.includes(name)),
    }
  })
}

export function useSpellSlots(): SpellSlotsState {
  const character = useCharacterStore((s) => s.activeCharacter)
  const updateCharacter = useCharacterStore((s) => s.updateCharacter)
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
    if (character.subrace && parentMatch?.subraces) {
      subraceMatch = parentMatch.subraces.find(
        (sr) =>
          sr.name === character.subrace &&
          (!character.subraceSource || (sr.source ?? '') === (character.subraceSource ?? '')),
      )
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

    // Use the most specific name for the profile label
    const displayName =
      subraceMatch?.name ?? character.subrace ?? parentMatch?.name ?? character.race
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

  const patchSpells = useCallback(
    (patch: Partial<NonNullable<typeof character>['spells']>) => {
      if (!character) return
      updateCharacter(character.id, {
        spells: { ...character.spells, ...patch },
      })
    },
    [character, updateCharacter],
  )

  const syncProfiles = useCallback(() => {
    if (!character) return
    patchSpells({ spellProfiles })
  }, [character, patchSpells, spellProfiles])

  const addSpellToProfile = useCallback(
    (profileId: string, name: string, kind: 'cantrip' | 'spell') => {
      if (!character) return
      patchSpells({
        spellProfiles: upsertProfileSpell(spellProfiles, profileId, name, kind),
      })
    },
    [character, patchSpells, spellProfiles],
  )

  const setProfileSpells = useCallback(
    (profileId: string, cantrips: string[], spellsKnown: string[]) => {
      if (!character) return
      patchSpells({
        spellProfiles: replaceProfileSpells(spellProfiles, profileId, cantrips, spellsKnown),
      })
    },
    [character, patchSpells, spellProfiles],
  )

  const removeSpellFromProfile = useCallback(
    (profileId: string, name: string, kind: 'cantrip' | 'spell') => {
      if (!character) return
      patchSpells({
        spellProfiles: removeProfileSpell(spellProfiles, profileId, name, kind),
      })
    },
    [character, patchSpells, spellProfiles],
  )

  /**
   * @deprecated Use addSpellToProfile(profileId, name, 'cantrip') directly.
   */
  const addCantrip = useCallback(
    (name: string, profileId?: string) => {
      const targetId = profileId ?? getDefaultProfileId(spellProfiles)
      addSpellToProfile(targetId, name, 'cantrip')
    },
    [addSpellToProfile, spellProfiles],
  )

  /**
   * @deprecated Use removeSpellFromProfile(profileId, name, 'cantrip') directly.
   */
  const removeCantrip = useCallback(
    (name: string, profileId?: string) => {
      const targetId = profileId ?? getDefaultProfileId(spellProfiles)
      removeSpellFromProfile(targetId, name, 'cantrip')
    },
    [removeSpellFromProfile, spellProfiles],
  )

  /**
   * @deprecated Use addSpellToProfile(profileId, name, 'spell') directly.
   */
  const addSpellKnown = useCallback(
    (name: string, profileId?: string) => {
      const targetId = profileId ?? getDefaultProfileId(spellProfiles)
      addSpellToProfile(targetId, name, 'spell')
    },
    [addSpellToProfile, spellProfiles],
  )

  /**
   * @deprecated Use removeSpellFromProfile(profileId, name, 'spell') directly.
   */
  const removeSpellKnown = useCallback(
    (name: string, profileId?: string) => {
      const targetId = profileId ?? getDefaultProfileId(spellProfiles)
      removeSpellFromProfile(targetId, name, 'spell')
    },
    [removeSpellFromProfile, spellProfiles],
  )

  const togglePrepared = useCallback(
    (profileId: string, name: string) => {
      if (!character) return
      const nextProfiles = spellProfiles.map((profile) => {
        if (profile.id !== profileId || profile.alwaysPrepared) return profile

        const isPrepared = profile.preparedSpells.includes(name)
        const detail = spellcastingDetailByProfileId.get(profileId)
        const preparedLimit =
          detail?.isPreparedCaster === true ? (detail.preparedSpellLimit ?? null) : null

        if (
          !isPrepared &&
          preparedLimit !== null &&
          profile.preparedSpells.length >= preparedLimit
        ) {
          return profile
        }

        return {
          ...profile,
          preparedSpells: isPrepared
            ? profile.preparedSpells.filter((spellName) => spellName !== name)
            : [...profile.preparedSpells, name],
        }
      })

      patchSpells({ spellProfiles: nextProfiles })
    },
    [character, patchSpells, spellProfiles, spellcastingDetailByProfileId],
  )

  const selectRacialSpell = useCallback(
    (profileId: string, choiceId: string, spellName: string) => {
      if (!character) return
      const nextProfiles = spellProfiles.map((profile) => {
        if (profile.id !== profileId || profile.type !== 'racial' || !profile.choices) {
          return profile
        }
        const nextChoices = profile.choices.map((choice) => {
          if (choice.id !== choiceId) return choice
          if (choice.selected.includes(spellName)) return choice
          if (choice.selected.length >= choice.count) return choice
          return { ...choice, selected: [...choice.selected, spellName] }
        })
        const updatedChoice = nextChoices.find((c) => c.id === choiceId)
        const wasAdded = updatedChoice?.selected.includes(spellName) ?? false
        if (!wasAdded) return profile

        const isCantrip = updatedChoice?.isCantrip ?? false
        return {
          ...profile,
          choices: nextChoices,
          cantrips: isCantrip ? [...profile.cantrips, spellName] : profile.cantrips,
          spellsKnown: isCantrip ? profile.spellsKnown : [...profile.spellsKnown, spellName],
        }
      })
      patchSpells({ spellProfiles: nextProfiles })
    },
    [character, patchSpells, spellProfiles],
  )

  const removeRacialSpell = useCallback(
    (profileId: string, choiceId: string, spellName: string) => {
      if (!character) return
      const nextProfiles = spellProfiles.map((profile) => {
        if (profile.id !== profileId || profile.type !== 'racial' || !profile.choices) {
          return profile
        }
        const nextChoices = profile.choices.map((choice) => {
          if (choice.id !== choiceId) return choice
          return { ...choice, selected: choice.selected.filter((s) => s !== spellName) }
        })
        return {
          ...profile,
          choices: nextChoices,
          cantrips: profile.cantrips.filter((s) => s !== spellName),
          spellsKnown: profile.spellsKnown.filter((s) => s !== spellName),
        }
      })
      patchSpells({ spellProfiles: nextProfiles })
    },
    [character, patchSpells, spellProfiles],
  )

  const setRacialCastingAbility = useCallback(
    (profileId: string, ability: string) => {
      if (!character) return
      const nextProfiles = spellProfiles.map((profile) => {
        if (profile.id !== profileId || profile.type !== 'racial') return profile
        return { ...profile, castingAbility: ability }
      })
      patchSpells({ spellProfiles: nextProfiles })
    },
    [character, patchSpells, spellProfiles],
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
    syncProfiles,
    addCantrip,
    removeCantrip,
    addSpellKnown,
    removeSpellKnown,
    addSpellToProfile,
    setProfileSpells,
    removeSpellFromProfile,
    togglePrepared,
    selectRacialSpell,
    removeRacialSpell,
    setRacialCastingAbility,
  }
}
