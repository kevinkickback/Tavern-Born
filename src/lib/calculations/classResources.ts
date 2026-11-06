import { CLASSIC_WILD_SHAPE_RESOURCE_ID, isClassicDruid } from '@/lib/5etools/archdruidSource'
import { getClassResourceDefs } from '@/lib/5etools/classData'
import {
  formatClassResourceRecovery,
  getClassResourceRecoveryAtLevel,
} from '@/lib/5etools/classRuleNormalization'
import {
  getCurrentNativeSorcerer,
  getSorcererResourceDefs,
  isNativeSorcerer,
} from '@/lib/5etools/sorcererSource'
import type { ClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import type { Class5e } from '@/types/5etools'
import type { Character, CharacterClassEntry } from '@/types/character'
import type { ClassResourceDef } from '@/types/classRules'
import type { CharacterEffect } from '@/types/effects'
import { type EffectResolutionContext, resolveNumericEffect } from './effects'

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
    effects?: readonly CharacterEffect[]
    effectContext?: EffectResolutionContext
    unlimitedWildShape: boolean
  },
) {
  const currentSorcerer = getCurrentNativeSorcerer(character, options.catalogs)
  const stored = character.classResources ?? {}
  return character.classProgression.flatMap((entry) => {
    const level = entry.levels ?? 1
    const levelIndex = Math.max(0, Math.min(19, level - 1))
    const definitions = isNativeSorcerer(entry)
      ? currentSorcerer?.owner === entry
        ? getSorcererResourceDefs(currentSorcerer)
        : []
      : getClassResourceDefs(resolveClass(entry), level)
    return definitions.flatMap((definition) => {
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
          className: entry.name,
        },
      ]
    })
  })
}
