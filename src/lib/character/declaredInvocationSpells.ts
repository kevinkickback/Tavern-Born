import { readDeclaredInvocationCast } from '@/lib/5etools/declaredInvocationCasting'
import {
  getCurrentSelectedClass,
  permitsClassRuleSource,
} from '@/lib/5etools/earnedClassFeatureSource'
import { resolveSpellReference } from '@/lib/5etools/spellResolvers'
import { auditSpellRouteMultiplicity } from '@/lib/5etools/spellRouteSources'
import { isRevisedInvocationSelection } from '@/lib/5etools/warlockInvocationCantripSource'
import { toAbilityName } from '@/lib/calculations/abilityNames'
import { getSpellReferenceKey } from '@/lib/calculations/spellIdentity'
import { toClassProfileId } from '@/lib/calculations/spellProfiles.constants'
import { renderEntriesToText } from '@/lib/entryText'
import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import type { Spell5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import type { ClassChoiceFeatureCatalogs } from './classChoiceFeatureCatalogs'
import { getClassChoiceFeatureId } from './classChoiceIdentity'
import { getDeclaredInvocationLeaf } from './declaredInvocationPrerequisites'
import {
  type ClassChoicePrerequisiteContext,
  getEffectiveClassChoiceFeatureRoutes,
} from './effectiveClassChoiceFeatures'
import type { ClassFixedSpellStatus } from './optionalClassFixedSpells'
import {
  getSavedRevisedInvocationOwner,
  hasEarnedRevisedInvocationSlots,
} from './warlockInvocationChoices'

/** Project authored Invocation spells after resolving choices, without saving another owner or slot. */
export function projectDeclaredInvocationSpells(
  character: Character,
  catalogs: ClassChoiceFeatureCatalogs | undefined,
  prerequisites: ClassChoicePrerequisiteContext,
  spellsByKey: Readonly<Record<string, Spell5e>> | undefined,
) {
  const statuses: ClassFixedSpellStatus[] = []
  if (!character.classChoiceSelections?.some(isRevisedInvocationSelection))
    return { character, statuses }

  let profiles = character.spells.spellProfiles
  const routes = getEffectiveClassChoiceFeatureRoutes(character, catalogs, prerequisites)
  for (const { choice, selection, option, ambiguousInvocationPool } of routes.selectedOptions) {
    if (
      !isRevisedInvocationSelection(selection) ||
      ambiguousInvocationPool ||
      !permitsClassRuleSource(character, option.source) ||
      !permitsClassRuleSource(character, 'XPHB')
    )
      continue
    const feature = getDeclaredInvocationLeaf(choice, option, catalogs)
    const cast = readDeclaredInvocationCast(feature)
    if (!feature || !cast) continue
    const owner = getSavedRevisedInvocationOwner(character, selection)
    const cls = owner && getCurrentSelectedClass(character, owner, catalogs)
    if (
      !owner ||
      !cls ||
      !hasEarnedRevisedInvocationSlots(choice, selection.selected, owner.levels)
    )
      continue
    const reference = getSpellReferenceKey(cast.reference)
    const resolved = resolveSpellReference(cast.reference, spellsByKey ?? {})
    const spell = resolved && auditSpellRouteMultiplicity([resolved])[0]
    const abilityMatches = toAbilityName(cls.spellcastingAbility ?? '') === cast.ability
    const available =
      abilityMatches &&
      !!spell &&
      Number.isInteger(spell.level) &&
      spell.level > 0 &&
      spell.level <= 9 &&
      getSpellReferenceKey(spell.name, spell.source) === reference &&
      permitsClassRuleSource(character, spell.source) &&
      !spell.classSpellRouteDiagnostics?.length
    statuses.push({
      owner: ['class', norm(owner.name), norm(owner.source)],
      target: getClassChoiceFeatureId(selection, option),
      featureName: feature.name,
      reference: cast.reference,
      level: option.slotLevel,
      active: available,
      prepared: false,
      castOnly: cast.learned ? { castingTime: 'Magic Action' } : {},
      ...(available
        ? {
            castingNote: `${feature.name} (${feature.source}) — ${renderEntriesToText([cast.rules]).replace(/\s+([,.])/g, '$1')}`,
          }
        : {
            reason: abilityMatches
              ? 'Restore the exact spell printing from enabled content.'
              : 'Restore the Invocation’s declared class casting ability.',
          }),
    })
    if (available && cast.learned) {
      const id = toClassProfileId(owner.name, owner.source)
      profiles = profiles.map((profile) =>
        profile.id === id &&
        !profile.spellsKnown.some((spell) => getSpellReferenceKey(spell) === reference)
          ? {
              ...profile,
              spellsKnown: [...profile.spellsKnown, cast.reference],
              fixedSpells: [...(profile.fixedSpells ?? []), cast.reference],
            }
          : profile,
      )
    }
  }
  return {
    character:
      profiles === character.spells.spellProfiles
        ? character
        : { ...character, spells: { ...character.spells, spellProfiles: profiles } },
    statuses,
  }
}
