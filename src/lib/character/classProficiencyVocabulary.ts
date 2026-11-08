import {
  canonicalProficiencyName,
  decodeProficiencyOption,
} from '@/lib/5etools/classProficiencyIdentity'
import {
  CLASS_PROFICIENCY_RULES,
  type QualifiedLanguageSources,
} from '@/lib/5etools/classProficiencyRules'
import { toAbilityName } from '@/lib/calculations/abilityNames'
import {
  type ClassifiableItem,
  getItemTypeCodes,
  isSelectableEquipmentItem,
} from '@/lib/calculations/itemClassification'
import type { NormalizedChoiceOptionReference } from '@/types/classRules'
import type { ClassChoiceFeatureCatalogs } from './classChoiceFeatureCatalogs'

function getQualifiedProficiencyLanguage(
  name: string,
  languages: ClassChoiceFeatureCatalogs['languages'],
  sources: QualifiedLanguageSources,
) {
  for (const [allowedName, source] of sources) {
    if (allowedName !== name) continue
    const matches = languages?.filter(
      (language) => canonicalProficiencyName(language.name) === name && language.source === source,
    )
    if (matches?.length === 1 && !matches[0].sourceIdentityConflict) return matches[0]
  }
  return undefined
}

export function hasProficiencyCatalogTarget(
  option: NormalizedChoiceOptionReference,
  catalogs:
    | Pick<ClassChoiceFeatureCatalogs, 'skills' | 'languages' | 'proficiencyTools'>
    | undefined,
  languageSources?: QualifiedLanguageSources,
  toolCategory?: string,
) {
  const target = decodeProficiencyOption(option)
  if (!target) return false
  if (target.domain === 'savingThrows') return toAbilityName(target.name) === target.name
  if (target.domain === 'languages' && languageSources)
    return !!getQualifiedProficiencyLanguage(target.name, catalogs?.languages, languageSources)
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
          getItemTypeCodes((value as ClassifiableItem).type).some((type) =>
            toolCategory ? type === toolCategory : type === 'AT' || type === 'GS',
          ))),
  )
}

/** Source description only; callers establish current choice authority and mechanical eligibility. */
export function getProficiencyOptionEntries(
  option: NormalizedChoiceOptionReference,
  catalogs: ClassChoiceFeatureCatalogs,
  languageSources?: QualifiedLanguageSources,
  toolCategory?: string,
): unknown[] | undefined {
  const target = decodeProficiencyOption(option)
  if (!target || !hasProficiencyCatalogTarget(option, catalogs, languageSources, toolCategory))
    return undefined
  if (target.domain === 'savingThrows')
    return ['Gain proficiency with the chosen ability’s saving throws.']
  const tool = target.proficiencyType === 'tool'
  const values =
    target.domain === 'expertise' || target.domain === 'skills'
      ? catalogs.skills
      : target.domain === 'tools'
        ? catalogs.proficiencyTools
        : catalogs.languages
  const entry = (
    target.domain === 'languages' && languageSources
      ? getQualifiedProficiencyLanguage(target.name, catalogs.languages, languageSources)
      : (values ?? []).find(
          (value) =>
            value &&
            typeof value === 'object' &&
            'name' in value &&
            typeof value.name === 'string' &&
            canonicalProficiencyName(value.name) === target.name &&
            (target.domain !== 'tools' ||
              !toolCategory ||
              getItemTypeCodes((value as ClassifiableItem).type).includes(toolCategory)),
        )
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
        ? ['Gain proficiency with the chosen tool.']
        : target.domain === 'skills'
          ? ['Gain proficiency with the chosen skill.']
          : [
              ...(entry?.type ? [`Language type: ${entry.type}.`] : []),
              'Exotic or secret language choices may require your DM’s permission. Use your campaign’s allowed languages.',
            ]),
  ]
}
