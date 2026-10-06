import { getEntityLookupKey } from '@/lib/5etools/lookups'
import { toAbilityName } from '@/lib/calculations/abilityNames'
import { buildSpellNameKeySet, parseSpellReference } from '@/lib/calculations/spellIdentity'
import { collectKnownSpells, ensureSpellProfiles } from '@/lib/calculations/spellProfiles'
import { getCharacterClassEntries, getTotalClassLevels } from '@/lib/characterUtils'
import type { Class5e, Raw5ePrereq } from '@/types/5etools'
import type { Character, CharacterClassEntry } from '@/types/character'
import type { AbilityName } from './abilityScores'

export interface PrereqCharacterSnapshot {
  progression: readonly (CharacterClassEntry & { subclassShortName?: string })[]
  race?: string
  raceSource?: string
  abilityScores?: Partial<Record<AbilityName, number>>
  features?: Array<{ name: string }>
  spells?: {
    cantrips?: string[]
    spellsKnown?: string[]
    preparedSpells?: string[]
  }
}

interface BuildPrerequisiteSnapshotParams {
  character: Character | null
  classProgression?: CharacterClassEntry[]
  classLookup?: Readonly<Record<string, Class5e | undefined>>
  effectiveAbilityScores?: Partial<Record<AbilityName, number>>
}

export function buildPrerequisiteSnapshot({
  character,
  classProgression = getCharacterClassEntries(character),
  classLookup,
  effectiveAbilityScores,
}: BuildPrerequisiteSnapshotParams): PrereqCharacterSnapshot {
  const profileSpells = character ? collectKnownSpells(ensureSpellProfiles(character)) : null

  return {
    progression: classProgression.map((entry) => {
      const subclass = classLookup?.[
        getEntityLookupKey(entry.name, entry.source)
      ]?.subclasses?.find(
        (candidate) =>
          candidate.name === entry.subclass && candidate.source === entry.subclassSource,
      )
      return subclass ? { ...entry, subclassShortName: subclass.shortName } : entry
    }),
    race: character?.race,
    raceSource: character?.raceSource,
    abilityScores: effectiveAbilityScores ?? {},
    features: character?.features ?? [],
    spells: {
      cantrips: profileSpells?.cantrips ?? [],
      spellsKnown: profileSpells?.spellsKnown ?? [],
      preparedSpells: profileSpells?.preparedSpells ?? [],
    },
  }
}

/** Canonical 5etools pact prerequisite text normalizer (Parser.prereqPactToFull). */
export function prereqPactToFull(pact: string): string {
  if (pact === 'Chain') return 'Pact of the Chain'
  if (pact === 'Tome') return 'Pact of the Tome'
  if (pact === 'Blade') return 'Pact of the Blade'
  if (pact === 'Talisman') return 'Pact of the Talisman'
  return pact
}

/** Canonical 5etools spell prerequisite text normalizer (Parser.prereqSpellToFull). */
export function prereqSpellToFull(spell: string): string {
  const { name: spellName, suffix } = parseSpellPrereqRef(spell)
  if (!suffix) return spellName
  if (suffix === 'c') return `${spellName} cantrip`
  if (suffix === 'x') return 'Hex spell or a warlock feature that curses'
  return spellName
}

function parseSpellPrereqRef(ref: string): {
  name: string
  suffix?: string
} {
  const [spellRef, suffix] = ref.split('#')
  // Accept both canonical source|suffix ordering and older source-decorated selections.
  return { name: parseSpellReference(spellRef).name, suffix: suffix?.split('|')[0] }
}

function normalizeAbilityName(input: string): AbilityName | null {
  const name = toAbilityName(input)
  return typeof name === 'string' ? (name as AbilityName) : null
}

export interface CheckPrereqOptions {
  /**
   * When set, level checks compare against this specific class's level
   * rather than total character level.
   */
  className?: string
  /**
   * Skip the race prerequisite check entirely (e.g. when browsing feats in
   * a race-selector context before race is finalised).
   */
  ignoreRacePrereq?: boolean
  /**
   * Set of class names known to grant spellcasting (from game data).
   * Required for the `spellcasting: true` prerequisite check.
   * If omitted, the existing fallback checks the character's known spell lists.
   */
  spellcastingClasses?: Set<string>
}

