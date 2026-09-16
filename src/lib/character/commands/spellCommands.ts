/**
 * Spell-domain command helpers.
 *
 * These commands coordinate spell profile state with provenance updates and
 * return a single result object for callers to apply.
 */

import {
  buildSpellNameKeySet,
  dedupeSpellNames,
  getSpellNameKey,
} from '@/lib/calculations/spellIdentity'
import {
  buildClassProfileLabel,
  toClassProfileId,
} from '@/lib/calculations/spellProfiles.constants'
import { addSpellGrant, applyClassSpellGrant, makeSourceTag, normalizeKey } from '@/lib/provenance'
import type { ProvenanceLedger, SpellSourceTag } from '@/lib/provenance/types'
import type { Character, SpellProfile } from '@/types/character'
import type { CharacterCommandResult } from './commandResult'

export interface SpellCommandResult extends CharacterCommandResult {}

export interface ClassSpellSelectionInput {
  name: string
  spellLevel: number
}

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

function isClassChoiceTag(
  tag: SpellSourceTag,
  className: string,
  classSource: string | undefined,
): boolean {
  return (
    tag.sourceType === 'class' &&
    tag.sourceName === className &&
    (tag.sourceRef ?? '') === (classSource ?? '') &&
    tag.grantType === 'choice'
  )
}

function removeClassChoiceTagsAtLevel(
  ledger: ProvenanceLedger,
  className: string,
  classSource: string | undefined,
  classLevel: number,
): ProvenanceLedger {
  const spells: ProvenanceLedger['spells'] = {}
  for (const [key, tags] of Object.entries(ledger.spells)) {
    const retained = tags.filter(
      (tag) =>
        !(isClassChoiceTag(tag, className, classSource) && tag.spellGrantedAtLevel === classLevel),
    )
    if (retained.length > 0) spells[key] = retained
  }
  return { ...ledger, spells }
}

/** Replace one class level's spell choices without disturbing other levels or unattributed spells. */
export function setClassSpellSelectionsAtLevel(
  character: Character,
  ledger: ProvenanceLedger,
  params: {
    className: string
    classSource?: string
    classLevel: number
    selections: ClassSpellSelectionInput[]
  },
): SpellCommandResult {
  const { className, classSource, classLevel } = params
  const selections = dedupeSpellNames(params.selections.map((selection) => selection.name)).map(
    (name) => ({
      name,
      spellLevel:
        params.selections.find(
          (selection) => getSpellNameKey(selection.name) === getSpellNameKey(name),
        )?.spellLevel ?? 1,
    }),
  )
  const profileId = toClassProfileId(className, classSource)
  const profiles = character.spells.spellProfiles
  const existingProfile = profiles.find((profile) => profile.id === profileId)
  const classEntry = character.classProgression?.find(
    (entry) => entry.name === className && (entry.source ?? '') === (classSource ?? ''),
  )
  const profile =
    existingProfile ??
    ({
      id: profileId,
      type: 'class',
      label: buildClassProfileLabel(
        classEntry ?? { name: className, source: classSource, levels: 1 },
      ),
      className,
      classSource,
      cantrips: [],
      spellsKnown: [],
      preparedSpells: [],
      alwaysPrepared: false,
    } satisfies SpellProfile)

  const previousLevelKeys = new Set<string>()
  for (const name of [...profile.cantrips, ...profile.spellsKnown]) {
    const tags = ledger.spells[normalizeKey(name)] ?? []
    if (
      tags.some(
        (tag) =>
          isClassChoiceTag(tag, className, classSource) && tag.spellGrantedAtLevel === classLevel,
      )
    ) {
      previousLevelKeys.add(getSpellNameKey(name))
    }
  }

  const fixedKeys = buildSpellNameKeySet(profile.fixedSpells ?? [])
  const retainedCantrips = profile.cantrips.filter(
    (name) => !previousLevelKeys.has(getSpellNameKey(name)) || fixedKeys.has(getSpellNameKey(name)),
  )
  const retainedSpellsKnown = profile.spellsKnown.filter(
    (name) => !previousLevelKeys.has(getSpellNameKey(name)) || fixedKeys.has(getSpellNameKey(name)),
  )
  const nextCantrips = dedupeSpellNames([
    ...retainedCantrips,
    ...selections.filter((selection) => selection.spellLevel === 0).map(({ name }) => name),
  ])
  const nextSpellsKnown = dedupeSpellNames([
    ...retainedSpellsKnown,
    ...selections.filter((selection) => selection.spellLevel !== 0).map(({ name }) => name),
  ])
  const nextKnownKeys = buildSpellNameKeySet([...nextCantrips, ...nextSpellsKnown])
  const nextProfile: SpellProfile = {
    ...profile,
    cantrips: nextCantrips,
    spellsKnown: nextSpellsKnown,
    preparedSpells: profile.preparedSpells.filter((name) =>
      nextKnownKeys.has(getSpellNameKey(name)),
    ),
  }
  const nextProfiles = profiles.some((candidate) => candidate.id === profileId)
    ? profiles.map((candidate) => (candidate.id === profileId ? nextProfile : candidate))
    : [...profiles, nextProfile]

  let provenanceUpdate = removeClassChoiceTagsAtLevel(ledger, className, classSource, classLevel)
  for (const selection of selections) {
    provenanceUpdate = applyClassSpellGrant(
      provenanceUpdate,
      className,
      classSource,
      selection.name,
      'choice',
      { spellGrantedAtLevel: classLevel, spellAttributionMode: 'exact' },
    )
  }

  return {
    characterPatch: createSpellProfilePatch(character, nextProfiles),
    provenanceUpdate,
  }
}

