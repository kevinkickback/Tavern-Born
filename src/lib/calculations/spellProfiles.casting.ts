import { getSelectedSubclassData } from '@/lib/5etools/classData'
import { type AbilityName, normalizeAbilityName } from '@/lib/calculations/abilityScores'
import { safeEvalArithmetic } from '@/lib/calculations/formulaEval'
import { getAbilityModifier, getProficiencyBonus } from '@/lib/calculations/gameRules'
import {
  type CasterProgression,
  getCasterLevelContribution,
  getEffectiveCasterProgression,
  getEffectiveSpellcastingAbility,
  getPactMagicSlots,
  getSpellSlotsFromClassData,
  getStandardSpellSlots,
} from '@/lib/calculations/spellSlots'
import { getCharacterClassEntries, getTotalLevel } from '@/lib/characterUtils'
import type { Class5e } from '@/types/5etools'
import type { AbilityScores, Character } from '@/types/character'
import { toClassProfileId } from './spellProfiles.constants'

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
  preparedSpellLimit: number | null
  knownSpellLimit: number | null
  cantripLimit: number | null
  isPreparedCaster: boolean
  isTruePreparedCaster: boolean
  isLevelOnlyPreparedCaster: boolean
}

function getProgressionArray(value: unknown): number[] | null {
  return Array.isArray(value) && value.every((v) => typeof v === 'number')
    ? (value as number[])
    : null
}

function hasKnownSpellProgression(classData?: Class5e): boolean {
  const known = getProgressionArray(classData?.spellsKnownProgression)
  const knownFixed = getProgressionArray(classData?.spellsKnownProgressionFixed)
  return !!known || !!knownFixed
}

function hasPreparedSpellsProgression(classData?: Class5e): boolean {
  return !!getProgressionArray(classData?.preparedSpellsProgression)
}

export function isPreparedCaster(classData?: Class5e): boolean {
  if (!classData?.spellcastingAbility) return false
  if (typeof classData.preparedSpells === 'string') return true
  if (hasPreparedSpellsProgression(classData)) return true
  return !hasKnownSpellProgression(classData)
}

/** True prepared casters (Cleric/Druid/Paladin) prepare from the full class list. */
export function isTruePreparedCaster(classData?: Class5e): boolean {
  if (!classData?.spellcastingAbility) return false
  // PHB path: formula-based prepared caster with no known-spell progression
  if (typeof classData.preparedSpells === 'string' && !hasKnownSpellProgression(classData)) {
    return true
  }
  // XPHB path: array-based prepared progression with daily change and no spellbook
  if (
    hasPreparedSpellsProgression(classData) &&
    classData.preparedSpellsChange === 'restLong' &&
    !getProgressionArray(classData.spellsKnownProgressionFixed)
  ) {
    return true
  }
  // Fallback for classes with no explicit progression info
  if (
    !hasPreparedSpellsProgression(classData) &&
    typeof classData.preparedSpells !== 'string' &&
    !hasKnownSpellProgression(classData)
  ) {
    return true
  }
  return false
}

/**
 * XPHB level-only prepared casters (Sorcerer/Bard/Warlock 2024).
 * They "prepare" a fixed list that only changes on level-up — same behavior as 2014 known casters.
 */
export function isLevelOnlyPreparedCaster(classData?: Class5e): boolean {
  if (!classData?.spellcastingAbility) return false
  return hasPreparedSpellsProgression(classData) && classData.preparedSpellsChange === 'level'
}

export function getCantripLimit(classData: Class5e | undefined, level: number): number | null {
  const progression = getProgressionArray(classData?.cantripProgression)
  if (!progression) return null
  return progression[level - 1] ?? progression[progression.length - 1] ?? null
}

export function getKnownSpellLimit(classData: Class5e | undefined, level: number): number | null {
  if (!classData?.spellcastingAbility) return null
  const spellsFixed = getProgressionArray(classData.spellsKnownProgressionFixed)
  const spellsKnown = getProgressionArray(classData.spellsKnownProgression)

  if (spellsKnown) {
    const current = spellsKnown[level - 1] ?? 0
    return current > 0 ? current : null
  }

  if (spellsFixed) {
    let total = 0
    for (let i = 0; i < level; i++) {
      total += spellsFixed[i] ?? 0
    }
    return total > 0 ? total : null
  }

  return null
}

/**
 * Parse and evaluate a 5etools prepared spells formula.
 */
