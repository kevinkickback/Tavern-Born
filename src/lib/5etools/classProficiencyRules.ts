import type { ClassProficiencyDomain } from '@/types/classRules'
import generated from './classProficiencyRules.generated.json' with { type: 'json' }
import subclasses from './subclassProficiencyRules.generated.json' with { type: 'json' }

interface ClassProficiencyRuleDomain {
  domain: ClassProficiencyDomain
  count: number
  tools?: readonly string[]
  skillPool?: readonly string[] | null
  excludeExisting?: boolean
  distinctEarlier?: boolean
  languagePool?: readonly string[]
  coupled?: boolean
  toolPool?: readonly string[]
  toolCategory?: string
}
export interface ClassProficiencyRule {
  target: string
  digest: string
  fields: readonly string[]
  optional: boolean
  /** Only the certified historical fallback descriptor admits acquisition setup. */
  proficiencyAtGain?: string
  domains: readonly ClassProficiencyRuleDomain[]
}

/** Reviewed source-derived mechanical checkpoint. Never regenerate trusted rules on application load. */
export const CLASS_PROFICIENCY_RULES = generated as readonly ClassProficiencyRule[]
const SUBCLASS_PROFICIENCY_RULES = subclasses as readonly ClassProficiencyRule[]
const byTarget = new Map(
  [...CLASS_PROFICIENCY_RULES, ...SUBCLASS_PROFICIENCY_RULES].map((rule) => [rule.target, rule]),
)
export const classProficiencyRule = (target: string) => byTarget.get(target)
export const isOwnedExpertiseTarget = (target: string) =>
  !!classProficiencyRule(target)?.domains.some((domain) => domain.domain === 'expertise')
