import {
  allowsProficiencyDomain,
  canonicalProficiencyName,
  decodeClassProficiencyChoiceId,
  decodeProficiencyOption,
  getProficiencyOption,
} from '@/lib/5etools/classProficiencyIdentity'
import { getClassProficiencyRuleDomain } from '@/lib/5etools/classProficiencyRules'
import {
  ownedClassProficiencyRule as classProficiencyRule,
  optionalClassProficiencyRule,
} from '@/lib/5etools/ownedClassProficiencyRules'
import { ABILITY_CATALOG_FALLBACK } from '@/lib/5etools/rulesetMetadata'
import { toAbilityName } from '@/lib/calculations/abilityNames'
import type { Character, CharacterClassChoiceOption } from '@/types/character'
import type { NormalizedCharacterChoice } from '@/types/classRules'
import { getClassChoiceOptionKey } from './classChoiceIdentity'
import type { ClassChoiceFeatureCatalogs, ClassChoiceOptionView } from './classChoiceOptions'
import { getEffectiveOwnerProficiencyChoices } from './classProficiencyAuthority'
import { projectOwnedProficiencies } from './classProficiencyFoundation'
import {
  getProficiencyOptionEntries,
  hasProficiencyCatalogTarget,
} from './classProficiencyVocabulary'

export { hasProficiencyCatalogTarget } from './classProficiencyVocabulary'

