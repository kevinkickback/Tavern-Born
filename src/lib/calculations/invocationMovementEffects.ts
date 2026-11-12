import { findClassReference } from '@/lib/5etools/classReference'
import {
  getCurrentSelectedClass,
  permitsClassRuleSource,
} from '@/lib/5etools/earnedClassFeatureSource'
import { isRevisedInvocationSelection } from '@/lib/5etools/warlockInvocationCantripSource'
import {
  getInvocationLeaf,
  isInvocationPool,
  isInvocationPoolId,
} from '@/lib/character/atWillInvocationRules'
import type { ClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import { getClassChoiceFeatureId } from '@/lib/character/classChoiceIdentity'
import { getDeclaredInvocationLeaf } from '@/lib/character/declaredInvocationPrerequisites'
import {
  type ClassChoicePrerequisiteContext,
  getEffectiveClassChoiceFeatureRoutes,
} from '@/lib/character/effectiveClassChoiceFeatures'
import type { Character } from '@/types/character'
import type { CharacterEffect } from '@/types/effects'
import { getEffectiveCharacterMovement, getWalkingSpeed } from './movement'

const swimming =
  /^You can breathe underwater, and you gain a (?:swimming speed equal to your walking speed|\{@variantrule Swim Speed\|XPHB\} equal to your \{@variantrule Speed\|XPHB\})\.$/

/** The passive belongs to the earned invocation even if its separate spell becomes unavailable. */
export function deriveInvocationMovementEffects(
  character: Character,
  catalogs: ClassChoiceFeatureCatalogs | undefined,
  prerequisites: ClassChoicePrerequisiteContext,
  precedingEffects: readonly CharacterEffect[],
): CharacterEffect[] {
  const selections = character.classChoiceSelections ?? []
  if (!selections.some(({ choiceId }) => isInvocationPoolId(choiceId))) return []
  const earned = getEffectiveClassChoiceFeatureRoutes(
    character,
    catalogs,
    prerequisites,
  ).selectedOptions.flatMap(({ choice, selection, option, ambiguousInvocationPool }) => {
    if (
      !isInvocationPool(choice) ||
      ambiguousInvocationPool ||
      selections.filter(({ choiceId }) => choiceId === selection.choiceId).length !== 1 ||
      !permitsClassRuleSource(character, option.source)
    )
      return []
    const owner = findClassReference(choice.owner, character.classProgression)
    if (!owner || !getCurrentSelectedClass(character, owner, catalogs)) return []
    const feature = isRevisedInvocationSelection(selection)
      ? getDeclaredInvocationLeaf(choice, option, catalogs)
      : getInvocationLeaf(option, catalogs)?.feature
    return Array.isArray(feature?.entries) &&
      feature.entries.some((entry) => typeof entry === 'string' && swimming.test(entry))
      ? [{ id: getClassChoiceFeatureId(selection, option), feature }]
      : []
  })
  if (!earned.length) return []
  const walk = getWalkingSpeed(getEffectiveCharacterMovement(character, precedingEffects))
  return earned.map(({ id, feature }) => ({
    id: id + ':swim',
    label: feature.name,
    source: { kind: 'class', name: feature.name, source: feature.source, entityId: id },
    target: { kind: 'speed', mode: 'swim' },
    operation: { kind: 'minimum', value: walk },
  }))
}
