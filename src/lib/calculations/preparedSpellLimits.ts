import type { ClassPreparationRule } from '@/types/classCasting'
import { normalizeAbilityName } from './abilityScores'
import { safeEvalArithmetic } from './formulaEval'

/** Arithmetic only. Callers establish current casting authority separately. */
export function evaluatePreparedSpellsFormula(
  formula: string | undefined,
  characterLevel: number,
  abilityModifiers: Record<string, number>,
): number | null {
  if (!formula || typeof formula !== 'string') return null
  try {
    const expression = formula
      .replace(/<\$level\$>/g, String(characterLevel))
      .replace(/<\$int_mod\$>/g, String(abilityModifiers.intelligence ?? 0))
      .replace(/<\$wis_mod\$>/g, String(abilityModifiers.wisdom ?? 0))
      .replace(/<\$cha_mod\$>/g, String(abilityModifiers.charisma ?? 0))
      .replace(/<\$str_mod\$>/g, String(abilityModifiers.strength ?? 0))
      .replace(/<\$dex_mod\$>/g, String(abilityModifiers.dexterity ?? 0))
      .replace(/<\$con_mod\$>/g, String(abilityModifiers.constitution ?? 0))
    const result = safeEvalArithmetic(expression)
    return Number.isFinite(result) ? Math.max(0, Math.floor(result)) : null
  } catch {
    return null
  }
}

/** Raw source arithmetic, without declaration authority or prose-only minimum semantics. */
export function getPreparedSpellLimit(
  classData:
    | {
        spellcastingAbility?: string
        preparedSpells?: string
        preparedSpellsProgression?: readonly number[]
      }
    | undefined,
  characterLevel: number,
  spellcastingAbilityModifier: number | null,
): number | null {
  if (!classData?.spellcastingAbility) return null
  const progression = classData.preparedSpellsProgression
  if (Array.isArray(progression) && progression.every((value) => typeof value === 'number'))
    return progression[characterLevel - 1] ?? progression[progression.length - 1] ?? null
  if (!classData.preparedSpells || spellcastingAbilityModifier === null) return null
  const abilityModifiers: Record<string, number> = {
    strength: 0,
    dexterity: 0,
    constitution: 0,
    intelligence: 0,
    wisdom: 0,
    charisma: 0,
  }
  const ability = normalizeAbilityName(classData.spellcastingAbility)
  if (ability) abilityModifiers[ability] = spellcastingAbilityModifier
  return evaluatePreparedSpellsFormula(classData.preparedSpells, characterLevel, abilityModifiers)
}

/** The application supplies this descriptor only after exact current source certification. */
export function getClassPreparationLimit(
  rule: ClassPreparationRule | undefined,
  classLevel: number,
  abilityModifier: number | null,
): number | null {
  if (
    !rule ||
    !Number.isInteger(classLevel) ||
    classLevel < 1 ||
    classLevel > rule.maximumByLevel.length
  )
    return null
  const capacity = rule.capacity
  const result = getPreparedSpellLimit(
    {
      spellcastingAbility: rule.ability,
      ...(capacity.kind === 'formula'
        ? { preparedSpells: capacity.formula }
        : { preparedSpellsProgression: capacity.values }),
    },
    classLevel,
    abilityModifier,
  )
  if (result === null) return null
  const limit = capacity.kind === 'formula' ? Math.max(capacity.minimum, result) : result
  return Number.isSafeInteger(limit) && limit >= 0 && limit <= rule.maximumByLevel[classLevel - 1]
    ? limit
    : null
}
