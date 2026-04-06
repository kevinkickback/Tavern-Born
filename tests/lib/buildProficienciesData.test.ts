import { describe, expect, test } from 'vitest';
import {
  buildChoiceCounts,
  buildSkillDescriptions,
  buildToolChoiceSlots,
  buildToolSubtypeOptionsByKind,
  normalizeGenericToolKind,
} from '@/pages/build/proficiencies/model/data';

describe('buildProficienciesData', () => {
  test('buildSkillDescriptions supports object and array input', () => {
    expect(
      buildSkillDescriptions({
        arcana: { name: 'Arcana', entries: ['lore'] },
      }),
    ).toEqual({ arcana: ['lore'] });

    expect(
      buildSkillDescriptions([{ name: 'Stealth', entries: ['hide'] }]),
    ).toEqual({ stealth: ['hide'] });
  });

  test('buildChoiceCounts returns remaining picks per domain', () => {
    const counts = buildChoiceCounts([
      {
        id: 'skills-1',
        domain: 'skills',
        sourceTag: {
          sourceType: 'class',
          sourceName: 'Rogue',
          grantType: 'choice',
          label: 'Rogue',
        },
        chooseCount: 2,
        optionPool: ['Stealth', 'Acrobatics'],
        selected: ['Stealth'],
        status: 'partially-resolved',
      },
      {
        id: 'tools-1',
        domain: 'tools',
        sourceTag: {
          sourceType: 'background',
          sourceName: 'Urchin',
          grantType: 'choice',
          label: 'Urchin',
        },
        chooseCount: 1,
        optionPool: ["Thieves' Tools"],
        selected: [],
        status: 'pending',
      },
    ]);

    expect(counts).toEqual({
      skills: 1,
      armor: 0,
      weapons: 0,
      tools: 1,
      languages: 0,
    });
  });

  test('normalizeGenericToolKind recognizes known generic tokens', () => {
    expect(normalizeGenericToolKind('Any Musical Instrument')).toBe(
      'musical instrument',
    );
    expect(normalizeGenericToolKind("any artisan's tool")).toBe(
      "artisan's tools",
    );
    expect(normalizeGenericToolKind('Any Gaming Set')).toBe('gaming set');
    expect(normalizeGenericToolKind("Thieves' Tools")).toBeNull();
  });

  test('buildToolSubtypeOptionsByKind filters by allowed sources and deduplicates names', () => {
    const byKind = buildToolSubtypeOptionsByKind({
      itemsBase: [
        { name: 'Lute', type: 'INS|PHB', source: 'PHB' },
        { name: 'Lyre', type: 'INS|PHB', source: 'XGE' },
        { name: "Smith's Tools", type: 'AT|PHB', source: 'PHB' },
        { name: 'Dice Set', type: 'GS|PHB', source: 'PHB' },
      ],
      allowedSources: ['PHB'],
    });

    expect(byKind['musical instrument']).toEqual(['Lute']);
    expect(byKind["artisan's tools"]).toEqual(["Smith's Tools"]);
    expect(byKind['gaming set']).toEqual(['Dice Set']);
  });

  test('buildToolChoiceSlots expands remaining generic tool picks into slots', () => {
    const slots = buildToolChoiceSlots({
      choices: [
        {
          id: 'choice-1',
          domain: 'tools',
          sourceTag: {
            sourceType: 'class',
            sourceName: 'Bard',
            grantType: 'choice',
            label: 'Bard',
          },
          chooseCount: 2,
          optionPool: ['any musical instrument'],
          selected: ['Lute'],
          status: 'partially-resolved',
        },
      ],
      selectedTools: ['Lute'],
      toolSubtypeOptionsByKind: {
        'musical instrument': ['Lute', 'Lyre'],
        "artisan's tools": ["Smith's Tools"],
        'gaming set': ['Dice Set'],
      },
    });

    expect(slots).toEqual([
      {
        id: 'choice-1:0',
        choiceId: 'choice-1',
        label: 'musical instrument',
        sourceName: 'Bard',
        options: ['Lyre'],
      },
    ]);
  });
});