/** Replace one class-owned spell and its provenance in the same character update. */
export function swapClassSpellAtLevel(
  character: Character,
  ledger: ProvenanceLedger,
  params: {
    className: string
    classSource?: string
    swapAtLevel: number
    removedName: string
    addedName: string
  },
): SpellCommandResult {
  const { className, classSource, swapAtLevel, removedName, addedName } = params
  const profileId = toClassProfileId(className, classSource)
  const profiles = character.spells.spellProfiles
  const removedKey = getSpellNameKey(removedName)
  const removedTags = ledger.spells[normalizeKey(removedName)] ?? []
  const removedClassTag = removedTags.find((tag) => isClassChoiceTag(tag, className, classSource))
  const retainedTags = removedTags.filter((tag) => !isClassChoiceTag(tag, className, classSource))
  const spells = { ...ledger.spells }
  if (retainedTags.length > 0) spells[normalizeKey(removedName)] = retainedTags
  else delete spells[normalizeKey(removedName)]

  let provenanceUpdate: ProvenanceLedger = { ...ledger, spells }
  provenanceUpdate = applyClassSpellGrant(
    provenanceUpdate,
    className,
    classSource,
    addedName,
    'choice',
    removedClassTag?.spellGrantedAtLevel
      ? {
          spellGrantedAtLevel: removedClassTag.spellGrantedAtLevel,
          spellAttributionMode: removedClassTag.spellAttributionMode ?? 'exact',
        }
      : undefined,
  )

  const nextProfiles = profiles.map((profile) => {
    if (profile.id !== profileId) return profile
    return {
      ...profile,
      spellsKnown: dedupeSpellNames([
        ...profile.spellsKnown.filter((name) => getSpellNameKey(name) !== removedKey),
        addedName,
      ]),
      preparedSpells: profile.preparedSpells.filter((name) => getSpellNameKey(name) !== removedKey),
      spellSwaps: {
        ...profile.spellSwaps,
        [swapAtLevel]: { removed: removedName, added: addedName },
      },
    }
  })

  return {
    characterPatch: createSpellProfilePatch(character, nextProfiles),
    provenanceUpdate,
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
 * @param options - Additional options (source identity, grantedAtLevel, attribution mode)
 * @returns { characterPatch, provenanceUpdate } - Apply both atomically
 */
export function addSpellToCharacter(
  character: Character,
  ledger: ProvenanceLedger,
  spellName: string,
  spellKind: 'cantrip' | 'spell',
  profileId?: string,
  options?: {
    sourceName?: string
    sourceRef?: string
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
    if (profile[list].some((name) => getSpellNameKey(name) === getSpellNameKey(spellName))) {
      return profile
    }

    return {
      ...profile,
      [list]: [...profile[list], spellName],
    }
  })

  const sourceType = options?.sourceType ?? 'manual'
  const sourceName = options?.sourceName ?? (sourceType === 'manual' ? 'User Choice' : 'Unknown')

  const baseTag = makeSourceTag(sourceType, sourceName, 'choice', options?.sourceRef)
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
  const normKey = normalizeKey(spellName)
  const updatedProfiles = (character.spells.spellProfiles ?? []).map((profile) => {
    if (options?.profileId && profile.id !== options.profileId) {
      return profile
    }

    let updated = profile

    if (!options?.spellKind || options.spellKind === 'cantrip') {
      updated = {
        ...updated,
        cantrips: updated.cantrips.filter((spell) => normalizeKey(spell) !== normKey),
        preparedSpells: updated.preparedSpells.filter((spell) => normalizeKey(spell) !== normKey),
      }
    }

    if (!options?.spellKind || options.spellKind === 'spell') {
      updated = {
        ...updated,
        spellsKnown: updated.spellsKnown.filter((spell) => normalizeKey(spell) !== normKey),
        preparedSpells: updated.preparedSpells.filter((spell) => normalizeKey(spell) !== normKey),
      }
    }

    return updated
  })

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
  const dedupedCantrips = dedupeSpellNames(cantrips)
  const dedupedSpellsKnown = dedupeSpellNames(spellsKnown)
  const knownSpellKeys = buildSpellNameKeySet(dedupedSpellsKnown)
  const updatedProfiles = (character.spells.spellProfiles ?? []).map((profile) => {
    if (profile.id !== profileId) return profile

    return {
      ...profile,
      cantrips: dedupedCantrips,
      spellsKnown: dedupedSpellsKnown,
      preparedSpells: profile.alwaysPrepared
        ? []
        : profile.preparedSpells.filter((spell) => knownSpellKeys.has(getSpellNameKey(spell))),
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

    const spellKey = getSpellNameKey(spellName)
    const isPrepared = profile.preparedSpells.some(
      (preparedSpell) => getSpellNameKey(preparedSpell) === spellKey,
    )
    if (isPrepared) {
      return {
        ...profile,
        preparedSpells: profile.preparedSpells.filter(
          (preparedSpell) => getSpellNameKey(preparedSpell) !== spellKey,
        ),
      }
    }

    const isKnown =
      isTruePreparedCaster ||
      profile.cantrips.some((name) => getSpellNameKey(name) === spellKey) ||
      profile.spellsKnown.some((name) => getSpellNameKey(name) === spellKey) ||
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
        entry.selected.some((name) => getSpellNameKey(name) === getSpellNameKey(spellName)) ||
        entry.selected.length >= entry.count
      ) {
        return entry
      }
      return { ...entry, selected: [...entry.selected, spellName] }
    })
    return {
      ...profile,
      ...(choices ? { choices } : {}),
      cantrips: isCantrip ? dedupeSpellNames([...profile.cantrips, spellName]) : profile.cantrips,
      spellsKnown: isCantrip
        ? profile.spellsKnown
        : dedupeSpellNames([...profile.spellsKnown, spellName]),
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
  const spellKey = getSpellNameKey(spellName)
  const updatedProfiles = (character.spells.spellProfiles ?? []).map((profile) => {
    if (profile.id !== profileId) return profile

    return {
      ...profile,
      choices: profile.choices?.map((choice) =>
        choice.id === choiceId
          ? {
              ...choice,
              selected: choice.selected.filter((name) => getSpellNameKey(name) !== spellKey),
            }
          : choice,
      ),
      cantrips: profile.cantrips.filter((name) => getSpellNameKey(name) !== spellKey),
      spellsKnown: profile.spellsKnown.filter((name) => getSpellNameKey(name) !== spellKey),
      preparedSpells: profile.preparedSpells.filter((name) => getSpellNameKey(name) !== spellKey),
    }
  })

  const normKey = spellKey
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
