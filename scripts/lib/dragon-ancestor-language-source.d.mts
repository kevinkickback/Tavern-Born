import type { GeneratedFixedProficiencyRule } from '../../src/lib/5etools/fixedProficiencyRules'
import type { SubclassProficiencyPackage } from '../../src/lib/5etools/subclassProficiencyCertificates'
import type { deriveSubclassProficiencyCertificates } from './subclass-proficiency-source.mjs'
import type { deriveFixedProficiencyRules } from './fixed-proficiency-source.mjs'

interface SorcererDocument {
  class: readonly Record<string, unknown>[]
  subclassFeature: readonly Record<string, unknown>[]
}

export function deriveDragonAncestorLanguage(
  configured: SorcererDocument,
  bundled: SorcererDocument & { subclass: readonly Record<string, unknown>[] },
  api: Parameters<typeof deriveSubclassProficiencyCertificates>[2] &
    Pick<Parameters<typeof deriveFixedProficiencyRules>[1], 'classIdentity' | 'decodeClass'>,
): { rule: GeneratedFixedProficiencyRule; package: SubclassProficiencyPackage }
