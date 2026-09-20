import {
  XPHB_LEGACY_FEAT_KEYS,
  XPHB_LEGACY_RACE_KEYS,
  XPHB_LEGACY_SUBCLASS_KEYS,
} from '@/lib/5etools/rulesetMetadata'
import { getSpellNameKey, parseSpellReference } from '@/lib/calculations/spellIdentity'
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
  const allowed = new Set(allowedSources.map((source) => source.toUpperCase()))
  const bySource = new Map<string, string[]>()
  const permitsLegacyExceptions = character.originSystem === '2024'

  const flag = (label: string, source?: string, isCompatibilityException = false) => {
    if (!source || allowed.has(source.toUpperCase()) || isCompatibilityException) return
    if (!bySource.has(source)) bySource.set(source, [])
    const items = bySource.get(source)
    if (!items?.includes(label)) items?.push(label)
  }

  const selectedRaceIsLegacyException = Boolean(
    permitsLegacyExceptions &&
      character.race &&
      character.raceSource &&
      XPHB_LEGACY_RACE_KEYS.has(`${character.race}|${character.raceSource}`),
  )
  flag(character.race, character.raceSource, selectedRaceIsLegacyException)
  if (character.subrace) {
    flag(
      character.subrace,
      character.subraceSource,
      selectedRaceIsLegacyException && character.subraceSource === character.raceSource,
    )
  }

  for (const cls of character.classProgression) {
    flag(cls.name, cls.source)
    if (cls.subclass) {
      const subclassIsLegacyException = Boolean(
        permitsLegacyExceptions &&
          cls.subclassSource &&
          XPHB_LEGACY_SUBCLASS_KEYS.has(
            `${cls.name}|${cls.source}|${cls.subclass}|${cls.subclassSource}`,
          ),
      )
      flag(`${cls.subclass} (subclass)`, cls.subclassSource, subclassIsLegacyException)
    }
  }

  flag(character.background, character.backgroundSource)

  for (const feat of character.feats) {
    flag(
      feat.name,
      feat.source,
      permitsLegacyExceptions && XPHB_LEGACY_FEAT_KEYS.has(`${feat.name}|${feat.source}`),
    )
  }
  for (const feat of character.specialFeats ?? []) {
    flag(
      feat.name,
      feat.source,
      permitsLegacyExceptions && XPHB_LEGACY_FEAT_KEYS.has(`${feat.name}|${feat.source}`),
    )
  }
  for (const choice of character.classFeatChoices ?? []) {
    for (const feat of choice.feats) {
      flag(
        feat.name,
        feat.source,
        permitsLegacyExceptions && XPHB_LEGACY_FEAT_KEYS.has(`${feat.name}|${feat.source}`),
      )
    }
  }
  for (const choice of character.classChoiceSelections ?? []) {
    for (const option of choice.selected) flag(option.name, option.source)
  }

  return Array.from(bySource.entries()).map(([source, items]) => ({ source, items }))
}

/** Count player-selected spells that were removed (excludes fixedSpells). */
export function countRemovedSpells(character: Character, newProfiles: SpellProfile[]): number {
  const selectedSpellKeys = (profile: SpellProfile): Set<string> =>
    new Set(
      [
        ...profile.cantrips,
        ...profile.spellsKnown,
        ...profile.preparedSpells,
        ...(profile.choices?.flatMap((choice) => choice.selected) ?? []),
      ].map(getSpellNameKey),
    )
  const nextById = new Map(newProfiles.map((profile) => [profile.id, profile]))
  let removed = 0
  for (const previous of character.spells.spellProfiles) {
    const before = selectedSpellKeys(previous)
    const after = nextById.get(previous.id)
    const afterKeys = after ? selectedSpellKeys(after) : new Set<string>()
    for (const key of before) {
      if (!afterKeys.has(key)) removed += 1
    }
  }
  return removed
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
    const key = getSpellNameKey(spell.name)
    if (!spellSourceIndex.has(key)) spellSourceIndex.set(key, new Set())
    spellSourceIndex.get(key)?.add(spell.source.toUpperCase())
  }

  const effectiveSet = new Set(effectiveSources.map((s) => s.toUpperCase()))

  const isSpellAllowed = (reference: string): boolean => {
    const { source } = parseSpellReference(reference)
    if (source) return effectiveSet.has(source.toUpperCase())

    const key = getSpellNameKey(reference)
    const sources = spellSourceIndex.get(key)
    if (!sources) return true // unknown spell — keep it
    for (const src of sources) {
      if (effectiveSet.has(src)) return true
    }
    return false
  }

  let changed = false
  const newProfiles = character.spells.spellProfiles.map((profile) => {
    const fixedKeys = new Set((profile.fixedSpells ?? []).map(getSpellNameKey))
    const keepMaterializedSpell = (reference: string) =>
      fixedKeys.has(getSpellNameKey(reference)) || isSpellAllowed(reference)
    const newCantrips = profile.cantrips.filter(keepMaterializedSpell)
    const newSpellsKnown = profile.spellsKnown.filter(keepMaterializedSpell)
    const newPreparedSpells = profile.preparedSpells.filter(keepMaterializedSpell)
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
