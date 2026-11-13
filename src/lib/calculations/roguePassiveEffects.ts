import {
  getCurrentDirectSubclassSource,
  getCurrentRetainedSubclassSource,
} from '@/lib/5etools/directSubclassSource'
import type { ClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import type { Character, CharacterClassEntry } from '@/types/character'
import type { CharacterEffect } from '@/types/effects'
import { getEffectiveCharacterMovement } from './movement'

export function deriveRoguePassiveEffects(
  character: Character,
  catalogs: ClassChoiceFeatureCatalogs | undefined,
  charisma: number,
  otherEffects: readonly CharacterEffect[],
): CharacterEffect[] {
  return character.classProgression.flatMap((entry) =>
    rogueEffects(character, entry, catalogs, charisma, otherEffects),
  )
}

function rogueEffects(
  character: Character,
  owner: CharacterClassEntry,
  catalogs: ClassChoiceFeatureCatalogs | undefined,
  charisma: number,
  otherEffects: readonly CharacterEffect[],
): CharacterEffect[] {
  const current =
    getCurrentDirectSubclassSource(character, owner, catalogs?.classes, 'Rogue') ??
    getCurrentRetainedSubclassSource(character, owner, catalogs, 'Rogue')
  if (!current) return []
  const { getFeature } = current
  const effects: CharacterEffect[] = []
  const source = (name: string, feature: NonNullable<ReturnType<typeof getFeature>>) =>
    ({ kind: 'subclass', name, source: feature.source, entityId: feature.target }) as const
  const audacity = getFeature('Rakish Audacity', 'Swashbuckler')
  if (audacity) {
    const line = audacity.entries[0]
    const match =
      typeof line === 'string' &&
      /^Starting at (\d+)(?:st|nd|rd|th) level, your confidence propels you into battle\. You can give yourself a bonus to your initiative rolls equal to your Charisma modifier\.$/.exec(
        line,
      )
    const revised =
      line ===
      'When you roll {@variantrule Initiative|XPHB}, you can give yourself a bonus to the roll equal to your Charisma modifier.'
    if ((revised || (match && Number(match[1]) === audacity.level)) && charisma > 0)
      effects.push({
        id: audacity.id,
        label: 'Rakish Audacity',
        source: source('Rakish Audacity', audacity),
        stackingGroup: audacity.target,
        target: { kind: 'initiative' },
        operation: { kind: 'add', value: charisma },
      })
  }
  const feature = getFeature('Superior Mobility', 'Scout', 'XGE')
  const line = feature?.entries[0]
  const match =
    typeof line === 'string' &&
    /^At (\d+)(?:st|nd|rd|th) level, your walking speed increases by (\d+) feet\. If you have a climbing or swimming speed, this increase applies to that speed as well\.$/.exec(
      line,
    )
  if (!feature || !match || Number(match[1]) !== feature.level || Number(match[2]) < 1)
    return effects
  const movement = getEffectiveCharacterMovement(character, otherEffects)
  effects.push(
    ...['walk', 'climb', 'swim']
      .filter((mode) => mode === 'walk' || (movement.speeds[mode] ?? 0) > 0)
      .map(
        (mode): CharacterEffect => ({
          id: `${feature.id}:${mode}`,
          label: 'Superior Mobility',
          source: source('Superior Mobility', feature),
          stackingGroup: feature.target,
          target: { kind: 'speed', mode },
          operation: { kind: 'add', value: Number(match[2]) },
        }),
      ),
  )
  return effects
}
