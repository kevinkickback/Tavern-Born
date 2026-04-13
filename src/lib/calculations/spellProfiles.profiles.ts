import { getSelectedSubclassData } from '@/lib/5etools/classData'
import { parseRaceSpellBlocks } from '@/lib/5etools/raceSpells'
import { parseSubclassSpells } from '@/lib/5etools/subclassSpells'
import { getCharacterClassEntries, getTotalLevel } from '@/lib/characterUtils'
import { normalizeKey } from '@/lib/provenance/normalization'
import type { Class5e, RaceAdditionalSpells } from '@/types/5etools'
import type {
  Character,
  CharacterClassEntry,
  RaceSpellChoice,
  SpellProfile,
} from '@/types/character'
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
    ...(profile.choices
      ? { choices: profile.choices.map((c) => ({ ...c, selected: [...c.selected] })) }
      : {}),
    ...(profile.castingAbilityOptions
      ? { castingAbilityOptions: [...profile.castingAbilityOptions] }
      : {}),
  }
}

function mergeSpellNames(existing: string[], additions: string[]): string[] {
  if (additions.length === 0) return existing
  const byKey = new Map(existing.map((name) => [normalizeKey(name), name] as const))
  for (const name of additions) {
    const key = normalizeKey(name)
    if (!key || byKey.has(key)) continue
    byKey.set(key, name)
  }
  return [...byKey.values()]
}

function toSubclassPreparedProfileId(entry: CharacterClassEntry): string {
  return `subclass:${entry.name}|${entry.source ?? ''}:${entry.subclass ?? ''}|${entry.subclassSource ?? ''}:prepared`
}

export function getSubclassExpandedSpellNames(
  entry: CharacterClassEntry,
  classData: Class5e | undefined,
): Set<string> {
  const subclassData = getSelectedSubclassData(classData, entry)
  if (!subclassData) return new Set<string>()
  const grants = parseSubclassSpells(subclassData.additionalSpells, entry.levels)
  const names = new Set<string>()
  for (const grant of grants) {
    if (grant.mode !== 'expanded') continue
    names.add(normalizeKey(grant.spellName))
  }
  return names
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
      const selected = existingChoice?.selected.filter((s) => pool.includes(s)) ?? []
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

export function ensureSpellProfiles(
  character: Character,
  classesById?: Map<string, Class5e>,
  raceData?: { name: string; source?: string; additionalSpells?: RaceAdditionalSpells[] },
): SpellProfile[] {
  const existing = Array.isArray(character.spells.spellProfiles)
    ? character.spells.spellProfiles.map(cloneProfile)
    : []

  const byId = new Map(existing.map((profile) => [profile.id, profile]))
  const next: SpellProfile[] = []

  const classEntries = getCharacterClassEntries(character)

  for (const entry of classEntries) {
    const id = toClassProfileId(entry.name, entry.source)
    const existingProfile = byId.get(id)
    const classData = classesById?.get(id)
    const subclassData = getSelectedSubclassData(classData, entry)
    const subclassSpells = parseSubclassSpells(subclassData?.additionalSpells, entry.levels)

    const knownSubclassCantrips = subclassSpells
      .filter((grant) => grant.mode === 'known' && grant.isCantrip)
      .map((grant) => grant.spellName)
    const knownSubclassSpells = subclassSpells
      .filter((grant) => grant.mode === 'known' && !grant.isCantrip)
      .map((grant) => grant.spellName)

    const preparedSubclassCantrips = subclassSpells
      .filter((grant) => (grant.mode === 'prepared' || grant.mode === 'innate') && grant.isCantrip)
      .map((grant) => grant.spellName)
    const preparedSubclassSpells = subclassSpells
      .filter((grant) => (grant.mode === 'prepared' || grant.mode === 'innate') && !grant.isCantrip)
      .map((grant) => grant.spellName)

    next.push({
      id,
      type: 'class',
      label: buildClassProfileLabel(entry),
      className: entry.name,
      classSource: entry.source,
      cantrips: mergeSpellNames(existingProfile?.cantrips ?? [], knownSubclassCantrips),
      spellsKnown: mergeSpellNames(existingProfile?.spellsKnown ?? [], knownSubclassSpells),
      preparedSpells: existingProfile?.preparedSpells ?? [],
      alwaysPrepared: false,
      ...(existingProfile?.spellSwaps ? { spellSwaps: existingProfile.spellSwaps } : {}),
    })

    if (
      entry.subclass &&
      (preparedSubclassCantrips.length > 0 || preparedSubclassSpells.length > 0)
    ) {
      const subclassPreparedId = toSubclassPreparedProfileId(entry)
      const existingSubclassPrepared = byId.get(subclassPreparedId)
      next.push({
        id: subclassPreparedId,
        type: 'special',
        label: `${entry.subclass} Spells`,
        cantrips: mergeSpellNames(
          existingSubclassPrepared?.cantrips ?? [],
          preparedSubclassCantrips,
        ),
        spellsKnown: mergeSpellNames(
          existingSubclassPrepared?.spellsKnown ?? [],
          preparedSubclassSpells,
        ),
        preparedSpells: [],
        alwaysPrepared: true,
      })
    }
  }

  if (raceData?.additionalSpells && raceData.additionalSpells.length > 0) {
    const racialId = toRacialProfileId(raceData.name, raceData.source)
    const existingRacial = byId.get(racialId)
    const totalLevel = getTotalLevel({ classes: getCharacterClassEntries(character) })
    next.push(
      buildRacialSpellProfile({
        raceName: raceData.name,
        raceSource: raceData.source,
        additionalSpells: raceData.additionalSpells,
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
    for (const name of profile.cantrips) {
      cantrips.add(name)
      if (profile.alwaysPrepared) prepared.add(name)
    }
    for (const name of profile.spellsKnown) {
      spellsKnown.add(name)
      if (profile.alwaysPrepared || profile.preparedSpells.includes(name)) {
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
