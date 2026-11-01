import { toAbilityName } from '@/lib/calculations/abilityNames'
import { normalizeKey } from '@/lib/provenance/normalization'

export function normalizeSavingThrowName(name: string): string {
  const normalized = normalizeKey(name)
  return toAbilityName(normalized) ?? normalized
}

export function isNarrativeTool(value: string): boolean {
  return /of your choice|choose|one type of/i.test(value)
}