export interface PrereqResult {
  met: boolean
  reason?: string
  status?: 'unsupported'
}

type PrerequisiteStatus = 'met' | 'unmet' | 'unsupported'

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function unsupported(condition: string): PrereqResult {
  return { met: false, status: 'unsupported', reason: `Requires manual review: ${condition}` }
}

function matchesReference(name: string, source: string | undefined, reference: unknown): boolean {
  if (typeof reference === 'string') return name.toLowerCase() === reference.toLowerCase()
  if (!isRecord(reference) || typeof reference.name !== 'string') return false
  return (
    name.toLowerCase() === reference.name.toLowerCase() &&
    (reference.source === undefined ||
      (typeof reference.source === 'string' &&
        source?.toLowerCase() === reference.source.toLowerCase()))
  )
}

function isNamedReference(value: unknown): value is string | { name: string; source?: string } {
  return (
    (typeof value === 'string' && value.trim().length > 0) ||
    (isRecord(value) &&
      typeof value.name === 'string' &&
      value.name.trim().length > 0 &&
      (value.source === undefined ||
        (typeof value.source === 'string' && value.source.trim().length > 0)) &&
      Object.keys(value).every((key) =>
        ['name', 'source', 'displayEntry', 'visible', 'visibleStats', 'visibleList'].includes(key),
      ))
  )
}

function anyPrerequisite(results: PrereqResult[]): PrereqResult {
  if (results.some((result) => result.met)) return { met: true }
  return results.find((result) => result.status === 'unsupported') ?? results[0]
}

function checkReferenceAlternatives(
  value: unknown,
  candidates: Array<{ name: string; source?: string }>,
  kind: string,
): PrereqResult {
  if (!Array.isArray(value) || !value.length)
    return unsupported(`${kind.toLowerCase()} requirement`)
  return anyPrerequisite(
    value.map((reference): PrereqResult => {
      if (!isNamedReference(reference)) return unsupported(`${kind.toLowerCase()} requirement`)
      return candidates.some((candidate) =>
        matchesReference(candidate.name, candidate.source, reference),
      )
        ? { met: true }
        : { met: false, reason: `${kind} requirement not met` }
    }),
  )
}

function checkAbilityPrerequisite(
  value: unknown,
  character: PrereqCharacterSnapshot,
): PrereqResult {
  if (!Array.isArray(value) || value.length === 0) return unsupported('ability score requirement')
  const alternatives = value.map((requirements): PrereqResult => {
    if (!isRecord(requirements) || Object.keys(requirements).length === 0)
      return unsupported('ability score requirement')
    let needsReview = false
    let unmet = false
    for (const [name, required] of Object.entries(requirements)) {
      const ability = normalizeAbilityName(name)
      if (!ability || typeof required !== 'number' || !Number.isInteger(required) || required < 0) {
        needsReview = true
        continue
      }
      const actual = character.abilityScores?.[ability]
      if (actual === undefined || !Number.isFinite(actual)) needsReview = true
      else if (actual < required) unmet = true
    }
    if (unmet) return { met: false, reason: 'Does not meet ability score requirement' }
    return needsReview ? unsupported('ability score requirement') : { met: true }
  })
  return anyPrerequisite(alternatives)
}

