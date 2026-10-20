import { canonicalProficiencyName } from '@/lib/5etools/classProficiencyIdentity'
import {
  decodeFixedProficiencyId,
  isFixedProficiencyId,
} from '@/lib/5etools/fixedProficiencyIdentity'
import {
  CONCRETE_TOOL_PROFICIENCY_NAMES,
  fixedProficiencyRule,
} from '@/lib/5etools/fixedProficiencyRules'
import type { SourceTag } from '@/lib/provenance/types'
import type { Character } from '@/types/character'

export const isFixedProficiencyTag = (tag: SourceTag) =>
  !!tag.grantVariant && isFixedProficiencyId(tag.grantVariant)
/** Strict reopen checks both materialization and complete paired ownership; no live catalog needed. */
export function getInvalidFixedProficiencyPaths(
  character: Pick<Character, 'proficiencies' | 'provenance'>,
): Array<Array<string | number>> {
  const paths: Array<Array<string | number>> = []
  const pairs = new Map<string, { name: string; id: string }>()
  const hasValue = (domain: 'skills' | 'expertise' | 'tools', name: string) =>
    character.proficiencies[domain].some((value) => canonicalProficiencyName(value) === name)
  for (const [domain, values] of Object.entries(character.provenance?.proficiencies ?? {})) {
    for (const [name, tags] of Object.entries(values as Record<string, SourceTag[]>)) {
      const seen = new Set<string>()
      for (const tag of tags.filter(isFixedProficiencyTag)) {
        const id = tag.grantVariant!,
          relation = decodeFixedProficiencyId(id)
        const rule = relation && fixedProficiencyRule(relation.target)
        const tool = rule?.kind === 'proficient-tools'
        const legal =
          relation &&
          rule &&
          (tool
            ? domain === 'expertise' &&
              CONCRETE_TOOL_PROFICIENCY_NAMES.includes(name) &&
              hasValue('tools', name)
            : ['skills', 'expertise'].includes(domain) && rule.skills?.includes(name)) &&
          (domain === 'skills' || domain === 'expertise') &&
          hasValue(domain, name) &&
          canonicalProficiencyName(name) === name &&
          tag.sourceType === (relation.owner.length === 4 ? 'subclass' : 'class') &&
          canonicalProficiencyName(tag.sourceName) ===
            relation.owner[relation.owner.length === 4 ? 2 : 0] &&
          typeof tag.sourceRef === 'string' &&
          canonicalProficiencyName(tag.sourceRef) ===
            relation.owner[relation.owner.length === 4 ? 3 : 1] &&
          tag.grantType === 'fixed' &&
          tag.grantSource === undefined &&
          !seen.has(id)
        if (!legal) paths.push(['provenance', 'proficiencies', domain, name])
        if (rule && !tool && rule.skills?.includes(name))
          pairs.set(JSON.stringify([id, name]), { id, name })
        seen.add(id)
      }
    }
  }
  for (const { id, name } of pairs.values()) {
    const tagged = (domain: 'skills' | 'expertise') =>
      (character.provenance?.proficiencies[domain]?.[name] ?? []).some(
        (tag) => tag.grantVariant === id,
      )
    if (
      tagged('skills') !== tagged('expertise') ||
      !hasValue('skills', name) ||
      !hasValue('expertise', name)
    )
      paths.push(['provenance', 'proficiencies', 'expertise', name])
  }
  for (const domain of ['features', 'feats', 'spells', 'equipment'] as const)
    for (const [name, tags] of Object.entries(character.provenance?.[domain] ?? {}))
      if (tags.some(isFixedProficiencyTag)) paths.push(['provenance', domain, name])
  for (const [index, bonus] of (character.provenance?.abilityBonuses ?? []).entries())
    if (isFixedProficiencyTag(bonus.sourceTag)) paths.push(['provenance', 'abilityBonuses', index])
  for (const [index, choice] of (character.provenance?.choices ?? []).entries())
    if (isFixedProficiencyTag(choice.sourceTag)) paths.push(['provenance', 'choices', index])
  return paths
}
