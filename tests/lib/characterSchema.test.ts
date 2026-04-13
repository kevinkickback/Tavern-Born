import { describe, expect, test } from 'vitest'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

describe('characterPersistenceSchema', () => {
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
})
