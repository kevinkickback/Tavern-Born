import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, expectTypeOf, test } from 'vitest'
import {
  type CharacterSchemaOutputContract,
  characterPersistenceSchema,
} from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

describe('characterPersistenceSchema', () => {
  test('keeps normalized persistence output compatible with the runtime Character type', () => {
    expectTypeOf<CharacterSchemaOutputContract>().toEqualTypeOf<true>()
  })

  test('accepts a full persisted character shape', () => {
    const character = makeCharacterFixture()
    const result = characterPersistenceSchema.safeParse(character)

    expect(result.success).toBe(true)
  })

  test('keeps the shared browser character fixture on the current schema', () => {
    const fixture = JSON.parse(
      fs.readFileSync(path.resolve('tests/fixtures/equipment-e2e.tbc'), 'utf8'),
    ) as unknown
    const result = characterPersistenceSchema.safeParse(fixture)

    expect(result.success ? [] : result.error.issues).toEqual([])
  })

  test('requires an exact source for every selected subclass', () => {
    const character = makeCharacterFixture({
      classProgression: [
        {
          name: 'Rogue',
          source: 'PHB',
          levels: 3,
          subclass: 'Arcane Trickster',
        },
      ],
    })

    const result = characterPersistenceSchema.safeParse(character)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: ['classProgression', 0, 'subclassSource'],
          }),
        ]),
      )
    }
  })

  test('rejects malformed spell profiles in persisted data', () => {
    const character = makeCharacterFixture({
      spells: {
        spellProfiles: [
          {
            id: 'class:Wizard|PHB',
            type: 'class',
            label: 'Wizard (Lv 1)',
            cantrips: [],
            spellsKnown: [],
            preparedSpells: [],
          },
        ],
        spellSlots: {
          1: { max: 0, used: 0 },
          2: { max: 0, used: 0 },
          3: { max: 0, used: 0 },
          4: { max: 0, used: 0 },
          5: { max: 0, used: 0 },
          6: { max: 0, used: 0 },
          7: { max: 0, used: 0 },
          8: { max: 0, used: 0 },
          9: { max: 0, used: 0 },
        },
      },
    })

    const result = characterPersistenceSchema.safeParse(character)
    expect(result.success).toBe(false)
  })

  test('round-trips structured movement, adjustments, and overrides', () => {
    const character = makeCharacterFixture({
      movement: {
        speeds: { walk: 25, swim: 30 },
        hover: false,
        other: { phase: 10, glide: true },
        source: { kind: 'race', name: 'River Dwarf', source: 'HB' },
      },
      movementAdjustments: [
        {
          id: 'training',
          label: 'Training',
          mode: 'walk',
          amount: 5,
          sourceType: 'manual',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      movementOverrides: { fly: 40 },
      movementHoverOverride: true,
    })

    const result = characterPersistenceSchema.parse(
      JSON.parse(JSON.stringify(character)) as unknown,
    )

    expect(result.movement).toEqual(character.movement)
    expect(result.movementAdjustments).toEqual(character.movementAdjustments)
    expect(result.movementOverrides).toEqual({ fly: 40 })
    expect(result.movementHoverOverride).toBe(true)
  })

  test('round-trips source-qualified class choice selections and slot ownership', () => {
    const character = makeCharacterFixture({
      classChoiceSelections: [
        {
          choiceId: 'class:sorcerer|xphb|choice:metamagic|2',
          label: 'Metamagic',
          kind: 'optional-feature',
          className: 'Sorcerer',
          classSource: 'XPHB',
          classLevel: 2,
          selected: [
            {
              entityType: 'optionalFeature',
              name: 'Quickened Spell',
              source: 'XPHB',
              slotLevel: 2,
            },
          ],
        },
      ],
    })

    const result = characterPersistenceSchema.parse(
      JSON.parse(JSON.stringify(character)) as unknown,
    )

    expect(result.classChoiceSelections).toEqual(character.classChoiceSelections)
  })

  test('round-trips typed manual effects and their activation state', () => {
    const character = makeCharacterFixture({
      manualEffects: [
        {
          id: 'manual-speed',
          label: 'Situational speed adjustment',
          target: { kind: 'speed', mode: 'walk' },
          operation: { kind: 'add', value: 5 },
          source: {
            kind: 'manual',
            name: 'User adjustment',
            provenance: { choiceId: 'manual-choice' },
          },
          requirements: [{ kind: 'flag', key: 'active', expected: true }],
          condition: 'Applies while the declared condition is met.',
        },
      ],
      suppressedEffectIds: ['source-effect'],
      effectFlags: { active: true },
    })

    const result = characterPersistenceSchema.parse(
      JSON.parse(JSON.stringify(character)) as unknown,
    )

    expect(result.manualEffects).toEqual(character.manualEffects)
    expect(result.suppressedEffectIds).toEqual(['source-effect'])
    expect(result.effectFlags).toEqual({ active: true })
  })

  test('rejects an operation that does not match its typed effect target', () => {
    const character = makeCharacterFixture({
      manualEffects: [
        {
          id: 'invalid-effect',
          label: 'Invalid effect',
          target: { kind: 'damage-resistance', damageType: 'test' },
          operation: { kind: 'add', value: 1 },
          source: { kind: 'manual', name: 'User adjustment' },
        } as never,
      ],
    })

    expect(characterPersistenceSchema.safeParse(character).success).toBe(false)
  })

  test('round-trips manual structured actions and rejects source-derived snapshots', () => {
    const action = {
      id: 'manual-action',
      name: 'Test action',
      kind: 'bonus-action' as const,
      description: 'Test description.',
      source: { kind: 'manual' as const, name: 'Test action' },
      active: true,
      attackBonus: 3,
      range: 'Test range',
      damage: [{ dice: '1d6', bonus: 1, damageType: 'test damage' }],
      resourceCost: { resourceId: 'test-resource', amount: 1 },
      recharge: { rest: 'long' as const, note: 'Test recharge.' },
    }
    const character = makeCharacterFixture({ manualActions: [action] })

    expect(characterPersistenceSchema.parse(character).manualActions).toEqual([action])
    expect(
      characterPersistenceSchema.safeParse({
        ...character,
        manualActions: [{ ...action, source: { kind: 'class', name: 'Test source' } }],
      }).success,
    ).toBe(false)
  })
})
