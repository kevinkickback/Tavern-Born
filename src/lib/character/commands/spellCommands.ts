/**
 * Spell-domain command helpers.
 *
 * These commands coordinate spell profile state with provenance updates and
 * return a single result object for callers to apply.
 */

import type { ResolvedRaceReference } from '@/lib/5etools/entityResolvers'
import {
  matchesNativeSpellFilter,
  matchNativeRacialChoices,
} from '@/lib/calculations/nativeRacialSpellChoices'
import {
  deriveNativeRacialSpellProfiles,
  getNativeRacialSpellOwners,
  materializeNativeRacialProfile,
  reconcileNativeRacialSpellLedger,
  refreshNativeRacialSpellState,
} from '@/lib/calculations/nativeRacialSpells'
import {
  buildSpellNameKeySet,
  dedupeSpellNames,
  formatSpellReference,
  getSpellNameKey,
  getSpellReferenceKey,
  isSourceQualifiedSpellReference,
  parseSpellReference,
} from '@/lib/calculations/spellIdentity'
import { isFixedProfileSpell, isSpecialSpellGrant } from '@/lib/calculations/spellOwnership'
import { SPECIAL_SPELL_PROFILE_ID } from '@/lib/calculations/spellProfiles.constants'
import {
  getSpecialSpellKind,
  refreshSpecialSpellKinds,
  resolveSpecialSpellKind,
  setSpecialSpellKind,
} from '@/lib/character/specialSpellState'
import { addSpellGrant, makeSourceTag } from '@/lib/provenance'
import type { ProvenanceLedger, SpellSourceTag } from '@/lib/provenance/types'
import type { Spell5e } from '@/types/5etools'
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
    sourceType?: 'feat' | 'manual'
    grantedAtLevel?: number
    attributionMode?: 'exact' | 'inferred-lowest-eligible'
    spellsByKey?: Readonly<Record<string, Spell5e>>
  },
): SpellCommandResult {
  if (options?.sourceType && !['manual', 'feat'].includes(options.sourceType))
    return { characterPatch: {}, provenanceUpdate: ledger }
  let targetProfileId = profileId
  if (!targetProfileId) {
    targetProfileId = SPECIAL_SPELL_PROFILE_ID
  }

  if (
    character.spells.spellProfiles.find((profile) => profile.id === targetProfileId)?.type ===
    'racial'
  )
    return { characterPatch: {}, provenanceUpdate: ledger }
  const targetProfile = character.spells.spellProfiles.find(
    (profile) => profile.id === targetProfileId,
  )
  if (targetProfile?.type !== 'special') return { characterPatch: {}, provenanceUpdate: ledger }
  if (
    targetProfile?.type === 'special' &&
    (!getSpellNameKey(spellName) ||
      (spellName.includes('|') && !isSourceQualifiedSpellReference(spellName)))
  )
    return { characterPatch: {}, provenanceUpdate: ledger }
  const updatedProfiles = (character.spells.spellProfiles ?? []).map((profile) => {
    if (profile.id !== targetProfileId) return profile

    const list = spellKind === 'cantrip' ? 'cantrips' : 'spellsKnown'
    if (profile.type === 'special')
      return setSpecialSpellKind(
        profile,
        spellName,
        resolveSpecialSpellKind(spellName, options?.spellsByKey) ??
          getSpecialSpellKind(profile, spellName) ??
          list,
      )
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
  if (
    options?.profileId &&
    character.spells.spellProfiles.find((profile) => profile.id === options.profileId)?.type ===
      'racial'
  )
    return { characterPatch: {}, provenanceUpdate: ledger }
  const target = parseSpellReference(spellName)
  const normKey = getSpellNameKey(spellName)
  const matchesReference = (reference: string) =>
    target.source
      ? getSpellReferenceKey(reference) === getSpellReferenceKey(spellName)
      : getSpellNameKey(reference) === normKey
  const affectedProfiles = character.spells.spellProfiles.filter(
    (profile) =>
      profile.type === 'special' && (!options?.profileId || profile.id === options.profileId),
  )
  if (!affectedProfiles.length) return { characterPatch: {}, provenanceUpdate: ledger }
  const retainedTags = (ledger.spells[normKey] ?? []).filter((tag) => {
    if (
      target.source &&
      getSpellReferenceKey(normKey, tag.grantSource) !== getSpellReferenceKey(spellName)
    )
      return true
    return !(affectedProfiles.length && tag.sourceType === 'manual')
  })
  const spells = { ...ledger.spells }
  if (retainedTags.length) spells[normKey] = retainedTags
  else delete spells[normKey]
  const updatedProfiles = character.spells.spellProfiles.map((profile) => {
    if (!affectedProfiles.includes(profile)) return profile
    const keep = (reference: string) =>
      !matchesReference(reference) ||
      (profile.type === 'special' &&
        retainedTags.some(
          (tag) =>
            isSpecialSpellGrant(tag) &&
            getSpellReferenceKey(normKey, tag.grantSource ?? '') ===
              getSpellReferenceKey(reference),
        ))
    return {
      ...profile,
      ...(!options?.spellKind || options.spellKind === 'cantrip' || profile.type === 'special'
        ? { cantrips: profile.cantrips.filter(keep) }
        : {}),
      ...(!options?.spellKind || options.spellKind === 'spell' || profile.type === 'special'
        ? { spellsKnown: profile.spellsKnown.filter(keep) }
        : {}),
      preparedSpells: profile.preparedSpells.filter(keep),
      ...(profile.type === 'special'
        ? { alwaysPreparedSpells: profile.alwaysPreparedSpells?.filter(keep) }
        : {}),
    }
  })
  return {
    characterPatch: createSpellProfilePatch(character, updatedProfiles),
    provenanceUpdate: reconcileNativeRacialSpellLedger({ ...ledger, spells }, updatedProfiles),
  }
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
  spellsByKey?: Readonly<Record<string, Spell5e>>,
): SpellCommandResult {
  const previous = character.spells.spellProfiles.find((profile) => profile.id === profileId)
  if (previous?.type !== 'special') return { characterPatch: {}, provenanceUpdate: ledger }
  const requestedCantrips = new Set(cantrips.map((reference) => getSpellReferenceKey(reference)))
  if (
    previous?.type === 'special' &&
    (spellsKnown.some((reference) => requestedCantrips.has(getSpellReferenceKey(reference))) ||
      [...cantrips, ...spellsKnown].some(
        (reference) =>
          !getSpellNameKey(reference) ||
          (reference.includes('|') && !isSourceQualifiedSpellReference(reference)),
      ))
  )
    return { characterPatch: {}, provenanceUpdate: ledger }
  const retainTargets = (references: string[], kind: 'cantrips' | 'spellsKnown') => {
    if (previous?.type !== 'special') return dedupeSpellNames(references)
    const fixed = previous[kind].filter((reference) =>
      isFixedProfileSpell(previous, ledger, reference),
    )
    return [
      ...new Map(
        [
          ...references.filter(
            (reference) =>
              !isFixedProfileSpell(previous, ledger, reference) ||
              getSpecialSpellKind(previous, reference) === kind,
          ),
          ...fixed,
        ].map((reference) => [getSpellReferenceKey(reference), reference]),
      ).values(),
    ]
  }
  const dedupedCantrips = retainTargets(cantrips, 'cantrips')
  const dedupedSpellsKnown = retainTargets(spellsKnown, 'spellsKnown')
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

  let provenanceUpdate = ledger
  if (previous?.type === 'special') {
    const previousTargets = new Set(
      [...previous.cantrips, ...previous.spellsKnown].map((reference) =>
        getSpellReferenceKey(reference),
      ),
    )
    const selectedTargets = [...dedupedCantrips, ...dedupedSpellsKnown]
    const selectedKeys = new Set(
      [...cantrips, ...spellsKnown].map((reference) => getSpellReferenceKey(reference)),
    )
    const removedTargets = new Set([...previousTargets].filter((key) => !selectedKeys.has(key)))
    provenanceUpdate = {
      ...ledger,
      spells: Object.fromEntries(
        Object.entries(ledger.spells).flatMap(([name, tags]) => {
          const retained = tags.filter(
            (tag) =>
              tag.sourceType !== 'manual' ||
              !removedTargets.has(getSpellReferenceKey(name, tag.grantSource)),
          )
          return retained.length ? [[name, retained]] : []
        }),
      ),
    }
    for (const reference of selectedTargets)
      if (!previousTargets.has(getSpellReferenceKey(reference)))
        provenanceUpdate = addSpellGrant(
          provenanceUpdate,
          reference,
          makeSourceTag('manual', 'User Choice', 'choice'),
        )
  }
  return {
    characterPatch: createSpellProfilePatch(
      character,
      refreshSpecialSpellKinds(
        { ...character, spells: { ...character.spells, spellProfiles: updatedProfiles } },
        spellsByKey,
      ).spells.spellProfiles,
    ),
    provenanceUpdate,
  }
}

export function selectRacialSpell(
  character: Character,
  ledger: ProvenanceLedger,
  profileId: string,
  choiceId: string,
  spellName: string,
  raceResolution?: ResolvedRaceReference,
  spellsByKey?: Readonly<Record<string, Spell5e>>,
): SpellCommandResult {
  const choice = character.spells.spellProfiles
    .find((profile) => profile.id === profileId)
    ?.choices?.find((entry) => entry.id === choiceId)
  if (!choice || choice.selected.length >= choice.count) {
    return {
      characterPatch: createSpellProfilePatch(character, character.spells.spellProfiles),
      provenanceUpdate: ledger,
    }
  }
  return setRacialSpellChoice(
    character,
    ledger,
    profileId,
    choiceId,
    [...choice.selected, spellName],
    raceResolution,
    spellsByKey,
  )
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
  const spellKey = getSpellReferenceKey(spellName)
  const choice = character.spells.spellProfiles
    .find((profile) => profile.id === profileId)
    ?.choices?.find((entry) => entry.id === choiceId)
  return setRacialSpellChoice(
    character,
    ledger,
    profileId,
    choiceId,
    choice?.selected.filter((name) => getSpellReferenceKey(name) !== spellKey) ?? [],
  )
}

/** Replace one descriptor, retaining independent fixed/descriptor/owner overlaps. */
export function setRacialSpellChoice(
  character: Character,
  ledger: ProvenanceLedger,
  profileId: string,
  choiceId: string,
  selectedSpells: readonly string[],
  raceResolution?: ResolvedRaceReference,
  spellsByKey?: Readonly<Record<string, Spell5e>>,
): SpellCommandResult {
  const profile = character.spells.spellProfiles.find((entry) => entry.id === profileId)
  const choice = profile?.choices?.find((entry) => entry.id === choiceId)
  const unchanged = { characterPatch: {}, provenanceUpdate: ledger }
  if (profile?.type !== 'racial' || !profile.racial?.suite || !choice) return unchanged
  const keys = selectedSpells.map(getSpellNameKey)
  if (
    new Set(keys).size !== keys.length ||
    selectedSpells.some((reference) => {
      const parts = reference.split('|')
      return parts.length !== 2 || parts.some((part) => !part.trim() || /[#{}]/.test(part))
    })
  )
    return unchanged
  const previous = new Set(choice.selected.map((reference) => getSpellReferenceKey(reference)))
  const current = refreshNativeRacialSpellState(
    { ...character, provenance: ledger },
    raceResolution,
    { spellsByKey },
  )
  const live = current.spells.spellProfiles.find((entry) => entry.id === profileId)
  const correspondence = matchNativeRacialChoices(
    profile,
    live?.racial?.mode ?? 'alternative',
    live?.racial?.suite?.id,
    live?.choices ?? [],
  )
  const descriptor = live?.choices?.find((entry) => correspondence.get(entry.id)?.id === choiceId)
  if (selectedSpells.length > (descriptor?.count ?? choice.count)) return unchanged
  const added = selectedSpells.filter((reference) => !previous.has(getSpellReferenceKey(reference)))
  if (added.length) {
    if (!descriptor || getNativeRacialSpellOwners(character, raceResolution) === null)
      return unchanged
    if (
      added.some(
        (reference) =>
          (descriptor.pool &&
            !descriptor.pool.some(
              (value) => getSpellReferenceKey(value) === getSpellReferenceKey(reference),
            )) ||
          (descriptor.filter &&
            matchesNativeSpellFilter(reference, descriptor.filter, { spellsByKey }) !== true),
      )
    )
      return unchanged
  }
  // A removed/unassociated old descriptor is already gone. Never clear a new one by position.
  if (!descriptor)
    return { characterPatch: { spells: current.spells }, provenanceUpdate: current.provenance }
  const retained = new Set(descriptor.selected.map((reference) => getSpellReferenceKey(reference)))
  const selected = selectedSpells.filter((reference) => {
    const key = getSpellReferenceKey(reference)
    return !previous.has(key) || retained.has(key)
  })
  const profiles = current.spells.spellProfiles.map((entry) =>
    entry.id === profileId
      ? materializeNativeRacialProfile({
          ...entry,
          choices: entry.choices?.map((candidate) =>
            candidate.id === descriptor.id
              ? {
                  ...candidate,
                  selected: selected.map((reference) => formatSpellReference(reference)),
                }
              : candidate,
          ),
        })
      : entry,
  )
  return {
    characterPatch: createSpellProfilePatch(character, profiles),
    provenanceUpdate: reconcileNativeRacialSpellLedger(current.provenance, profiles),
  }
}

/** Activate a whole live suite, or clear an established alternative using its saved mode. */
export function setRacialSpellSuite(
  character: Character,
  ledger: ProvenanceLedger,
  profileId: string,
  suiteId: string | undefined,
  raceResolution?: ResolvedRaceReference,
  spellsByKey?: Readonly<Record<string, Spell5e>>,
): SpellCommandResult {
  const profile = character.spells.spellProfiles.find((entry) => entry.id === profileId)
  const unchanged = { characterPatch: {}, provenanceUpdate: ledger }
  if (profile?.type !== 'racial' || !profile.racial || profile.racial.mode !== 'alternative')
    return unchanged
  const owners = getNativeRacialSpellOwners(character, raceResolution)
  let native: SpellProfile[]
  if (suiteId !== undefined) {
    if (
      !owners?.find((owner) => owner.id === profileId)?.suites.some((suite) => suite.id === suiteId)
    )
      return unchanged
    native = deriveNativeRacialSpellProfiles(
      character,
      raceResolution,
      new Map([[profileId, suiteId]]),
      { spellsByKey },
    )
  } else if (owners !== null) {
    native = deriveNativeRacialSpellProfiles(
      character,
      raceResolution,
      new Map([[profileId, undefined]]),
      { spellsByKey },
    )
  } else {
    native = character.spells.spellProfiles
      .filter((entry) => entry.type === 'racial')
      .map((entry) => {
        if (entry.id !== profileId || !entry.racial) return entry
        return materializeNativeRacialProfile({
          ...entry,
          racial: {
            context: entry.racial.context,
            ownerType: entry.racial.ownerType,
            mode: 'alternative',
            fixed: [],
          },
          castingAbility: undefined,
          castingAbilityOptions: undefined,
          choices: [],
        })
      })
  }
  const profiles = [
    ...character.spells.spellProfiles.filter((entry) => entry.type !== 'racial'),
    ...native,
  ]
  return {
    characterPatch: createSpellProfilePatch(character, profiles),
    provenanceUpdate: reconcileNativeRacialSpellLedger(ledger, profiles),
  }
}

export function setRacialCastingAbility(
  character: Character,
  ledger: ProvenanceLedger,
  profileId: string,
  ability: string,
  raceResolution?: ResolvedRaceReference,
  spellsByKey?: Readonly<Record<string, Spell5e>>,
): SpellCommandResult {
  const profile = character.spells.spellProfiles.find((entry) => entry.id === profileId)
  const normalized = ability.trim().toLowerCase()
  if (
    profile?.type !== 'racial' ||
    !profile.racial?.suite ||
    (normalized && !/^(str|dex|con|int|wis|cha)$/.test(normalized))
  )
    return { characterPatch: {}, provenanceUpdate: ledger }
  if (normalized && getNativeRacialSpellOwners(character, raceResolution) === null)
    return { characterPatch: {}, provenanceUpdate: ledger }
  const current = refreshNativeRacialSpellState(
    { ...character, provenance: ledger },
    raceResolution,
    { spellsByKey },
  )
  const live = current.spells.spellProfiles.find((entry) => entry.id === profileId)
  if (normalized && !live?.castingAbilityOptions?.includes(normalized))
    return { characterPatch: {}, provenanceUpdate: ledger }
  if (!live?.castingAbilityOptions)
    return { characterPatch: { spells: current.spells }, provenanceUpdate: current.provenance }
  const profiles = current.spells.spellProfiles.map((entry) =>
    entry.id === profileId ? { ...entry, castingAbility: normalized || undefined } : entry,
  )
  return {
    characterPatch: createSpellProfilePatch(current, profiles),
    provenanceUpdate: current.provenance,
  }
}
