import { getClassSpellGainAtLevel } from '@/lib/5etools/classData'
import { normalizeKey } from '@/lib/provenance/normalization'
import type { Class5e } from '@/types/5etools'
import type { Character, SpellProfile } from '@/types/character'
import { toClassProfileId } from './spellProfiles.constants'
import { ensureSpellProfiles } from './spellProfiles.profiles'

export function getProfileKnownNames(profile: SpellProfile): Set<string> {
  return new Set([...profile.cantrips, ...profile.spellsKnown])
}

export function buildClassSpellSelectionsByLevel(params: {
  character: Character
  className?: string
  classSource?: string
}): Map<number, string[]> {
  const { character, className, classSource } = params
  const selections = new Map<number, string[]>()
  if (!className) return selections

  const profileId = toClassProfileId(className, classSource)
  const classProfile = ensureSpellProfiles(character).find((profile) => profile.id === profileId)
  if (!classProfile) return selections

  const classKnownNames = new Set([...classProfile.cantrips, ...classProfile.spellsKnown])
  if (classKnownNames.size === 0) return selections

  const addAtLevel = (level: number, spellName: string) => {
    const existing = selections.get(level) ?? []
    if (existing.includes(spellName)) return
    selections.set(level, [...existing, spellName])
  }

  for (const spellName of classKnownNames) {
    const tags = character.provenance?.spells?.[normalizeKey(spellName)] ?? []
    const classTag = tags.find(
      (tag) =>
        tag.sourceType === 'class' &&
        tag.sourceName === className &&
        (tag.sourceRef ?? '') === (classSource ?? '') &&
        !!tag.spellGrantedAtLevel,
    )
    if (!classTag?.spellGrantedAtLevel) continue

    for (const [level, names] of selections.entries()) {
      if (!names.includes(spellName)) continue
      const filtered = names.filter((name) => name !== spellName)
      if (filtered.length > 0) {
        selections.set(level, filtered)
      } else {
        selections.delete(level)
      }
    }
    addAtLevel(classTag.spellGrantedAtLevel, spellName)
  }

  const swaps = classProfile.spellSwaps
  if (swaps) {
    for (const [levelStr, swap] of Object.entries(swaps)) {
      const level = Number(levelStr)
      const names = selections.get(level)
      if (!names) continue
      const filtered = names.filter((n) => n !== swap.added)
      if (filtered.length > 0) {
        selections.set(level, filtered)
      } else {
        selections.delete(level)
      }
    }
  }

  return selections
}

export interface SpellAttribution {
  spellName: string
  grantedAtLevel: number
}

export type ExistingSpellAttribution = SpellAttribution
export type InferredSpellAttribution = SpellAttribution

/**
 * Assign newly-selected spells to the lowest eligible class level that still has
 * remaining spell-gain capacity.
 */
