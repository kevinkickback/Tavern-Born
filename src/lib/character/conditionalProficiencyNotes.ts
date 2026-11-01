import {
  getRequiredChoiceSelectionCount,
  normalizeSubclassRules,
} from '@/lib/5etools/classChoiceNormalization'
import {
  CONDITIONAL_PROFICIENCY_RULES,
  type ConditionalProficiencyRule,
} from '@/lib/5etools/conditionalProficiencyRules'
import { getConditionalOptionalSources } from '@/lib/5etools/conditionalProficiencySource'
import { buildClassLookup } from '@/lib/5etools/lookups'
import { decodeNaturalExplorerChoiceId } from '@/lib/5etools/naturalExplorerIdentity'
import {
  getSubclassProficiencyOwner,
  subclassProficiencyDigest,
} from '@/lib/5etools/subclassProficiencyCertificates'
import { getCurrentSubclassProficiencyCertificate } from '@/lib/5etools/subclassProficiencySource'
import { buildPrerequisiteSnapshot, checkAllPrerequisites } from '@/lib/calculations/prerequisites'
import type { Class5e, Subclass5e } from '@/types/5etools'
import type {
  AbilityScores,
  Character,
  CharacterClassChoiceSelection,
  SpellProfile,
} from '@/types/character'
import type { NormalizedCharacterChoice } from '@/types/classRules'
import type { CharacterEffect } from '@/types/effects'
import {
  type ClassChoiceFeatureCatalogs,
  scopeClassChoiceFeatureCatalogs,
} from './classChoiceFeatureCatalogs'
import { getClassChoiceOptionKey, getFeatureOwnerKey } from './classChoiceIdentity'
import {
  createClassChoiceCatalogs,
  getClassChoiceCandidates,
  resolveClassChoiceOptions,
} from './classChoiceOptions'
import { getNaturalExplorerSelectionStates } from './naturalExplorerSelections'

const key = (parts: readonly string[]) =>
  JSON.stringify(parts.map((part) => part.trim().toLowerCase()))
const same = (left: unknown, right: unknown) =>
  subclassProficiencyDigest(left) === subclassProficiencyDigest(right)
interface CurrentConditionalOwner {
  owner: string[]
  cls: Class5e
  sub: Subclass5e
  rule: ConditionalProficiencyRule
  level: number
  choice?: NormalizedCharacterChoice
}
interface CurrentConditionalSources {
  owners: CurrentConditionalOwner[]
  classLookup: ReturnType<typeof buildClassLookup>
}
const cache = new WeakMap<ClassChoiceFeatureCatalogs, CurrentConditionalSources>()
/** Hash and traverse each immutable current catalog once, independently of character selection. */
function getCurrentOwners(catalogs: ClassChoiceFeatureCatalogs): CurrentConditionalSources {
  const old = cache.get(catalogs)
  if (old) return old
  const result: CurrentConditionalOwner[] = []
  const classes = catalogs.classes ?? []
  for (const cls of classes) {
    if (
      classes.filter((row) => key([row.name, row.source]) === key([cls.name, cls.source]))
        .length !== 1
    )
      continue
    for (const sub of cls.subclasses ?? []) {
      const owner = getSubclassProficiencyOwner(sub)
      if (
        !owner ||
        (cls.subclasses ?? []).filter((row) => same(getSubclassProficiencyOwner(row), owner))
          .length !== 1
      )
        continue
      const scoped = scopeClassChoiceFeatureCatalogs(
        catalogs,
        getFeatureOwnerKey(cls.name, cls.source, sub.name, sub.source),
      )
      if (!catalogs.subclassTargets || !scoped.subclassFeatureCandidates) continue
      const certificate = getCurrentSubclassProficiencyCertificate(
        cls,
        sub,
        scoped.subclassFeatureCandidates,
      )
      for (const path of certificate?.paths ?? []) {
        const rule = CONDITIONAL_PROFICIENCY_RULES.find(
          (row) => row.target === path.target && row.family !== 'favored-terrain',
        )
        if (!rule) continue
        let choice: NormalizedCharacterChoice | undefined
        if (rule.family === 'fire-rune') {
          if (
            !rule.optionalTarget ||
            !getConditionalOptionalSources(catalogs).get(rule.optionalTarget)
          )
            continue
          const indices = (sub.optionalfeatureProgression ?? []).flatMap((row, index) =>
            same(row, rule.progression) ? [index] : [],
          )
          if (indices.length !== 1) continue
          const canonical = normalizeSubclassRules(
            cls,
            sub,
            sub.subclassFeatureRefs ?? [],
          ).choices.filter(
            (row) =>
              row.kind === 'optional-feature' &&
              row.source.kind === 'optional-feature-progression' &&
              row.source.field === `optionalfeatureProgression[${indices[0]}]`,
          )
          if (canonical.length !== 1) continue
          const current = getClassChoiceCandidates(cls, sub, catalogs).filter(
            (row) => row.id === canonical[0].id,
          )
          if (current.length !== 1 || !same(current[0], canonical[0])) continue
          choice = canonical[0]
        }
        result.push({ owner, cls, sub, rule, level: path.level, choice })
      }
    }
  }
  const sources = { owners: result, classLookup: buildClassLookup([...classes]) }
  cache.set(catalogs, sources)
  return sources
}

