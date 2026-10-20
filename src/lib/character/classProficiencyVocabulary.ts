import {
  canonicalProficiencyName,
  decodeProficiencyOption,
} from '@/lib/5etools/classProficiencyIdentity'
import { CLASS_PROFICIENCY_RULES } from '@/lib/5etools/classProficiencyRules'
import {
  type ClassifiableItem,
  getItemTypeCodes,
  isSelectableEquipmentItem,
} from '@/lib/calculations/itemClassification'
import type { NormalizedChoiceOptionReference } from '@/types/classRules'
import type { ClassChoiceFeatureCatalogs } from './classChoiceFeatureCatalogs'

export function hasProficiencyCatalogTarget(
  option: NormalizedChoiceOptionReference,
  catalogs:
    | Pick<ClassChoiceFeatureCatalogs, 'skills' | 'languages' | 'proficiencyTools'>
    | undefined,
) {
  const target = decodeProficiencyOption(option)
  if (!target) return false
  if (target.proficiencyType === 'tool')
    return CLASS_PROFICIENCY_RULES.some((rule) =>
      rule.domains.some((domain) => domain.tools?.includes(target.name)),
    )
  const values =
    target.domain === 'expertise' || target.domain === 'skills'
      ? catalogs?.skills
      : target.domain === 'tools'
        ? catalogs?.proficiencyTools
        : catalogs?.languages
  return (values ?? []).some(
    (value) =>
      !!value &&
      typeof value === 'object' &&
      'name' in value &&
      typeof value.name === 'string' &&
      canonicalProficiencyName(value.name) === target.name &&
      (target.domain !== 'tools' ||
        (isSelectableEquipmentItem(value as ClassifiableItem) &&
          getItemTypeCodes((value as ClassifiableItem).type).includes('AT'))),
  )
}

/** Source description only; callers establish current choice authority and mechanical eligibility. */
export function getProficiencyOptionEntries(
  option: NormalizedChoiceOptionReference,
  catalogs: ClassChoiceFeatureCatalogs,
): unknown[] | undefined {
  const target = decodeProficiencyOption(option)
  if (!target || !hasProficiencyCatalogTarget(option, catalogs)) return undefined
  const tool = target.proficiencyType === 'tool'
  const values =
    target.domain === 'expertise' || target.domain === 'skills'
      ? catalogs.skills
      : target.domain === 'tools'
        ? catalogs.proficiencyTools
        : catalogs.languages
  const entry = (values ?? []).find(
    (value) =>
      value &&
      typeof value === 'object' &&
      'name' in value &&
      typeof value.name === 'string' &&
      canonicalProficiencyName(value.name) === target.name,
  ) as { entries?: unknown[]; type?: string } | undefined
  return [
    ...(tool
      ? ['Double your proficiency bonus for ability checks using this proficient tool.']
      : Array.isArray(entry?.entries)
        ? entry.entries
        : []),
    ...(target.domain === 'expertise'
      ? [
          `Double your proficiency bonus for checks using this proficient ${tool ? 'tool' : 'skill'}; expertise does not stack.`,
        ]
      : target.domain === 'tools'
        ? ['Gain proficiency with the chosen artisan tool.']
        : target.domain === 'skills'
          ? ['Gain proficiency with the chosen skill.']
          : [
              ...(entry?.type ? [`Language type: ${entry.type}.`] : []),
              'Exotic or secret language choices may require your DM’s permission. Use your campaign’s allowed languages.',
            ]),
  ]
}
