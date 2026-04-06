import { describe, expect, test } from 'vitest';
import {
  DataFilter,
  extractUniqueClasses,
  extractUniqueFeatCategories,
  extractUniqueItemTypes,
  extractUniqueRarities,
  extractUniqueSchools,
  extractUniqueSizes,
  extractUniqueSources,
  extractUniqueSpellLevels,
  searchByName,
  sortByName,
} from '@/lib/5etools/filters';
import {
  makeClassFixture,
  makeRaceFixture,
  makeSpellFixture,
} from '../../fixtures/gameDataFixtures';

describe('5etools/filters', () => {
  test('filterRaces applies source, size, and darkvision filters', () => {
    const races = [
      makeRaceFixture({ name: 'Human', source: 'PHB', size: ['M'] }),
      makeRaceFixture({
        name: 'Elf',
        source: 'XPHB',
        size: ['M'],
        darkvision: 60,
      }),
    ];

    const filtered = DataFilter.filterRaces(races, {
      sources: ['XPHB'],
      hasDarkvision: true,
    });

    expect(filtered.map((r) => r.name)).toEqual(['Elf']);
  });

  test('filterClasses applies spellcaster and hit-die filters', () => {
    const classes = [
      makeClassFixture({
        name: 'Wizard',
        casterProgression: 'full',
        hd: { faces: 6 },
      }),
      makeClassFixture({
        name: 'Fighter',
        casterProgression: undefined,
        spellcastingAbility: undefined,
        hd: { faces: 10 },
      }),
    ];

    const filtered = DataFilter.filterClasses(classes, {
      spellcaster: false,
      hitDice: [10],
    });

    expect(filtered.map((c) => c.name)).toEqual(['Fighter']);
  });

  test('filterSpells applies class, concentration, and component filters', () => {
    const spells = [
      makeSpellFixture({
        name: 'Misty Step',
        classes: { fromClassList: [{ name: 'Wizard', source: 'PHB' }] },
        duration: [{ type: 'timed', concentration: false }],
        components: { v: true, s: true },
      }),
      makeSpellFixture({
        name: 'Fly',
        classes: { fromClassList: [{ name: 'Wizard', source: 'PHB' }] },
        duration: [{ type: 'timed', concentration: true }],
        components: { v: true, s: true, m: 'a wing feather' },
      }),
    ];

    const filtered = DataFilter.filterSpells(spells, {
      classes: ['Wizard'],
      concentration: true,
      components: { material: true },
    });

    expect(filtered.map((s) => s.name)).toEqual(['Fly']);
  });

  test('search and sort helpers are case-insensitive and stable by name', () => {
    const entries = [{ name: 'Zed' }, { name: 'alpha' }, { name: 'Beta' }];
    expect(searchByName(entries, 'AL')).toEqual([{ name: 'alpha' }]);
    expect(sortByName(entries).map((e) => e.name)).toEqual([
      'alpha',
      'Beta',
      'Zed',
    ]);
  });

  test('filterFeats applies category and prerequisite filters', () => {
    const feats = [
      {
        name: 'Mage Slayer',
        source: 'PHB',
        category: 'G',
      },
      {
        name: 'Fighting Initiate',
        source: 'TCE',
        category: 'FS',
        prerequisite: ['Fighter level 1'],
      },
      {
        name: 'Boon of Spell Recall',
        source: 'DMG',
        category: 'EB',
      },
    ];

    const filteredByCategory = DataFilter.filterFeats(feats, {
      categories: ['FS', 'EB'],
    });
    expect(filteredByCategory.map((f) => f.name)).toEqual([
      'Fighting Initiate',
      'Boon of Spell Recall',
    ]);

    const filteredByCategoryAndPrereq = DataFilter.filterFeats(feats, {
      categories: ['FS', 'EB'],
      hasPrerequisite: true,
    });
    expect(filteredByCategoryAndPrereq.map((f) => f.name)).toEqual([
      'Fighting Initiate',
    ]);
  });

  test('unique extraction helpers return sorted distinct values', () => {
    const spells = [
      makeSpellFixture({
        school: 'A',
        level: 1,
        classes: { fromClassList: [{ name: 'Wizard', source: 'PHB' }] },
      }),
      makeSpellFixture({
        school: 'C',
        level: 3,
        classes: { fromClassList: [{ name: 'Cleric', source: 'PHB' }] },
      }),
    ];

    expect(
      extractUniqueSources([{ source: 'B' }, { source: 'A' }, { source: 'A' }]),
    ).toEqual(['A', 'B']);
    expect(
      extractUniqueSizes([
        makeRaceFixture({ size: ['M'] }),
        makeRaceFixture({ size: ['S'] }),
      ]),
    ).toEqual(['M', 'S']);
    expect(extractUniqueSchools(spells)).toEqual(['A', 'C']);
    expect(extractUniqueSpellLevels(spells)).toEqual([1, 3]);
    expect(extractUniqueClasses(spells)).toEqual(['Cleric', 'Wizard']);
    expect(
      extractUniqueItemTypes([
        { name: 'A', source: 'PHB', type: 'A' },
        { name: 'B', source: 'PHB', type: 'B' },
        { name: 'A2', source: 'PHB', type: 'A' },
      ]),
    ).toEqual(['A', 'B']);
    expect(
      extractUniqueRarities([
        { name: 'R', source: 'PHB', type: 'G', rarity: 'rare' },
        { name: 'U', source: 'PHB', type: 'G' },
        { name: 'C', source: 'PHB', type: 'G', rarity: 'common' },
      ]),
    ).toEqual(['common', 'rare']);
    expect(
      extractUniqueFeatCategories([
        { name: 'A', source: 'PHB', category: 'G' },
        { name: 'B', source: 'TCE', category: 'FS' },
        { name: 'C', source: 'DMG' },
        { name: 'D', source: 'DMG', category: 'G' },
      ]),
    ).toEqual(['FS', 'G']);
  });
});
