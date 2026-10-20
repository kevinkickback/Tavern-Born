import generated from './fixedProficiencyRules.generated.json' with { type: 'json' }

export interface FixedProficiencyRule {
  target: string
  name: string
  className: string
  classSource: string
  level: number
  kind: 'fixed-skills' | 'historical-skill' | 'proficient-tools'
  skills?: readonly string[]
  fallback?: { name: string; count: number; skillPool: readonly string[] }
  digest: string
  metadataDigest: string
  fields: readonly string[]
}
export interface DirectFixedClassCertificate {
  owner: [string, string]
  target: string
  level: number
  rawDeclaration: string
  declarationDigest: string
  ordinal: number
}
export const FIXED_PROFICIENCY_RULES = generated.features as readonly FixedProficiencyRule[]
export const DIRECT_FIXED_CLASS_CERTIFICATES =
  generated.directClasses as DirectFixedClassCertificate[]
export const CONCRETE_TOOL_PROFICIENCY_NAMES: readonly string[] = generated.toolNames
const rules = new Map(FIXED_PROFICIENCY_RULES.map((row) => [row.target, row]))
export const fixedProficiencyRule = (target: string) => rules.get(target)
