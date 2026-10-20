import {
  decodeClassProficiencyChoiceId,
  decodeProficiencyOption,
  isClassProficiencyChoiceId,
} from '@/lib/5etools/classProficiencyIdentity'
import { CLASS_PROFICIENCY_RULES } from '@/lib/5etools/classProficiencyRules'
import {
  ownedClassProficiencyRule as classProficiencyRule,
  optionalClassProficiencyRule,
} from '@/lib/5etools/ownedClassProficiencyRules'
import { getSubclassProficiencyRootCertificate } from '@/lib/5etools/subclassProficiencyRegistry'
import type { SourceTag } from '@/lib/provenance/types'
import type { Character, CharacterClassChoiceSelection } from '@/types/character'

export function isValidClassProficiencySelection(
  selection: CharacterClassChoiceSelection,
): boolean {
  const relation = decodeClassProficiencyChoiceId(selection.choiceId)
  const domain =
    relation &&
    classProficiencyRule(relation.target)?.domains.find((row) => row.domain === relation.domain)
  const setup = selection.proficiencyAtGain
  const trigger =
    relation?.domain === 'skills' && classProficiencyRule(relation.target)?.proficiencyAtGain
  const historical = !!trigger
  const optional = relation && optionalClassProficiencyRule(relation.target)
  const validSetup = historical
    ? !!setup &&
      setup.name === trigger &&
      typeof setup.alreadyProficient === 'boolean' &&
      Object.keys(setup).every((key) => ['name', 'alreadyProficient'].includes(key))
    : setup === undefined
  return (
    !!relation &&
    !!domain &&
    (!optional ||
      (JSON.stringify(relation.owner) === JSON.stringify(optional.owner.slice(1)) &&
        optional.gains.includes(relation.level) &&
        relation.domain === 'skills')) &&
    validSetup &&
    selection.kind === 'proficiency' &&
    (relation.owner.length === 2
      ? !selection.subclassName && !selection.subclassSource
      : relation.owner[2] === selection.subclassName?.trim().toLowerCase() &&
        relation.owner[3] === selection.subclassSource?.trim().toLowerCase() &&
        !!getSubclassProficiencyRootCertificate(relation.owner)?.paths.some(
          (path) => path.target === relation.target && path.level === relation.level,
        )) &&
    relation.level === selection.classLevel &&
    relation.owner[0] === selection.className.trim().toLowerCase() &&
    relation.owner[1] === selection.classSource.trim().toLowerCase() &&
    (historical || selection.selected.length > 0) &&
    selection.selected.length <= (historical && !setup?.alreadyProficient ? 0 : domain.count) &&
    selection.selected.every((option) => {
      const target = decodeProficiencyOption(option)
      const toolAllowed =
        target?.proficiencyType === 'tool'
          ? !!domain.tools?.includes(target.name)
          : !CLASS_PROFICIENCY_RULES.some((rule) =>
              rule.domains.some((row) => row.tools?.includes(target?.name ?? '')),
            )
      return (
        target?.domain === relation.domain &&
        toolAllowed &&
        (target.proficiencyType === 'tool' ||
          !domain.skillPool ||
          domain.skillPool.includes(target.name)) &&
        (!domain.languagePool || domain.languagePool.includes(target.name)) &&
        (!domain.toolPool || domain.toolPool.includes(target.name)) &&
        option.slotLevel === relation.level
      )
    }) &&
    new Set(selection.selected.map((option) => decodeProficiencyOption(option)?.name)).size ===
      selection.selected.length
  )
}

export const isClassProficiencyTag = (tag: SourceTag) =>
  !!tag.grantVariant && isClassProficiencyChoiceId(tag.grantVariant)

export function getInvalidClassProficiencySelectionIds(
  selections: readonly CharacterClassChoiceSelection[],
): Set<string> {
  const invalid = new Set<string>(),
    seen = new Set<string>()
  for (const selection of selections) {
    if (
      !isClassProficiencyChoiceId(selection.choiceId) &&
      selection.kind !== 'proficiency' &&
      selection.proficiencyAtGain === undefined &&
      !selection.selected.some((option) => option.entityType === 'proficiency')
    )
      continue
    if (!isValidClassProficiencySelection(selection) || seen.has(selection.choiceId))
      invalid.add(selection.choiceId)
    seen.add(selection.choiceId)
  }
  const occupied = new Map<string, string>()
  for (const selection of selections) {
    const relation = decodeClassProficiencyChoiceId(selection.choiceId)
    if (!relation || !optionalClassProficiencyRule(relation.target)) continue
    for (const option of selection.selected) {
      const name = decodeProficiencyOption(option)?.name
      if (!name) continue
      const key = JSON.stringify([relation.owner, relation.target, name])
      const prior = occupied.get(key)
      if (prior) {
        invalid.add(prior)
        invalid.add(selection.choiceId)
      }
      occupied.set(key, selection.choiceId)
    }
  }
  return invalid
}

