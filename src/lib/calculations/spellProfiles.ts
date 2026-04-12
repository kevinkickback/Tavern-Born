import { getClassSpellGainAtLevel } from '@/lib/5etools/classData'
import { parseSubclassSpells } from '@/lib/5etools/subclassSpells'
import { type AbilityName, normalizeAbilityName } from '@/lib/calculations/abilityScores'
import { getAbilityModifier, getProficiencyBonus } from '@/lib/calculations/gameRules'
import {
  type CasterProgression,
  calculateSpellSlots,
  getCasterLevelContribution,
  getEffectiveCasterProgression,
  getEffectiveSpellcastingAbility,
  getPactMagicSlots,
  getSpellSlotsFromClassData,
  getStandardSpellSlots,
  mergeSpellSlots,
  type SpellSlotsResult,
} from '@/lib/calculations/spellSlots'
import { getTotalLevel } from '@/lib/characterUtils'
import { normalizeKey } from '@/lib/provenance/normalization'
import type { Class5e } from '@/types/5etools'
import type {
  AbilityScores,
  Character,
  CharacterClassEntry,
  SpellProfile,
  SpellSlots,
} from '@/types/character'

export const SPECIAL_SPELL_PROFILE_ID = 'special:unrestricted'
export const SPECIAL_SPELL_PROFILE_LABEL = 'Bonus Spells'

function toClassProfileId(name: string, source?: string): string {
  return `class:${name}|${source ?? ''}`
}

function getSelectedSubclassData(classData: Class5e | undefined, entry: CharacterClassEntry) {
  if (!classData || !entry.subclass) return undefined
  return (classData.subclasses ?? []).find(
    (subclass) =>
      subclass.name === entry.subclass && (subclass.source ?? '') === (entry.subclassSource ?? ''),
  )
}

