import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { ItemSelectionModal } from '@/components/modals/ItemSelectionModal'
import { expandItemEntries } from '@/lib/5etools/itemEntries'
import { useGameDataStore } from '@/store/gameDataStore'
import type { GameDataLookups, Item5e } from '@/types/5etools'
import { makeGameDataFixture } from '../fixtures/gameDataFixtures'
import { firePotion, resistanceFragments } from '../fixtures/itemEntryFixtures'

vi.mock('@/components/modals/SelectionModal', () => ({
  SelectionModal: ({
    items,
    renderCard,
    selectionHint,
  }: {
    items: Item5e[]
    renderCard: (item: Item5e, selected: boolean, canSelect: boolean) => ReactNode
    selectionHint?: ReactNode
  }) => (
    <div>
      {selectionHint}
      {items.map((item) => (
        <div key={`${item.name}|${item.source}`}>{renderCard(item, false, true)}</div>
      ))}
    </div>
  ),
}))

const lookups: GameDataLookups = {
  classesByKey: {},
  racesByKey: {},
  backgroundsByKey: {},
  featsByKey: {},
  classFeaturesByKey: {},
  spellsByKey: {},
  optionalFeaturesByKey: {},
  subclassesByKey: {},
  itemLookup: new Map(),
  itemPropertyByAbbr: {},
  itemTypeByAbbr: { LA: 'Light Armor' },
  skillToAbilityMap: {},
  skillList: [],
  conditionNames: [],
}

describe('ItemSelectionModal', () => {
  test('renders expanded shared rules text in the existing item card', () => {
    const items = expandItemEntries([firePotion], resistanceFragments)
    useGameDataStore.setState({ gameData: makeGameDataFixture({ items, lookups }) })
    render(<ItemSelectionModal open onOpenChange={vi.fn()} items={items} onConfirm={vi.fn()} />)
    expect(
      screen.getByText(
        'When you drink this potion, you gain resistance to fire damage for 1 hour.',
      ),
    ).toBeTruthy()
  })
  afterEach(() => {
    cleanup()
    useGameDataStore.setState({ gameData: null })
  })

  test('shows only the specific armor category, source provenance, and source management', () => {
    useGameDataStore.setState({ gameData: makeGameDataFixture({ lookups }) })
    const onManageSources = vi.fn()

    render(
      <ItemSelectionModal
        open
        onOpenChange={vi.fn()}
        items={[
          {
            name: 'Leather Armor',
            source: 'PHB',
            type: 'LA',
            ac: 11,
            rarity: 'none',
          },
        ]}
        onConfirm={vi.fn()}
        onManageSources={onManageSources}
      />,
    )

    expect(screen.queryByText('Armor', { exact: true })).toBeNull()
    expect(screen.getByText('Light Armor')).toBeTruthy()
    const source = screen.getByText('PHB')
    expect(source.parentElement?.parentElement).toBe(
      screen.getByText('Leather Armor').parentElement,
    )
    expect(screen.queryByText(/Core potions and spell scrolls are included/)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Manage additional content' }))
    expect(onManageSources).toHaveBeenCalledOnce()
  })

  test('shows the full name and note for a structured item property', () => {
    useGameDataStore.setState({
      gameData: makeGameDataFixture({
        lookups: { ...lookups, itemPropertyByAbbr: { '2H': 'Two-Handed' } },
      }),
    })

    render(
      <ItemSelectionModal
        open
        onOpenChange={vi.fn()}
        items={[
          {
            name: 'Lance',
            source: 'XPHB',
            type: 'M',
            property: [{ uid: '2H|XPHB', note: 'unless mounted' }],
          },
        ]}
        onConfirm={vi.fn()}
      />,
    )

    expect(screen.getByText('Two-Handed (unless mounted)')).toBeTruthy()
  })
})
