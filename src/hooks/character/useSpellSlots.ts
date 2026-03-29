// Spell slot management hook — covers item 18 (spell management) from the plan.
// Calculates max slots from class + level, tracks used slots, and exposes actions.

import { useMemo, useCallback } from 'react'
import { useCharacterStore } from '@/store/characterStore'
import { useClass } from '@/hooks/data/useGameData'
import {
  calculateSpellSlots,
  getSpellSlotsFromClassData,
  mergeSpellSlots,
  isSpellcaster,
  type SpellSlotsResult,
} from '@/lib/calculations/spellSlots'
import type { SpellSlots } from '@/types/character'

// Map from SpellSlots named keys to numeric spell levels
const SLOT_LEVEL_KEYS: (keyof SpellSlots)[] = [
  'level1', 'level2', 'level3', 'level4', 'level5',
  'level6', 'level7', 'level8', 'level9',
]

function storedToNumericUsed(spellSlots: SpellSlots): Record<number, number> {
  const out: Record<number, number> = {}
  SLOT_LEVEL_KEYS.forEach((key, idx) => {
    out[idx + 1] = spellSlots[key]?.used ?? 0
  })
  return out
}

function numericToStored(calculated: SpellSlotsResult, usedMap: Record<number, number>): SpellSlots {
  const base: SpellSlots = {
    level1: { max: 0, used: 0 }, level2: { max: 0, used: 0 },
    level3: { max: 0, used: 0 }, level4: { max: 0, used: 0 },
    level5: { max: 0, used: 0 }, level6: { max: 0, used: 0 },
    level7: { max: 0, used: 0 }, level8: { max: 0, used: 0 },
    level9: { max: 0, used: 0 },
  }
  for (let sl = 1; sl <= 9; sl++) {
    const key = `level${sl}` as keyof SpellSlots
    const calc = calculated[sl]
    if (calc) {
      base[key] = { max: calc.max, used: Math.min(usedMap[sl] ?? 0, calc.max) }
    }
  }
  return base
}

export interface SpellSlotInfo {
  level: number
  max: number
  used: number
  available: number
  isPactMagic?: boolean
}

export interface SpellSlotsState {
  /** Calculated and merged slot array — only non-zero levels are present. */
  slots: SpellSlotInfo[]
  /** True when the character's class is a spellcaster. */
  isSpellcaster: boolean
  spellcastingAbility?: string
  cantrips: string[]
  spellsKnown: string[]
  preparedSpells: string[]
  /** Mark one slot at `spellLevel` as used. */
  useSlot: (spellLevel: number) => void
  /** Restore one used slot at `spellLevel`. */
  restoreSlot: (spellLevel: number) => void
  /** Restore all slots (long rest). */
  longRest: () => void
  /** Add a cantrip by name. */
  addCantrip: (name: string) => void
  removeCantrip: (name: string) => void
  /** Add a spell to spells known. */
  addSpellKnown: (name: string) => void
  removeSpellKnown: (name: string) => void
  /** Toggle a spell in the prepared list. */
  togglePrepared: (name: string) => void
  /** Sync stored slot maxima to the calculated values. */
  syncSlots: () => void
}

