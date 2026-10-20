import {
  getItemTypeCodes,
  getNormalizedItemTraits,
  isSelectableEquipmentItem,
} from '@/lib/calculations/itemClassification'
import type { Item5e } from '@/types/5etools'
import { canonicalProficiencyName } from './classProficiencyIdentity'

export type ConcreteToolAssessment =
  | { kind: 'eligible'; name: string }
  | { kind: 'ineligible' }
  | { kind: 'unsupported'; reason: string }

/** Shared offline/live vocabulary; callers supply production-copy-resolved item records. */
export function assessStructuredConcreteToolProficiency(item: Item5e): ConcreteToolAssessment {
  const traits = getNormalizedItemTraits(item)
  if (!isSelectableEquipmentItem(item) || !traits.isTool) return { kind: 'ineligible' }
  if (item._copy) return { kind: 'unsupported', reason: 'Unresolved tool copy' }
  const codes = getItemTypeCodes(item.type)
  if (!codes.length || codes.some((code) => !['AT', 'GS', 'INS', 'T'].includes(code)))
    return { kind: 'unsupported', reason: 'Unsupported concrete tool classification' }
  if (typeof item.rarity !== 'string')
    return { kind: 'unsupported', reason: 'Missing explicit tool rarity' }
  const rarity = item.rarity.trim().toLowerCase()
  if (!['none', 'unknown'].includes(rarity)) {
    return ['common', 'uncommon', 'rare', 'very rare', 'legendary', 'artifact', 'varies'].includes(
      rarity,
    )
      ? { kind: 'ineligible' }
      : { kind: 'unsupported', reason: 'Unsupported tool rarity' }
  }
  if (
    ['wondrous', 'magic', 'sentient', 'curse', 'tattoo'].some(
      (key) => item[key] !== undefined && typeof item[key] !== 'boolean',
    ) ||
    (item.reqAttune !== undefined &&
      typeof item.reqAttune !== 'boolean' &&
      (typeof item.reqAttune !== 'string' || !item.reqAttune.trim())) ||
    Object.entries(item).some(
      ([key, value]) =>
        key.startsWith('bonus') &&
        value !== undefined &&
        typeof value !== 'string' &&
        !(typeof value === 'number' && Number.isFinite(value)),
    )
  )
    return { kind: 'unsupported', reason: 'Unsupported tool magic classification' }
  if (
    traits.isWondrous ||
    traits.isArmor ||
    traits.isWeapon ||
    traits.isPotion ||
    traits.isScroll ||
    (item.reqAttune !== undefined && item.reqAttune !== false) ||
    Object.entries(item).some(
      ([key, value]) =>
        value !== undefined &&
        (key.startsWith('bonus') ||
          (['magic', 'sentient', 'curse', 'artifactProperties', 'tattoo'].includes(key) &&
            value !== false)),
    )
  )
    return { kind: 'ineligible' }
  if (typeof item.name !== 'string' || typeof item.source !== 'string' || !item.source.trim())
    return { kind: 'unsupported', reason: 'A tool definition requires a qualified source identity' }
  const name = canonicalProficiencyName(item.name)
  return name ? { kind: 'eligible', name } : { kind: 'unsupported', reason: 'Invalid tool name' }
}
