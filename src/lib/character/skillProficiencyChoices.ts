import { decodeProficiencyOption } from '@/lib/5etools/classProficiencyIdentity'
import { normalizeKey } from '@/lib/provenance'
import type { ProvenanceLedger, SourceRow } from '@/lib/provenance/types'
import type { Character } from '@/types/character'
import { getClassChoiceOptionKey, isClassChoiceOptionEligible } from './classChoiceOptions'
import { refreshClassProficiencyState } from './classProficiencySelections'
import { getClassProficiencyWorkflow } from './classProficiencyWorkflow'
import type { ExpertiseAuthority } from './skillExpertiseChoices'

export interface SkillProficiencyAction {
  id: string
  ownerId: string
  kind: 'class' | 'ledger'
  adding: boolean
  label: string
}

/** Actual ledger choices and class-owned skill choices share a control, never a saved record. */
export function getSkillProficiencyChoices(
  character: Character,
  authority: ExpertiseAuthority,
  ledger: ProvenanceLedger = character.provenance,
) {
  const catalogs = { ...authority.catalogs, featExpertiseFeats: authority.feats }
  const effective = refreshClassProficiencyState(
    { ...character, provenance: ledger },
    authority.classes,
    catalogs,
  )
  const classOwners = getClassProficiencyWorkflow(character, authority.classes, catalogs).filter(
    (row) => row.domain === 'skills',
  )
  const actions: Record<string, SkillProficiencyAction[]> = {}
  const rows: SourceRow[] = []
  let remaining = 0
  const add = (name: string, action: SkillProficiencyAction) => {
    const key = normalizeKey(name)
    if (!actions[key]) actions[key] = []
    actions[key].push(action)
  }
  const names = [
    ...new Set(
      (catalogs.skills ?? []).flatMap((skill) =>
        skill && typeof skill === 'object' && 'name' in skill && typeof skill.name === 'string'
          ? [normalizeKey(skill.name)]
          : [],
      ),
    ),
  ]
  for (const owner of ledger.choices.filter((row) => row.domain === 'skills')) {
    const label = `${owner.sourceTag.sourceName} — ${owner.sourceTag.sourceType}`
    for (const name of owner.selected)
      add(name, {
        id: `ledger:remove:${owner.id}`,
        ownerId: owner.id,
        kind: 'ledger',
        adding: false,
        label: `Remove from ${label}`,
      })
    if (owner.selected.length < owner.chooseCount)
      for (const name of names) {
        if (
          effective.proficiencies.skills.some(
            (skill) => normalizeKey(skill) === normalizeKey(name),
          ) ||
          (owner.optionPool.length &&
            !owner.optionPool.some((skill) => normalizeKey(skill) === normalizeKey(name)))
        )
          continue
        add(name, {
          id: `ledger:add:${owner.id}`,
          ownerId: owner.id,
          kind: 'ledger',
          adding: true,
          label: `Use ${label}`,
        })
      }
  }
  for (const owner of classOwners) {
    const label = `${owner.label} — ${owner.subclassName ?? owner.className} (${owner.subclassSource ?? owner.classSource}), level ${owner.level}`
    const selected = owner.selection?.selected ?? []
    const eligible = owner.options.filter(isClassChoiceOptionEligible)
    const quota = owner.choice?.maximumSelections ?? selected.length
    if (owner.choice) remaining += Math.max(0, quota - selected.length)
    for (const pick of selected) {
      const target = decodeProficiencyOption(pick)
      if (!target) continue
      add(target.name, {
        id: `class:remove:${owner.id}`,
        ownerId: owner.id,
        kind: 'class',
        adding: false,
        label: `Remove from ${label}`,
      })
      const applied = (effective.provenance.proficiencies.skills[target.name] ?? []).some(
        (tag) => tag.grantVariant === owner.id,
      )
      if (!applied)
        rows.push({
          category: 'Skills',
          itemName: `${pick.name} — retained, inactive`,
          attribution: owner.subclassName ? 'subclass' : 'class',
          sourceTypes: [owner.subclassName ? 'subclass' : 'class'],
          isPending: true,
        })
    }
    if (
      owner.choice &&
      selected.length < quota &&
      selected.every((pick) =>
        eligible.some(
          (option) => getClassChoiceOptionKey(option.reference) === getClassChoiceOptionKey(pick),
        ),
      )
    )
      for (const option of eligible) {
        const target = decodeProficiencyOption(option.reference)
        if (!target || selected.some((pick) => decodeProficiencyOption(pick)?.name === target.name))
          continue
        add(target.name, {
          id: `class:add:${owner.id}`,
          ownerId: owner.id,
          kind: 'class',
          adding: true,
          label: `Use ${label}`,
        })
      }
    if (owner.choice && selected.length < quota)
      rows.push({
        category: 'Skills',
        itemName: `${owner.label}, level ${owner.level}: ${quota - selected.length} choice(s) remaining`,
        attribution: owner.subclassName ? 'subclass' : 'class',
        sourceTypes: [owner.subclassName ? 'subclass' : 'class'],
        isPending: true,
      })
  }
  return { classOwners, actions, rows, remaining }
}
