import { normalizeKey } from '@/lib/provenance/normalization'
import type { SpellSourceTag } from '@/lib/provenance/types'
import type { Spell5e } from '@/types/5etools'
import type { Character, SpellProfile } from '@/types/character'

export interface SourceConflict {
  source: string
  items: string[]
}

export function detectSourceConflicts(
  character: Character,
  allowedSources: string[],
): SourceConflict[] {
  const allowed = new Set(allowedSources)
  const bySource = new Map<string, string[]>()

  const flag = (label: string, source?: string) => {
    if (!source || allowed.has(source)) return
    if (!bySource.has(source)) bySource.set(source, [])
    bySource.get(source)?.push(label)
  }

  flag(character.race, character.raceSource)
  if (character.subrace) flag(character.subrace, character.subraceSource)

  if (character.classProgression?.length) {
    for (const cls of character.classProgression) {
      flag(cls.name, cls.source)
      if (cls.subclass) flag(`${cls.subclass} (subclass)`, cls.subclassSource)
    }
  } else {
    flag(character.class, character.classSource)
    if (character.subclass) flag(`${character.subclass} (subclass)`, character.subclassSource)
  }

  flag(character.background, character.backgroundSource)

  for (const feat of character.feats) {
    flag(feat.name, feat.source)
  }
  for (const feat of character.specialFeats ?? []) {
    flag(feat.name, feat.source)
  }

  return Array.from(bySource.entries()).map(([source, items]) => ({ source, items }))
}

/** Count player-selected spells that were removed (excludes fixedSpells). */
export function countRemovedSpells(character: Character, newProfiles: SpellProfile[]): number {
  let before = 0
  let after = 0
  for (let i = 0; i < character.spells.spellProfiles.length; i++) {
    const prev = character.spells.spellProfiles[i]
    const next = newProfiles[i]
    if (!prev || !next) continue
    before +=
      prev.cantrips.length +
      prev.spellsKnown.length +
      prev.preparedSpells.length +
      (prev.choices?.reduce((s, c) => s + c.selected.length, 0) ?? 0)
    after +=
      next.cantrips.length +
      next.spellsKnown.length +
      next.preparedSpells.length +
      (next.choices?.reduce((s, c) => s + c.selected.length, 0) ?? 0)
  }
  return before - after
}

/**
 * Returns a character patch removing player-selected spells whose sourcebook is no
 * longer present in effectiveSources, plus the matching provenance entries.
 * Returns null when nothing needs to change.
 *
 * fixedSpells (auto-granted by class/race features) are intentionally left alone
 * because they are tied to the entity, not to the sourcebook.
 */
export function pruneSpellsForDisabledSources(
  character: Character,
  effectiveSources: string[],
  allSpells: Spell5e[],
): Pick<Character, 'spells' | 'provenance'> | null {
  // Build index: normalized spell name → set of source abbreviations (uppercased)
  const spellSourceIndex = new Map<string, Set<string>>()
  for (const spell of allSpells) {
    const key = spell.name.toLowerCase().trim()
    if (!spellSourceIndex.has(key)) spellSourceIndex.set(key, new Set())
    spellSourceIndex.get(key)?.add(spell.source.toUpperCase())
  }

  const effectiveSet = new Set(effectiveSources.map((s) => s.toUpperCase()))

  const isSpellAllowed = (name: string): boolean => {
    const key = name.toLowerCase().trim()
    const sources = spellSourceIndex.get(key)
    if (!sources) return true // unknown spell — keep it
    for (const src of sources) {
      if (effectiveSet.has(src)) return true
    }
    return false
  }

  let changed = false
  const newProfiles = character.spells.spellProfiles.map((profile) => {
    const newCantrips = profile.cantrips.filter(isSpellAllowed)
    const newSpellsKnown = profile.spellsKnown.filter(isSpellAllowed)
    const newPreparedSpells = profile.preparedSpells.filter(isSpellAllowed)
    const newChoices = profile.choices?.map((choice) => ({
      ...choice,
      selected: choice.selected.filter(isSpellAllowed),
    }))

    const profileChanged =
      newCantrips.length !== profile.cantrips.length ||
      newSpellsKnown.length !== profile.spellsKnown.length ||
      newPreparedSpells.length !== profile.preparedSpells.length ||
      (newChoices?.some(
        (c, i) => c.selected.length !== (profile.choices?.[i]?.selected?.length ?? 0),
      ) ??
        false)

    if (!profileChanged) return profile
    changed = true
    return {
      ...profile,
      cantrips: newCantrips,
      spellsKnown: newSpellsKnown,
      preparedSpells: newPreparedSpells,
      ...(newChoices !== undefined ? { choices: newChoices } : {}),
    }
  })

  if (!changed) return null

  // Rebuild the set of spell keys still on the character so we can prune provenance
  const remainingKeys = new Set<string>()
  for (const profile of newProfiles) {
    for (const name of [
      ...profile.cantrips,
      ...profile.spellsKnown,
      ...profile.preparedSpells,
      ...(profile.fixedSpells ?? []),
    ]) {
      remainingKeys.add(normalizeKey(name))
    }
    for (const choice of profile.choices ?? []) {
      for (const name of choice.selected) {
        remainingKeys.add(normalizeKey(name))
      }
    }
  }

  let newProvenance = character.provenance
  if (character.provenance) {
    const filteredSpells: Record<string, SpellSourceTag[]> = {}
    for (const [key, tags] of Object.entries(character.provenance.spells)) {
      if (remainingKeys.has(key)) {
        filteredSpells[key] = tags
      }
    }
    newProvenance = { ...character.provenance, spells: filteredSpells }
  }

  return {
    spells: { ...character.spells, spellProfiles: newProfiles },
    provenance: newProvenance,
  }
}
