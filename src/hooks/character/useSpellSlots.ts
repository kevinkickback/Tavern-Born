import { useCallback, useMemo } from 'react'
import { useClasses, useClassLookup } from '@/hooks/data/useGameData'
import {
  buildSpellcastingClassDetails,
  calculateCharacterSpellSlots,
  collectKnownSpells,
  ensureSpellProfiles,
  SPECIAL_SPELL_PROFILE_ID,
  type SpellcastingClassDetail,
} from '@/lib/calculations/spellProfiles'
import { useCharacterStore } from '@/store/characterStore'
import type { Class5e } from '@/types/5etools'
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
}

function toClassProfileId(name: string, source?: string): string {
  return `class:${name}|${source ?? ''}`
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

  const spellProfiles = useMemo(() => {
    if (!character) return []
    return ensureSpellProfiles(character, classesById)
  }, [character, classesById])

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
    patchSpells({ spellProfiles: ensureSpellProfiles(character, classesById) })
  }, [character, classesById, patchSpells])

  const addSpellToProfile = useCallback(
    (profileId: string, name: string, kind: 'cantrip' | 'spell') => {
      if (!character) return
      const baseProfiles = ensureSpellProfiles(character, classesById)
      patchSpells({
        spellProfiles: upsertProfileSpell(baseProfiles, profileId, name, kind),
      })
    },
    [character, classesById, patchSpells],
  )

  const setProfileSpells = useCallback(
    (profileId: string, cantrips: string[], spellsKnown: string[]) => {
      if (!character) return
      const baseProfiles = ensureSpellProfiles(character, classesById)
      patchSpells({
        spellProfiles: replaceProfileSpells(baseProfiles, profileId, cantrips, spellsKnown),
      })
    },
    [character, classesById, patchSpells],
  )

  const removeSpellFromProfile = useCallback(
    (profileId: string, name: string, kind: 'cantrip' | 'spell') => {
      if (!character) return
      const baseProfiles = ensureSpellProfiles(character, classesById)
      patchSpells({
        spellProfiles: removeProfileSpell(baseProfiles, profileId, name, kind),
      })
    },
    [character, classesById, patchSpells],
  )

  const addCantrip = useCallback(
    (name: string, profileId?: string) => {
      const targetId = profileId ?? getDefaultProfileId(spellProfiles)
      addSpellToProfile(targetId, name, 'cantrip')
    },
    [addSpellToProfile, spellProfiles],
  )

  const removeCantrip = useCallback(
    (name: string, profileId?: string) => {
      const targetId = profileId ?? getDefaultProfileId(spellProfiles)
      removeSpellFromProfile(targetId, name, 'cantrip')
    },
    [removeSpellFromProfile, spellProfiles],
  )

  const addSpellKnown = useCallback(
    (name: string, profileId?: string) => {
      const targetId = profileId ?? getDefaultProfileId(spellProfiles)
      addSpellToProfile(targetId, name, 'spell')
    },
    [addSpellToProfile, spellProfiles],
  )

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
      const nextProfiles = ensureSpellProfiles(character, classesById).map((profile) => {
        if (profile.id !== profileId || profile.alwaysPrepared) return profile

        const isPrepared = profile.preparedSpells.includes(name)
        const detail = spellcastingDetailByProfileId.get(profileId)
        const preparedLimit =
          detail?.isPreparedCaster === true ? (detail.knownSpellLimit ?? null) : null

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
    [character, classesById, patchSpells, spellcastingDetailByProfileId],
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
  }
}
