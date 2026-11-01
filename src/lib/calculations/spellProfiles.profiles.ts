import { findClassReference } from '@/lib/5etools/classReference'
import type { ResolvedRaceReference } from '@/lib/5etools/entityResolvers'
import { getEarnedSubclassSpellGrants } from '@/lib/5etools/subclassSpells'
import { stripManagedClassSpellState } from '@/lib/character/managedClassSpellState'
import { getCharacterClassEntries } from '@/lib/characterUtils'
import type { Class5e, RaceAdditionalSpells } from '@/types/5etools'
import type { Character, SpellProfile } from '@/types/character'
import { deriveNativeRacialSpellProfiles } from './nativeRacialSpells'
import { getSpellNameKey, getSpellReferenceKey } from './spellIdentity'
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

/** Exact race resolution establishes grants/removals; missing metadata retains saved racial state. */
export function ensureSpellProfiles(
  character: Character,
  classesById?: Map<string, Class5e>,
  raceData?: { name: string; source?: string; additionalSpells?: RaceAdditionalSpells[] },
  options?: {
    preserveUnavailableClassProfiles?: boolean
    raceResolution?: ResolvedRaceReference
    /** Already current shared projection; omitted authority strips saved numeric benefits. */
    effectiveSpellProfiles?: readonly SpellProfile[]
    /** Exact current visible targets; omitted authority cannot grant fixed spell benefits. */
    availableSpellReferences?: ReadonlySet<string>
  },
): SpellProfile[] {
  if (options?.effectiveSpellProfiles !== undefined)
    return options.effectiveSpellProfiles.map(cloneProfile)
  character = stripManagedClassSpellState(character)
  const existing = Array.isArray(character.spells.spellProfiles)
    ? character.spells.spellProfiles.map(cloneProfile)
    : []

  const byId = new Map(existing.map((profile) => [profile.id, profile]))
  const next: SpellProfile[] = []

  const classEntries = getCharacterClassEntries(character)
  const spellKey = getSpellReferenceKey

  for (const entry of classEntries) {
    const id = toClassProfileId(entry.name, entry.source)
    const existingProfile = byId.get(id)
    const classData = findClassReference(entry, classesById?.values())
    const subclassSpells = getEarnedSubclassSpellGrants(classData, entry)
    if (
      options?.preserveUnavailableClassProfiles &&
      existingProfile &&
      (!classData || subclassSpells === undefined)
    ) {
      next.push(existingProfile)
      continue
    }
    const grantedSubclassSpells = (subclassSpells ?? []).filter(
      (grant) =>
        grant.mode !== 'expanded' &&
        options?.availableSpellReferences?.has(getSpellReferenceKey(grant.spellName)),
    )
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
      [
        ...(existingProfile?.fixedSpells ?? []),
        ...(existingProfile?.alwaysPreparedSpells ?? []),
      ].map((name) => spellKey(name)),
    )
    const shouldRetain = (name: string) => !previousFixedKeys.has(spellKey(name))
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
        (name) => shouldRetain(name) && !alwaysPreparedKeys.has(spellKey(name)),
      ),
      fixedSpells:
        grantedSubclassSpells.length > 0
          ? grantedSubclassSpells.map((grant) => grant.spellName)
          : undefined,
      alwaysPreparedSpells:
        alwaysPreparedSubclassSpells.length > 0 ? alwaysPreparedSubclassSpells : undefined,
      alwaysPrepared: false,
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

export function collectKnownSpells(profiles: readonly SpellProfile[]): {
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
    for (const name of profile.preparedSpells) prepared.add(name)
  }

  return {
    cantrips: [...cantrips],
    spellsKnown: [...spellsKnown].filter((name) => !cantrips.has(name)),
    preparedSpells: [...prepared],
  }
}