export function inferClassSpellAttributionLevels(params: {
  classData: Class5e | undefined
  classLevel: number
  newSpellNames: string[]
  spellLevelByName: Map<string, number>
  existingAttributions: ExistingSpellAttribution[]
}): InferredSpellAttribution[] {
  const { classData, classLevel, newSpellNames, spellLevelByName, existingAttributions } = params

  if (!classData || classLevel <= 0 || newSpellNames.length === 0) {
    return []
  }

  const spellCapacity = new Map<number, number>()
  const cantripCapacity = new Map<number, number>()
  const maxSpellLevelByClassLevel = new Map<number, number>()

  for (let level = 1; level <= classLevel; level++) {
    const gain = getClassSpellGainAtLevel(classData, level)
    spellCapacity.set(level, gain.spells)
    cantripCapacity.set(level, gain.cantrips)
    maxSpellLevelByClassLevel.set(level, gain.maxSpellLevel)
  }

  const usedSpellSlots = new Map<number, number>()
  const usedCantripSlots = new Map<number, number>()

  for (const attribution of existingAttributions) {
    const attributedSpellLevel = spellLevelByName.get(attribution.spellName) ?? 1
    if (attributedSpellLevel === 0) {
      usedCantripSlots.set(
        attribution.grantedAtLevel,
        (usedCantripSlots.get(attribution.grantedAtLevel) ?? 0) + 1,
      )
      continue
    }

    usedSpellSlots.set(
      attribution.grantedAtLevel,
      (usedSpellSlots.get(attribution.grantedAtLevel) ?? 0) + 1,
    )
  }

  const assignments: InferredSpellAttribution[] = []
  const pending = [...newSpellNames].sort((a, b) => {
    const levelDelta = (spellLevelByName.get(a) ?? 1) - (spellLevelByName.get(b) ?? 1)
    if (levelDelta !== 0) return levelDelta
    return a.localeCompare(b)
  })

  for (const spellName of pending) {
    const spellLevel = spellLevelByName.get(spellName) ?? 1
    const eligibleLevels: number[] = []

    for (let level = 1; level <= classLevel; level++) {
      const cap =
        spellLevel === 0 ? (cantripCapacity.get(level) ?? 0) : (spellCapacity.get(level) ?? 0)
      if (cap <= 0) continue

      if (spellLevel > 0 && spellLevel > (maxSpellLevelByClassLevel.get(level) ?? 0)) {
        continue
      }

      eligibleLevels.push(level)
    }

    const fallbackLevel = eligibleLevels[0] ?? classLevel
    let selectedLevel = fallbackLevel

    for (const level of eligibleLevels) {
      const used =
        spellLevel === 0 ? (usedCantripSlots.get(level) ?? 0) : (usedSpellSlots.get(level) ?? 0)
      const cap =
        spellLevel === 0 ? (cantripCapacity.get(level) ?? 0) : (spellCapacity.get(level) ?? 0)
      if (used < cap) {
        selectedLevel = level
        break
      }
    }

    if (spellLevel === 0) {
      usedCantripSlots.set(selectedLevel, (usedCantripSlots.get(selectedLevel) ?? 0) + 1)
    } else {
      usedSpellSlots.set(selectedLevel, (usedSpellSlots.get(selectedLevel) ?? 0) + 1)
    }

    assignments.push({ spellName, grantedAtLevel: selectedLevel })
  }

  return assignments
}

export function buildSpellSelectionSourceMap(params: {
  spellProfiles: SpellProfile[]
  ledger: Character['provenance']
}): Map<string, string> {
  const { spellProfiles, ledger } = params
  const map = new Map<string, string>()

  for (const profile of spellProfiles) {
    for (const spellName of [...profile.cantrips, ...profile.spellsKnown]) {
      const key = `${profile.id}|${spellName}`
      const tags = ledger?.spells?.[normalizeKey(spellName)] ?? []

      if (profile.type === 'class' && profile.className) {
        const classTag = tags.find(
          (tag) =>
            tag.sourceType === 'class' &&
            tag.sourceName === profile.className &&
            (tag.sourceRef ?? '') === (profile.classSource ?? ''),
        )
        if (!classTag) continue

        if (classTag.spellGrantedAtLevel) {
          const suffix =
            classTag.spellAttributionMode === 'inferred-lowest-eligible'
              ? 'Inferred Choice'
              : 'Choice'
          map.set(key, `${profile.className} Lv. ${classTag.spellGrantedAtLevel} ${suffix}`)
          continue
        }

        map.set(key, `${profile.className} Choice`)
        continue
      }

      if (tags.some((tag) => tag.sourceType === 'manual')) {
        map.set(key, 'User Choice')
      }
    }
  }

  return map
}

export function isSpellOnClassList(
  spell: {
    classes?: {
      fromClassList?: Array<{ name?: string; source?: string }>
    }
  },
  className?: string,
  classSource?: string,
): boolean {
  if (!className) return true

  const targetName = className.trim().toLowerCase()
  const targetSource = (classSource ?? '').trim().toLowerCase()
  const fromClassList = spell.classes?.fromClassList ?? []

  if (fromClassList.length === 0) {
    return false
  }

  return fromClassList.some((entry) => {
    const entryName = entry.name?.trim().toLowerCase()
    if (entryName !== targetName) return false

    const entrySource = entry.source?.trim().toLowerCase()
    if (!targetSource || !entrySource) return true

    return entrySource === targetSource
  })
}
