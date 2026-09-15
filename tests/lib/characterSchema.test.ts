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
})
