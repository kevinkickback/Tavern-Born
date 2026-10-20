import { getEffectiveSpellcastingClassData, getSelectedSubclassData } from '@/lib/5etools/classData'
import { findClassReference } from '@/lib/5etools/classReference'
import {
  getCasterLevelContribution,
  getEffectiveCasterProgression,
  getSpellSlotsFromClassData,
  getStandardSpellSlotsFromClassData,
  mergeSpellSlots,
  type SpellSlotsResult,
} from '@/lib/calculations/spellSlots'
import { getCharacterClassEntries } from '@/lib/characterUtils'
import type { Class5e } from '@/types/5etools'
import type { Character } from '@/types/character'

function normalizeProgression(value?: string) {
  if (value === 'full') return 'full'
  if (value === '1/2') return '1/2'
  if (value === '1/3') return '1/3'
  if (value === 'pact') return 'pact'
  if (value === 'artificer') return 'artificer'
  return 'none'
}

function getSpellSlotFieldMap(
  spellSlots: Character['spells']['spellSlots'],
  field: 'used' | 'max',
): Record<number, number> {
  const result: Record<number, number> = {}
  for (let level = 1; level <= 9; level++) {
    result[level] = spellSlots[level]?.[field] ?? 0
  }
  return result
}

function addSlotRows(acc: SpellSlotsResult, rows: SpellSlotsResult, pact = false): void {
  for (const [levelText, row] of Object.entries(rows)) {
    const level = Number.parseInt(levelText, 10)
    if (!row || !level) continue
    const existing = acc[level]
    acc[level] = {
      max: (existing?.max ?? 0) + row.max,
      used: existing?.used ?? 0,
      ...(pact ? { isPactMagic: true } : {}),
    }
  }
}

export interface CharacterSpellSlotsBreakdown {
  shared: SpellSlotsResult
  pact: SpellSlotsResult
  mergedSharedWithUsage: SpellSlotsResult
  mergedPactWithUsage: SpellSlotsResult
}

export function calculateCharacterSpellSlots(
  character: Character,
  classesById: Map<string, Class5e>,
): CharacterSpellSlotsBreakdown {
  const entries = getCharacterClassEntries(character)

  let combinedCasterLevel = 0
  let has2024Class = false
  const pact: SpellSlotsResult = {}

  // Only an earned shared caster can move a character onto the combined progression.
  const sharedEntries: Array<{ classData: Class5e | undefined; levels: number }> = []

  for (const entry of entries) {
    const classData = findClassReference(entry, classesById.values())
    if (classData?.edition === 'one' || classData?.source.trim().toUpperCase() === 'XPHB')
      has2024Class = true
    const subclassData = getSelectedSubclassData(classData, entry)
    const effective = getEffectiveSpellcastingClassData(classData, subclassData)
    const progression = normalizeProgression(getEffectiveCasterProgression(classData, subclassData))

    if (progression === 'pact') {
      const pactRows = classData ? getSpellSlotsFromClassData(classData, entry.levels) : null
      if (pactRows) {
        addSlotRows(pact, pactRows, true)
      } else if (import.meta.env.DEV) {
        console.warn(
          `[spellSlots] Missing parsed pact progression for ${entry.name}|${entry.source ?? ''}.`,
        )
      }
      continue
    }

    const contribution = getCasterLevelContribution(progression, entry.levels)
    const ownSlots = effective ? getSpellSlotsFromClassData(effective, entry.levels) : null
    if (
      progression === 'none' ||
      (ownSlots === null ? contribution === 0 : Object.keys(ownSlots).length === 0)
    )
      continue
    combinedCasterLevel += contribution
    sharedEntries.push({ classData: effective, levels: entry.levels })
  }

  let shared: SpellSlotsResult = {}
  if (sharedEntries.length > 0) {
    const ruleset = has2024Class ? '2024' : '2014'
    const parsedStandardSlots = getStandardSpellSlotsFromClassData(
      classesById.values(),
      combinedCasterLevel,
      ruleset,
    )
    if (sharedEntries.length === 1 && sharedEntries[0].classData) {
      const { classData, levels } = sharedEntries[0]
      shared = getSpellSlotsFromClassData(classData, levels) ?? parsedStandardSlots ?? {}
    } else {
      shared = parsedStandardSlots ?? {}
    }
    if (!parsedStandardSlots && Object.keys(shared).length === 0 && import.meta.env.DEV) {
      console.warn(
        `[spellSlots] Missing parsed ${ruleset} full-caster progression for effective caster level ${combinedCasterLevel}.`,
      )
    }
  }
  const usedMap = getSpellSlotFieldMap(character.spells.spellSlots, 'used')

  const mergedSharedWithUsage = mergeSpellSlots(shared, usedMap)

  const pactUsedMap = getSpellSlotFieldMap(character.spells.pactSpellSlots ?? {}, 'used')
  for (const [levelText, slots] of Object.entries(pact)) {
    const level = Number.parseInt(levelText, 10)
    if (!level || !slots) continue
    const used = Math.min(pactUsedMap[level] ?? 0, slots.max)
    pactUsedMap[level] = used
  }
  const mergedPactWithUsage = mergeSpellSlots(pact, pactUsedMap)

  return {
    shared,
    pact,
    mergedSharedWithUsage,
    mergedPactWithUsage,
  }
}
