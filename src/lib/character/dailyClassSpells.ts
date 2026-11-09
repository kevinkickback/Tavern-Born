import {
  getClassSpellProfilePolicy,
  isSavedDailyCastingTarget,
} from '@/lib/5etools/classCastingRules'
import { getClassCastingLevelAccess } from '@/lib/5etools/classCastingSource'
import { getEntityLookupKey } from '@/lib/5etools/entityIdentity'
import { getSpellReferenceKey } from '@/lib/calculations/spellIdentity'
import { toClassProfileId } from '@/lib/calculations/spellProfiles.constants'
import { normalizeOwnerIdentity } from '@/lib/provenance/normalization'
import type { Spell5e } from '@/types/5etools'
import type { Character, SpellProfile } from '@/types/character'
import type { ClassCastingSourceProof } from '@/types/classCasting'
import {
  hasCurrentClassSpellListRoute,
  type ManagedClassSpellContext,
  permitted,
  sources,
} from './classSpellAuthority'

const norm = normalizeOwnerIdentity

export function getDailyClassSpellEntry(
  character: Character,
  profile: SpellProfile,
  castingSources?: readonly ClassCastingSourceProof[],
) {
  if (
    profile.type !== 'class' ||
    !profile.className ||
    profile.id !== toClassProfileId(profile.className, profile.classSource)
  )
    return undefined
  const entries = character.classProgression.filter(
    (entry) =>
      norm(profile.className) === norm(entry.name) &&
      norm(profile.classSource) === norm(entry.source),
  )
  const entry = entries.length === 1 ? entries[0] : undefined
  return entry &&
    profile.id === toClassProfileId(entry.name, entry.source) &&
    (profile.dailyCastingTarget
      ? isSavedDailyCastingTarget(entry, profile.dailyCastingTarget)
      : getClassSpellProfilePolicy(entry).mode === 'daily' ||
        getClassSpellProfilePolicy(entry, castingSources).mode === 'daily')
    ? entry
    : undefined
}

/** Unrelated writes retain player intent, never stale fixed or numeric materialization. */
export function preserveDailyClassSpellIntent(saved: Character, next: Character): Character {
  return {
    ...next,
    spells: {
      ...next.spells,
      spellProfiles: next.spells.spellProfiles.map((profile) => {
        const previous = saved.spells.spellProfiles.find(
          (row) => row.id === profile.id && getDailyClassSpellEntry(saved, row),
        )
        const retained = previous?.dailyCastingTarget
          ? { ...profile, dailyCastingTarget: previous.dailyCastingTarget }
          : profile
        return previous && getDailyClassSpellEntry(next, retained)
          ? { ...retained, preparedSpells: [...previous.preparedSpells] }
          : profile
      }),
    },
  }
}

export function getDailyClassSpellAccess(
  character: Character,
  profile: SpellProfile,
  context?: ManagedClassSpellContext,
) {
  const castingSources = context?.catalogs?.classCastingSources
  const entry = getDailyClassSpellEntry(character, profile, castingSources)
  if (!entry) return undefined
  const { rule, owner, mode } = getClassSpellProfilePolicy(entry, castingSources)
  const savedTarget =
    profile.dailyCastingTarget ??
    (profile.preparedSpells.length
      ? getClassSpellProfilePolicy(entry).rule?.declaration.target
      : undefined)
  if (!rule || mode !== 'daily' || (savedTarget && savedTarget !== rule.declaration.target))
    return undefined
  const current =
    context?.catalogs &&
    getClassCastingLevelAccess(
      context.catalogs,
      owner,
      rule.declaration.target,
      rule.declaration.level,
      entry.levels,
    )
  const allowed = sources(character)
  if (
    !current ||
    ![
      entry.source,
      current.declaration.feature.source,
      ...(current.provider ? [current.provider.source] : []),
    ].every((source) => permitted(allowed, source))
  )
    return undefined
  return { entry, ...current }
}

export interface DailyClassSpellStatus {
  profileId: string
  reference: string
  active: boolean
  reason?: string
}

/** Saved daily arrays are intent; current exact producer/target/level/list yields the benefit. */
export function projectDailyClassSpellIntent(
  saved: Character,
  current: Character,
  context?: ManagedClassSpellContext,
) {
  const statuses: DailyClassSpellStatus[] = []
  let targets: Map<string, Spell5e | undefined> | undefined
  const currentTargets = () => {
    if (!targets) {
      targets = new Map()
      for (const spell of Object.values(context?.spellsByKey ?? {})) {
        const key = getEntityLookupKey(spell.name, spell.source).toLowerCase()
        targets.set(key, targets.has(key) ? undefined : spell)
      }
    }
    return targets
  }
  const spellProfiles = current.spells.spellProfiles.map((profile) => {
    const previous = saved.spells.spellProfiles.find((row) => row.id === profile.id)
    if (
      !previous?.preparedSpells.length ||
      !getDailyClassSpellEntry(saved, previous) ||
      !getDailyClassSpellEntry(current, profile)
    )
      return profile
    const access = getDailyClassSpellAccess(current, previous, context)
    const preparedSpells = [...profile.preparedSpells]
    for (const reference of previous.preparedSpells) {
      const spell = currentTargets().get(getSpellReferenceKey(reference))
      const fixed = profile.fixedSpells?.some(
        (row) => getSpellReferenceKey(row) === getSpellReferenceKey(reference),
      )
      const reason = !access
        ? 'Restore the current source for this class and its casting feature.'
        : !spell || !permitted(sources(current), spell.source)
          ? 'Restore the exact prepared spell printing.'
          : !Number.isInteger(spell.level) || spell.level < 1 || spell.level > access.maxSpellLevel
            ? 'This spell is outside the level available to this class.'
            : !fixed && !hasCurrentClassSpellListRoute(current, access.entry, spell, context ?? {})
              ? 'Restore this class spell list, its optional feature selection, or an independent spell-list grant.'
              : undefined
      statuses.push({
        profileId: profile.id,
        reference,
        active: !reason,
        ...(reason ? { reason } : {}),
      })
      if (
        !reason &&
        !preparedSpells.some((row) => getSpellReferenceKey(row) === getSpellReferenceKey(reference))
      )
        preparedSpells.push(reference)
    }
    return { ...profile, preparedSpells }
  })
  return { character: { ...current, spells: { ...current.spells, spellProfiles } }, statuses }
}