function hasSelectedFire(
  character: Character,
  current: CurrentConditionalOwner,
  levels: number,
  catalogs: ClassChoiceFeatureCatalogs,
  classLookup: CurrentConditionalSources['classLookup'],
  effectiveAbilityScores?: Partial<AbilityScores>,
  effectiveSpellProfiles?: readonly SpellProfile[],
): CharacterClassChoiceSelection | undefined {
  const choice = current.choice
  if (!choice) return undefined
  const rows = (character.classChoiceSelections ?? []).filter((row) => row.choiceId === choice.id)
  if (rows.length !== 1) return undefined
  const selection = rows[0]
  if (
    selection.inactive ||
    selection.kind !== choice.kind ||
    selection.classLevel !== choice.level ||
    key([
      selection.className,
      selection.classSource,
      selection.subclassName ?? '',
      selection.subclassSource ?? '',
    ]) !== key(current.owner)
  )
    return undefined
  const count = getRequiredChoiceSelectionCount(choice, levels)
  const keys = selection.selected.map(getClassChoiceOptionKey)
  if (
    selection.selected.length > count ||
    new Set(keys).size !== keys.length ||
    !keys.includes(current.rule.optionalTarget!)
  )
    return undefined
  const slots: number[] = []
  let previous = 0
  choice.selectionCountByLevel.slice(0, levels).forEach((total, index) => {
    for (let gain = previous; gain < total; gain++) slots.push(index + 1)
    previous = total
  })
  const views = resolveClassChoiceOptions(
    choice,
    createClassChoiceCatalogs(catalogs),
    selection.selected,
    levels,
    character,
  )
  const snapshot = buildPrerequisiteSnapshot({
    character,
    classLookup,
    effectiveAbilityScores,
    effectiveSpellProfiles,
    classChoiceFeatureCatalogs: catalogs,
  })
  for (const option of selection.selected) {
    const slot = slots.indexOf(option.slotLevel)
    const view = views.find(
      (view) =>
        view.availability === 'eligible' &&
        getClassChoiceOptionKey(view.reference) === getClassChoiceOptionKey(option),
    )
    if (
      slot < 0 ||
      option.entityType !== 'optionalFeature' ||
      !option.source?.trim() ||
      option.ref ||
      !view ||
      !checkAllPrerequisites(view, snapshot, {
        className: current.cls.name,
        classSource: current.cls.source,
      }).met
    )
      return undefined
    slots.splice(slot, 1)
  }
  return selection
}

