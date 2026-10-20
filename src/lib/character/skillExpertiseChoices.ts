import { decodeProficiencyOption } from '@/lib/5etools/classProficiencyIdentity'
import { getExpertiseSlotsFromClasses } from '@/lib/calculations/skills'
import { normalizeKey } from '@/lib/provenance'
import { formatSourceType } from '@/lib/provenance/summaries'
import type { SourceRow } from '@/lib/provenance/types'
import { isFixedProficiencyTag } from '@/lib/schema/fixedProficiencyValidation'
import type { Class5e, Feat5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import {
  type ClassChoiceFeatureCatalogs,
  getClassChoiceOptionKey,
  isClassChoiceOptionEligible,
} from './classChoiceOptions'
import { refreshClassProficiencyState } from './classProficiencySelections'
import { getClassProficiencyWorkflow } from './classProficiencyWorkflow'
import { getFeatOptionSourceTag, isSameGrantSource } from './commands/featCommandIdentity'
import { getFeatExpertiseOwners, getFeatExpertiseSkillPool } from './featExpertiseSelections'

export interface ExpertiseAuthority {
  classes: readonly Class5e[]
  feats: readonly Feat5e[]
  catalogs: ClassChoiceFeatureCatalogs
}
export interface SkillExpertiseAction {
  id: string
  ownerId: string
  kind: 'class' | 'feat' | 'legacy'
  adding: boolean
  label: string
}

/** Shared current authority for circle actions, quotas and Sources; never writes a character. */
export function getSkillExpertiseChoices(saved: Character, authority: ExpertiseAuthority) {
  const { classes, feats } = authority
  const catalogs = { ...authority.catalogs, featExpertiseFeats: feats }
  const effective = refreshClassProficiencyState(saved, classes, catalogs)
  const classOwners = getClassProficiencyWorkflow(effective, classes, catalogs).filter(
    (row) => row.domain === 'expertise',
  )
  const featOwners = getFeatExpertiseOwners(saved, feats)
  const actions: Record<string, SkillExpertiseAction[]> = {}
  const rows: SourceRow[] = []
  let remaining = 0
  const addAction = (name: string, action: SkillExpertiseAction) => {
    const key = normalizeKey(name)
    if (!actions[key]) actions[key] = []
    actions[key].push(action)
  }
  for (const owner of classOwners) {
    const label = `${owner.label} — ${owner.subclassName ? `${owner.subclassName} (${owner.subclassSource}), ` : ''}${owner.className} (${owner.classSource}), level ${owner.level}`
    const selected = owner.selection?.selected ?? []
    const quota = owner.choice?.maximumSelections ?? selected.length
    const eligible = owner.options.filter(isClassChoiceOptionEligible)
    const canPreserve = selected.every((pick) =>
      eligible.some(
        (option) => getClassChoiceOptionKey(option.reference) === getClassChoiceOptionKey(pick),
      ),
    )
    if (owner.choice) remaining += Math.max(0, quota - selected.length)
    for (const pick of selected) {
      const target = decodeProficiencyOption(pick)
      if (!target) continue
      if (target.proficiencyType !== 'tool')
        addAction(target.name, {
          id: `class:remove:${owner.id}`,
          ownerId: owner.id,
          kind: 'class',
          adding: false,
          label: `Remove from ${label}`,
        })
      const applied = (effective.provenance.proficiencies.expertise?.[target.name] ?? []).some(
        (tag) => tag.grantVariant === owner.id,
      )
      rows.push({
        category: 'Expertise',
        itemName: `${pick.name}${applied ? '' : ' — retained, inactive'}`,
        attribution: owner.subclassName ? 'subclass' : 'class',
        sourceTypes: [owner.subclassName ? 'subclass' : 'class'],
        isPending: !applied,
      })
    }
    if (owner.choice && selected.length < quota && canPreserve)
      for (const option of eligible) {
        const target = decodeProficiencyOption(option.reference)
        if (
          !target ||
          target.proficiencyType === 'tool' ||
          selected.some(
            (pick) => getClassChoiceOptionKey(pick) === getClassChoiceOptionKey(option.reference),
          )
        )
          continue
        addAction(target.name, {
          id: `class:add:${owner.id}`,
          ownerId: owner.id,
          kind: 'class',
          adding: true,
          label: `Use ${label}`,
        })
      }
    if (!selected.length || (owner.choice && selected.length < quota))
      rows.push({
        category: 'Expertise',
        itemName: owner.choice
          ? `${Math.max(0, quota - selected.length)} choice(s) remaining`
          : 'Saved choice unavailable',
        attribution: owner.subclassName ? 'subclass' : 'class',
        sourceTypes: [owner.subclassName ? 'subclass' : 'class'],
        isPending: true,
      })
  }
  for (const owner of featOwners) {
    const label = `${owner.target.name} (${owner.target.source}) — ${owner.label}`
    const name = normalizeKey(owner.options?.expertiseSkill ?? '')
    if (name) {
      addAction(name, {
        id: `feat:remove:${owner.id}`,
        ownerId: owner.id,
        kind: 'feat',
        adding: false,
        label: `Remove from ${label}`,
      })
      const applied = (effective.provenance.proficiencies.expertise?.[name] ?? []).some((tag) =>
        isSameGrantSource(tag, getFeatOptionSourceTag(owner.target)),
      )
      rows.push({
        category: 'Expertise',
        itemName: `${name}${applied ? '' : ' — retained, inactive'}`,
        attribution: 'feat',
        sourceTypes: ['feat'],
        isPending: !applied,
      })
    } else if (owner.authorized) {
      remaining++
      rows.push({
        category: 'Expertise',
        itemName: '1 choice remaining',
        attribution: 'feat',
        sourceTypes: ['feat'],
        isPending: true,
      })
      const knownSkills = (catalogs.skills ?? []).flatMap((value) =>
        value && typeof value === 'object' && 'name' in value && typeof value.name === 'string'
          ? [value.name]
          : [],
      )
      for (const skill of getFeatExpertiseSkillPool(
        saved,
        effective,
        owner.target,
        owner.options ?? {},
        feats,
        knownSkills,
      )) {
        if (
          effective.proficiencies.expertise.some(
            (value) => normalizeKey(value) === normalizeKey(skill),
          )
        )
          continue
        if (
          !(catalogs.skills ?? []).some(
            (value) =>
              value &&
              typeof value === 'object' &&
              'name' in value &&
              normalizeKey(String(value.name)) === normalizeKey(skill),
          )
        )
          continue
        addAction(skill, {
          id: `feat:add:${owner.id}`,
          ownerId: owner.id,
          kind: 'feat',
          adding: true,
          label: `Use ${label}`,
        })
      }
    }
  }
  const capacity = getExpertiseSlotsFromClasses(
    saved.classProgression,
    Object.fromEntries(classes.map((cls, index) => [index, cls])),
  )
  const manualNames = effective.proficiencies.expertise.filter((name) => {
    const tags = effective.provenance.proficiencies.expertise?.[normalizeKey(name)] ?? []
    return (
      !tags.length ||
      tags.some((tag) => tag.sourceType === 'manual' && tag.sourceName === 'User Choice')
    )
  })
  remaining += Math.max(0, capacity - manualNames.length)
  for (const name of manualNames) {
    addAction(name, {
      id: 'legacy:remove',
      ownerId: 'legacy',
      kind: 'legacy',
      adding: false,
      label: 'Remove earlier manual choice',
    })
    rows.push({
      category: 'Expertise',
      itemName: name,
      attribution: 'manual',
      sourceTypes: ['manual'],
      isPending: false,
    })
  }
  if (capacity > manualNames.length)
    for (const name of effective.proficiencies.skills) {
      if (
        !effective.proficiencies.expertise.some(
          (skill) => normalizeKey(skill) === normalizeKey(name),
        )
      )
        addAction(name, {
          id: 'legacy:add',
          ownerId: 'legacy',
          kind: 'legacy',
          adding: true,
          label: 'Use remaining class Expertise allowance (legacy)',
        })
    }
  for (const [name, tags] of Object.entries(effective.provenance.proficiencies.expertise ?? {}))
    for (const tag of tags) {
      if (
        tag.sourceType === 'manual' ||
        classOwners.some((owner) => tag.grantVariant === owner.id) ||
        featOwners.some((owner) => isSameGrantSource(tag, getFeatOptionSourceTag(owner.target)))
      )
        continue
      rows.push({
        category: 'Expertise',
        itemName: name,
        attribution: formatSourceType(tag.sourceType),
        sourceTypes: [tag.sourceType],
        isPending: false,
      })
    }
  for (const [name, tags] of Object.entries(saved.provenance.proficiencies.expertise ?? {}))
    for (const tag of tags.filter(isFixedProficiencyTag))
      if (
        !(effective.provenance.proficiencies.expertise?.[name] ?? []).some(
          (row) => row.grantVariant === tag.grantVariant,
        )
      )
        rows.push({
          category: 'Expertise',
          itemName: `${name} — retained, inactive`,
          attribution: formatSourceType(tag.sourceType),
          sourceTypes: [tag.sourceType],
          isPending: true,
        })
  return { effective, classOwners, featOwners, actions, remaining, rows }
}