export function evaluatePreparedSpellsFormula(
  formula: string | undefined,
  characterLevel: number,
  abilityModifiers: Record<string, number>,
): number | null {
  if (!formula || typeof formula !== 'string') return null

  try {
    const result = formula
      .replace(/<\$level\$>/g, String(characterLevel))
      .replace(/<\$int_mod\$>/g, String(abilityModifiers.intelligence ?? 0))
      .replace(/<\$wis_mod\$>/g, String(abilityModifiers.wisdom ?? 0))
      .replace(/<\$cha_mod\$>/g, String(abilityModifiers.charisma ?? 0))
      .replace(/<\$str_mod\$>/g, String(abilityModifiers.strength ?? 0))
      .replace(/<\$dex_mod\$>/g, String(abilityModifiers.dexterity ?? 0))
      .replace(/<\$con_mod\$>/g, String(abilityModifiers.constitution ?? 0))

    const evalResult = safeEvalArithmetic(result)

    if (typeof evalResult === 'number' && Number.isFinite(evalResult)) {
      return Math.max(0, Math.floor(evalResult))
    }
  } catch {
    // Fall through to return null
  }

  return null
}

export function getPreparedSpellLimit(
  classData: Class5e | undefined,
  characterLevel: number,
  spellcastingAbilityModifier: number | null,
): number | null {
  if (!classData?.spellcastingAbility) return null

  // XPHB array-based progression takes precedence
  const progression = getProgressionArray(classData.preparedSpellsProgression)
  if (progression) {
    return progression[characterLevel - 1] ?? progression[progression.length - 1] ?? null
  }

  if (!classData.preparedSpells) {
    return null
  }

  if (spellcastingAbilityModifier === null) {
    return null
  }

  const abilityModifiers: Record<string, number> = {
    strength: 0,
    dexterity: 0,
    constitution: 0,
    intelligence: 0,
    wisdom: 0,
    charisma: 0,
  }

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

  const classSlots = getSpellSlotsFromClassData(classData, classLevel)
  if (classSlots) {
    return Object.keys(classSlots)
      .map((k) => Number.parseInt(k, 10))
      .filter((k) => Number.isFinite(k))
      .reduce((max, k) => Math.max(max, k), 0)
  }

  if (progression === 'pact') {
    const pactSlots = getPactMagicSlots(classLevel)
    return Object.keys(pactSlots)
      .map((k) => Number.parseInt(k, 10))
      .filter((k) => Number.isFinite(k))
      .reduce((max, k) => Math.max(max, k), 0)
  }

  const fallback = getStandardSpellSlots(getCasterLevelContribution(progression, classLevel))
  return Object.keys(fallback)
    .map((k) => Number.parseInt(k, 10))
    .filter((k) => Number.isFinite(k))
    .reduce((max, k) => Math.max(max, k), 0)
}

export function buildSpellcastingClassDetails(
  character: Character,
  classesById: Map<string, Class5e>,
): SpellcastingClassDetail[] {
  const entries = getCharacterClassEntries(character)
  const totalLevel = getTotalLevel({ classes: entries })
  const proficiency = getProficiencyBonus(totalLevel)

  return entries
    .map((entry) => {
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
      const preparedCaster = isPreparedCaster(classData)
      const truePreparedCaster = isTruePreparedCaster(classData)
      const levelOnlyPrepared = isLevelOnlyPreparedCaster(classData)

      // Determine prepared spell limit
      const preparedSpellLimit = preparedCaster
        ? getPreparedSpellLimit(classData, entry.levels, mod)
        : null

      // Determine known spell limit
      let knownSpellLimit: number | null
      const progressionKnownSpellLimit = getKnownSpellLimit(classData, entry.levels)
      if (progressionKnownSpellLimit != null) {
        // Prefer explicit known-spell progression (e.g. Wizard spellbook additions)
        // over prepared limits so "selection available" reflects creation/level picks.
        knownSpellLimit = progressionKnownSpellLimit
      } else if (levelOnlyPrepared) {
        // XPHB level-only casters: their "prepared" count IS their "known" count.
        knownSpellLimit = preparedSpellLimit
      } else if (preparedCaster) {
        // Prepared-only casters without known progression use prepared count as cap.
        knownSpellLimit = preparedSpellLimit
      } else {
        knownSpellLimit = null
      }

      return {
        profileId: toClassProfileId(entry.name, entry.source),
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
        preparedSpellLimit: levelOnlyPrepared ? null : preparedSpellLimit,
        knownSpellLimit,
        cantripLimit: getCantripLimit(classData, entry.levels),
        isPreparedCaster: preparedCaster,
        isTruePreparedCaster: truePreparedCaster,
        isLevelOnlyPreparedCaster: levelOnlyPrepared,
      } as SpellcastingClassDetail
    })
    .filter((detail): detail is SpellcastingClassDetail => detail !== null)
    .filter((detail) => detail.casterProgression !== 'none')
}
