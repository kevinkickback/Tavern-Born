import { REVISED_INVOCATION_POOL } from '@/lib/5etools/warlockInvocationCantripSource'
import { inferRulesTextActionKind } from '@/lib/calculations/actions'
import type { ClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import { getClassChoiceFeatureId } from '@/lib/character/classChoiceIdentity'
import {
  type ClassChoicePrerequisiteContext,
  getEffectiveClassChoiceFeatureRoutes,
} from '@/lib/character/effectiveClassChoiceFeatures'
import {
  CLASSIC_PACT_BOON_POOL,
  getCurrentPactBladeState,
  PACT_BLADE_NAME,
} from '@/lib/character/warlockInvocationSource'
import { renderEntriesToText } from '@/lib/entryText'
import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import type { CharacterAction } from '@/types/actions'
import type { Character } from '@/types/character'

interface PactBladeSheetRule {
  featureId: string
  actionId: string
  name: string
  source: string
  body?: string
}

/** Project the current selected blade rule once for both the feature and PDF-only action paths. */
export function getPactOfTheBladeSheetRules(
  character: Character,
  catalogs: ClassChoiceFeatureCatalogs | undefined,
  prerequisites: ClassChoicePrerequisiteContext,
): PactBladeSheetRule[] {
  const picks = (character.classChoiceSelections ?? []).flatMap((selection) => {
    const revised = selection.choiceId === REVISED_INVOCATION_POOL
    if (!revised && selection.choiceId !== CLASSIC_PACT_BOON_POOL) return []
    const source = revised ? ('xphb' as const) : ('phb' as const)
    if (
      norm(selection.className) !== 'warlock' ||
      norm(selection.classSource) !== source ||
      selection.subclassName ||
      selection.subclassSource
    )
      return []
    return selection.selected
      .filter(
        (option) => norm(option.name) === norm(PACT_BLADE_NAME) && norm(option.source) === source,
      )
      .map((option) => ({ selection, option, source }))
  })
  if (!picks.length) return []
  const routes = getEffectiveClassChoiceFeatureRoutes(character, catalogs, prerequisites)
  return picks.map(({ selection, option, source }) => {
    const featureId = getClassChoiceFeatureId(selection, option)
    const rule = { featureId, actionId: `feature:${featureId}`, name: PACT_BLADE_NAME, source }
    const pact = getCurrentPactBladeState(character, catalogs, source)
    return pact?.selection === selection &&
      pact.option === option &&
      routes.selectedOptions.some((row) => row.selection === selection && row.option === option)
      ? { ...rule, body: renderEntriesToText(pact.entries) }
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
