import type { ClassFeature } from '../../src/types/5etools'
import type { ClassProficiencyRule } from '../../src/lib/5etools/classProficiencyRules'

export function deriveLanguagePool(book: unknown): {
  names: string[]
  tables: Array<{ value: Record<string, unknown>; path: string[] }>
}
export function validateExpertiseRule(rules: unknown[]): void
export function deriveClassProficiencyRules(
  features: readonly ClassFeature[],
  options: {
    languagePool: string[]
    identity: (feature: ClassFeature) => string | undefined
    digest: (entries: unknown[], stripEnrichment?: boolean) => string | undefined
  },
): readonly ClassProficiencyRule[]
