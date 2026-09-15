import { describe, expect, test } from 'vitest'
import {
  deriveStructuredItemEffects,
  deriveStructuredRaceEffects,
  getCharacterEffectResolutionContext,
  getCharacterEffects,
} from '@/lib/calculations/characterEffects'
import { resolveGrantedTrait, resolveNumericEffect } from '@/lib/calculations/effects'
import type { Race5e } from '@/types/5etools'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

describe('character effect projection', () => {
  test('projects structured race fields without interpreting rules text', () => {
    const race = {
      name: 'Test Ancestry',
      source: 'TEST',
      darkvision: 45,
      resist: ['test damage'],
      immune: ['other damage'],
      conditionImmune: ['test condition'],
      entries: ['Unstructured prose is not an effect source.'],
    } as Race5e

    const effects = deriveStructuredRaceEffects(race)

    expect(effects.map((effect) => effect.target)).toEqual([
      { kind: 'sense', sense: 'darkvision' },
      { kind: 'damage-resistance', damageType: 'test damage' },
      { kind: 'damage-immunity', damageType: 'other damage' },
      { kind: 'condition-immunity', condition: 'test condition' },
    ])
    expect(effects.every((effect) => effect.source.name === race.name)).toBe(true)
  })

  test('combines legacy adjustments with manual declarations and activation state', () => {
    const character = makeCharacterFixture({
      hitPoints: { max: 0, current: 0, temporary: 0 },
      armorClassAdjustments: [
        {
          id: 'legacy-adjustment',
          label: 'Legacy adjustment',
          amount: 1,
          sourceType: 'other',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      manualEffects: [
        {
          id: 'manual-adjustment',
          label: 'Manual adjustment',
          target: { kind: 'initiative' },
          operation: { kind: 'add', value: 2 },
          source: { kind: 'manual', name: 'User adjustment' },
        },
      ],
      suppressedEffectIds: ['manual-adjustment'],
      effectFlags: { enabled: true },
      equipment: [
        { id: 'item', name: 'Test Item', type: 'G', quantity: 1, equipped: true, attuned: true },
      ],
    })

    expect(getCharacterEffects(character).map((effect) => effect.id)).toEqual([
      'legacy:armor-class:legacy-adjustment',
      'manual-adjustment',
    ])
    expect(getCharacterEffectResolutionContext(character)).toEqual({
      equipment: { item: { equipped: true, attuned: true } },
      flags: { enabled: true },
      suppressedEffectIds: ['manual-adjustment'],
    })
  })

  test('projects structured item fields and gates every declaration by equipment state', () => {
    const itemData = {
      name: 'Test Implement',
      source: 'TEST',
      type: 'G',
      reqAttune: true,
      bonusAc: '+1',
      bonusSavingThrow: '+2',
      bonusAbilityCheck: '+1',
      bonusSpellAttack: '+3',
      bonusSpellSaveDc: '+2',
      modifySpeed: {
        static: { swim: 20 },
        multiply: { walk: 2, fly: 2 },
        bonus: { '*': 5 },
        equal: { fly: 'walk' },
      },
      resist: ['test damage'],
      entries: ['Rules prose is preserved but not interpreted.'],
    }
    const equipment = [
      {
        id: 'test-item',
        name: itemData.name,
        source: itemData.source,
        type: itemData.type,
        quantity: 1,
        equipped: true,
        attuned: false,
      },
    ]
    const effects = deriveStructuredItemEffects(equipment, new Map([['test', itemData]]))
    const inactiveContext = { equipment: { 'test-item': { equipped: true, attuned: false } } }
    const activeContext = { equipment: { 'test-item': { equipped: true, attuned: true } } }

    expect(effects.length).toBeGreaterThan(0)
    expect(
      effects.every((effect) => {
        const requirement = effect.requirements?.[0]
        return requirement?.kind === 'equipment' && requirement.itemId === 'test-item'
      }),
    ).toBe(true)
    expect(resolveNumericEffect(10, { kind: 'armor-class' }, effects, inactiveContext).value).toBe(
      10,
    )
    expect(resolveNumericEffect(10, { kind: 'armor-class' }, effects, activeContext).value).toBe(11)
    expect(
      resolveNumericEffect(
        0,
        { kind: 'saving-throw-modifier', ability: 'wisdom' },
        effects,
        activeContext,
      ).value,
    ).toBe(2)
    expect(
      resolveNumericEffect(
        0,
        { kind: 'ability-check-modifier', ability: 'wisdom' },
        effects,
        activeContext,
      ).value,
    ).toBe(1)
    expect(
      resolveNumericEffect(30, { kind: 'speed', mode: 'walk' }, effects, activeContext).value,
    ).toBe(70)
    expect(
      resolveNumericEffect(0, { kind: 'speed', mode: 'swim' }, effects, activeContext).value,
    ).toBe(20)
    expect(
      resolveNumericEffect(0, { kind: 'speed', mode: 'fly' }, effects, activeContext).value,
    ).toBe(5)
    expect(
      resolveGrantedTrait(
        { kind: 'damage-resistance', damageType: 'test damage' },
        effects,
        activeContext,
      ).granted,
    ).toBe(true)
  })
})
