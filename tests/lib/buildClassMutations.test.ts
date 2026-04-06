import { describe, expect, test } from 'vitest';
import {
  buildClassSelectionPatch,
  buildSubclassSelectionPatch,
} from '@/pages/build/class/model/mutations';
import { makeCharacterFixture } from '../fixtures/characterFixtures';

describe('buildClassMutations', () => {
  test('buildClassSelectionPatch merges starting proficiencies and normalizes spellcasting ability', () => {
    const character = makeCharacterFixture({
      proficiencies: {
        armor: ['Light Armor'],
        weapons: ['Simple Weapons'],
        tools: ["Thieves' Tools"],
        languages: [],
        savingThrows: [],
      },
      spells: {
        cantrips: [],
        spellsKnown: [],
        preparedSpells: [],
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

    const fighter = {
      name: 'Fighter',
      source: 'PHB',
      spellcastingAbility: 'Cha',
      startingProficiencies: {
        armor: ['Light Armor', 'Medium Armor'],
        weapons: ['Simple Weapons', 'Martial Weapons'],
        tools: ["Smith's Tools"],
      },
    };

    const { classEntity, patch } = buildClassSelectionPatch({
      character,
      className: 'Fighter',
      classSource: 'PHB',
      classLookup: {
        'Fighter|PHB': fighter,
      },
      fallbackClassByName: new Map(),
    });

    expect(classEntity?.name).toBe('Fighter');
    expect(patch.class).toBe('Fighter');
    expect(patch.subclass).toBeUndefined();
    expect(patch.proficiencies?.armor).toEqual(['Light Armor', 'Medium Armor']);
    expect(patch.proficiencies?.weapons).toEqual([
      'Simple Weapons',
      'Martial Weapons',
    ]);
    expect(patch.proficiencies?.tools).toEqual([
      "Thieves' Tools",
      "Smith's Tools",
    ]);
    expect(patch.spells?.spellcastingAbility).toBe('charisma');
  });

  test('buildSubclassSelectionPatch updates matching class progression entry and top-level subclass for primary class', () => {
    const character = makeCharacterFixture({ class: 'Wizard' });
    const classProgression = [
      { name: 'Wizard', source: 'PHB', levels: 5 },
      { name: 'Fighter', source: 'PHB', levels: 2 },
    ];

    const patch = buildSubclassSelectionPatch({
      character,
      classProgression,
      viewingEntry: classProgression[0],
      subclassName: 'Evocation',
      subclassSource: 'PHB',
    });

    expect(patch.subclass).toBe('Evocation');
    expect(patch.subclassSource).toBe('PHB');
    expect(patch.classProgression).toEqual([
      {
        name: 'Wizard',
        source: 'PHB',
        levels: 5,
        subclass: 'Evocation',
        subclassSource: 'PHB',
      },
      { name: 'Fighter', source: 'PHB', levels: 2 },
    ]);
  });
});
