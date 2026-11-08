import { getCurrentDirectSubclassSource } from '@/lib/5etools/directSubclassSource'
import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import type { Class5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import type { CharacterEffect } from '@/types/effects'
import { getEffectiveCharacterMovement } from './movement'

export function deriveRoguePassiveEffects(
  character: Character,
  classes: readonly Class5e[] | undefined,
  charisma: number,
  otherEffects: readonly CharacterEffect[],
): CharacterEffect[] {
  const owner = character.classProgression.find((entry) => norm(entry.name) === 'rogue')
  const current = owner && getCurrentDirectSubclassSource(character, owner, classes, 'Rogue')
  if (!current || current.subclass.source !== 'XGE') return []
  const { subclass, getFeature } = current
  const source = (name: string, entityId: string) =>
    ({ kind: 'subclass', name, source: subclass.source, entityId }) as const
  if (subclass.shortName === 'Swashbuckler') {
    const feature = getFeature('Rakish Audacity')
    const line = feature?.entries[0]
    const match =
      typeof line === 'string' &&
      /^Starting at (\d+)(?:st|nd|rd|th) level, your confidence propels you into battle\. You can give yourself a bonus to your initiative rolls equal to your Charisma modifier\.$/.exec(
        line,
      )
    return feature && match && Number(match[1]) === feature.level && charisma > 0
      ? [
          {
            id: feature.target,
            label: 'Rakish Audacity',
            source: source('Rakish Audacity', feature.target),
            target: { kind: 'initiative' },
            operation: { kind: 'add', value: charisma },
          },
        ]
      : []
  }
  if (subclass.shortName !== 'Scout') return []
  const feature = getFeature('Superior Mobility')
  const line = feature?.entries[0]
  const match =
    typeof line === 'string' &&
    /^At (\d+)(?:st|nd|rd|th) level, your walking speed increases by (\d+) feet\. If you have a climbing or swimming speed, this increase applies to that speed as well\.$/.exec(
      line,
    )
  if (!feature || !match || Number(match[1]) !== feature.level || Number(match[2]) < 1) return []
  const movement = getEffectiveCharacterMovement(character, otherEffects)
  return ['walk', 'climb', 'swim']
    .filter((mode) => mode === 'walk' || (movement.speeds[mode] ?? 0) > 0)
    .map((mode) => ({
      id: `${feature.target}:${mode}`,
      label: 'Superior Mobility',
      source: source('Superior Mobility', feature.target),
      target: { kind: 'speed', mode },
      operation: { kind: 'add', value: Number(match[2]) },
    }))
}
