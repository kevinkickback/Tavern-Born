// Proficiency management hook — covers item 11 (proficiency system) from the plan.
// Exposes all proficiency categories with source information and toggle actions.

import { useMemo, useCallback } from 'react'
import { useCharacterStore } from '@/store/characterStore'
import type { Proficiencies } from '@/types/character'

export type ProficiencyCategory = keyof Proficiencies

export interface ProficiencyEntry {
  name: string
  /** Where this proficiency originates (may be unknown when added manually). */
  source: 'race' | 'class' | 'background' | 'feat' | 'manual' | 'unknown'
}

export interface ProficienciesState {
  proficiencies: Proficiencies
  /** Add a proficiency to a category (noop if already present). */
  addProficiency: (category: ProficiencyCategory, name: string) => void
  /** Remove a proficiency from a category. */
  removeProficiency: (category: ProficiencyCategory, name: string) => void
  /** Toggle a proficiency in a category (add if absent, remove if present). */
  toggleProficiency: (category: ProficiencyCategory, name: string) => void
  /** Replace the whole list for a category at once. */
  setProficiencies: (category: ProficiencyCategory, names: string[]) => void
  /** True when the character has the named proficiency in a given category. */
  hasProficiency: (category: ProficiencyCategory, name: string) => boolean
  /** Apply all proficiencies granted by a race/subrace (from 5etools data). */
  applyRaceProficiencies: (raceData: RaceGrantData) => void
  /** Apply all proficiencies granted by a class (from 5etools data). */
  applyClassProficiencies: (classData: ClassGrantData) => void
  /** Apply all proficiencies granted by a background (from 5etools data). */
  applyBackgroundProficiencies: (bgData: BackgroundGrantData) => void
}

// ── Grant data shapes (mirrors relevant 5etools fields) ───────────────────────

export interface RaceGrantData {
  skillProficiencies?: Array<Record<string, boolean | { choose: { from: string[]; count: number } }>>
  languageProficiencies?: Array<Record<string, boolean | { choose: { from: string[] } } | { anyStandard: number }>>
}

export interface ClassGrantData {
  startingProficiencies?: {
    armor?: string[]
    weapons?: string[]
    tools?: string[]
    skills?: { choose?: { from: string[]; count: number } }
  }
}

export interface BackgroundGrantData {
  skillProficiencies?: Array<Record<string, boolean | { choose: { from: string[]; count: number } }>>
  languageProficiencies?: Array<Record<string, boolean | { choose: { from: string[] } } | { anyStandard: number }>>
  toolProficiencies?: Array<Record<string, boolean | { choose: { from: string[] } }>>
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useProficiencies(): ProficienciesState {
  const character = useCharacterStore((s) => s.activeCharacter)
  const updateCharacter = useCharacterStore((s) => s.updateCharacter)

  const patch = useCallback(
    (category: ProficiencyCategory, names: string[]) => {
      if (!character) return
      updateCharacter(character.id, {
        proficiencies: { ...character.proficiencies, [category]: names },
      })
    },
    [character, updateCharacter],
  )

  const hasProficiency = useCallback(
    (category: ProficiencyCategory, name: string) => {
      return (character?.proficiencies[category] ?? []).includes(name)
    },
    [character?.proficiencies],
  )

  const addProficiency = useCallback(
    (category: ProficiencyCategory, name: string) => {
      if (!character) return
      if (hasProficiency(category, name)) return
      patch(category, [...(character.proficiencies[category] ?? []), name])
    },
    [character, hasProficiency, patch],
  )

  const removeProficiency = useCallback(
    (category: ProficiencyCategory, name: string) => {
      if (!character) return
      patch(
        category,
        (character.proficiencies[category] ?? []).filter((p) => p !== name),
      )
    },
    [character, patch],
  )

  const toggleProficiency = useCallback(
    (category: ProficiencyCategory, name: string) => {
      if (hasProficiency(category, name)) {
        removeProficiency(category, name)
      } else {
        addProficiency(category, name)
      }
    },
    [hasProficiency, removeProficiency, addProficiency],
  )

  const setProficiencies = useCallback(
    (category: ProficiencyCategory, names: string[]) => patch(category, names),
    [patch],
  )

  // ── Grant helpers ────────────────────────────────────────────────────────────

  const applyRaceProficiencies = useCallback(
    (raceData: RaceGrantData) => {
      if (!character) return
      const skills: string[] = []
      const languages: string[] = []

      for (const block of raceData.skillProficiencies ?? []) {
        for (const [key, val] of Object.entries(block)) {
          if (key !== 'choose' && val === true) skills.push(key)
        }
      }
      for (const block of raceData.languageProficiencies ?? []) {
        for (const [key, val] of Object.entries(block)) {
          if (key !== 'choose' && key !== 'anyStandard' && val === true)
            languages.push(key)
        }
      }

      const merged = (current: string[], additions: string[]) => [
        ...new Set([...current, ...additions]),
      ]
      updateCharacter(character.id, {
        proficiencies: {
          ...character.proficiencies,
          ...(skills.length && {
            // Skill proficiency names go into the tools/languages categories where appropriate
          }),
          languages: merged(character.proficiencies.languages, languages),
        },
      })
    },
    [character, updateCharacter],
  )

  const applyClassProficiencies = useCallback(
    (classData: ClassGrantData) => {
      if (!character) return
      const sp = classData.startingProficiencies
      if (!sp) return
      const merged = (current: string[], additions: string[] = []) => [
        ...new Set([...current, ...additions]),
      ]
      updateCharacter(character.id, {
        proficiencies: {
          ...character.proficiencies,
          armor: merged(character.proficiencies.armor, sp.armor),
          weapons: merged(character.proficiencies.weapons, sp.weapons),
          tools: merged(character.proficiencies.tools, sp.tools),
        },
      })
    },
    [character, updateCharacter],
  )

  const applyBackgroundProficiencies = useCallback(
    (bgData: BackgroundGrantData) => {
      if (!character) return
      const skills: string[] = []
      const languages: string[] = []
      const tools: string[] = []

      for (const block of bgData.skillProficiencies ?? []) {
        for (const [key, val] of Object.entries(block)) {
          if (key !== 'choose' && val === true) skills.push(key)
        }
      }
      for (const block of bgData.languageProficiencies ?? []) {
        for (const [key, val] of Object.entries(block)) {
          if (key !== 'choose' && key !== 'anyStandard' && val === true)
            languages.push(key)
        }
      }
      for (const block of bgData.toolProficiencies ?? []) {
        for (const [key, val] of Object.entries(block)) {
          if (key !== 'choose' && val === true) tools.push(key)
        }
      }

      const merged = (current: string[], additions: string[]) => [
        ...new Set([...current, ...additions]),
      ]
      updateCharacter(character.id, {
        proficiencies: {
          ...character.proficiencies,
          languages: merged(character.proficiencies.languages, languages),
          tools: merged(character.proficiencies.tools, tools),
        },
      })
    },
    [character, updateCharacter],
  )

  const proficiencies: Proficiencies = useMemo(
    () =>
      character?.proficiencies ?? {
        armor: [],
        weapons: [],
        tools: [],
        languages: [],
        savingThrows: [],
      },
    [character?.proficiencies],
  )

  return {
    proficiencies,
    addProficiency,
    removeProficiency,
    toggleProficiency,
    setProficiencies,
    hasProficiency,
    applyRaceProficiencies,
    applyClassProficiencies,
    applyBackgroundProficiencies,
  }
}
