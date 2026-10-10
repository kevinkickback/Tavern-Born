import { getSelectedSubclassData } from '@/lib/5etools/classData'
import type { ResolvedRaceReference } from '@/lib/5etools/entityResolvers'
import { parseSubclassSpells } from '@/lib/5etools/subclassSpells'
import { getCharacterClassEntries } from '@/lib/characterUtils'
import { normalizeKey } from '@/lib/provenance/normalization'
import type { Class5e, RaceAdditionalSpells } from '@/types/5etools'
import type { Character, SpellProfile } from '@/types/character'
import { deriveNativeRacialSpellProfiles } from './nativeRacialSpells'
import { getSpellNameKey, getSpellReferenceKey, parseSpellReference } from './spellIdentity'
import {
  buildClassProfileLabel,
  SPECIAL_SPELL_PROFILE_ID,
  SPECIAL_SPELL_PROFILE_LABEL,
  toClassProfileId,
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

  // A direct parent boundary is sufficient only when no child was requested.
  const resolution =
    options?.raceResolution ??
    (raceData?.source && !character.subrace
      ? {
          parentRace: raceData as import('@/types/5etools').Race5e,
          subraceData: undefined,
          subraceIsNested: false,
        }
      : undefined)
  next.push(...deriveNativeRacialSpellProfiles(character, resolution))

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
