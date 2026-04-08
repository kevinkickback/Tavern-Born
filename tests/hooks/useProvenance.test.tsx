import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('@/lib/storage/idb-storage', () => ({
  createIdbStorage: () => ({
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  }),
}));

import { useProvenance } from '@/hooks/character/useProvenance';
import { useCharacterStore } from '@/store/characterStore';
import { useGameDataStore } from '@/store/gameDataStore';
import { makeCharacterFixture } from '../fixtures/characterFixtures';

function resetStore() {
  useCharacterStore.setState({
    characters: [],
    activeCharacterId: null,
    activeCharacter: null,
  });
  useGameDataStore.setState({ gameData: null });
}

function setGameDataItems(
  items: Array<{ name: string; source: string; type: string; ac?: number }>,
) {
  useGameDataStore.setState({
    gameData: {
      races: [],
      classes: [],
      backgrounds: [],
      spells: [],
      feats: [],
      items: items as never,
      itemsBase: [],
      classFeatures: [],
      actions: [],
      conditions: [],
      deities: [],
      skills: [],
      senses: [],
      languages: [],
      magicvariants: [],
      optionalfeatures: [],
      variantrules: [],
      sources: [],
    },
  });
}

describe('useProvenance mutations', () => {
  beforeEach(() => {
    resetStore();
  });

  test('applyRaceSelection materializes fixed race skills and languages', () => {
    const character = makeCharacterFixture({
      id: 'race-profs',
      race: 'Human',
      skills: {},
    });

    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    });

    const { result } = renderHook(() => useProvenance());

    result.current.applyRaceSelection({
      name: 'Elf',
      source: 'PHB',
      skillProficiencies: [{ perception: true }],
      languageProficiencies: [{ elvish: true }],
      ability: [],
    });

    const updated = useCharacterStore.getState().activeCharacter;
    expect(updated?.proficiencies.skills).toEqual(['perception']);
    expect(updated?.proficiencies.languages).toContain('elvish');
    expect(updated?.skills.perception).toEqual({
      proficient: true,
      expertise: false,
      bonus: 0,
    });
  });

  test('applyClassSelection materializes saving throw proficiencies', () => {
    const character = makeCharacterFixture({
      id: 'class-saves',
      class: 'Fighter',
      classSource: 'PHB',
    });

    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    });

    const { result } = renderHook(() => useProvenance());

    result.current.applyClassSelection({
      name: 'Cleric',
      source: 'PHB',
      proficiency: ['wis', 'cha'],
      startingProficiencies: {
        armor: ['light'],
        weapons: ['simple'],
        tools: [],
      },
    });

    const updated = useCharacterStore.getState().activeCharacter;
    expect(updated?.proficiencies.savingThrows).toEqual(['wisdom', 'charisma']);
  });

  test('applyClassSelection should add default class starting equipment', () => {
    setGameDataItems([
      { name: 'Chain Mail', source: 'phb', type: 'HA', ac: 16 },
      { name: 'Shield', source: 'phb', type: 'S', ac: 2 },
    ]);

    const character = makeCharacterFixture({ id: 'class-equipment' });

    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    });

    const { result } = renderHook(() => useProvenance());

    result.current.applyClassSelection({
      name: 'Fighter',
      source: 'PHB',
      proficiency: [],
      startingProficiencies: {},
      startingEquipment: {
        defaultData: [
          {
            a: ['Chain Mail|phb'],
            b: ['Shield|phb'],
          },
        ],
      },
    });

    const updated = useCharacterStore.getState().activeCharacter;
    expect(updated?.equipment.map((item) => item.name)).toContain('Chain Mail');
    expect(updated?.equipment.map((item) => item.name)).not.toContain('Shield');
  });

  test('applyBackgroundSelection should apply selected option and currency', () => {
    setGameDataItems([{ name: 'Pouch', source: 'phb', type: 'G' }]);

    const character = makeCharacterFixture({ id: 'background-equipment' });

    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    });

    const { result } = renderHook(() => useProvenance());

    result.current.applyBackgroundSelection(
      {
        name: 'Acolyte',
        source: 'PHB',
        skillProficiencies: [],
        languageProficiencies: [],
        toolProficiencies: [],
        startingEquipment: [
          {
            _: [{ special: 'sticks of incense', quantity: 5 }],
            a: ['Pouch|phb'],
            b: [
              { special: 'book of prayer' },
              { value: 250 },
              { item: 'Pouch|phb', quantity: 1, containsValue: 35 },
            ],
          },
        ],
      },
      'b',
    );

    const updated = useCharacterStore.getState().activeCharacter;
    expect(updated?.equipment.map((item) => item.name)).toEqual([
      'sticks of incense',
      'book of prayer',
      'Pouch',
    ]);
    expect(updated?.currency).toEqual({ cp: 5, sp: 8, ep: 0, gp: 2, pp: 0 });
    expect(updated?.backgroundEquipmentChoice).toBe('b');
  });
});
