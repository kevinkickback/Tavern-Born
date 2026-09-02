/**
 * Spell-domain command helpers.
 *
 * These commands coordinate spell profile state with provenance updates and
 * return a single result object for callers to apply.
 */

import { addSpellGrant, makeSourceTag, normalizeKey } from '@/lib/provenance'
import type { ProvenanceLedger, SpellSourceTag } from '@/lib/provenance/types'
import type { Character, SpellProfile } from '@/types/character'
import type { CharacterCommandResult } from './commandResult'

export interface SpellCommandResult extends CharacterCommandResult {}

function createSpellProfilePatch(
  character: Character,
  spellProfiles: SpellProfile[],
): Partial<Character> {
  return {
    spells: {
      ...character.spells,
      spellProfiles,
    },
  }
}

/**
 * Add a spell (cantrip or spell) to a character's spell profile.
 *
 * @param character - Active character
 * @param ledger - Current provenance ledger
 * @param spellName - Name of spell to add
 * @param spellKind - Type: 'cantrip' or 'spell'
 * @param profileId - Target spell profile ID
 * @param options - Additional options (source, grantedAtLevel, attribution mode)
 * @returns { characterPatch, provenanceUpdate } - Apply both atomically
 */
export function addSpellToCharacter(
  character: Character,
  ledger: ProvenanceLedger,
  spellName: string,
  spellKind: 'cantrip' | 'spell',
  profileId?: string,
  options?: {
    source?: string
    sourceType?: 'class' | 'subclass' | 'feat' | 'manual'
    grantedAtLevel?: number
    attributionMode?: 'exact' | 'inferred-lowest-eligible'
  },
): SpellCommandResult {
  let targetProfileId = profileId
  if (!targetProfileId) {
    const firstClass = character.spells.spellProfiles?.find((p) => p.type === 'class')
    targetProfileId = firstClass?.id ?? 'special'
  }

  const updatedProfiles = (character.spells.spellProfiles ?? []).map((profile) => {
    if (profile.id !== targetProfileId) return profile

    const list = spellKind === 'cantrip' ? 'cantrips' : 'spellsKnown'
    if (profile[list].includes(spellName)) {
      return profile
    }

    return {
      ...profile,
      [list]: [...profile[list], spellName],
    }
  })

  const sourceType = options?.sourceType ?? 'manual'
  const sourceName = options?.source ?? (sourceType === 'manual' ? 'User Choice' : 'Unknown')

  const baseTag = makeSourceTag(sourceType, sourceName, 'choice', options?.source)
  const sourceTag: SpellSourceTag = {
    ...baseTag,
    ...(options?.grantedAtLevel ? { spellGrantedAtLevel: options.grantedAtLevel } : {}),
    ...(options?.attributionMode ? { spellAttributionMode: options.attributionMode } : {}),
  }

  const updatedLedger = addSpellGrant(ledger, spellName, sourceTag)

  return {
    characterPatch: createSpellProfilePatch(character, updatedProfiles),
    provenanceUpdate: updatedLedger,
  }
}

/**
 * Remove a spell from a character's spell profiles and provenance.
 *
 * @param character - Active character
 * @param ledger - Current provenance ledger
 * @param spellName - Name of spell to remove
 * @param options - Additional options (kind, profileId for targeted removal)
 * @returns { characterPatch, provenanceUpdate } - Apply both atomically
 */
export function removeSpellFromCharacter(
  character: Character,
  ledger: ProvenanceLedger,
  spellName: string,
  options?: {
    spellKind?: 'cantrip' | 'spell'
    profileId?: string
  },
): SpellCommandResult {
  const updatedProfiles = (character.spells.spellProfiles ?? []).map((profile) => {
    if (options?.profileId && profile.id !== options.profileId) {
      return profile
    }

    let updated = profile

    if (!options?.spellKind || options.spellKind === 'cantrip') {
      updated = {
        ...updated,
        cantrips: updated.cantrips.filter((s) => s !== spellName),
        preparedSpells: updated.preparedSpells.filter((s) => s !== spellName),
      }
    }

    if (!options?.spellKind || options.spellKind === 'spell') {
      updated = {
        ...updated,
        spellsKnown: updated.spellsKnown.filter((s) => s !== spellName),
        preparedSpells: updated.preparedSpells.filter((s) => s !== spellName),
      }
    }

    return updated
  })

  const normKey = normalizeKey(spellName)
  const newSpells = { ...ledger.spells }
  delete newSpells[normKey]
  const updatedLedger = { ...ledger, spells: newSpells }

  return {
    characterPatch: createSpellProfilePatch(character, updatedProfiles),
    provenanceUpdate: updatedLedger,
  }
}

