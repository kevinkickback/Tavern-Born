import { DIVINE_ORDER_OPTIONS } from './divineOrderIdentity'
import generated from './fixedProficiencyRules.generated.json' with { type: 'json' }

export interface FixedProficiencyRule {
  target: string
  name: string
  className: string
  classSource: string
  level: number
  kind:
    | 'fixed-skills'
    | 'historical-skill'
    | 'proficient-tools'
    | 'fixed-languages'
    | 'fixed-training'
  training?: Readonly<Partial<Record<'armor' | 'weapons', readonly string[]>>>
  skills?: readonly string[]
  languages?: readonly string[]
  fallback?: { name: string; count: number; skillPool: readonly string[] }
}
export interface GeneratedFixedProficiencyRule extends FixedProficiencyRule {
  bundledMetadataDigest?: string
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
export const FIXED_PROFICIENCY_RULES =
  generated.features as readonly GeneratedFixedProficiencyRule[]
export const DIRECT_FIXED_CLASS_CERTIFICATES =
  generated.directClasses as DirectFixedClassCertificate[]
export const CONCRETE_TOOL_PROFICIENCY_NAMES: readonly string[] = generated.toolNames
const rules = new Map(FIXED_PROFICIENCY_RULES.map((row) => [row.target, row]))

// Source authority for this selected branch is checked by the Divine Order adapter.
export const PROTECTOR_TRAINING: FixedProficiencyRule = {
  target: DIVINE_ORDER_OPTIONS.protector,
  name: 'Protector',
  className: 'Cleric',
  classSource: 'XPHB',
  level: 1,
  kind: 'fixed-training',
  training: { armor: ['heavy'], weapons: ['martial'] },
}
export const fixedProficiencyRule = (target: string) =>
  target === PROTECTOR_TRAINING.target ? PROTECTOR_TRAINING : rules.get(target)
