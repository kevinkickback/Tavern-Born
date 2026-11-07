import { CLASS_ORDERS } from './classOrderIdentity'
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
  training?: Readonly<Partial<Record<'armor' | 'weapons' | 'tools', readonly string[]>>>
  skills?: readonly string[]
  languages?: readonly string[]
  languageSource?: string
  useClassLanguagePrinting?: true
  subclassGain?: { owner: readonly string[]; target: string }
  fallback?: { name: string; count: number; skillPool: readonly string[] }
}
export interface GeneratedFixedProficiencyRule extends FixedProficiencyRule {
  bundledMetadataDigest?: string
  alwaysPreparedSpell?: string
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
const rules = new Map<string, FixedProficiencyRule>(
  FIXED_PROFICIENCY_RULES.map((row) => [row.target, row]),
)

// The selected Order branch is checked against its live source before granting training.
for (const order of CLASS_ORDERS) {
  const { target, name, armor } = order.training
  rules.set(target, {
    target,
    name,
    className: order.className,
    classSource: 'XPHB',
    level: 1,
    kind: 'fixed-training',
    training: { armor: [armor], weapons: ['martial'] },
  })
}
export function fixedProficiencyRule(target: string, owner?: readonly string[]) {
  const rule = rules.get(target)
  const requiredOwner = rule?.subclassGain?.owner
  if (
    owner &&
    requiredOwner &&
    (owner.length !== requiredOwner.length ||
      requiredOwner.some((part, index) => owner[index] !== part))
  )
    return undefined
  if (!rule?.useClassLanguagePrinting || !owner) return rule
  const source = owner[1]
  if (
    owner.length !== 4 ||
    owner[0] !== 'sorcerer' ||
    owner[2] !== 'storm sorcery' ||
    owner[3] !== 'xge' ||
    (source !== 'phb' && source !== 'xphb')
  )
    return undefined
  const gainTarget =
    source === 'phb'
      ? 'class-feature|sorcerous origin|sorcerer|phb|1|phb'
      : 'class-feature|sorcerer subclass|sorcerer|xphb|3|xphb'
  return {
    ...rule,
    languageSource: source.toUpperCase(),
    subclassGain: { owner, target: gainTarget },
  }
}
