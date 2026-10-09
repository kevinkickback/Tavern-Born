import { getSelectedSubclassData } from '@/lib/5etools/classData'
import type { ResolvedRaceReference } from '@/lib/5etools/entityResolvers'
import { parseRaceSpellBlocks } from '@/lib/5etools/raceSpells'
import { parseSubclassSpells } from '@/lib/5etools/subclassSpells'
import { getCharacterClassEntries, getTotalClassLevels } from '@/lib/characterUtils'
import { normalizeKey } from '@/lib/provenance/normalization'
import type { Class5e, RaceAdditionalSpells } from '@/types/5etools'
import type { Character, RaceSpellChoice, SpellProfile } from '@/types/character'
import { deriveRaceSpellSelection } from './raceSpellSelection'
import { getSpellNameKey, getSpellReferenceKey, parseSpellReference } from './spellIdentity'
import {
  buildClassProfileLabel,
  RACIAL_SPELL_PROFILE_LABEL,
  SPECIAL_SPELL_PROFILE_ID,
  SPECIAL_SPELL_PROFILE_LABEL,
  toClassProfileId,
  toRacialProfileId,
} from './spellProfiles.constants'

function cloneProfile(profile: SpellProfile): SpellProfile {
  return {
    ...profile,
    cantrips: [...profile.cantrips],
    spellsKnown: [...profile.spellsKnown],
    preparedSpells: [...profile.preparedSpells],
    ...(profile.fixedSpells ? { fixedSpells: [...profile.fixedSpells] } : {}),
    ...(profile.alwaysPreparedSpells
      ? { alwaysPreparedSpells: [...profile.alwaysPreparedSpells] }
      : {}),
    ...(profile.choices
      ? { choices: profile.choices.map((c) => ({ ...c, selected: [...c.selected] })) }
      : {}),
    ...(profile.castingAbilityOptions
      ? { castingAbilityOptions: [...profile.castingAbilityOptions] }
      : {}),
  }
}

function mergeSpellNames(
  existing: string[],
  additions: string[],
  spellKey = getSpellNameKey,
): string[] {
  if (additions.length === 0) return existing
  const byKey = new Map(existing.map((name) => [spellKey(name), name] as const))
  for (const name of additions) {
    const key = spellKey(name)
    if (!key || byKey.has(key)) continue
    byKey.set(key, name)
  }
  return [...byKey.values()]
}

function uniqueSpellKeys(names: readonly string[]): Set<string> {
  return new Set(names.map(getSpellNameKey).filter(Boolean))
}

function hasIndependentClassOwnership(
  character: Character,
  entry: { name: string; source?: string },
  spellName: string,
): boolean {
  return (character.provenance?.spells?.[normalizeKey(spellName)] ?? []).some(
    (tag) =>
      tag.sourceType === 'class' &&
      tag.sourceName === entry.name &&
      (tag.sourceRef ?? '') === (entry.source ?? ''),
  )
}

export interface SpellProfileSelectionCounts {
  cantrips: number
  spells: number
  prepared: number
}

/** Counts unique player-managed entries without treating derived grants as class selections. */
export function getSpellProfileSelectionCounts(
  profile: Pick<
    SpellProfile,
    'cantrips' | 'spellsKnown' | 'preparedSpells' | 'fixedSpells' | 'alwaysPreparedSpells'
  >,
): SpellProfileSelectionCounts {
  const fixed = uniqueSpellKeys(profile.fixedSpells ?? [])
  const alwaysPrepared = uniqueSpellKeys(profile.alwaysPreparedSpells ?? [])
  const countSelectable = (names: readonly string[]) =>
    new Set(names.map(getSpellNameKey).filter((key) => key && !fixed.has(key))).size

  return {
    cantrips: countSelectable(profile.cantrips),
    spells: countSelectable(profile.spellsKnown),
    prepared: new Set(
      profile.preparedSpells.map(getSpellNameKey).filter((key) => key && !alwaysPrepared.has(key)),
    ).size,
  }
}

/** Counts spell identities case-insensitively for derived presentation summaries. */
export function countUniqueSpellNames(names: readonly string[]): number {
  return uniqueSpellKeys(names).size
}

/**
 * Build or update a racial spell profile from parsed race data.
 */