/** Applied tags prove a saved relation; retained intent does not require currently applied benefits. */
export function getInvalidClassProficiencyPaths(
  character: Pick<Character, 'classChoiceSelections' | 'proficiencies' | 'provenance'>,
): Array<Array<string | number>> {
  const paths: Array<Array<string | number>> = []
  const invalid = getInvalidClassProficiencySelectionIds(character.classChoiceSelections ?? [])
  const selections = new Map<string, CharacterClassChoiceSelection>()
  for (const [index, selection] of (character.classChoiceSelections ?? []).entries()) {
    if (
      !isClassProficiencyChoiceId(selection.choiceId) &&
      selection.kind !== 'proficiency' &&
      selection.proficiencyAtGain === undefined &&
      !selection.selected.some((option) => option.entityType === 'proficiency')
    )
      continue
    if (invalid.has(selection.choiceId)) paths.push(['classChoiceSelections', index])
    selections.set(selection.choiceId, selection)
  }
  for (const [domain, values] of Object.entries(character.provenance?.proficiencies ?? {})) {
    for (const [name, tags] of Object.entries(values as Record<string, SourceTag[]>)) {
      const owned = tags.filter(isClassProficiencyTag)
      const seen = new Set<string>()
      for (const tag of owned) {
        const selection = selections.get(tag.grantVariant!)
        const relation = selection && decodeClassProficiencyChoiceId(selection.choiceId)
        const matches = selection?.selected.some(
          (option) => decodeProficiencyOption(option)?.name === name,
        )
        if (
          !selection ||
          invalid.has(selection.choiceId) ||
          !(
            relation?.domain === domain ||
            (domain === 'skills' &&
              relation?.domain === 'expertise' &&
              classProficiencyRule(relation.target)?.domains.some(
                (row) => row.domain === 'expertise' && row.coupled,
              ))
          ) ||
          !matches ||
          tag.sourceType !== (selection.subclassName ? 'subclass' : 'class') ||
          tag.grantType !== 'choice' ||
          tag.sourceName !== (selection.subclassName ?? selection.className) ||
          tag.sourceRef !== (selection.subclassSource ?? selection.classSource) ||
          tag.grantSource !== undefined ||
          seen.has(tag.grantVariant!) ||
          !(
            character.proficiencies[domain as 'skills' | 'expertise' | 'languages' | 'tools'] ?? []
          ).some((value) => value.trim().toLowerCase() === name)
        )
          paths.push(['provenance', 'proficiencies', domain, name])
        seen.add(tag.grantVariant!)
      }
    }
  }
  for (const selection of selections.values()) {
    const relation = decodeClassProficiencyChoiceId(selection.choiceId)
    if (
      !relation ||
      relation.domain !== 'expertise' ||
      !classProficiencyRule(relation.target)?.domains.some(
        (row) => row.domain === 'expertise' && row.coupled,
      )
    )
      continue
    for (const option of selection.selected) {
      const name = decodeProficiencyOption(option)?.name
      if (!name) continue
      const has = (domain: 'skills' | 'expertise') =>
        (character.provenance?.proficiencies[domain]?.[name] ?? []).some(
          (tag) => tag.grantVariant === selection.choiceId,
        )
      if (
        has('skills') !== has('expertise') ||
        ((has('skills') || has('expertise')) &&
          !(['skills', 'expertise'] as const).every((domain) =>
            character.proficiencies[domain].some((value) => value.trim().toLowerCase() === name),
          ))
      )
        paths.push(['provenance', 'proficiencies', 'skills', name])
    }
  }
  for (const domain of ['features', 'feats', 'spells', 'equipment'] as const) {
    for (const [name, tags] of Object.entries(character.provenance?.[domain] ?? {}))
      if (tags.some(isClassProficiencyTag)) paths.push(['provenance', domain, name])
  }
  for (const [index, bonus] of (character.provenance?.abilityBonuses ?? []).entries())
    if (isClassProficiencyTag(bonus.sourceTag)) paths.push(['provenance', 'abilityBonuses', index])
  for (const [index, choice] of (character.provenance?.choices ?? []).entries())
    if (isClassProficiencyTag(choice.sourceTag)) paths.push(['provenance', 'choices', index])
  return paths
}
