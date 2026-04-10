import { describe, expect, test } from 'vitest';
import { calculatePointBuyTotal } from '@/lib/calculations/abilityScores';
import { normalizeKey } from '@/lib/provenance/normalization';
import { DEV_SEED_CHARACTERS } from '@/lib/seedCharacters';
import { characterPersistenceSchema } from '@/types/characterSchema';

describe('seedCharacters', () => {
  test('contains exactly three seed characters', () => {
    expect(DEV_SEED_CHARACTERS).toHaveLength(3);
    expect(DEV_SEED_CHARACTERS.map((c) => c.id)).toEqual([
      'seed-1',
      'seed-2',
      'seed-3',
    ]);
  });

  test('all seed records satisfy current persistence schema', () => {
    for (const character of DEV_SEED_CHARACTERS) {
      expect(characterPersistenceSchema.safeParse(character).success).toBe(
        true,
      );
    }
  });

  test('seed-1 is 2014 PHB human wizard with recommended-only sources and point buy', () => {
    const c = DEV_SEED_CHARACTERS.find((it) => it.id === 'seed-1');

    expect(c?.race).toBe('Human');
    expect(c?.raceSource).toBe('PHB');
    expect(c?.class).toBe('Wizard');
    expect(c?.classSource).toBe('PHB');
    expect(c?.background).toBe('Acolyte');
    expect(c?.backgroundSource).toBe('PHB');
    expect(c?.level).toBe(5);
    expect(c?.details.gender).toBe('Female');
    expect(c?.variantRules?.abilityScoreMethod).toBe('point-buy');
    expect(c?.portrait).toBe(
      '/assets/images/characters/placeholder_char_card.jpg',
    );
    expect(c?.allowedSources).toEqual([
      'PHB',
      'XGE',
      'TCE',
      'MPMM',
      'ERLW',
      'EGW',
      'MOT',
      'VRGR',
    ]);
    expect(
      c?.spells.spellProfiles.some((p) => p.id === 'class:Wizard|PHB'),
    ).toBe(true);
    expect(
      c?.spells.spellProfiles.find((p) => p.id === 'class:Wizard|PHB')
        ?.preparedSpells,
    ).toEqual(['Shield', 'Mage Armor', 'Magic Missile', 'Fireball']);
    const wizardKnown = c?.spells.spellProfiles.find(
      (p) => p.id === 'class:Wizard|PHB',
    )?.spellsKnown;
    expect(wizardKnown).not.toContain('Fly');
    const wizardLv5Selections = ['Fireball', 'Counterspell', 'Fly'].filter(
      (spellName) => {
        const tag = c?.provenance?.spells?.[normalizeKey(spellName)]?.find(
          (t) =>
            t.sourceType === 'class' &&
            t.sourceName === 'Wizard' &&
            (t.sourceRef ?? '') === 'PHB' &&
            t.spellGrantedAtLevel === 5,
        );
        return !!tag;
      },
    );
    expect(wizardLv5Selections).toEqual(['Fireball', 'Counterspell']);
    expect(c?.provenance?.proficiencies.languages).toMatchObject({
      common: expect.any(Array),
      celestial: expect.any(Array),
      elvish: expect.any(Array),
    });
    expect(
      calculatePointBuyTotal(
        c?.abilityScores ?? {
          strength: 8,
          dexterity: 8,
          constitution: 8,
          intelligence: 8,
          wisdom: 8,
          charisma: 8,
        },
      ),
    ).toBe(27);
    expect(c?.provenance?.abilityBonuses).toContainEqual({
      ability: 'intelligence',
      value: 2,
      sourceTag: {
        sourceType: 'class',
        sourceName: 'Ability Score Improvement',
        sourceRef: 'PHB',
        grantType: 'choice',
        label: 'ASI',
      },
    });
  });

  test('seed-2 is 2024-only dwarf fighter with standard array', () => {
    const c = DEV_SEED_CHARACTERS.find((it) => it.id === 'seed-2');

    expect(c?.race).toBe('Dwarf');
    expect(c?.raceSource).toBe('XPHB');
    expect(c?.class).toBe('Fighter');
    expect(c?.classSource).toBe('XPHB');
    expect(c?.subclass).toBe('Battle Master');
    expect(c?.background).toBe('Soldier');
    expect(c?.backgroundSource).toBe('XPHB');
    expect(c?.level).toBe(5);
    expect(c?.details.gender).toBe('Male');
    expect(c?.variantRules?.abilityScoreMethod).toBe('standard-array');
    expect(c?.portrait).toBe(
      '/assets/images/characters/placeholder_char_card5.jpg',
    );
    expect(c?.allowedSources).toEqual(['XPHB']);
    expect(c?.features.some((f) => f.name.includes('Fighting Style'))).toBe(
      true,
    );
    expect(c?.provenance?.proficiencies.savingThrows).toMatchObject({
      strength: expect.any(Array),
      constitution: expect.any(Array),
    });
  });

  test('seed-3 is all-sources tiefling with warlock/sorcerer 5/5 and custom scores', () => {
    const c = DEV_SEED_CHARACTERS.find((it) => it.id === 'seed-3');

    expect(c?.race).toBe('Tiefling');
    expect(c?.raceSource).toBe('PHB');
    expect(c?.background).toBe('Sage');
    expect(c?.backgroundSource).toBe('XPHB');
    expect(c?.details.gender).toBe('Female');
    expect(c?.portrait).toBe(
      '/assets/images/characters/placeholder_char_card6.jpg',
    );
    expect(c?.variantRules?.abilityScoreMethod).toBe('custom');
    expect(c?.allowedSources?.length).toBeGreaterThan(20);
    expect(c?.classProgression).toEqual([
      {
        name: 'Warlock',
        source: 'PHB',
        levels: 5,
        subclass: 'The Fiend',
        subclassSource: 'PHB',
      },
      {
        name: 'Sorcerer',
        source: 'PHB',
        levels: 5,
        subclass: 'Draconic Bloodline',
        subclassSource: 'PHB',
      },
    ]);
    expect(c?.level).toBe(10);
    expect(
      c?.spells.spellProfiles.some((p) => p.id === 'class:Warlock|PHB'),
    ).toBe(true);
    expect(
      c?.spells.spellProfiles.some((p) => p.id === 'class:Sorcerer|PHB'),
    ).toBe(true);
    expect(
      c?.spells.spellProfiles.find((p) => p.id === 'class:Warlock|PHB')
        ?.preparedSpells,
    ).toEqual([]);
    expect(
      c?.spells.spellProfiles.find((p) => p.id === 'class:Sorcerer|PHB')
        ?.preparedSpells,
    ).toEqual([]);
    expect(c?.features.some((f) => f.name === 'Metamagic')).toBe(true);
    expect(c?.features.some((f) => f.name === 'Eldritch Invocations')).toBe(
      true,
    );
    expect(c?.provenance?.spells).toMatchObject({
      'eldritch blast': expect.any(Array),
      shield: expect.any(Array),
    });
  });

  test('ability score methods are unique across three seeds', () => {
    const methods = DEV_SEED_CHARACTERS.map(
      (c) => c.variantRules?.abilityScoreMethod,
    );
    expect(methods).toEqual(['point-buy', 'standard-array', 'custom']);
  });

  test('all class-profile spells include level attribution provenance tags', () => {
    for (const character of DEV_SEED_CHARACTERS) {
      for (const profile of character.spells.spellProfiles) {
        if (profile.type !== 'class' || !profile.className) continue;

        for (const spellName of [...profile.cantrips, ...profile.spellsKnown]) {
          const tags = character.provenance?.spells?.[normalizeKey(spellName)];
          const classTag = tags?.find(
            (tag) =>
              tag.sourceType === 'class' &&
              tag.sourceName === profile.className &&
              (tag.sourceRef ?? '') === (profile.classSource ?? '') &&
              !!tag.spellGrantedAtLevel,
          );

          expect(
            classTag,
            `${character.id} missing attribution for ${spellName}`,
          ).toBeDefined();
        }
      }
    }
  });
});