function checkLevelPrerequisite(
  value: unknown,
  character: PrereqCharacterSnapshot,
  options: CheckPrereqOptions,
): PrereqResult {
  const required = isRecord(value) ? value.level : value
  if (
    isRecord(value) &&
    Object.keys(value).some((key) => !['level', 'class', 'subclass'].includes(key))
  )
    return unsupported('level requirement')
  if (typeof required !== 'number' || !Number.isInteger(required) || required < 1)
    return unsupported('level requirement')
  const classReference = isRecord(value) ? value.class : undefined
  const subclassReference = isRecord(value) ? value.subclass : undefined
  if (
    (classReference !== undefined && !isNamedReference(classReference)) ||
    (subclassReference !== undefined && !isNamedReference(subclassReference))
  )
    return unsupported('class level requirement')
  const className =
    isNamedReference(classReference) && typeof classReference !== 'string'
      ? classReference.name
      : typeof classReference === 'string'
        ? classReference
        : options.className
  const hasOwner =
    classReference !== undefined || subclassReference !== undefined || className !== undefined
  const unmet: PrereqResult = {
    met: false,
    reason: `Requires ${className ?? 'character'} level ${required}`,
  }
  if (!hasOwner)
    return getTotalClassLevels(character.progression) >= required ? { met: true } : unmet
  const owners = character.progression.filter((entry) =>
    classReference === undefined
      ? !className || entry.name.toLowerCase() === className.toLowerCase()
      : matchesReference(entry.name, entry.source, classReference),
  )
  if (!owners.length) return unmet
  return anyPrerequisite(
    owners.map((entry): PrereqResult => {
      if (entry.levels < required) return unmet
      if (subclassReference === undefined) return { met: true }
      if (
        matchesReference(entry.subclass ?? '', entry.subclassSource, subclassReference) ||
        matchesReference(entry.subclassShortName ?? '', entry.subclassSource, subclassReference)
      )
        return { met: true }
      const sourceMatches =
        !isRecord(subclassReference) ||
        subclassReference.source === undefined ||
        entry.subclassSource?.toLowerCase() === (subclassReference.source as string).toLowerCase()
      return entry.subclass && entry.subclassShortName === undefined && sourceMatches
        ? unsupported('subclass identity requirement')
        : unmet
    }),
  )
}

const CHECKED_PREREQUISITE_KEYS = new Set([
  'level',
  'ability',
  'race',
  'class',
  'spellcasting',
  'spell',
  'pact',
  'patron',
  'note',
])

/**
 * Check a single 5etools prerequisite object against a character snapshot.
 * Each property within the prereq object is AND-ed together; call this once
 * per element in `item.prerequisite[]`.
 */
