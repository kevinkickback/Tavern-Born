import { describe, expect, test } from 'vitest';
import {
  buildCompendiumEntries,
  filterCompendiumEntries,
} from '@/lib/compendiumEntries';

describe('compendiumEntries', () => {
  test('buildCompendiumEntries flattens multiple game data families', () => {
    const entries = buildCompendiumEntries({
      races: { elf: { name: 'Elf', source: 'PHB', entries: ['race text'] } },
      classes: {
        wizard: {
          name: 'Wizard',
          source: 'PHB',
          fluff: { entries: ['class text'] },
        },
      },
      spells: {
        mm: { name: 'Magic Missile', source: 'PHB', level: 1, school: 'E' },
      },
      items: [{ name: 'Rope', source: 'PHB', entries: ['item text'] }],
    });

    expect(entries.map((e) => `${e.type}:${e.name}`)).toEqual([
      'Race:Elf',
      'Class:Wizard',
      'Spell:Magic Missile',
      'Item:Rope',
    ]);
  });

  test('buildCompendiumEntries supports array collections for primary families', () => {
    const entries = buildCompendiumEntries({
      races: [{ name: 'Elf', source: 'PHB', entries: ['race text'] }],
      classes: [
        {
          name: 'Wizard',
          source: 'PHB',
          fluff: { entries: ['class text'] },
        },
      ],
      spells: [{ name: 'Magic Missile', source: 'PHB', level: 1, school: 'E' }],
      backgrounds: [
        { name: 'Acolyte', source: 'PHB', entries: ['background text'] },
      ],
    });

    expect(entries.map((e) => `${e.type}:${e.name}`)).toEqual([
      'Race:Elf',
      'Class:Wizard',
      'Spell:Magic Missile',
      'Background:Acolyte',
    ]);
  });

  test('filterCompendiumEntries filters by type, source, and text query', () => {
    const entries = [
      {
        name: 'Elf',
        type: 'Race',
        source: 'PHB',
        data: {},
      },
      {
        name: 'Magic Missile',
        type: 'Spell',
        source: 'PHB',
        data: {},
      },
      {
        name: 'Mordenkainen',
        type: 'Deity',
        source: 'XGE',
        data: {},
      },
    ];

    const filtered = filterCompendiumEntries(
      entries,
      'magic',
      new Set(['Spell']),
      new Set(['PHB']),
    );

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.name).toBe('Magic Missile');
  });
});
