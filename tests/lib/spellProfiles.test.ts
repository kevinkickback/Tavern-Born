import { describe, expect, test } from 'vitest';
import {
  buildClassSpellLevelKey,
  buildSpellcastingClassDetails,
  calculateCharacterSpellSlots,
  collectKnownSpells,
  ensureSpellProfiles,
  isSpellOnClassList,
  SPECIAL_SPELL_PROFILE_ID,
  SPECIAL_SPELL_PROFILE_LABEL,
} from '@/lib/calculations/spellProfiles';
import { makeCharacterFixture } from '../fixtures/characterFixtures';
import { makeClassFixture } from '../fixtures/gameDataFixtures';

describe('spellProfiles', () => {
  test('ensureSpellProfiles creates class profiles and special unrestricted profile', () => {
    const character = makeCharacterFixture({
      class: 'Wizard',
      classSource: 'PHB',
      level: 3,
      classProgression: [
        { name: 'Wizard', source: 'PHB', levels: 3 },
        { name: 'Cleric', source: 'PHB', levels: 2 },
      ],
      spells: {
        spellProfiles: [
          {
            id: 'class:Wizard|PHB',
            type: 'class',
            label: 'Wizard (Lv 3)',
            className: 'Wizard',
            classSource: 'PHB',
            cantrips: ['Mage Hand'],
            spellsKnown: ['Magic Missile'],
            preparedSpells: ['Magic Missile'],
            alwaysPrepared: false,
          },
        ],
        spellSlots: makeCharacterFixture().spells.spellSlots,
      },
    });

    const profiles = ensureSpellProfiles(character);
    expect(profiles.map((profile) => profile.id)).toEqual([
      'class:Wizard|PHB',
      'class:Cleric|PHB',
      SPECIAL_SPELL_PROFILE_ID,
    ]);
    expect(profiles[0].cantrips).toEqual(['Mage Hand']);
    expect(profiles[2].alwaysPrepared).toBe(true);
    expect(profiles[2].label).toBe(SPECIAL_SPELL_PROFILE_LABEL);
  });

  test('buildClassSpellLevelKey includes class source to avoid multiclass collisions', () => {
    expect(buildClassSpellLevelKey('Wizard', 'PHB', 3)).toBe('Wizard|PHB:3');
    expect(buildClassSpellLevelKey('Wizard', 'XPHB', 3)).toBe('Wizard|XPHB:3');
  });

  test('isSpellOnClassList matches exact class source when present', () => {
    const spell = {
      classes: {
        fromClassList: [
          { name: 'Wizard', source: 'PHB' },
          { name: 'Cleric', source: 'PHB' },
        ],
      },
    };

    expect(isSpellOnClassList(spell, 'Wizard', 'PHB')).toBe(true);
    expect(isSpellOnClassList(spell, 'Wizard', 'XPHB')).toBe(false);
    expect(isSpellOnClassList(spell, 'Druid', 'PHB')).toBe(false);
  });

  test('isSpellOnClassList does not treat missing class lists as universally available', () => {
    expect(isSpellOnClassList({}, 'Wizard', 'PHB')).toBe(false);
  });

  test('collectKnownSpells includes always-prepared unrestricted spells', () => {
    const character = makeCharacterFixture({
      class: 'Wizard',
      classSource: 'PHB',
      level: 2,
      classProgression: [{ name: 'Wizard', source: 'PHB', levels: 2 }],
      spells: {
        spellProfiles: [
          {
            id: 'class:Wizard|PHB',
            type: 'class',
            label: 'Wizard (Lv 2)',
            className: 'Wizard',
            classSource: 'PHB',
            cantrips: ['Mage Hand'],
            spellsKnown: ['Shield'],
            preparedSpells: ['Shield'],
            alwaysPrepared: false,
          },
          {
            id: SPECIAL_SPELL_PROFILE_ID,
            type: 'special',
            label: 'Special (Unrestricted)',
            cantrips: ['Guidance'],
            spellsKnown: ['Fireball'],
            preparedSpells: [],
            alwaysPrepared: true,
          },
        ],
        spellSlots: makeCharacterFixture().spells.spellSlots,
      },
    });

    const known = collectKnownSpells(ensureSpellProfiles(character));
    expect(known.cantrips).toEqual(
      expect.arrayContaining(['Mage Hand', 'Guidance']),
    );
    expect(known.spellsKnown).toEqual(
      expect.arrayContaining(['Shield', 'Fireball']),
    );
    expect(known.preparedSpells).toEqual(
      expect.arrayContaining(['Shield', 'Fireball', 'Guidance']),
    );
  });

  test('calculateCharacterSpellSlots combines multiclass shared slots and keeps pact separate', () => {
    const character = makeCharacterFixture({
      class: 'Wizard',
      classSource: 'PHB',
      level: 5,
      classProgression: [
        { name: 'Wizard', source: 'PHB', levels: 3 },
        { name: 'Cleric', source: 'PHB', levels: 2 },
        { name: 'Warlock', source: 'PHB', levels: 2 },
      ],
      spells: {
        spellProfiles: [],
        spellSlots: {
          level1: { max: 0, used: 2 },
          level2: { max: 0, used: 1 },
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

    const classesById = new Map([
      [
        'class:Wizard|PHB',
        makeClassFixture({
          name: 'Wizard',
          source: 'PHB',
          casterProgression: 'full',
        }),
      ],
      [
        'class:Cleric|PHB',
        makeClassFixture({
          name: 'Cleric',
          source: 'PHB',
          casterProgression: 'full',
        }),
      ],
      [
        'class:Warlock|PHB',
        makeClassFixture({
          name: 'Warlock',
          source: 'PHB',
          casterProgression: 'pact',
        }),
      ],
    ]);

    const slots = calculateCharacterSpellSlots(character, classesById);
    expect(slots.shared[1]?.max).toBe(4);
    expect(slots.shared[2]?.max).toBe(3);
    expect(slots.pact[1]?.max).toBe(2);
  });

  test('buildSpellcastingClassDetails computes save and attack values per class', () => {
    const character = makeCharacterFixture({
      class: 'Wizard',
      classSource: 'PHB',
      level: 5,
      classProgression: [{ name: 'Wizard', source: 'PHB', levels: 5 }],
      abilityScores: {
        strength: 10,
        dexterity: 10,
        constitution: 10,
        intelligence: 16,
        wisdom: 12,
        charisma: 10,
      },
      spells: {
        spellProfiles: [
          {
            id: 'class:Wizard|PHB',
            type: 'class',
            label: 'Wizard (Lv 5)',
            className: 'Wizard',
            classSource: 'PHB',
            cantrips: [],
            spellsKnown: [],
            preparedSpells: [],
            alwaysPrepared: false,
          },
          {
            id: SPECIAL_SPELL_PROFILE_ID,
            type: 'special',
            label: 'Special (Unrestricted)',
            cantrips: [],
            spellsKnown: [],
            preparedSpells: [],
            alwaysPrepared: true,
          },
        ],
        spellSlots: makeCharacterFixture().spells.spellSlots,
      },
    });

    const classesById = new Map([
      [
        'class:Wizard|PHB',
        makeClassFixture({
          name: 'Wizard',
          source: 'PHB',
          casterProgression: 'full',
          spellcastingAbility: 'int',
          spellsKnownProgression: [6, 8, 10, 12, 14],
        }),
      ],
    ]);

    const details = buildSpellcastingClassDetails(character, classesById);
    expect(details).toHaveLength(1);
    expect(details[0].spellSaveDC).toBe(14);
    expect(details[0].spellAttackBonus).toBe(6);
    expect(details[0].isPreparedCaster).toBe(false);
  });
});