export function checkPrerequisite(
  prereq: Raw5ePrereq,
  character: PrereqCharacterSnapshot,
  options: CheckPrereqOptions = {},
): PrereqResult {
  if (!character) return { met: false, reason: 'No character' }
  if (!isRecord(prereq) || Object.keys(prereq).every((key) => key === 'note'))
    return unsupported('prerequisite data')
  const reviewReasons = Object.keys(prereq).filter((key) => !CHECKED_PREREQUISITE_KEYS.has(key))
  if (prereq.level !== undefined) {
    const result = checkLevelPrerequisite(prereq.level, character, options)
    if (!result.met && result.status !== 'unsupported') return result
    if (result.status === 'unsupported') reviewReasons.push('level requirement')
  }
  if (prereq.ability !== undefined) {
    const result = checkAbilityPrerequisite(prereq.ability, character)
    if (!result.met && result.status !== 'unsupported') return result
    if (result.status === 'unsupported') reviewReasons.push('ability score requirement')
  }
  if (!options.ignoreRacePrereq && prereq.race !== undefined) {
    const result = checkReferenceAlternatives(
      prereq.race,
      [{ name: character.race ?? '', source: character.raceSource }],
      'Race',
    )
    if (!result.met && result.status !== 'unsupported') return result
    if (result.status === 'unsupported') reviewReasons.push('race requirement')
  }

  if (prereq.class !== undefined) {
    const result = checkReferenceAlternatives(
      prereq.class,
      character.progression.map((entry) => ({ name: entry.name, source: entry.source })),
      'Class',
    )
    if (!result.met && result.status !== 'unsupported') return result
    if (result.status === 'unsupported') reviewReasons.push('class requirement')
  }
  if (prereq.spellcasting !== undefined && prereq.spellcasting !== true)
    reviewReasons.push('spellcasting requirement')
  if (prereq.spellcasting === true) {
    const casterClasses = options.spellcastingClasses
    let hasSpellcasting = false

    if (casterClasses) {
      hasSpellcasting = character.progression.some((cls) => casterClasses.has(cls.name))
    } else {
      // Fall back: has any spells listed
      const sp = character.spells
      hasSpellcasting =
        (sp?.cantrips?.length ?? 0) > 0 ||
        (sp?.spellsKnown?.length ?? 0) > 0 ||
        (sp?.preparedSpells?.length ?? 0) > 0
    }

    if (!hasSpellcasting) {
      return { met: false, reason: 'Requires spellcasting ability' }
    }
  }
  if (prereq.spell !== undefined) {
    const required = Array.isArray(prereq.spell) ? prereq.spell : [prereq.spell]
    const knownCantrips = buildSpellNameKeySet(character.spells?.cantrips ?? [])
    const knownNames = buildSpellNameKeySet([
      ...(character.spells?.cantrips ?? []),
      ...(character.spells?.spellsKnown ?? []),
      ...(character.spells?.preparedSpells ?? []),
    ])
    const hasCurseFeature =
      character.features?.some((f) => f.name.toLowerCase().includes('curse')) ?? false

    const results = required.map((ref): PrereqResult => {
      if (typeof ref !== 'string' || !ref.trim()) return unsupported('spell requirement')
      const parsed = parseSpellPrereqRef(ref)
      const name = parsed.name.toLowerCase()
      if (!name || (parsed.suffix && parsed.suffix !== 'c' && parsed.suffix !== 'x'))
        return unsupported('spell requirement')
      const met =
        parsed.suffix === 'c'
          ? knownCantrips.has(name)
          : parsed.suffix === 'x'
            ? knownNames.has('hex') || hasCurseFeature
            : knownNames.has(name)
      return met
        ? { met: true }
        : { met: false, reason: `Requires spell: ${prereqSpellToFull(ref)}` }
    })
    const result = results.length ? anyPrerequisite(results) : unsupported('spell requirement')
    if (!result.met && result.status !== 'unsupported') return result
    if (result.status === 'unsupported') reviewReasons.push('spell requirement')
  }
  if (prereq.pact !== undefined && (typeof prereq.pact !== 'string' || !prereq.pact.trim()))
    reviewReasons.push('pact requirement')
  else if (prereq.pact) {
    const requiredPact = prereqPactToFull(prereq.pact)
    const hasPact = character.features?.some((f) =>
      f.name.toLowerCase().includes(requiredPact.toLowerCase()),
    )
    if (!hasPact) {
      return { met: false, reason: `Requires ${requiredPact}` }
    }
  }

  if (prereq.patron !== undefined && (typeof prereq.patron !== 'string' || !prereq.patron.trim()))
    reviewReasons.push('patron requirement')
  else if (prereq.patron) {
    const patronLower = prereq.patron.toLowerCase()
    const hasPatron = character.features?.some((f) => f.name.toLowerCase().includes(patronLower))
    if (!hasPatron) {
      return { met: false, reason: `Requires patron: ${prereq.patron}` }
    }
  }

  return reviewReasons.length ? unsupported(reviewReasons.join(', ')) : { met: true }
}

export interface AllPrereqsResult {
  met: boolean
  status: PrerequisiteStatus
  /** Human-readable failure reasons, one per failing prereq block. */
  failures: string[]
}

/**
 * Prerequisite blocks are alternatives (OR); conditions within a block are AND.
 * Ability maps require every named score; maps within ability[] are alternatives.
 *
 * @param item - Any 5etools object with an optional `prerequisite` array
 * @param character - Character snapshot
 * @param options - Optional checks (spellcastingClasses, ignoreRacePrereq, etc.)
 */
export function checkAllPrerequisites(
  item: { prerequisite?: Raw5ePrereq[] },
  character: PrereqCharacterSnapshot,
  options: CheckPrereqOptions = {},
): AllPrereqsResult {
  if (
    item.prerequisite === undefined ||
    (Array.isArray(item.prerequisite) && item.prerequisite.length === 0)
  ) {
    return { met: true, status: 'met', failures: [] }
  }
  if (!Array.isArray(item.prerequisite)) {
    return {
      met: false,
      status: 'unsupported',
      failures: ['Requires manual review: prerequisite data'],
    }
  }
  const results = item.prerequisite.map((prereq) => checkPrerequisite(prereq, character, options))
  if (results.some((result) => result.met)) return { met: true, status: 'met', failures: [] }
  return {
    met: false,
    status: results.some((result) => result.status === 'unsupported') ? 'unsupported' : 'unmet',
    failures: [...new Set(results.flatMap((result) => (result.reason ? [result.reason] : [])))],
  }
}