export function useSpellSlots(): SpellSlotsState {
  const character = useCharacterStore((s) => s.activeCharacter)
  const updateCharacter = useCharacterStore((s) => s.updateCharacter)

  // Read class data so we can use rowsSpellProgression directly from the JSON
  // rather than relying on the hardcoded CLASS_CASTER_PROGRESSION fallback table.
  const classData = useClass(character?.class ?? '')

  const calculatedSlots = useMemo(() => {
    if (!character) return {}
    // Prefer the data-driven read (handles artificer, half-casters, any homebrew).
    // Falls back to calculateSpellSlots for pact magic (Warlock) and unknown classes.
    if (classData) {
      const fromData = getSpellSlotsFromClassData(classData, character.level)
      if (fromData !== null) return fromData
    }
    return calculateSpellSlots(
      character.class ?? '',
      character.level ?? 1,
      classData?.casterProgression,
    )
  }, [character?.class, character?.level, classData])

  const storedUsed = useMemo(
    () => storedToNumericUsed(character?.spells?.spellSlots ?? {
      level1: { max: 0, used: 0 }, level2: { max: 0, used: 0 },
      level3: { max: 0, used: 0 }, level4: { max: 0, used: 0 },
      level5: { max: 0, used: 0 }, level6: { max: 0, used: 0 },
      level7: { max: 0, used: 0 }, level8: { max: 0, used: 0 },
      level9: { max: 0, used: 0 },
    }),
    [character?.spells?.spellSlots],
  )

  const merged = useMemo(
    () => mergeSpellSlots(calculatedSlots, storedUsed),
    [calculatedSlots, storedUsed],
  )

  const slots: SpellSlotInfo[] = useMemo(() => {
    return Object.entries(merged)
      .map(([lvl, s]) => ({
        level: Number(lvl),
        max: s!.max,
        used: s!.used,
        available: s!.max - s!.used,
        isPactMagic: s!.isPactMagic,
      }))
      .sort((a, b) => a.level - b.level)
  }, [merged])

  const patchSpells = useCallback(
    (patch: Partial<NonNullable<typeof character>['spells']>) => {
      if (!character) return
      updateCharacter(character.id, { spells: { ...character.spells, ...patch } })
    },
    [character, updateCharacter],
  )

  const useSlot = useCallback(
    (spellLevel: number) => {
      if (!character) return
      const current = character.spells.spellSlots[`level${spellLevel}` as keyof SpellSlots]
      if (!current || current.used >= current.max) return
      const key = `level${spellLevel}` as keyof SpellSlots
      patchSpells({
        spellSlots: {
          ...character.spells.spellSlots,
          [key]: { ...current, used: current.used + 1 },
        },
      })
    },
    [character, patchSpells],
  )

  const restoreSlot = useCallback(
    (spellLevel: number) => {
      if (!character) return
      const current = character.spells.spellSlots[`level${spellLevel}` as keyof SpellSlots]
      if (!current || current.used === 0) return
      const key = `level${spellLevel}` as keyof SpellSlots
      patchSpells({
        spellSlots: {
          ...character.spells.spellSlots,
          [key]: { ...current, used: current.used - 1 },
        },
      })
    },
    [character, patchSpells],
  )

  const longRest = useCallback(() => {
    if (!character) return
    patchSpells({ spellSlots: numericToStored(calculatedSlots, {}) })
  }, [character, patchSpells, calculatedSlots])

  const syncSlots = useCallback(() => {
    if (!character) return
    patchSpells({ spellSlots: numericToStored(calculatedSlots, storedUsed) })
  }, [character, patchSpells, calculatedSlots, storedUsed])

  const addCantrip = useCallback(
    (name: string) => {
      if (!character) return
      if (character.spells.cantrips.includes(name)) return
      patchSpells({ cantrips: [...character.spells.cantrips, name] })
    },
    [character, patchSpells],
  )

  const removeCantrip = useCallback(
    (name: string) => {
      if (!character) return
      patchSpells({ cantrips: character.spells.cantrips.filter((c) => c !== name) })
    },
    [character, patchSpells],
  )

  const addSpellKnown = useCallback(
    (name: string) => {
      if (!character) return
      if (character.spells.spellsKnown.includes(name)) return
      patchSpells({ spellsKnown: [...character.spells.spellsKnown, name] })
    },
    [character, patchSpells],
  )

  const removeSpellKnown = useCallback(
    (name: string) => {
      if (!character) return
      patchSpells({ spellsKnown: character.spells.spellsKnown.filter((s) => s !== name) })
    },
    [character, patchSpells],
  )

  const togglePrepared = useCallback(
    (name: string) => {
      if (!character) return
      const current = character.spells.preparedSpells
      patchSpells({
        preparedSpells: current.includes(name)
          ? current.filter((s) => s !== name)
          : [...current, name],
      })
    },
    [character, patchSpells],
  )

  return {
    slots,
    isSpellcaster: isSpellcaster(character?.class ?? '', classData?.casterProgression),
    spellcastingAbility: character?.spells?.spellcastingAbility,
    cantrips: character?.spells?.cantrips ?? [],
    spellsKnown: character?.spells?.spellsKnown ?? [],
    preparedSpells: character?.spells?.preparedSpells ?? [],
    useSlot,
    restoreSlot,
    longRest,
    addCantrip,
    removeCantrip,
    addSpellKnown,
    removeSpellKnown,
    togglePrepared,
    syncSlots,
  }
}
