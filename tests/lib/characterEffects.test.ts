import { describe, expect, test } from 'vitest'
import {
  deriveStructuredRaceEffects,
  getCharacterEffectResolutionContext,
  getCharacterEffects,
} from '@/lib/calculations/characterEffects'
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
})