function declaration(
  owner: readonly string[],
  rule: ConditionalProficiencyRule,
  label: string,
  source: CharacterEffect['source'],
): CharacterEffect {
  return {
    id: `proficiency-check-note:${encodeURIComponent(JSON.stringify([owner, rule.target, rule.family, rule.optionalTarget ?? (rule.family === 'favored-terrain' ? 'favored-terrain' : 'proficiency')]))}`,
    label,
    source,
    target: {
      kind: 'proficiency-check-note',
      proficiencyType: rule.proficiencyType,
      ...(rule.abilities ? { abilities: rule.abilities } : {}),
    },
    operation: { kind: 'conditional-note', note: rule.note },
  }
}

/** Qualified player-applied check rules; these never grant proficiency or alter a numeric check. */
export function deriveConditionalProficiencyNotes(
  character: Character,
  catalogs?: ClassChoiceFeatureCatalogs,
  effectiveAbilityScores?: Partial<AbilityScores>,
  effectiveSpellProfiles?: readonly SpellProfile[],
): CharacterEffect[] {
  if (!catalogs) return []
  const effects: CharacterEffect[] = []
  const sources = getCurrentOwners(catalogs)
  for (const current of sources.owners) {
    const parents = character.classProgression.filter(
      (row) => key([row.name, row.source]) === key(current.owner.slice(0, 2)),
    )
    if (parents.length !== 1) continue
    const selected = parents[0]
    if (
      key([
        selected.name,
        selected.source,
        selected.subclass ?? '',
        selected.subclassSource ?? '',
      ]) !== key(current.owner) ||
      selected.levels < current.level
    )
      continue
    const selection =
      current.rule.family === 'fire-rune'
        ? hasSelectedFire(
            character,
            current,
            selected.levels,
            catalogs,
            sources.classLookup,
            effectiveAbilityScores,
            effectiveSpellProfiles,
          )
        : undefined
    if (current.rule.family === 'fire-rune' && !selection) continue
    effects.push(
      declaration(current.owner, current.rule, `${current.rule.name} — ${current.sub.name}`, {
        kind: 'subclass',
        name: current.sub.name,
        source: current.sub.source,
        entityId: current.rule.target,
        ...(selection
          ? {
              provenance: {
                choiceId: selection.choiceId,
                grantVariant: current.rule.optionalTarget,
              },
            }
          : {}),
      }),
    )
  }
  const terrainRule = CONDITIONAL_PROFICIENCY_RULES.find((row) => row.family === 'favored-terrain')
  if (!terrainRule) return effects
  const groups = new Map<
    string,
    { owner: string[]; terrains: { gain: number; name: string; choiceId: string }[] }
  >()
  for (const state of getNaturalExplorerSelectionStates(
    character,
    catalogs.classes ?? [],
    catalogs,
  )) {
    const relation = decodeNaturalExplorerChoiceId(state.selection.choiceId)
    if (!relation || state.selection.inactive) continue
    if (
      character.classProgression.filter(
        (row) => key([row.name, row.source]) === key(relation.owner.slice(0, 2)),
      ).length !== 1 ||
      (catalogs.classes ?? []).filter(
        (row) => key([row.name, row.source]) === key(relation.owner.slice(0, 2)),
      ).length !== 1
    )
      continue
    const family = JSON.stringify([relation.owner, relation.pool, relation.group])
    const row = groups.get(family) ?? { owner: relation.owner, terrains: [] }
    row.terrains.push(
      ...state.details
        .filter((detail) => detail.available)
        .map((detail) => ({
          gain: state.selection.classLevel,
          name: detail.name,
          choiceId: state.selection.choiceId,
        })),
    )
    groups.set(family, row)
  }
  for (const { owner, terrains } of groups.values()) {
    if (!terrains.length) continue
    const names = terrains.map((row) => row.name).join(', ')
    effects.push(
      declaration(owner, terrainRule, `${terrainRule.name} — ${names}`, {
        kind: 'class',
        name: terrainRule.className,
        source: terrainRule.classSource,
        entityId: terrainRule.target,
        provenance: { choiceId: terrains[0].choiceId, grantVariant: JSON.stringify(terrains) },
      }),
    )
  }
  return effects
}
