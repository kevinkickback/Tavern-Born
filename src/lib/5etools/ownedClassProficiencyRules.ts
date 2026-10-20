import type { ClassProficiencyRule } from './classProficiencyRules'
import { classProficiencyRule } from './classProficiencyRules'
import generated from './optionalClassProficiencyRules.generated.json' with { type: 'json' }

interface OptionalClassProficiencyRule extends ClassProficiencyRule {
  owner: readonly ['class', string, string]
  rootLevel: number
  gains: readonly number[]
  name: string
  source: string
}
export const OPTIONAL_CLASS_PROFICIENCY_RULES =
  generated as unknown as readonly OptionalClassProficiencyRule[]
export const optionalClassProficiencyRule = (target: string) =>
  OPTIONAL_CLASS_PROFICIENCY_RULES.find((row) => row.target === target)

/** Mechanical consumers only. Raw legacy proficiency audits deliberately use their original registry. */
export const ownedClassProficiencyRule = (target: string): ClassProficiencyRule | undefined =>
  classProficiencyRule(target) ?? optionalClassProficiencyRule(target)