export function buildRacialSpellProfile(params: {
  raceName: string
  raceSource?: string
  additionalSpells: RaceAdditionalSpells[]
  totalLevel: number
  existingProfile?: SpellProfile
}): SpellProfile {
  const { raceName, raceSource, additionalSpells, totalLevel, existingProfile } = params
  const profileId = toRacialProfileId(raceName, raceSource)

  const blocks = parseRaceSpellBlocks(additionalSpells)
  const isMutuallyExclusive = blocks.length > 1

  const fixedSpells: string[] = []
  const cantrips: string[] = []
  const spellsKnown: string[] = []
  const choices: RaceSpellChoice[] = []

  let ability: string | undefined
  let abilityOptions: string[] | undefined

  if (isMutuallyExclusive) {
    const pool: string[] = []
    let isCantrip = false

    for (const block of blocks) {
      if (block.ability) ability = block.ability
      if (block.abilityOptions) abilityOptions = block.abilityOptions

      for (const grant of block.grants) {
        if (grant.level <= totalLevel) {
          pool.push(grant.spellName)
          isCantrip = grant.isCantrip
        }
      }
    }

    if (pool.length > 0) {
      const existingChoice = existingProfile?.choices?.find((c) => c.id === 'block-choice')
      const poolKeys = new Set(pool.map((reference) => getSpellReferenceKey(reference)))
      const selected =
        existingChoice?.selected.filter((spell) => poolKeys.has(getSpellReferenceKey(spell))) ?? []
      choices.push({
        id: 'block-choice',
        count: 1,
        isCantrip,
        pool,
        selected,
      })

      for (const name of selected) {
        if (isCantrip) {
          cantrips.push(name)
        } else {
          spellsKnown.push(name)
        }
      }
    }
  } else if (blocks.length === 1) {
    const block = blocks[0]
    if (block.ability) ability = block.ability
    if (block.abilityOptions) abilityOptions = block.abilityOptions

    for (const grant of block.grants) {
      if (grant.level > totalLevel) continue
      fixedSpells.push(grant.spellName)
      if (grant.isCantrip) {
        cantrips.push(grant.spellName)
      } else {
        spellsKnown.push(grant.spellName)
      }
    }

    for (const choiceDesc of block.choices) {
      if (choiceDesc.level > totalLevel) continue
      const existingChoice = existingProfile?.choices?.find((c) => c.id === choiceDesc.id)
      const selected = existingChoice?.selected ?? []
      const choice: RaceSpellChoice = {
        id: choiceDesc.id,
        count: choiceDesc.count,
        isCantrip: choiceDesc.isCantrip,
        selected,
      }
      if (choiceDesc.filter) choice.filter = choiceDesc.filter
      if (choiceDesc.pool) choice.pool = choiceDesc.pool
      choices.push(choice)

      for (const name of selected) {
        if (choiceDesc.isCantrip) {
          cantrips.push(name)
        } else {
          spellsKnown.push(name)
        }
      }
    }
  }

  const resolvedAbility = existingProfile?.castingAbility ?? ability

  return {
    id: profileId,
    type: 'racial',
    label: RACIAL_SPELL_PROFILE_LABEL,
    raceName,
    raceSource,
    castingAbility: resolvedAbility,
    castingAbilityOptions: abilityOptions,
    choices: choices.length > 0 ? choices : undefined,
    fixedSpells: fixedSpells.length > 0 ? fixedSpells : undefined,
    cantrips,
    spellsKnown,
    preparedSpells: [],
    alwaysPrepared: true,
  }
}

export function getKnownSpellNames(profiles: SpellProfile[]): Set<string> {
  const names = new Set<string>()

  for (const profile of profiles) {
    for (const name of profile.cantrips) {
      names.add(name)
    }
    for (const name of profile.spellsKnown) {
      names.add(name)
    }
  }

  return names
}

