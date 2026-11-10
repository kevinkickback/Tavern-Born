import { resolveSpellReference } from '@/lib/5etools/spellResolvers'
import { auditSpellRouteMultiplicity } from '@/lib/5etools/spellRouteSources'
import { getSpellReferenceKey } from '@/lib/calculations/spellIdentity'
import { toClassProfileId } from '@/lib/calculations/spellProfiles.constants'
import { renderEntriesToText } from '@/lib/entryText'
import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import type { Spell5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import { isInvocationPoolId } from './atWillInvocationRules'
import type { ClassChoiceFeatureCatalogs } from './classChoiceFeatureCatalogs'
import { permitted, sources } from './classSpellAuthority'
import {
  type ClassChoicePrerequisiteContext,
  getEffectiveClassChoiceFeatureRoutes,
} from './effectiveClassChoiceFeatures'

export interface AtWillInvocationSpellStatus {
  id: string
  profileId: string
  featureName: string
  reference: string
  rules: string
  spell?: Spell5e
  reason?: string
}

/** These references are independent of ordinary learned spells, Pact slots and prerequisites. */
export function getAtWillInvocationSpellStatuses(
  character: Character,
  catalogs: ClassChoiceFeatureCatalogs | undefined,
  prerequisites: ClassChoicePrerequisiteContext,
  spellsByKey: Readonly<Record<string, Spell5e>> | undefined,
): AtWillInvocationSpellStatus[] {
  if (!character.classChoiceSelections?.some(({ choiceId }) => isInvocationPoolId(choiceId)))
    return []

  const allowed = sources(character)
  return getEffectiveClassChoiceFeatureRoutes(
    character,
    catalogs,
    prerequisites,
  ).selectedOptions.flatMap(
    ({ atWillInvocation: contract, ambiguousInvocationPool, selection, option }) => {
      if (!contract || !permitted(allowed, selection.classSource)) return []
      if (
        character.classChoiceSelections?.filter((row) => row.choiceId === selection.choiceId)
          .length !== 1
      )
        return []
      const matchesOwner = (row: { name: string; source: string }) =>
        norm(row.name) === norm(selection.className) &&
        norm(row.source) === norm(selection.classSource)
      const owners = character.classProgression.filter(matchesOwner)
      const owner = owners.length === 1 ? owners[0] : undefined
      if (!owner) return []
      const currentOwners = catalogs?.classes?.filter(matchesOwner) ?? []
      const uniqueClass = currentOwners.length === 1 && !currentOwners[0].sourceIdentityConflict
      const sourceIssue = !uniqueClass
        ? 'Restore a single exact Warlock class declaration.'
        : ambiguousInvocationPool
          ? 'Restore a single exact Eldritch Invocations declaration.'
          : undefined
      const resolved = !sourceIssue
        ? resolveSpellReference(contract.reference, spellsByKey ?? {})
        : undefined
      const spell = resolved ? auditSpellRouteMultiplicity([resolved])[0] : undefined
      const exactSpell =
        spell?.level === 1 &&
        permitted(allowed, spell.source) &&
        getSpellReferenceKey(spell.name, spell.source) ===
          getSpellReferenceKey(contract.grant.spellName) &&
        (spell.classSpellRouteDiagnostics?.length ?? 0) === 0
          ? spell
          : undefined
      return [
        {
          id: JSON.stringify([selection.choiceId, contract.target, option.slotLevel]),
          profileId: toClassProfileId(owner.name, owner.source),
          featureName: contract.feature.name,
          reference: contract.reference,
          rules: renderEntriesToText(contract.feature.entries),
          spell: exactSpell,
          reason: sourceIssue,
        },
      ]
    },
  )
}
