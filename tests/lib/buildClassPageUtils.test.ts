import { describe, expect, test } from 'vitest';
import {
  buildCharacterSnapshot,
  buildClassProgression,
  buildFeatModalFeats,
  buildLevelsToShow,
  countTotalAsiAcrossClasses,
  countTotalFeatSlots,
  filterClassSpells,
} from '@/pages/build/buildClassPageUtils';
import type { Class5e } from '@/types/5etools';
import type { Character } from '@/types/character';
import { makeCharacterFixture } from '../fixtures/characterFixtures';
import { makeClassFixture } from '../fixtures/gameDataFixtures';

function makeLookup(classes: Class5e[]): {
  byKey: Record<string, Class5e | undefined>;
  fallback: Map<string, Class5e>;
} {
  const byKey: Record<string, Class5e | undefined> = {};
  const fallback = new Map<string, Class5e>();
  for (const cls of classes) {
    byKey[`${cls.name}|${cls.source ?? ''}`] = cls;
    fallback.set(cls.name, cls);
  }
  return { byKey, fallback };
}

describe('buildClassPageUtils', () => {
  test('buildClassProgression uses classProgression when present', () => {
    const character = makeCharacterFixture({
      classProgression: [
        { name: 'Fighter', source: 'PHB', levels: 3 },
        { name: 'Wizard', source: 'PHB', levels: 2 },
      ],
    });

    expect(buildClassProgression(character)).toEqual(
      character.classProgression,
    );
  });

  test('buildClassProgression falls back to primary class fields', () => {
    const character = makeCharacterFixture({
      class: 'Rogue',
      classSource: 'PHB',
      level: 4,
      classProgression: undefined,
    });

    expect(buildClassProgression(character)).toEqual([
      { name: 'Rogue', source: 'PHB', levels: 4 },
    ]);
  });

  test('countTotalAsiAcrossClasses sums ASI levels across multiclass progression', () => {
    const character = makeCharacterFixture({
      class: 'Fighter',
      level: 8,
      classProgression: [
        { name: 'Fighter', source: 'PHB', levels: 6 },
        { name: 'Wizard', source: 'PHB', levels: 4 },
      ],
    });

    const fighter = makeClassFixture({
      name: 'Fighter',
      source: 'PHB',
      classFeatureRefs: [
        {
          ref: '',
          name: 'Ability Score Improvement',
          className: 'Fighter',
          level: 4,
        },
        {
          ref: '',
          name: 'Ability Score Improvement',
          className: 'Fighter',
          level: 6,
        },
        {
          ref: '',
          name: 'Ability Score Improvement',
          className: 'Fighter',
          level: 8,
        },
      ],
    });
    const wizard = makeClassFixture({
      name: 'Wizard',
      source: 'PHB',
      classFeatureRefs: [
        {
          ref: '',
          name: 'Ability Score Improvement',
          className: 'Wizard',
          level: 4,
        },
      ],
    });

    const { byKey, fallback } = makeLookup([fighter, wizard]);

    expect(
      countTotalAsiAcrossClasses({
        classProgression: buildClassProgression(character),
        character,
        classLookup: byKey,
        fallbackClassByName: fallback,
      }),
    ).toBe(3);
  });

  test('countTotalFeatSlots subtracts ASI choices from earned ASI slots', () => {
    const character = makeCharacterFixture({
      class: 'Fighter',
      level: 8,
      classProgression: [{ name: 'Fighter', source: 'PHB', levels: 8 }],
      asiChoices: [
        {
          id: 'asi-fighter-4',
          className: 'Fighter',
          level: 4,
          abilityChanges: { strength: 2 },
        },
      ],
    }) as Character;

    const fighter = makeClassFixture({
      name: 'Fighter',
      source: 'PHB',
      classFeatureRefs: [
        {
          ref: '',
          name: 'Ability Score Improvement',
          className: 'Fighter',
          level: 4,
        },
        {
          ref: '',
          name: 'Ability Score Improvement',
          className: 'Fighter',
          level: 6,
        },
        {
          ref: '',
          name: 'Ability Score Improvement',
          className: 'Fighter',
          level: 8,
        },
      ],
    });
    const { byKey, fallback } = makeLookup([fighter]);

    expect(
      countTotalFeatSlots({
        classProgression: buildClassProgression(character),
        character,
        classLookup: byKey,
        fallbackClassByName: fallback,
      }),
    ).toBe(2);
  });

  test('buildCharacterSnapshot includes progression and spell details', () => {
    const character = makeCharacterFixture({
      class: 'Wizard',
      classProgression: [{ name: 'Wizard', source: 'PHB', levels: 3 }],
      spells: {
        cantrips: ['Fire Bolt'],
        spellsKnown: ['Shield'],
        preparedSpells: ['Magic Missile'],
        spellSlots: {
          level1: { max: 4, used: 0 },
          level2: { max: 2, used: 0 },
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

    const snapshot = buildCharacterSnapshot({
      character,
      classProgression: buildClassProgression(character),
      viewingClass: 'Wizard',
    });

    expect(snapshot.class).toBe('Wizard');
    expect(snapshot.progression?.classes).toEqual([
      { name: 'Wizard', levels: 3, source: 'PHB' },
    ]);
    expect(snapshot.spells?.cantrips).toEqual(['Fire Bolt']);
    expect(snapshot.spells?.spellsKnown).toEqual(['Shield']);
  });

  test('buildLevelsToShow merges feature, asi, subclass, spell, and progression trigger levels', () => {
    const levels = buildLevelsToShow({
      allClassFeatures: [{ level: 1 }, { level: 3 }, { level: 9 }],
      asiLevels: [4, 8, 12],
      subclassLevel: 3,
      viewingClassLevel: 8,
      spellChoicesByLevel: new Map([
        [1, { cantrips: 2 }],
        [5, { spells: 2 }],
      ]),
      optFeatureProgressions: [{ progression: { '2': 1, '6': 2 } }],
      classFeatProgressions: [{ progression: [0, 0, 1, 1, 2, 2, 2, 3] }],
    });

    expect(levels).toEqual([1, 2, 3, 4, 5, 6, 8]);
  });

  test('buildFeatModalFeats keeps available feats and appends selected missing feats', () => {
    const merged = buildFeatModalFeats({
      availableFeats: [
        { name: 'Alert', source: 'PHB', entries: [] },
        { name: 'Lucky', source: 'PHB', entries: [] },
      ],
      selectedFeats: [
        { name: 'Alert', source: 'PHB' },
        { name: 'Custom Feat', source: 'HOMEBREW' },
      ],
      createFallback: (selected) => ({
        name: selected.name,
        source: selected.source,
        entries: [],
      }),
    });

    expect(merged.map((feat) => `${feat.name}|${feat.source}`)).toEqual([
      'Alert|PHB',
      'Lucky|PHB',
      'Custom Feat|HOMEBREW',
    ]);
  });

  test('filterClassSpells keeps unscoped spells and matching class spells', () => {
    const spells = [
      {
        name: 'Magic Missile',
        classes: { fromClassList: [{ name: 'Wizard' }] },
      },
      {
        name: 'Cure Wounds',
        classes: { fromClassList: [{ name: 'Cleric' }] },
      },
      {
        name: 'Universal Spell',
        classes: { fromClassList: [] },
      },
    ];

    expect(
      filterClassSpells(spells, 'Wizard').map((spell) => spell.name),
    ).toEqual(['Magic Missile', 'Universal Spell']);
  });
});
