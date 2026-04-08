import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { AppHeader } from '@/components/layout/AppHeader';
import { useCharacterStore } from '@/store/characterStore';
import { makeCharacterFixture } from '../fixtures/characterFixtures';

vi.mock('@/lib/storage/idb-storage', () => ({
  createIdbStorage: () => ({
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  }),
}));

vi.mock('@/components/modals/LevelUpModal', () => ({
  LevelUpModal: () => null,
}));

vi.mock('@/hooks/character/useArmorClass', () => ({
  useArmorClass: () => ({
    calculatedAC: 17,
    storedAC: 18,
    syncAC: vi.fn(),
    setAC: vi.fn(),
  }),
}));

vi.mock('@/hooks/character/useHitPoints', () => ({
  useHitPoints: () => ({
    hitPoints: { max: 42, current: 37, temporary: 0 },
    calculatedMaxHP: 40,
    hitDie: 10,
    conMod: 2,
    levelsHPBreakdown: [0, 12, 8, 8, 7, 7],
    setCurrentHP: vi.fn(),
    setTempHP: vi.fn(),
    setMaxHP: vi.fn(),
    syncMaxHP: vi.fn(),
    heal: vi.fn(),
    damage: vi.fn(),
  }),
}));

describe('app header character summary', () => {
  beforeEach(() => {
    const character = makeCharacterFixture({
      name: 'Aelar',
      race: 'Elf',
      class: 'Fighter',
      level: 2,
      classProgression: [
        { name: 'Fighter', source: 'PHB', levels: 3 },
        { name: 'Wizard', source: 'PHB', levels: 2 },
      ],
    });

    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
      hasUnsavedChangesFlag: false,
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  test('should show multiclass-aware level and class summary in header', () => {
    render(<AppHeader />);

    expect(screen.getByText('Aelar')).toBeTruthy();
    expect(screen.getByText('Elf . Fighter 3 / Wizard 2')).toBeTruthy();
  });

  test('should show current AC and max HP in icon badges', () => {
    render(<AppHeader />);

    expect(screen.getByTestId('header-ac-badge')).toBeTruthy();
    expect(screen.getByTestId('header-hp-badge')).toBeTruthy();
    expect(screen.getByText('18')).toBeTruthy();
    expect(screen.getByText('42')).toBeTruthy();
  });
});
