import { getSelectedSubclassData } from '@/lib/5etools/classData'
import {
  getCasterLevelContribution,
  getEffectiveCasterProgression,
  getPactMagicSlots,
  getSpellSlotsFromClassData,
  getStandardSpellSlots,
  mergeSpellSlots,
  type SpellSlotsResult,
} from '@/lib/calculations/spellSlots'
import { getCharacterClassEntries } from '@/lib/characterUtils'
import type { Class5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import { toClassProfileId } from './spellProfiles.constants'

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
  const pact: SpellSlotsResult = {}

  for (const entry of entries) {
    const classData = classesById.get(toClassProfileId(entry.name, entry.source))
    const subclassData = getSelectedSubclassData(classData, entry)
    const progression = normalizeProgression(getEffectiveCasterProgression(classData, subclassData))

    if (progression === 'pact') {
      const pactRows = classData ? getSpellSlotsFromClassData(classData, entry.levels) : null
      addSlotRows(pact, pactRows ?? getPactMagicSlots(entry.levels), true)
      continue
    }

    combinedCasterLevel += getCasterLevelContribution(progression, entry.levels)
  }

  const shared = combinedCasterLevel > 0 ? getStandardSpellSlots(combinedCasterLevel) : {}
  const usedMap = getSpellSlotFieldMap(character.spells.spellSlots, 'used')

  const mergedSharedWithUsage = mergeSpellSlots(shared, usedMap)

  const pactUsedMap: Record<number, number> = {}
  for (const [levelText, slots] of Object.entries(pact)) {
    const level = Number.parseInt(levelText, 10)
    if (!level || !slots) continue
    const used = Math.min(usedMap[level] ?? 0, slots.max)
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
