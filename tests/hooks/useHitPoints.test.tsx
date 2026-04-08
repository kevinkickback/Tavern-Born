import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('@/lib/storage/idb-storage', () => ({
  createIdbStorage: () => ({
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  }),
}));

vi.mock('@/hooks/data/useGameData', () => ({
  useClasses: () => [
    { name: 'Rogue', source: 'PHB', hd: { faces: 8 } },
    { name: 'Wizard', source: 'PHB', hd: { faces: 6 } },
  ],
}));

import { useHitPoints } from '@/hooks/character/useHitPoints';
import { useCharacterStore } from '@/store/characterStore';
import { makeCharacterFixture } from '../fixtures/characterFixtures';

function resetCharacterStore() {
  useCharacterStore.setState({
    characters: [],
    activeCharacterId: null,
    activeCharacter: null,
  });
}

describe('useHitPoints hook', () => {
  beforeEach(() => {
    resetCharacterStore();
  });

  test('calculates max HP correctly for multiclass progression', () => {
    const character = makeCharacterFixture({
      id: 'hp-hook-multi',
      class: 'Rogue',
      classSource: 'PHB',
      level: 8,
      classProgression: [
        { name: 'Rogue', source: 'PHB', levels: 5 },
        { name: 'Wizard', source: 'PHB', levels: 3 },
      ],
      abilityScores: {
        strength: 10,
        dexterity: 14,
        constitution: 14,
        intelligence: 14,
        wisdom: 10,
        charisma: 10,
      },
      variantRules: { averageHitPoints: true },
      hitPoints: { max: 1, current: 1, temporary: 0 },
    });

    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    });

    const { result } = renderHook(() => useHitPoints());

    expect(result.current.conMod).toBe(2);
    expect(result.current.levelsHPBreakdown).toEqual([
      0, 10, 7, 7, 7, 7, 6, 6, 6,
    ]);
    expect(result.current.calculatedMaxHP).toBe(56);

    act(() => {
      result.current.syncMaxHP();
    });

    expect(useCharacterStore.getState().activeCharacter?.hitPoints.max).toBe(
      56,
    );
  });
});
