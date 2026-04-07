import { describe, expect, test } from 'vitest';
import { characterPersistenceSchema } from '@/types/characterSchema';
import { makeCharacterFixture } from '../fixtures/characterFixtures';

describe('characterPersistenceSchema', () => {
  test('accepts a full persisted character shape', () => {
    const character = makeCharacterFixture();
    const result = characterPersistenceSchema.safeParse(character);

    expect(result.success).toBe(true);
  });

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
          level1: { max: 0, used: 0 },
          level2: { max: 0, used: 0 },
          level3: { max: 0, used: 0 },
          level4: { max: 0, used: 0 },
          level5: { max: 0, used: 0 },
          level6: { max: 0, used: 0 },
          level7: { max: 0, used: 0 },
          level8: { max: 0, used: 0 },
          level9: { max: 0, used: 0 },
        },
      },
    });

    const result = characterPersistenceSchema.safeParse(character);
    expect(result.success).toBe(false);
  });
});