/** Exact race resolution establishes grants/removals; missing metadata retains saved racial state. */
export function ensureSpellProfiles(
  character: Character,
  classesById?: Map<string, Class5e>,
  raceData?: { name: string; source?: string; additionalSpells?: RaceAdditionalSpells[] },
  options?: {
    preserveUnavailableClassProfiles?: boolean
    raceResolution?: ResolvedRaceReference
  },
): SpellProfile[] {
  const existing = Array.isArray(character.spells.spellProfiles)
    ? character.spells.spellProfiles.map(cloneProfile)
    : []

  const byId = new Map(existing.map((profile) => [profile.id, profile]))
  const next: SpellProfile[] = []

  const classEntries = getCharacterClassEntries(character)
  const spellKey = options?.preserveUnavailableClassProfiles
    ? getSpellReferenceKey
    : getSpellNameKey

  for (const entry of classEntries) {
    const id = toClassProfileId(entry.name, entry.source)
    const existingProfile = byId.get(id)
    const classData = classesById?.get(id)
    const subclassData = getSelectedSubclassData(classData, entry)
    if (
      options?.preserveUnavailableClassProfiles &&
      existingProfile &&
      (!classData || (entry.subclass && !subclassData))
    ) {
      next.push(existingProfile)
      continue
    }
    const subclassSpells = parseSubclassSpells(subclassData?.additionalSpells, entry.levels, {
      preserveSource: options?.preserveUnavailableClassProfiles,
    })
    const grantedSubclassSpells = subclassSpells.filter((grant) => grant.mode !== 'expanded')
    const grantedSubclassCantrips = grantedSubclassSpells
      .filter((grant) => grant.isCantrip)
      .map((grant) => grant.spellName)
    const grantedSubclassLeveledSpells = grantedSubclassSpells
      .filter((grant) => !grant.isCantrip)
      .map((grant) => grant.spellName)
    const alwaysPreparedSubclassSpells = grantedSubclassSpells
      .filter((grant) => grant.mode === 'prepared' || grant.mode === 'innate')
      .map((grant) => grant.spellName)

    // Subclass grants are derived from the current selection. Remove the previous
    // derived set before merging so changing subclasses or losing a level cannot
    // leave stale grants behind in the parent class profile.
    const previousFixedKeys = new Set(
      (existingProfile?.fixedSpells ?? []).map((name) => spellKey(name)),
    )
    const legacyFixedKeys = new Set(
      (existingProfile?.fixedSpells ?? [])
        .filter((name) => !parseSpellReference(name).source)
        .map(getSpellNameKey),
    )
    const shouldRetain = (name: string) =>
      (!previousFixedKeys.has(spellKey(name)) && !legacyFixedKeys.has(getSpellNameKey(name))) ||
      hasIndependentClassOwnership(character, entry, name)
    const retainedCantrips = (existingProfile?.cantrips ?? []).filter(shouldRetain)
    const retainedSpellsKnown = (existingProfile?.spellsKnown ?? []).filter(shouldRetain)
    const alwaysPreparedKeys = new Set(alwaysPreparedSubclassSpells.map((name) => spellKey(name)))

    next.push({
      id,
      type: 'class',
      label: buildClassProfileLabel(entry),
      className: entry.name,
      classSource: entry.source,
      cantrips: mergeSpellNames(retainedCantrips, grantedSubclassCantrips, spellKey),
      spellsKnown: mergeSpellNames(retainedSpellsKnown, grantedSubclassLeveledSpells, spellKey),
      preparedSpells: (existingProfile?.preparedSpells ?? []).filter(
        (name) => !alwaysPreparedKeys.has(spellKey(name)),
      ),
      fixedSpells:
        grantedSubclassSpells.length > 0
          ? grantedSubclassSpells.map((grant) => grant.spellName)
          : undefined,
      alwaysPreparedSpells:
        alwaysPreparedSubclassSpells.length > 0 ? alwaysPreparedSubclassSpells : undefined,
      alwaysPrepared: false,
      ...(existingProfile?.spellSwaps ? { spellSwaps: existingProfile.spellSwaps } : {}),
    })
  }

  const resolution = options?.raceResolution
  const selection =
    resolution?.parentRace && (!character.subrace || resolution.subraceData)
      ? deriveRaceSpellSelection(resolution.parentRace, resolution.subraceData, {
          raceName: character.race,
          subraceName: character.subrace,
          subraceIsNested: resolution.subraceIsNested,
        })
      : undefined
  const selectedRaceData = resolution ? selection : raceData
  if (!selectedRaceData && character.race) {
    // Missing exact metadata cannot establish a replacement or a spell removal.
    next.push(...existing.filter((profile) => profile.type === 'racial'))
  } else if (selectedRaceData?.additionalSpells?.length) {
    const raceName = selectedRaceData.name ?? character.race
    const racialId = toRacialProfileId(raceName, selectedRaceData.source)
    const existingRacial = byId.get(racialId)
    const totalLevel = getTotalClassLevels(getCharacterClassEntries(character))
    next.push(
      buildRacialSpellProfile({
        raceName,
        raceSource: selectedRaceData.source,
        additionalSpells: selectedRaceData.additionalSpells,
        totalLevel,
        existingProfile: existingRacial,
      }),
    )
  }

  const special = byId.get(SPECIAL_SPELL_PROFILE_ID)
  next.push({
    id: SPECIAL_SPELL_PROFILE_ID,
    type: 'special',
    label: SPECIAL_SPELL_PROFILE_LABEL,
    cantrips: special?.cantrips ?? [],
    spellsKnown: special?.spellsKnown ?? [],
    preparedSpells: [],
    ...(special?.fixedSpells ? { fixedSpells: [...special.fixedSpells] } : {}),
    ...(special?.alwaysPreparedSpells
      ? { alwaysPreparedSpells: [...special.alwaysPreparedSpells] }
      : {}),
    alwaysPrepared: true,
  })

  return next
}

export function collectKnownSpells(profiles: SpellProfile[]): {
  cantrips: string[]
  spellsKnown: string[]
  preparedSpells: string[]
} {
  const cantrips = new Set<string>()
  const spellsKnown = new Set<string>()
  const prepared = new Set<string>()

  for (const profile of profiles) {
    const alwaysPreparedKeys = new Set(
      (profile.alwaysPreparedSpells ?? []).map((name) => getSpellNameKey(name)),
    )
    for (const name of profile.cantrips) {
      cantrips.add(name)
      if (profile.alwaysPrepared || alwaysPreparedKeys.has(getSpellNameKey(name)))
        prepared.add(name)
    }
    for (const name of profile.spellsKnown) {
      spellsKnown.add(name)
      if (
        profile.alwaysPrepared ||
        alwaysPreparedKeys.has(getSpellNameKey(name)) ||
        profile.preparedSpells.some(
          (preparedSpell) => getSpellNameKey(preparedSpell) === getSpellNameKey(name),
        )
      ) {
        prepared.add(name)
      }
    }
  }

  return {
    cantrips: [...cantrips],
    spellsKnown: [...spellsKnown].filter((name) => !cantrips.has(name)),
    preparedSpells: [...prepared],
  }
}
