import { getClassChoiceSlotLevels } from '@/lib/5etools/classChoiceNormalization'
import { getCurrentDirectClassFeature } from '@/lib/5etools/directClassFeatureSource'
import { getFeatureSourceDigest, hasFeatureSourceShape } from '@/lib/5etools/featureSourceAudit'
import {
  isCurrentRevisedInvocationCantripPool,
  REVISED_INVOCATION_POOL,
} from '@/lib/5etools/warlockInvocationCantripSource'
import { inferRulesTextActionKind } from '@/lib/calculations/actions'
import type { ClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import {
  getClassChoiceCatalogOptionKey,
  getClassChoiceFeatureId,
} from '@/lib/character/classChoiceIdentity'
import {
  type ClassChoicePrerequisiteContext,
  getEffectiveClassChoiceFeatureRoutes,
} from '@/lib/character/effectiveClassChoiceFeatures'
import {
  getSavedRevisedInvocationOwner,
  hasEarnedRevisedInvocationSlots,
} from '@/lib/character/warlockInvocationChoices'
import { renderEntriesToText } from '@/lib/entryText'
import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import type { Class5e } from '@/types/5etools'
import type { CharacterAction } from '@/types/actions'
import type { Character } from '@/types/character'
import type { NormalizedCharacterChoice } from '@/types/classRules'

const classicPool = 'class:warlock|phb|choice:pact-boon|3'
const bladeName = 'Pact of the Blade'
const bladeKey = norm(bladeName)
const classicBoonBodies = new Set([
  '877e4f7f9031d43f944ad634450b3a2d53416c175cc82d3523276d52a96821c9',
  'e5e22664c6aa9206e74747503158ba7cc9db448175c607b391904f4e7b64fa43',
])
const classicBladeBodies = new Set([
  'dc33f57d36f69c12ae70da881d9a5e048a34ca3f83a0516ea4d47f07e0f57619',
  '9884982a7fcef230d73ccf4ebce7cf0bf4bcd4f20206f97ed6b0f7b7507f3ac2',
])
const revisedBladeBody = '695476794d60d9d271ff80fc309ae7b556c46af553cb6e35f0647bac224e0b94'
const bladeFields = new Set([
  'name',
  'source',
  'page',
  'srd',
  'srd52',
  'reprintedAs',
  'featureType',
  'entries',
])

interface PactBladeSheetRule {
  featureId: string
  actionId: string
  name: string
  source: string
  body?: string
}

function isCurrentClassicPactBoon(
  cls: Class5e,
  choice: NormalizedCharacterChoice,
  catalogs: ClassChoiceFeatureCatalogs,
) {
  const slots = getClassChoiceSlotLevels(choice)
  return (
    choice.kind === 'optional-feature' &&
    choice.level === 3 &&
    choice.owner.type === 'class' &&
    choice.source.kind === 'optional-feature-progression' &&
    choice.source.field === 'optionalfeatureProgression[1]' &&
    choice.optionFilter?.entityType === 'optionalFeature' &&
    choice.optionFilter.featureTypes?.length === 1 &&
    choice.optionFilter.featureTypes[0] === 'PB' &&
    slots.length === 1 &&
    slots[0] === 3 &&
    cls.normalizedRules?.choices.filter((row) => row.id === choice.id).length === 1 &&
    cls.optionalfeatureProgression?.filter((row) => row.featureType?.includes('PB')).length === 1 &&
    getFeatureSourceDigest([cls.optionalfeatureProgression[1]], false) ===
      '7202031bd5effaef428f8623d37b9e89a4e4526f9b3d564a8a611314dd1158be' &&
    !!getCurrentDirectClassFeature(
      cls,
      catalogs,
      'class-feature|pact boon|warlock|phb|3|phb',
      (row) =>
        Array.isArray(row.entries) &&
        classicBoonBodies.has(getFeatureSourceDigest(row.entries, false) ?? ''),
    )
  )
}

/** Project the current selected blade rule once for both the feature and PDF-only action paths. */
export function getPactOfTheBladeSheetRules(
  character: Character,
  catalogs: ClassChoiceFeatureCatalogs | undefined,
  prerequisites: ClassChoicePrerequisiteContext,
): PactBladeSheetRule[] {
  const selections = character.classChoiceSelections ?? []
  const picks = selections.flatMap((selection) => {
    const revised = selection.choiceId === REVISED_INVOCATION_POOL
    if (!revised && selection.choiceId !== classicPool) return []
    const source = revised ? 'xphb' : 'phb'
    if (
      norm(selection.className) !== 'warlock' ||
      norm(selection.classSource) !== source ||
      selection.subclassName ||
      selection.subclassSource
    )
      return []
    return selection.selected
      .filter((option) => norm(option.name) === bladeKey && norm(option.source) === source)
      .map((option) => ({ selection, option, source, revised }))
  })
  if (!picks.length) return []
  const routes = getEffectiveClassChoiceFeatureRoutes(character, catalogs, prerequisites)
  return picks.map(({ selection, option, source, revised }) => {
    const featureId = getClassChoiceFeatureId(selection, option)
    const rule = { featureId, actionId: `feature:${featureId}`, name: bladeName, source }
    const owners = character.classProgression.filter(
      (entry) => norm(entry.name) === 'warlock' && norm(entry.source) === source,
    )
    const classes = catalogs?.classes?.filter(
      (cls) => norm(cls.name) === 'warlock' && norm(cls.source) === source,
    )
    const cls = classes?.length === 1 ? classes[0] : undefined
    const route = routes.selectedOptions.find(
      (row) => row.selection === selection && row.option === option,
    )
    if (
      !catalogs ||
      !cls ||
      cls.sourceIdentityConflict ||
      '_copy' in cls ||
      owners.length !== 1 ||
      !route ||
      option.entityType !== 'optionalFeature' ||
      option.ref !== undefined ||
      option.invocationCantrip ||
      selections.filter((row) => row.choiceId === selection.choiceId).length !== 1
    )
      return rule
    const earned = revised
      ? isCurrentRevisedInvocationCantripPool(route.choice, catalogs) &&
        !!getSavedRevisedInvocationOwner(character, selection) &&
        hasEarnedRevisedInvocationSlots(route.choice, selection.selected, owners[0].levels)
      : selection.selected.length === 1 &&
        option.slotLevel === 3 &&
        isCurrentClassicPactBoon(cls, route.choice, catalogs)
    if (!earned) return rule

    const target = getClassChoiceCatalogOptionKey(option)
    const candidates = catalogs.optionalFeatureCandidates
      ? (catalogs.optionalFeatureCandidates.get(target) ?? [])
      : (catalogs.optionalFeatures ?? []).filter(
          (row) => norm(row.name) === bladeKey && norm(row.source) === source,
        )
    const leaf = candidates.length === 1 ? candidates[0] : undefined
    if (
      !leaf ||
      norm(leaf.name) !== bladeKey ||
      norm(leaf.source) !== source ||
      !hasFeatureSourceShape(leaf, bladeFields) ||
      !Array.isArray(leaf.featureType) ||
      leaf.featureType.length !== 1 ||
      leaf.featureType[0] !== (revised ? 'EI' : 'PB') ||
      !Array.isArray(leaf.entries)
    )
      return rule
    const digest = getFeatureSourceDigest(leaf.entries, false)
    return (revised ? digest === revisedBladeBody : classicBladeBodies.has(digest ?? ''))
      ? { ...rule, body: renderEntriesToText(leaf.entries) }
      : rule
  })
}

/** Preserve the action slot and keep a manual action's independent identity. */
export function withPactOfTheBladeSheetActions(
  actions: CharacterAction[],
  rules: readonly PactBladeSheetRule[],
): CharacterAction[] {
  if (!rules.length) return actions
  const byId = new Map(actions.map((action) => [action.id, action]))
  for (const { actionId, name, body, source } of rules) {
    const current = byId.get(actionId)
    if (current && (current.source.kind !== 'class' || norm(current.source.source) !== source))
      continue
    const kind = body && inferRulesTextActionKind(body)
    if (body && kind) {
      byId.set(actionId, {
        id: actionId,
        name,
        kind,
        description: body,
        source: { kind: 'class', name, source: source.toUpperCase() },
        active: true,
      })
    } else {
      byId.delete(actionId)
    }
  }
  return [...byId.values()]
}
