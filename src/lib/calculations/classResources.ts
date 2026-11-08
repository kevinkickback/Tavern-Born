import { CLASSIC_WILD_SHAPE_RESOURCE_ID, isClassicDruid } from '@/lib/5etools/archdruidSource'
import { getArtificerClassResources } from '@/lib/5etools/artificerJourneyRules'
import { hasCurrentWarriorOfTheGods } from '@/lib/5etools/barbarianJourneySources'
import { getClassResourceDefs } from '@/lib/5etools/classData'
import { findClassReference } from '@/lib/5etools/classReference'
import {
  formatClassResourceRecovery,
  getClassResourceRecoveryAtLevel,
} from '@/lib/5etools/classRuleNormalization'
import { getFighterSubclassResources } from '@/lib/5etools/fighterSubclassResources'
import { getFighterSuperiorityDice } from '@/lib/5etools/fighterSuperiorityDice'
import { getCurrentMonkBaseRules, getMonkBaseResources } from '@/lib/5etools/monkBaseRules'
import { getMonkSubclassResources } from '@/lib/5etools/monkSubclassRules'
import {
  getCurrentNativeWarlockPatronRules,
  getNativeHealingLightOwner,
  HEALING_LIGHT_RESOURCE_ID,
  HEALING_LIGHT_RULE_DIGEST,
  HEALING_LIGHT_TARGET,
} from '@/lib/5etools/nativeWarlockPatronRules'
import { getCurrentRangerFeatures } from '@/lib/5etools/rangerFeatureSource'
import { getRangerJourneyResources } from '@/lib/5etools/rangerResources'
import { getRogueJourneyResources } from '@/lib/5etools/rogueJourneyResources'
import {
  getCurrentNativeSorcerer,
  getSorcererResourceDefs,
  isNativeSorcerer,
} from '@/lib/5etools/sorcererSource'
import type { ClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import { getTotalCharacterLevel } from '@/lib/characterUtils'
import type { Class5e } from '@/types/5etools'
import type { AbilityScores, Character, CharacterClassEntry } from '@/types/character'
import type { ClassResourceDef } from '@/types/classRules'
import type { CharacterEffect } from '@/types/effects'
import { type EffectResolutionContext, resolveNumericEffect } from './effects'
import { getProficiencyBonus } from './gameRules'

const healingLight: ClassResourceDef = {
  id: HEALING_LIGHT_RESOURCE_ID,
  label: 'Healing Light',
  maxPerLevel: Array.from({ length: 20 }, (_, index) => index + 2),
  restType: 'long',
}

export const WARRIOR_OF_THE_GODS_RESOURCE_ID = 'barbarian-xphb-zealot-warrior-of-the-gods'
const warriorOfTheGods: ClassResourceDef = {
  id: WARRIOR_OF_THE_GODS_RESOURCE_ID,
  label: 'Warrior of the Gods (d12s)',
  maxPerLevel: Array.from({ length: 20 }, (_, index) =>
    index < 2 ? 0 : 4 + Number(index >= 5) + Number(index >= 11) + Number(index >= 16),
  ),
  restType: 'long',
}

function getCurrentResourceClass(
  character: Character,
  entry: CharacterClassEntry,
  catalogs?: ClassChoiceFeatureCatalogs,
) {
  if (
    character.originSystem !== '2024' ||
    !catalogs?.classes ||
    character.classProgression.filter((row) => findClassReference(entry, [row])).length !== 1
  )
    return undefined
  const current = catalogs.classes.filter((row) => findClassReference(entry, [row]))
  return current.length === 1 ? current[0] : undefined
}

/** Resolve one class resource's maximum from its rule definition and active effects. */
function getEffectiveClassResourceMaximum(
  definition: ClassResourceDef,
  levelIndex: number,
  charismaModifier: number,
  effects: readonly CharacterEffect[] = [],
  context: EffectResolutionContext = {},
): number {
  const baseMaximum =
    definition.maxFormula === 'cha-mod'
      ? Math.max(1, charismaModifier)
      : (definition.maxPerLevel[levelIndex] ?? 0)
  return Math.max(
    0,
    Math.trunc(
      resolveNumericEffect(
        baseMaximum,
        { kind: 'resource-maximum', resourceId: definition.id },
        effects,
        context,
      ).value,
    ),
  )
}

export function getCharacterClassResources(
  character: Character,
  resolveClass: (entry: CharacterClassEntry) => Class5e | undefined,
  options: {
    catalogs?: ClassChoiceFeatureCatalogs
    charismaModifier: number
    abilityModifiers?: AbilityScores
    effects?: readonly CharacterEffect[]
    effectContext?: EffectResolutionContext
    unlimitedWildShape: boolean
  },
) {
  const { catalogs } = options
  const currentSorcerer = getCurrentNativeSorcerer(character, catalogs)
  const stored = character.classResources ?? {}
  const healingDiceLimit = Math.max(1, options.charismaModifier)
  const proficiencyBonus = getProficiencyBonus(getTotalCharacterLevel(character))
  const monk = getCurrentMonkBaseRules(character, catalogs)
  const ranger = getCurrentRangerFeatures(character, catalogs)
  return character.classProgression.flatMap((entry) => {
    const level = entry.levels ?? 1
    const levelIndex = Math.max(0, Math.min(19, level - 1))
    const definitions = isNativeSorcerer(entry)
      ? currentSorcerer?.owner === entry
        ? getSorcererResourceDefs(currentSorcerer)
        : []
      : getClassResourceDefs(resolveClass(entry), level)
    const earned = [...definitions]
    earned.push(
      ...getArtificerClassResources(
        character,
        entry,
        catalogs,
        options.abilityModifiers?.intelligence,
      ),
    )
    if (monk?.owner === entry) earned.push(...getMonkBaseResources(monk))
    if (ranger?.owner === entry)
      earned.push(
        ...getRangerJourneyResources(
          ranger,
          options.abilityModifiers?.wisdom ?? 0,
          proficiencyBonus,
        ),
      )
    const current = getCurrentResourceClass(character, entry, catalogs)
    if (
      catalogs &&
      current &&
      getNativeHealingLightOwner(entry) &&
      getCurrentNativeWarlockPatronRules(current, entry, catalogs)?.getNestedFeature(
        HEALING_LIGHT_TARGET,
        HEALING_LIGHT_RULE_DIGEST,
      )
    )
      earned.push(healingLight)
    if (hasCurrentWarriorOfTheGods(current, entry)) earned.push(warriorOfTheGods)
    const superiority = getFighterSuperiorityDice(character, entry, catalogs?.classes)
    if (superiority) earned.push(superiority)
    earned.push(
      ...getFighterSubclassResources(
        character,
        entry,
        catalogs?.classes,
        options.abilityModifiers,
        proficiencyBonus,
      ),
      ...getMonkSubclassResources(
        character,
        entry,
        catalogs?.classes,
        options.abilityModifiers?.wisdom,
        proficiencyBonus,
      ),
      ...getRogueJourneyResources(
        character,
        entry,
        catalogs,
        options.abilityModifiers,
        proficiencyBonus,
      ),
    )
    return earned.flatMap((definition) => {
      if (
        options.unlimitedWildShape &&
        isClassicDruid(entry) &&
        definition.id === CLASSIC_WILD_SHAPE_RESOURCE_ID
      )
        return []
      const max = getEffectiveClassResourceMaximum(
        definition,
        levelIndex,
        options.charismaModifier,
        options.effects,
        options.effectContext,
      )
      const recovery = getClassResourceRecoveryAtLevel(definition, levelIndex)
      return [
        {
          id: definition.id,
          label: definition.label,
          current: Math.max(0, Math.min(max, stored[definition.id] ?? max)),
          max,
          restType: recovery.shortRest !== undefined ? ('short' as const) : ('long' as const),
          recovery,
          recoveryText: formatClassResourceRecovery(recovery),
          usageText:
            definition.id === HEALING_LIGHT_RESOURCE_ID
              ? `Up to ${healingDiceLimit} ${healingDiceLimit === 1 ? 'die' : 'dice'} per use`
              : definition.usageText,
          className: entry.name,
        },
      ]
    })
  })
}