/**
 * Swap one spell for another, preserving grant level attribution.
 *
 * @param character - Active character
 * @param ledger - Current provenance ledger
 * @param removedSpellName - Spell being replaced
 * @param addedSpellName - New spell
 * @param profileId - Target spell profile
 * @returns { characterPatch, provenanceUpdate } - Apply both atomically
 */
export function swapSpellOnCharacter(
  character: Character,
  ledger: ProvenanceLedger,
  removedSpellName: string,
  addedSpellName: string,
  profileId?: string,
  options?: {
    grantedAtLevel?: number // If not specified, inherit from old spell's grant
  },
): SpellCommandResult {
  let inheritedLevel = options?.grantedAtLevel
  if (!inheritedLevel) {
    const removedKey = normalizeKey(removedSpellName)
    const removedTags = ledger.spells[removedKey] ?? []
    const levelTag = removedTags.find((t) => !!t.spellGrantedAtLevel)
    inheritedLevel = levelTag?.spellGrantedAtLevel
  }

  const afterRemove = removeSpellFromCharacter(character, ledger, removedSpellName, {
    profileId,
  })

  const afterAdd = addSpellToCharacter(
    {
      ...character,
      spells: afterRemove.characterPatch.spells ?? character.spells,
    },
    afterRemove.provenanceUpdate,
    addedSpellName,
    'spell',
    profileId,
    {
      sourceType: 'class',
      grantedAtLevel: inheritedLevel,
    },
  )

  return afterAdd
}

/**
 * Replace all spells on a profile.
 *
 * @param character - Active character
 * @param ledger - Current provenance ledger
 * @param profileId - Target spell profile
 * @param cantrips - New cantrip list
 * @param spellsKnown - New spells known list
 * @returns { characterPatch, provenanceUpdate } - Apply both atomically
 */
export function setProfileSpells(
  character: Character,
  ledger: ProvenanceLedger,
  profileId: string,
  cantrips: string[],
  spellsKnown: string[],
): SpellCommandResult {
  const updatedProfiles = (character.spells.spellProfiles ?? []).map((profile) => {
    if (profile.id !== profileId) return profile

    return {
      ...profile,
      cantrips: [...new Set(cantrips)],
      spellsKnown: [...new Set(spellsKnown)],
      preparedSpells: profile.alwaysPrepared
        ? []
        : profile.preparedSpells.filter((s) => spellsKnown.includes(s)),
    }
  })

  return {
    characterPatch: createSpellProfilePatch(character, updatedProfiles),
    provenanceUpdate: ledger,
  }
}

/**
 * Toggle a spell's prepared status.
 *
 * @param character - Active character
 * @param ledger - Current provenance ledger (unchanged)
 * @param profileId - Target spell profile
 * @param spellName - Spell to toggle
 * @returns { characterPatch, provenanceUpdate } - Apply both atomically
 */
export function toggleSpellPrepared(
  character: Character,
  ledger: ProvenanceLedger,
  profileId: string,
  spellName: string,
  isTruePreparedCaster = false,
): SpellCommandResult {
  const updatedProfiles = (character.spells.spellProfiles ?? []).map((profile) => {
    if (profile.id !== profileId) return profile

    const isPrepared = profile.preparedSpells.includes(spellName)
    if (isPrepared) {
      return {
        ...profile,
        preparedSpells: profile.preparedSpells.filter((s) => s !== spellName),
      }
    }

    const isKnown =
      isTruePreparedCaster ||
      profile.cantrips.includes(spellName) ||
      profile.spellsKnown.includes(spellName) ||
      profile.alwaysPrepared

    if (!isKnown) {
      return profile
    }

    return {
      ...profile,
      preparedSpells: [...profile.preparedSpells, spellName],
    }
  })

  return {
    characterPatch: createSpellProfilePatch(character, updatedProfiles),
    provenanceUpdate: ledger,
  }
}