function cloneProfile(profile: SpellProfile): SpellProfile {
  return {
    ...profile,
    cantrips: [...profile.cantrips],
    spellsKnown: [...profile.spellsKnown],
    preparedSpells: [...profile.preparedSpells],
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

export function buildClassProfileLabel(entry: CharacterClassEntry): string {
  return entry.levels > 1 ? `${entry.name} (Lv ${entry.levels})` : `${entry.name} (Lv 1)`
}

export function buildClassSpellLevelKey(
  className: string | undefined,
  classSource: string | undefined,
  level: number,
): string {
  return `${className ?? ''}|${classSource ?? ''}:${level}`
}

export function buildClassSpellSelectionsByLevel(params: {
  character: Character
  className?: string
  classSource?: string
}): Map<number, string[]> {
  const { character, className, classSource } = params
  const selections = new Map<number, string[]>()
  if (!className) return selections

  const profileId = `class:${className}|${classSource ?? ''}`
  const classProfile = ensureSpellProfiles(character).find((profile) => profile.id === profileId)
  if (!classProfile) return selections

  const classKnownNames = new Set([...classProfile.cantrips, ...classProfile.spellsKnown])
  if (classKnownNames.size === 0) return selections

  const addAtLevel = (level: number, spellName: string) => {
    const existing = selections.get(level) ?? []
    if (existing.includes(spellName)) return
    selections.set(level, [...existing, spellName])
  }

  for (const spellName of classKnownNames) {
    const tags = character.provenance?.spells?.[normalizeKey(spellName)] ?? []
    const classTag = tags.find(
      (tag) =>
        tag.sourceType === 'class' &&
        tag.sourceName === className &&
        (tag.sourceRef ?? '') === (classSource ?? '') &&
        !!tag.spellGrantedAtLevel,
    )
    if (!classTag?.spellGrantedAtLevel) continue

    for (const [level, names] of selections.entries()) {
      if (!names.includes(spellName)) continue
      const filtered = names.filter((name) => name !== spellName)
      if (filtered.length > 0) {
        selections.set(level, filtered)
      } else {
        selections.delete(level)
      }
    }
    addAtLevel(classTag.spellGrantedAtLevel, spellName)
  }

  return selections
}

export interface ExistingSpellAttribution {
  spellName: string
  grantedAtLevel: number
}

export interface InferredSpellAttribution {
  spellName: string
  grantedAtLevel: number
}

/**
 * Assign newly-selected spells to the lowest eligible class level that still has
 * remaining spell-gain capacity. This is intentionally approximate and used for
 * spells page attribution only.
 */
export function inferClassSpellAttributionLevels(params: {
  classData: Class5e | undefined
  classLevel: number
  newSpellNames: string[]
  spellLevelByName: Map<string, number>
  existingAttributions: ExistingSpellAttribution[]
}): InferredSpellAttribution[] {
  const { classData, classLevel, newSpellNames, spellLevelByName, existingAttributions } = params

  if (!classData || classLevel <= 0 || newSpellNames.length === 0) {
    return []
  }

  const spellCapacity = new Map<number, number>()
  const cantripCapacity = new Map<number, number>()
  const maxSpellLevelByClassLevel = new Map<number, number>()

  for (let level = 1; level <= classLevel; level++) {
    const gain = getClassSpellGainAtLevel(classData, level)
    spellCapacity.set(level, gain.spells)
    cantripCapacity.set(level, gain.cantrips)
    maxSpellLevelByClassLevel.set(level, gain.maxSpellLevel)
  }

  const usedSpellSlots = new Map<number, number>()
  const usedCantripSlots = new Map<number, number>()

  for (const attribution of existingAttributions) {
    const attributedSpellLevel = spellLevelByName.get(attribution.spellName) ?? 1
    if (attributedSpellLevel === 0) {
      usedCantripSlots.set(
        attribution.grantedAtLevel,
        (usedCantripSlots.get(attribution.grantedAtLevel) ?? 0) + 1,
      )
      continue
    }

    usedSpellSlots.set(
      attribution.grantedAtLevel,
      (usedSpellSlots.get(attribution.grantedAtLevel) ?? 0) + 1,
    )
  }

  const assignments: InferredSpellAttribution[] = []
  const pending = [...newSpellNames].sort((a, b) => {
    const levelDelta = (spellLevelByName.get(a) ?? 1) - (spellLevelByName.get(b) ?? 1)
    if (levelDelta !== 0) return levelDelta
    return a.localeCompare(b)
  })

  for (const spellName of pending) {
    const spellLevel = spellLevelByName.get(spellName) ?? 1
    const eligibleLevels: number[] = []

    for (let level = 1; level <= classLevel; level++) {
      const cap =
        spellLevel === 0 ? (cantripCapacity.get(level) ?? 0) : (spellCapacity.get(level) ?? 0)
      if (cap <= 0) continue

      if (spellLevel > 0 && spellLevel > (maxSpellLevelByClassLevel.get(level) ?? 0)) {
        continue
      }

      eligibleLevels.push(level)
    }

    const fallbackLevel = eligibleLevels[0] ?? classLevel
    let selectedLevel = fallbackLevel

    for (const level of eligibleLevels) {
      const used =
        spellLevel === 0 ? (usedCantripSlots.get(level) ?? 0) : (usedSpellSlots.get(level) ?? 0)
      const cap =
        spellLevel === 0 ? (cantripCapacity.get(level) ?? 0) : (spellCapacity.get(level) ?? 0)
      if (used < cap) {
        selectedLevel = level
        break
      }
    }

    if (spellLevel === 0) {
      usedCantripSlots.set(selectedLevel, (usedCantripSlots.get(selectedLevel) ?? 0) + 1)
    } else {
      usedSpellSlots.set(selectedLevel, (usedSpellSlots.get(selectedLevel) ?? 0) + 1)
    }

    assignments.push({ spellName, grantedAtLevel: selectedLevel })
  }

  return assignments
}

export function isSpellOnClassList(
  spell: {
    classes?: {
      fromClassList?: Array<{ name?: string; source?: string }>
    }
  },
  className?: string,
  classSource?: string,
): boolean {
  if (!className) return true

  const targetName = className.trim().toLowerCase()
  const targetSource = (classSource ?? '').trim().toLowerCase()
  const fromClassList = spell.classes?.fromClassList ?? []

  if (fromClassList.length === 0) {
    return false
  }

  return fromClassList.some((entry) => {
    const entryName = entry.name?.trim().toLowerCase()
    if (entryName !== targetName) return false

    const entrySource = entry.source?.trim().toLowerCase()
    if (!targetSource || !entrySource) return true

    return entrySource === targetSource
  })
}

export function getProfileKnownNames(profile: SpellProfile): Set<string> {
  return new Set([...profile.cantrips, ...profile.spellsKnown])
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
): SpellProfile[] {
  const existing = Array.isArray(character.spells.spellProfiles)
    ? character.spells.spellProfiles.map(cloneProfile)
    : []

  const byId = new Map(existing.map((profile) => [profile.id, profile]))
  const next: SpellProfile[] = []

  const classEntries =
    character.classProgression && character.classProgression.length > 0
      ? character.classProgression
      : character.class
        ? [
            {
              name: character.class,
              source: character.classSource,
              levels: character.level,
            },
          ]
        : []

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

const SPELL_LEVEL_KEYS = [
  'level1',
  'level2',
  'level3',
  'level4',
  'level5',
  'level6',
  'level7',
  'level8',
  'level9',
] as const

function storedToNumeric(spellSlots: SpellSlots, field: 'used' | 'max'): Record<number, number> {
  const result: Record<number, number> = {}
  for (let i = 0; i < SPELL_LEVEL_KEYS.length; i++) {
    result[i + 1] = spellSlots[SPELL_LEVEL_KEYS[i]]?.[field] ?? 0
  }
  return result
}

export function numericToStored(
  calculated: SpellSlotsResult,
  usedMap: Record<number, number>,
): SpellSlots {
  const base = {} as SpellSlots

  for (let i = 0; i < SPELL_LEVEL_KEYS.length; i++) {
    const sl = i + 1
    const key = SPELL_LEVEL_KEYS[i]
    const calc = calculated[sl]
    base[key] = {
      max: calc?.max ?? 0,
      used: Math.min(usedMap[sl] ?? 0, calc?.max ?? 0),
    }
  }

  return base
}

function normalizeProgression(value?: string): CasterProgression {
  if (value === 'full') return 'full'
  if (value === '1/2') return '1/2'
  if (value === '1/3') return '1/3'
  if (value === 'pact') return 'pact'
  if (value === 'artificer') return 'artificer'
  return 'none'
}

export interface SpellcastingClassDetail {
  profileId: string
  className: string
  classSource?: string
  classLevel: number
  casterProgression: CasterProgression
  spellcastingAbility?: AbilityName
  spellSaveDC: number | null
  spellAttackBonus: number | null
  maxSpellLevel: number
  knownSpellLimit: number | null
  cantripLimit: number | null
  isPreparedCaster: boolean
}

function getProgressionArray(value: unknown): number[] | null {
  return Array.isArray(value) && value.every((v) => typeof v === 'number')
    ? (value as number[])
    : null
}

export function isPreparedCaster(classData?: Class5e): boolean {
  if (!classData?.spellcastingAbility) return false
  if (typeof classData.preparedSpells === 'string') return true
  const known = getProgressionArray(classData.spellsKnownProgression)
  const knownFixed = getProgressionArray(classData.spellsKnownProgressionFixed)
  return !known && !knownFixed
}

export function getCantripLimit(classData: Class5e | undefined, level: number): number | null {
  const progression = getProgressionArray(classData?.cantripProgression)
  if (!progression) return null
  return progression[level - 1] ?? progression[progression.length - 1] ?? null
}

export function getKnownSpellLimit(classData: Class5e | undefined, level: number): number | null {
  if (!classData?.spellcastingAbility) return null
  let total = 0
  for (let i = 1; i <= level; i++) {
    total += getClassSpellGainAtLevel(classData, i).spells
  }
  return total > 0 ? total : null
}

/**
 * Evaluate a simple arithmetic expression containing only numbers, +, -, *, /,
 * parentheses, and the functions floor/ceil/round. Rejects any input that would
 * require dynamic code execution. Throws on rejected or malformed input.
 *
 * This replaces `new Function()` for evaluating 5etools prepared-spell formulas
 * whose tokens have already been substituted with numeric values.
 */
function safeEvalArithmetic(expr: string): number {
  // Strip all whitespace before validation/parsing
  const cleaned = expr.replace(/\s+/g, '')

  // Whitelist check: only digits, decimal point, operators, parens, and the
  // three allowed function names. Anything else is rejected.
  const withoutFns = cleaned.replace(/floor|ceil|round/g, '')
  if (!/^[\d.+\-*/()]+$/.test(withoutFns)) {
    throw new Error(`Rejected non-arithmetic expression: ${expr}`)
  }

  let pos = 0

  function parseExpr(): number {
    let left = parseTerm()
    while (pos < cleaned.length && (cleaned[pos] === '+' || cleaned[pos] === '-')) {
      const op = cleaned[pos++]
      const right = parseTerm()
      left = op === '+' ? left + right : left - right
    }
    return left
  }

  function parseTerm(): number {
    let left = parseFactor()
    while (pos < cleaned.length && (cleaned[pos] === '*' || cleaned[pos] === '/')) {
      const op = cleaned[pos++]
      const right = parseFactor()
      left = op === '*' ? left * right : left / right
    }
    return left
  }

  function parseFactor(): number {
    // floor(...) / ceil(...) / round(...)
    for (const fn of ['floor', 'ceil', 'round'] as const) {
      if (cleaned.startsWith(fn, pos)) {
        pos += fn.length
        if (cleaned[pos] !== '(') throw new Error(`Expected '(' after ${fn}`)
        pos++ // consume '('
        const inner = parseExpr()
        if (cleaned[pos] !== ')') throw new Error(`Expected ')' after ${fn}(...)`)
        pos++ // consume ')'
        return Math[fn](inner)
      }
    }

    // Parenthesised expression
    if (cleaned[pos] === '(') {
      pos++ // consume '('
      const val = parseExpr()
      if (cleaned[pos] !== ')') throw new Error("Expected closing ')'")
      pos++ // consume ')'
      return val
    }

    // Unary minus
    if (cleaned[pos] === '-') {
      pos++
      return -parseFactor()
    }

    // Number literal (integer or decimal)
    const start = pos
    while (pos < cleaned.length && /[\d.]/.test(cleaned[pos])) pos++
    if (pos === start) {
      throw new Error(`Unexpected token at position ${pos}: '${cleaned[pos]}'`)
    }
    return parseFloat(cleaned.slice(start, pos))
  }

  const result = parseExpr()
  if (pos !== cleaned.length) {
    throw new Error(`Unexpected trailing input: '${cleaned.slice(pos)}'`)
  }
  return result
}

/**
 * Parse and evaluate a 5etools prepared spells formula.
 * Examples: "<$level$> + <$int_mod$>", "<$level$>"
 * Returns the calculated limit, or null if formula is invalid or missing.
 */
export function evaluatePreparedSpellsFormula(
  formula: string | undefined,
  characterLevel: number,
  abilityModifiers: Record<string, number>,
): number | null {
  if (!formula || typeof formula !== 'string') return null

  try {
    // Replace formula tokens with values
    const result = formula
      .replace(/<\$level\$>/g, String(characterLevel))
      .replace(/<\$int_mod\$>/g, String(abilityModifiers.intelligence ?? 0))
      .replace(/<\$wis_mod\$>/g, String(abilityModifiers.wisdom ?? 0))
      .replace(/<\$cha_mod\$>/g, String(abilityModifiers.charisma ?? 0))
      .replace(/<\$str_mod\$>/g, String(abilityModifiers.strength ?? 0))
      .replace(/<\$dex_mod\$>/g, String(abilityModifiers.dexterity ?? 0))
      .replace(/<\$con_mod\$>/g, String(abilityModifiers.constitution ?? 0))

    // Safe arithmetic evaluation — no dynamic code execution.
    const evalResult = safeEvalArithmetic(result)

    if (typeof evalResult === 'number' && Number.isFinite(evalResult)) {
      return Math.max(0, Math.floor(evalResult))
    }
  } catch {
    // Fall through to return null
  }

  return null
}

/**
 * Get the prepared spell limit for a character with a specific class.
 * Uses the 5etools preparedSpells formula if available, otherwise returns null.
 */
export function getPreparedSpellLimit(
  classData: Class5e | undefined,
  characterLevel: number,
  spellcastingAbilityModifier: number | null,
): number | null {
  if (!classData?.spellcastingAbility || !classData.preparedSpells) {
    return null
  }

  if (spellcastingAbilityModifier === null) {
    return null
  }

  // Build a map of all ability modifiers - we'll use the primary ability modifier
  // and default others to 0 for formula evaluation
  const abilityModifiers: Record<string, number> = {
    strength: 0,
    dexterity: 0,
    constitution: 0,
    intelligence: 0,
    wisdom: 0,
    charisma: 0,
  }

  // Set the specific spellcasting ability modifier
  const normalizedAbility = normalizeAbilityName(classData.spellcastingAbility)
  if (normalizedAbility) {
    abilityModifiers[normalizedAbility] = spellcastingAbilityModifier
  }

  return evaluatePreparedSpellsFormula(classData.preparedSpells, characterLevel, abilityModifiers)
}

export function getClassMaxSpellLevel(
  classData: Class5e | undefined,
  classLevel: number,
  casterProgressionOverride?: CasterProgression,
): number {
  if (!classData) return 0
  const progression = casterProgressionOverride ?? normalizeProgression(classData.casterProgression)

  if (progression === 'pact') {
    const pactSlots = getPactMagicSlots(classLevel)
    return Object.keys(pactSlots)
      .map((k) => Number.parseInt(k, 10))
      .filter((k) => Number.isFinite(k))
      .reduce((max, k) => Math.max(max, k), 0)
  }

  const tableGroups = Array.isArray(classData.classTableGroups)
    ? (classData.classTableGroups as Array<{
        rowsSpellProgression?: unknown[]
      }>)
    : []
  const spellRows = tableGroups.find((group) =>
    Array.isArray(group.rowsSpellProgression),
  )?.rowsSpellProgression
  const row = classData.spellSlotProgression?.[classLevel - 1] ?? spellRows?.[classLevel - 1]

  if (Array.isArray(row)) {
    return row
      .map((value, idx) => ({ value, level: idx + 1 }))
      .filter((item) => typeof item.value === 'number' && item.value > 0)
      .reduce((max, item) => Math.max(max, item.level), 0)
  }

  const fallback = calculateSpellSlots(classData.name, classLevel, progression)
  return Object.keys(fallback)
    .map((k) => Number.parseInt(k, 10))
    .filter((k) => Number.isFinite(k))
    .reduce((max, k) => Math.max(max, k), 0)
}

export function buildSpellcastingClassDetails(
  character: Character,
  classesById: Map<string, Class5e>,
): SpellcastingClassDetail[] {
  const profiles = ensureSpellProfiles(character).filter((profile) => profile.type === 'class')
  const totalLevel = getTotalLevel({
    classes: character.classProgression?.map((entry) => ({
      name: entry.name,
      levels: entry.levels,
      source: entry.source,
    })) ?? [
      {
        name: character.class,
        levels: character.level,
        source: character.classSource,
      },
    ],
  })
  const proficiency = getProficiencyBonus(totalLevel)

  const entries =
    character.classProgression && character.classProgression.length > 0
      ? character.classProgression
      : [
          {
            name: character.class,
            source: character.classSource,
            levels: character.level,
          },
        ]

  return profiles
    .map((profile) => {
      const entry = entries.find(
        (candidate) =>
          candidate.name === profile.className &&
          (candidate.source ?? '') === (profile.classSource ?? ''),
      )
      if (!entry || !profile.className) return null

      const classData = classesById.get(toClassProfileId(entry.name, entry.source))
      const subclassData = getSelectedSubclassData(classData, entry)
      const effectiveProgression = getEffectiveCasterProgression(classData, subclassData)
      const effectiveAbility = getEffectiveSpellcastingAbility(classData, subclassData)
      const ability = effectiveAbility ? normalizeAbilityName(effectiveAbility) : null
      const mod = ability
        ? getAbilityModifier((character.abilityScores as AbilityScores)[ability] ?? 10)
        : null
      const saveDc = mod !== null ? 8 + proficiency + mod : null
      const attack = mod !== null ? proficiency + mod : null

      return {
        profileId: profile.id,
        className: entry.name,
        classSource: entry.source,
        classLevel: entry.levels,
        casterProgression: normalizeProgression(effectiveProgression),
        spellcastingAbility: ability ?? undefined,
        spellSaveDC: saveDc,
        spellAttackBonus: attack,
        maxSpellLevel: getClassMaxSpellLevel(
          classData,
          entry.levels,
          normalizeProgression(effectiveProgression),
        ),
        knownSpellLimit:
          isPreparedCaster(classData) && classData?.preparedSpells
            ? getPreparedSpellLimit(classData, entry.levels, mod)
            : getKnownSpellLimit(classData, entry.levels),
        cantripLimit: getCantripLimit(classData, entry.levels),
        isPreparedCaster: isPreparedCaster(classData),
      } as SpellcastingClassDetail
    })
    .filter((detail): detail is SpellcastingClassDetail => detail !== null)
    .filter((detail) => detail.casterProgression !== 'none')
}

function addSlotRows(acc: SpellSlotsResult, rows: SpellSlotsResult, pact = false): void {
  for (const [levelText, row] of Object.entries(rows)) {
    const level = Number.parseInt(levelText, 10)
    if (!row || !level) continue
    const existing = acc[level]
    acc[level] = {
      max: (existing?.max ?? 0) + row.max,
      used: existing?.used ?? 0,
      ...(pact ? { isPactMagic: true } : {}),
    }
  }
}

export interface CharacterSpellSlotsBreakdown {
  shared: SpellSlotsResult
  pact: SpellSlotsResult
  mergedSharedWithUsage: SpellSlotsResult
  mergedPactWithUsage: SpellSlotsResult
}

export function calculateCharacterSpellSlots(
  character: Character,
  classesById: Map<string, Class5e>,
): CharacterSpellSlotsBreakdown {
  const entries =
    character.classProgression && character.classProgression.length > 0
      ? character.classProgression
      : character.class
        ? [
            {
              name: character.class,
              source: character.classSource,
              levels: character.level,
            },
          ]
        : []

  let combinedCasterLevel = 0
  const pact: SpellSlotsResult = {}

  for (const entry of entries) {
    const classData = classesById.get(toClassProfileId(entry.name, entry.source))
    const subclassData = getSelectedSubclassData(classData, entry)
    const progression = normalizeProgression(getEffectiveCasterProgression(classData, subclassData))

    if (progression === 'pact') {
      const pactRows = classData ? getSpellSlotsFromClassData(classData, entry.levels) : null
      addSlotRows(pact, pactRows ?? getPactMagicSlots(entry.levels), true)
      continue
    }

    combinedCasterLevel += getCasterLevelContribution(progression, entry.levels)
  }

  const shared = combinedCasterLevel > 0 ? getStandardSpellSlots(combinedCasterLevel) : {}
  const usedMap = storedToNumeric(character.spells.spellSlots, 'used')

  const mergedSharedWithUsage = mergeSpellSlots(shared, usedMap)

  // Pact slots are tracked in the same usage pool, so allocate usage greedily by level.
  const pactUsedMap: Record<number, number> = {}
  for (const [levelText, slots] of Object.entries(pact)) {
    const level = Number.parseInt(levelText, 10)
    if (!level || !slots) continue
    const used = Math.min(usedMap[level] ?? 0, slots.max)
    pactUsedMap[level] = used
  }
  const mergedPactWithUsage = mergeSpellSlots(pact, pactUsedMap)

  return {
    shared,
    pact,
    mergedSharedWithUsage,
    mergedPactWithUsage,
  }
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
    spellsKnown: [...spellsKnown],
    preparedSpells: [...prepared],
  }
}