/** Eligibility uses the same foundation-first projection as commands and calculations. */
export function resolveClassProficiencyOptions(
  choice: NormalizedCharacterChoice,
  catalogs: ClassChoiceFeatureCatalogs,
  saved: readonly CharacterClassChoiceOption[],
  character?: Character,
  projection?: ReturnType<typeof projectOwnedProficiencies>,
): ClassChoiceOptionView[] {
  const relation = decodeClassProficiencyChoiceId(choice.id)
  const rule = relation && classProficiencyRule(relation.target)
  const domain = getClassProficiencyRuleDomain(rule, relation)
  const state = projection ?? (character && projectOwnedProficiencies(character, catalogs))
  const base = state?.effective
  const current = base?.classProgression
    .flatMap((owner) => getEffectiveOwnerProficiencyChoices(base, owner, catalogs))
    .find((row) => row.id === choice.id)
  const valid =
    !!character &&
    !!relation &&
    !!domain &&
    relation.domain === choice.proficiencyDomain &&
    choice.kind === 'proficiency' &&
    !!current
  const selected = new Set(saved.map(getClassChoiceOptionKey))
  const known = new Set(
    base?.proficiencies.languages.map((name) => canonicalProficiencyName(name)) ?? [],
  )
  const proficient = new Set(
    base?.proficiencies.skills.map((name) => canonicalProficiencyName(name)) ?? [],
  )
  const tools = new Set(
    base?.proficiencies.tools.map((name) => canonicalProficiencyName(name)) ?? [],
  )
  const occupied = new Set(
    base?.proficiencies.expertise.map((name) => canonicalProficiencyName(name)) ?? [],
  )
  const earlier = new Set<string>()
  // Other current, earned, source-authorized intent counts; this choice's own grant never does.
  for (const { selection: other } of state?.current ?? []) {
    if (other.choiceId === choice.id) continue
    const otherRelation = decodeClassProficiencyChoiceId(other.choiceId)!
    const otherDomain = getClassProficiencyRuleDomain(
      classProficiencyRule(otherRelation.target),
      otherRelation,
    )
    for (const option of other.selected) {
      const target = decodeProficiencyOption(option)!
      if (target.domain === 'languages') {
        if (
          (!otherDomain?.languagePool || otherDomain.languagePool.includes(target.name)) &&
          hasProficiencyCatalogTarget(option, catalogs, otherDomain?.languageSources)
        )
          known.add(target.name)
      } else if (
        (target.proficiencyType === 'skill' &&
          proficient.has(target.name) &&
          (!otherDomain?.skillPool || otherDomain.skillPool.includes(target.name))) ||
        (target.proficiencyType === 'tool' &&
          tools.has(target.name) &&
          otherDomain?.tools?.includes(target.name))
      ) {
        occupied.add(target.name)
        if (
          otherRelation.owner.every((value, index) => value === relation?.owner[index]) &&
          other.classLevel < choice.level
        )
          earlier.add(target.name)
      }
    }
  }
  const candidates =
    relation?.domain === 'expertise'
      ? [
          ...(catalogs.skills ?? []),
          ...(domain?.tools ?? []).map((name) => ({
            name,
            proficiencyType: 'tool',
            entries: [
              'Double your proficiency bonus for ability checks using this proficient tool.',
            ],
          })),
        ]
      : relation?.domain === 'tools'
        ? (catalogs.proficiencyTools ?? [])
        : relation?.domain === 'skills'
          ? (catalogs.skills ?? [])
          : relation?.domain === 'savingThrows'
            ? ABILITY_CATALOG_FALLBACK.map(({ title }) => ({ name: title }))
            : (catalogs.languages ?? [])
  const views = new Map<string, ClassChoiceOptionView>()
  if (valid) {
    const options =
      relation.domain === 'skill-or-language'
        ? [
            ...(catalogs.skills ?? []).map((candidate) => ({
              candidate,
              optionDomain: 'skills' as const,
            })),
            ...(catalogs.languages ?? []).map((candidate) => ({
              candidate,
              optionDomain: 'languages' as const,
            })),
          ]
        : candidates.map((candidate) => ({ candidate, optionDomain: relation.domain }))
    for (const { candidate, optionDomain } of options) {
      if (
        !candidate ||
        typeof candidate !== 'object' ||
        !('name' in candidate) ||
        typeof candidate.name !== 'string'
      )
        continue
      const name = canonicalProficiencyName(candidate.name)
      if (!name || optionDomain === 'skill-or-language') continue
      const tool = 'proficiencyType' in candidate && candidate.proficiencyType === 'tool'
      const reference = getProficiencyOption(
        optionDomain,
        candidate.name,
        tool ? 'tool' : undefined,
      )
      const key = getClassChoiceOptionKey(reference)
      const alreadySelected = selected.has(key)
      if (views.has(key)) continue
      if (
        optionDomain === 'savingThrows' &&
        (!domain?.savingThrowPool?.includes(name) ||
          !character?.classChoiceSelections?.find((row) => row.choiceId === choice.id)
            ?.proficiencyAtGain?.alreadyProficient ||
          (!alreadySelected &&
            state?.independent.proficiencies.savingThrows.some(
              (value) => toAbilityName(value) === name,
            )))
      )
        continue
      if (
        optionDomain === 'skills' &&
        ((current?.currentProficiencySkillPool &&
          !current.currentProficiencySkillPool.includes(name)) ||
          (domain?.skillPool !== null && !domain?.skillPool?.includes(name)) ||
          ((optionalClassProficiencyRule(relation.target) || domain?.excludeExisting) &&
            proficient.has(name) &&
            !alreadySelected) ||
          ((domain?.trigger || rule?.proficiencyAtGain) &&
            !character?.classChoiceSelections?.find((row) => row.choiceId === choice.id)
              ?.proficiencyAtGain?.alreadyProficient))
      )
        continue
      if (optionDomain === 'expertise') {
        if (
          !domain?.coupled &&
          !proficient.has(name) &&
          !(tools.has(name) && domain?.tools?.includes(name))
        )
          continue
        if (domain?.skillPool && !domain.skillPool.includes(name)) continue
        if (domain?.excludeExisting && occupied.has(name) && !alreadySelected) continue
        if (domain?.distinctEarlier && earlier.has(name)) continue
      }
      if (
        optionDomain === 'languages' &&
        domain?.languagePool &&
        !domain.languagePool.includes(name)
      )
        continue
      if (optionDomain === 'languages' && known.has(name) && !alreadySelected) continue
      if (
        optionDomain === 'languages' &&
        domain?.languageSources &&
        !hasProficiencyCatalogTarget(reference, catalogs, domain.languageSources)
      )
        continue
      if (
        optionDomain === 'tools' &&
        ((!domain?.toolCategory && !domain?.toolPool) ||
          (domain.toolPool && !domain.toolPool.includes(name)) ||
          !hasProficiencyCatalogTarget(reference, catalogs, undefined, domain.toolCategory))
      )
        continue
      views.set(key, {
        reference,
        availability: 'eligible',
        entries:
          getProficiencyOptionEntries(
            reference,
            catalogs,
            domain?.languageSources,
            domain?.toolCategory,
          ) ?? [],
      })
    }
  }
  for (const reference of saved) {
    const target = decodeProficiencyOption(reference)
    const key = getClassChoiceOptionKey(reference)
    if (
      !target ||
      !relation ||
      !allowsProficiencyDomain(relation.domain, target.domain) ||
      !views.has(key)
    ) {
      views.set(key, {
        reference,
        availability: 'retained',
        entries: [],
      })
    }
  }
  return [...views.values()].sort((a, b) => a.reference.name.localeCompare(b.reference.name))
}
