import { getClassSpellProfilePolicy } from '@/lib/5etools/classCastingRules'
import { getClassCastingLevelAccess } from '@/lib/5etools/classCastingSource'
import { getSpellReferenceKey } from '@/lib/calculations/spellIdentity'
import { toClassProfileId } from '@/lib/calculations/spellProfiles.constants'
import { normalizeOwnerIdentity } from '@/lib/provenance/normalization'
import type { Spell5e } from '@/types/5etools'
import type { Character, SpellProfile } from '@/types/character'
import {
  hasCurrentClassSpellListRoute,
  type ManagedClassSpellContext,
  permitted,
  sources,
} from './classSpellAuthority'

const norm = normalizeOwnerIdentity

function dailyEntry(character: Character, profile: SpellProfile) {
  const entries = character.classProgression.filter(
    (entry) =>
      profile.type === 'class' &&
      profile.id === toClassProfileId(entry.name, entry.source) &&
      norm(profile.className) === norm(entry.name) &&
      norm(profile.classSource) === norm(entry.source),
  )
  const entry = entries.length === 1 ? entries[0] : undefined
  return entry && getClassSpellProfilePolicy(entry).mode === 'daily' ? entry : undefined
}

/** Unrelated writes retain player intent, never stale fixed or numeric materialization. */
export function preserveDailyClassSpellIntent(saved: Character, next: Character): Character {
  return {
    ...next,
    spells: {
      ...next.spells,
      spellProfiles: next.spells.spellProfiles.map((profile) => {
        if (!dailyEntry(next, profile)) return profile
        const previous = saved.spells.spellProfiles.find(
          (row) => row.id === profile.id && dailyEntry(saved, row),
        )
        return previous ? { ...profile, preparedSpells: [...previous.preparedSpells] } : profile
      }),
    },
  }
}

export function getDailyClassSpellAccess(
  character: Character,
  profile: SpellProfile,
  context?: ManagedClassSpellContext,
) {
  const entry = dailyEntry(character, profile)
  const rule = entry && getClassSpellProfilePolicy(entry).rule
  if (!entry || !rule) return undefined
  const current =
    context?.catalogs &&
    getClassCastingLevelAccess(
      context.catalogs,
      rule.declaration.owner,
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
        const key = getSpellReferenceKey(spell.name, spell.source)
        targets.set(key, targets.has(key) ? undefined : spell)
      }
    }
    return targets
  }
  const spellProfiles = current.spells.spellProfiles.map((profile) => {
    const previous = saved.spells.spellProfiles.find((row) => row.id === profile.id)
    if (
      !previous?.preparedSpells.length ||
      !dailyEntry(saved, previous) ||
      !dailyEntry(current, profile)
    )
      return profile
    const access = getDailyClassSpellAccess(current, profile, context)
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
            : !fixed &&
                !hasCurrentClassSpellListRoute(current, access.entry, spell, context ?? {}, {
                  allowOptional: false,
                })
              ? 'Restore this class spell list or its independent spell-list grant.'
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
