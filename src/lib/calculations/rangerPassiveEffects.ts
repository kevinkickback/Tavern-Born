import { findClassReference } from '@/lib/5etools/classReference'
import {
  getEarnedDirectClassFeature,
  hasCurrentSubclassFeatureReplacement,
} from '@/lib/5etools/earnedClassFeatureSource'
import { optionalDeclarationObject as record } from '@/lib/5etools/optionalClassDeclarationStructure'
import { getCurrentRangerFeatures } from '@/lib/5etools/rangerFeatureSource'
import { getNormalizedItemTraits } from '@/lib/calculations/itemClassification'
import type { ClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import type { Character } from '@/types/character'
import type { CharacterEffect, NumericEffectTarget } from '@/types/effects'
import { getCharacterEffectResolutionContext, getCharacterEffects } from './characterEffects'
import { resolveNumericEffect } from './effects'
import { getEffectiveCharacterMovement, getWalkingSpeed } from './movement'

const roving =
  /^Your \{@variantrule Speed\|XPHB\} increases by (\d+) feet while you aren't wearing Heavy armor\. You also have a \{@variantrule Climb Speed\|XPHB\} and a \{@variantrule Swim Speed\|XPHB\} equal to your \{@variantrule Speed\|XPHB\}\.$/
const blindsight =
  /^Your connection to the forces of nature grants you \{@sense Blindsight\|XPHB\} with a range of (\d+) feet\.$/
const classicSight =
  /^At \d+(?:st|nd|rd|th) level, you gain \{@sense darkvision\} out to a range of (\d+) feet\. If you already have \{@sense darkvision\} from your race, its range increases by (\d+) feet\.$/
const revisedSight =
  /^You gain \{@sense Darkvision\|XPHB\} with a range of (\d+) feet\. If you already have \{@sense Darkvision\|XPHB\} when you gain this feature, its range increases by (\d+) feet\.$/
const rovingTarget = 'class-feature|roving|ranger|xphb|6|xphb'

function effectIdentity(
  rule: { target: string; name: string; source: string },
  target: CharacterEffect['target'],
) {
  return {
    id: `${rule.target}:${JSON.stringify(target)}`,
    label: rule.name,
    source: {
      kind: rule.target.startsWith('subclass-') ? ('subclass' as const) : ('class' as const),
      name: rule.name,
      source: rule.source,
      entityId: rule.target,
    },
  }
}

export function deriveRangerPassiveEffects(
  character: Character,
  catalogs: ClassChoiceFeatureCatalogs | undefined,
  wisdom: number,
  precedingEffects: readonly CharacterEffect[],
): CharacterEffect[] {
  const rules = getCurrentRangerFeatures(character, catalogs)

  const effects: CharacterEffect[] = []
  const addEffect = (
    rule: { target: string; name: string; source: string },
    target: NumericEffectTarget,
    value: number,
    kind: 'add' | 'minimum' = 'add',
  ) => effects.push({ ...effectIdentity(rule, target), target, operation: { kind, value } })

  const baseRule = (name: string, pattern: RegExp) => {
    const feature = rules?.base(name)
    const entry = feature?.entries[0]
    const match = feature?.entries.length === 1 && typeof entry === 'string' && pattern.exec(entry)
    return feature && match ? { ...feature, distance: Number(match[1]) } : undefined
  }
  if (rules?.source === 'xphb') {
    const feral = baseRule('Feral Senses', blindsight)
    if (feral) addEffect(feral, { kind: 'sense', sense: 'blindsight' }, feral.distance, 'minimum')
  }
  const inherited = character.classProgression
    .flatMap((entry) => {
      if (findClassReference({ name: 'Ranger', source: 'XPHB' }, [entry])) return []
      const current = getEarnedDirectClassFeature(character, entry, catalogs, rovingTarget)
      const line = current?.feature.entries?.[0]
      const match =
        current?.feature.entries?.length === 1 && typeof line === 'string' && roving.exec(line)
      if (
        !current ||
        !match ||
        hasCurrentSubclassFeatureReplacement(
          character,
          entry,
          catalogs,
          current.cls,
          rovingTarget,
          6,
        )
      )
        return []
      return [
        {
          target: rovingTarget,
          name: current.feature.name,
          source: current.feature.source,
          distance: Number(match[1]),
        },
      ]
    })
    .sort((a, b) => b.distance - a.distance)[0]
  const moving = (rules?.source === 'xphb' ? baseRule('Roving', roving) : undefined) ?? inherited
  if (moving) {
    const heavy = character.equipment?.some(
      (item) => item.equipped && getNormalizedItemTraits(item).armorCategory === 'heavy',
    )
    if (!heavy) addEffect(moving, { kind: 'speed', mode: 'walk' }, moving.distance)
    const walk = getWalkingSpeed(
      getEffectiveCharacterMovement(character, [...precedingEffects, ...effects]),
    )
    for (const mode of ['climb', 'swim'])
      addEffect(moving, { kind: 'speed', mode }, walk, 'minimum')
  }
  if (!rules?.specialization) return effects
  const { subclass, origin, earned } = rules.specialization
  if (subclass.shortName === 'Fey Wanderer') {
    const glamour = earned('Otherworldly Glamour')
    if (
      glamour?.entries.some(
        (entry) =>
          typeof entry === 'string' &&
          /^(?:Your fey qualities give you a supernatural charm\. As a result, whenever|Whenever) you make a Charisma check, you gain a bonus to the check equal to your Wisdom modifier \(minimum of \+1\)\.$/.test(
            entry,
          ),
      )
    )
      addEffect(
        glamour,
        { kind: 'ability-check-modifier', ability: 'charisma' },
        Math.max(1, wisdom),
      )
  }
  if (subclass.shortName === 'Gloom Stalker') {
    const nativeRevised = origin === 'XPHB'
    const ambush = earned('Dread Ambusher')
    const initiative = nativeRevised
      ? ambush?.entries
          .map(record)
          .some(
            (row) =>
              row.type === 'entries' &&
              row.name === 'Initiative Bonus' &&
              Array.isArray(row.entries) &&
              row.entries.length === 1 &&
              row.entries[0] ===
                'When you roll {@variantrule Initiative|XPHB}, you can add your Wisdom modifier to the roll.',
          )
      : ambush?.entries.some(
          (entry) =>
            typeof entry === 'string' &&
            /^At \d+(?:st|nd|rd|th) level, you master the art of the ambush\. You can give yourself a bonus to your initiative rolls equal to your Wisdom modifier\.$/.test(
              entry,
            ),
        )
    if (ambush && initiative) addEffect(ambush, { kind: 'initiative' }, wisdom)
    const sight = earned('Umbral Sight')
    const text = sight?.entries[0]
    const ranges =
      typeof text === 'string' && (nativeRevised ? revisedSight : classicSight).exec(text)
    if (sight && ranges) {
      const target = { kind: 'sense', sense: 'darkvision' } as const
      const context = getCharacterEffectResolutionContext(character)
      const prior = nativeRevised
        ? resolveNumericEffect(
            character.visions?.find((sense) => norm(sense.type) === 'darkvision')?.range ?? 0,
            target,
            getCharacterEffects(character, 1, precedingEffects),
            context,
          ).value
        : resolveNumericEffect(
            0,
            target,
            precedingEffects.filter(
              (effect) => effect.source.kind === 'race' || effect.source.kind === 'subrace',
            ),
            context,
          ).value
      addEffect(
        sight,
        target,
        prior > 0 ? Number(ranges[2]) : Number(ranges[1]),
        prior > 0 ? 'add' : 'minimum',
      )
    }
  }
  if (subclass.shortName === 'Winter Walker' && subclass.source === 'FRHoF') {
    const frigid = earned('Frigid Explorer')
    if (
      frigid?.entries
        .map(record)
        .some(
          (row) =>
            row.type === 'entries' &&
            row.name === 'Frost Resistance' &&
            Array.isArray(row.entries) &&
            row.entries.length === 1 &&
            row.entries[0] === 'You have {@variantrule Resistance|XPHB} to Cold damage.',
        )
    ) {
      const target = { kind: 'damage-resistance', damageType: 'cold' } as const
      effects.push({ ...effectIdentity(frigid, target), target, operation: { kind: 'grant' } })
    }
  }
  if (subclass.shortName === 'Hollow Warden' && subclass.source === 'RHW') {
    const might = earned('Hungering Might')
    if (
      might?.entries[0] ===
      'You gain a bonus to Constitution saving throws equal to your Wisdom modifier (minimum of +1).'
    )
      addEffect(
        might,
        { kind: 'saving-throw-modifier', ability: 'constitution' },
        Math.max(1, wisdom),
      )
    const ancient = earned('Ancient Might')
    if (
      ancient?.entries
        .map(record)
        .some(
          (entry) =>
            entry.type === 'entries' &&
            entry.name === 'Timeless' &&
            Array.isArray(entry.entries) &&
            entry.entries.length === 1 &&
            entry.entries[0] ===
              'You have {@variantrule Immunity|XPHB} to the {@condition Exhaustion|XPHB} condition.',
        )
    ) {
      const target = { kind: 'condition-immunity', condition: 'exhaustion' } as const
      effects.push({ ...effectIdentity(ancient, target), target, operation: { kind: 'grant' } })
    }
  }
  return effects
}