/**
 * Select a racial spell from a racial spellcasting ability.
 *
 * @param character - Active character
 * @param ledger - Current provenance ledger
 * @param profileId - Target spell profile (usually 'special')
 * @param choiceId - Racial spellcasting choice identifier
 * @param spellName - Selected spell name
 * @returns { characterPatch, provenanceUpdate } - Apply both atomically
 */
export function selectRacialSpell(
  character: Character,
  ledger: ProvenanceLedger,
  profileId: string,
  choiceId: string,
  spellName: string,
): SpellCommandResult {
  const updatedProfiles = (character.spells.spellProfiles ?? []).map((profile) => {
    if (profile.id !== profileId) return profile
    const choice =
      profile.type === 'racial'
        ? profile.choices?.find((entry) => entry.id === choiceId)
        : undefined
    const isCantrip = choice?.isCantrip ?? true
    const choices = profile.choices?.map((entry) => {
      if (
        entry.id !== choiceId ||
        entry.selected.includes(spellName) ||
        entry.selected.length >= entry.count
      ) {
        return entry
      }
      return { ...entry, selected: [...entry.selected, spellName] }
    })
    return {
      ...profile,
      ...(choices ? { choices } : {}),
      cantrips: isCantrip ? [...new Set([...profile.cantrips, spellName])] : profile.cantrips,
      spellsKnown: isCantrip
        ? profile.spellsKnown
        : [...new Set([...profile.spellsKnown, spellName])],
    }
  })

  const sourceTag = makeSourceTag('race', choiceId.split(':')[0] ?? 'Race', 'choice')

  const updatedLedger = addSpellGrant(ledger, spellName, sourceTag)

  return {
    characterPatch: createSpellProfilePatch(character, updatedProfiles),
    provenanceUpdate: updatedLedger,
  }
}

/**
 * Remove a racial spell selection.
 *
 * @param character - Active character
 * @param ledger - Current provenance ledger
 * @param profileId - Target spell profile
 * @param choiceId - Racial spellcasting choice identifier
 * @param spellName - Selected spell name
 * @returns { characterPatch, provenanceUpdate } - Apply both atomically
 */
export function removeRacialSpell(
  character: Character,
  ledger: ProvenanceLedger,
  profileId: string,
  choiceId: string,
  spellName: string,
): SpellCommandResult {
  const updatedProfiles = (character.spells.spellProfiles ?? []).map((profile) => {
    if (profile.id !== profileId) return profile

    return {
      ...profile,
      choices: profile.choices?.map((choice) =>
        choice.id === choiceId
          ? { ...choice, selected: choice.selected.filter((name) => name !== spellName) }
          : choice,
      ),
      cantrips: profile.cantrips.filter((s) => s !== spellName),
      spellsKnown: profile.spellsKnown.filter((s) => s !== spellName),
      preparedSpells: profile.preparedSpells.filter((s) => s !== spellName),
    }
  })

  const normKey = normalizeKey(spellName)
  const tags = ledger.spells[normKey] ?? []
  const raceName = choiceId.split(':')[0] ?? 'Race'
  const filtered = tags.filter((t) => !(t.sourceType === 'race' && t.sourceName === raceName))

  const newSpells =
    filtered.length > 0
      ? { ...ledger.spells, [normKey]: filtered }
      : Object.fromEntries(Object.entries(ledger.spells).filter(([key]) => key !== normKey))

  const updatedLedger = { ...ledger, spells: newSpells }

  return {
    characterPatch: createSpellProfilePatch(character, updatedProfiles),
    provenanceUpdate: updatedLedger,
  }
}

export function syncSpellProfiles(
  character: Character,
  ledger: ProvenanceLedger,
  spellProfiles: SpellProfile[],
): SpellCommandResult {
  return {
    characterPatch: createSpellProfilePatch(character, spellProfiles),
    provenanceUpdate: ledger,
  }
}

export function setRacialCastingAbility(
  character: Character,
  ledger: ProvenanceLedger,
  profileId: string,
  ability: string,
): SpellCommandResult {
  const spellProfiles = character.spells.spellProfiles.map((profile) =>
    profile.id === profileId && profile.type === 'racial'
      ? { ...profile, castingAbility: ability }
      : profile,
  )
  return {
    characterPatch: createSpellProfilePatch(character, spellProfiles),
    provenanceUpdate: ledger,
  }
}
