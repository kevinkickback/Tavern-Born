import {
  canonicalProficiencyName,
  decodeClassProficiencyChoiceId,
  decodeProficiencyOption,
  getProficiencyOption,
} from '@/lib/5etools/classProficiencyIdentity'
import {
  ownedClassProficiencyRule as classProficiencyRule,
  optionalClassProficiencyRule,
} from '@/lib/5etools/ownedClassProficiencyRules'
import type { Character, CharacterClassChoiceOption } from '@/types/character'
import type { NormalizedCharacterChoice } from '@/types/classRules'
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
  const domain = rule?.domains.find((row) => row.domain === relation?.domain)
  const current = character?.classProgression
    .flatMap((owner) => getEffectiveOwnerProficiencyChoices(character, owner, catalogs))
    .find((row) => row.id === choice.id)
  const valid =
    !!character &&
    !!relation &&
    !!domain &&
    relation.domain === choice.proficiencyDomain &&
    choice.kind === 'proficiency' &&
    !!current
  const selected = new Set(saved.flatMap((option) => decodeProficiencyOption(option)?.name ?? []))
  const state = projection ?? (character && projectOwnedProficiencies(character, catalogs))
  const base = state?.effective
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
    const otherDomain = classProficiencyRule(otherRelation.target)?.domains.find(
      (row) => row.domain === otherRelation.domain,
    )
    for (const option of other.selected) {
      const target = decodeProficiencyOption(option)!
      if (target.domain === 'languages') {
        if (
          (!otherDomain?.languagePool || otherDomain.languagePool.includes(target.name)) &&
          hasProficiencyCatalogTarget(option, catalogs)
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
          : (catalogs.languages ?? [])
  const views = new Map<string, ClassChoiceOptionView>()
  if (valid)
    for (const candidate of candidates) {
      if (
        !candidate ||
        typeof candidate !== 'object' ||
        !('name' in candidate) ||
        typeof candidate.name !== 'string'
      )
        continue
      const name = canonicalProficiencyName(candidate.name)
      if (!name || views.has(name)) continue
      if (
        relation.domain === 'skills' &&
        (!domain?.skillPool?.includes(name) ||
          (optionalClassProficiencyRule(relation.target)
            ? proficient.has(name) && !selected.has(name)
            : !character?.classChoiceSelections?.find((row) => row.choiceId === choice.id)
                ?.proficiencyAtGain?.alreadyProficient))
      )
        continue
      if (relation.domain === 'expertise') {
        if (
          !domain?.coupled &&
          !proficient.has(name) &&
          !(tools.has(name) && domain?.tools?.includes(name))
        )
          continue
        if (domain?.skillPool && !domain.skillPool.includes(name)) continue
        if (domain?.excludeExisting && occupied.has(name) && !selected.has(name)) continue
        if (domain?.distinctEarlier && earlier.has(name)) continue
      }
      if (
        relation.domain === 'languages' &&
        domain?.languagePool &&
        !domain.languagePool.includes(name)
      )
        continue
      if (relation.domain === 'languages' && known.has(name) && !selected.has(name)) continue
      if (
        relation.domain === 'tools' &&
        (!domain?.toolPool?.includes(name) ||
          !hasProficiencyCatalogTarget(getProficiencyOption('tools', candidate.name), catalogs))
      )
        continue
      const tool = 'proficiencyType' in candidate && candidate.proficiencyType === 'tool'
      views.set(name, {
        reference: getProficiencyOption(relation.domain, candidate.name, tool ? 'tool' : undefined),
        availability: 'eligible',
        entries:
          getProficiencyOptionEntries(
            getProficiencyOption(relation.domain, candidate.name, tool ? 'tool' : undefined),
            catalogs,
          ) ?? [],
      })
    }
  for (const reference of saved) {
    const target = decodeProficiencyOption(reference)
    if (!target || target.domain !== relation?.domain || !views.has(target.name)) {
      views.set(target?.name ?? JSON.stringify(reference), {
        reference,
        availability: 'retained',
        entries: [],
      })
    }
  }
  return [...views.values()].sort((a, b) => a.reference.name.localeCompare(b.reference.name))
}
