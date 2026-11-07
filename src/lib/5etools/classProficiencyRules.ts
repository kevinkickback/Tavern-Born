import type { AbilityName } from '@/types/character'
import type { ClassProficiencyChoiceDomain, NormalizedCharacterChoice } from '@/types/classRules'
import generated from './classProficiencyRules.generated.json' with { type: 'json' }
import subclasses from './subclassProficiencyRules.generated.json' with { type: 'json' }

export type QualifiedLanguageSources = readonly (readonly [string, string])[]

interface ClassProficiencyRuleDomain {
  domain: ClassProficiencyChoiceDomain
  count: number
  tools?: readonly string[]
  skillPool?: readonly string[] | null
  excludeExisting?: boolean
  distinctEarlier?: boolean
  languagePool?: readonly string[]
  languageSources?: QualifiedLanguageSources
  requiresKnownLanguage?: string
  coupled?: boolean
  toolPool?: readonly string[]
  toolCategory?: string
  savingThrowPool?: readonly string[]
  replacement?: NormalizedCharacterChoice['replacement']
  trigger?: string
}

export function getClassProficiencyRuleDomain(
  rule: ClassProficiencyRule | undefined,
  relation: { domain: ClassProficiencyChoiceDomain; trigger?: string } | undefined,
) {
  return (
    relation &&
    rule?.domains.find((row) => row.domain === relation.domain && row.trigger === relation.trigger)
  )
}
export interface ClassProficiencyRule {
  target: string
  digest: string
  fields: readonly string[]
  optional: boolean
  /** Only the certified historical fallback descriptor admits acquisition setup. */
  proficiencyAtGain?: string
  subclassGainTarget?: string
  subclassGainTargets?: readonly string[]
  subclassGainPosition?: 'first' | 'at-level'
  startingSkillPoolBase?: readonly string[]
  skillModifier?: { label: string; ability: AbilityName; minimum: number }
  domains: readonly ClassProficiencyRuleDomain[]
}

export const REVISED_PRIMAL_KNOWLEDGE_TARGET =
  'class-feature|primal knowledge|barbarian|xphb|3|xphb'

/** Reviewed source-derived mechanical checkpoint. Never regenerate trusted rules on application load. */
export const CLASS_PROFICIENCY_RULES = generated as readonly ClassProficiencyRule[]
const SUBCLASS_PROFICIENCY_RULES = subclasses as readonly ClassProficiencyRule[]
const byTarget = new Map(
  [...CLASS_PROFICIENCY_RULES, ...SUBCLASS_PROFICIENCY_RULES].map((rule) => [rule.target, rule]),
)
export const classProficiencyRule = (target: string) => byTarget.get(target)
export const isOwnedExpertiseTarget = (target: string) =>
  !!classProficiencyRule(target)?.domains.some((domain) => domain.domain === 'expertise')
