import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { RulesPreviewManager } from '@/components/editor/RulesPreviewManager'
import { TooltipProvider } from '@/components/ui/tooltip'
import { EquipmentPage } from '@/pages/equipment/EquipmentPage'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { GameData, Item5e } from '@/types/5etools'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

vi.mock('@/lib/storage/idb-storage', () => ({
  createIdbStorage: () => ({
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  }),
}))

const canonicalItem: Item5e = {
  name: 'Canonical Item',
  source: 'DMG',
  type: 'G',
  entries: [
    'Canonical rules text. See {@item Base Relic|PHB}.',
    { type: 'entries', name: 'Additional Effect', entries: ['Structured entry text.'] },
  ],
}

const baseRelic: Item5e = {
  name: 'Base Relic',
  source: 'PHB',
  type: 'G',
  entries: ['Resolved base-item tooltip text.'],
}

function renderPage() {
  return render(
    <MemoryRouter>
      <TooltipProvider>
        <RulesPreviewManager>
          <EquipmentPage />
        </RulesPreviewManager>
      </TooltipProvider>
    </MemoryRouter>,
  )
}

describe('EquipmentPage item details', () => {
  beforeEach(() => {
    const character = makeCharacterFixture({
      equipment: [
        {
          id: 'canonical-item',
          name: 'Canonical Item',
          source: 'DMG',
          type: 'G',
          quantity: 1,
          equipped: false,
          description: '',
        },
        {
          id: 'custom-item',
          name: 'Custom Item',
          source: 'HB',
          type: 'G',
          quantity: 1,
          equipped: false,
          description: 'Stored custom description.',
        },
        {
          id: 'healing-potion',
          name: 'Potion of Healing',
          source: 'PHB',
          type: 'P',
          quantity: 2,
          equipped: false,
        },
      ],
    })
    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    })
    useGameDataStore.setState({
      gameData: {
        items: [canonicalItem],
        itemsBase: [baseRelic],
        lookups: {
          itemLookup: new Map([['canonical item|dmg', canonicalItem]]),
          itemPropertyByAbbr: {},
        },
      } as GameData,
    })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  test('renders canonical entries, stored fallbacks, and a persistent inventory header', () => {
    const { container } = renderPage()

    expect(screen.getByText(/Canonical rules text/)).toBeTruthy()
    expect(screen.getByText('Additional Effect')).toBeTruthy()
    expect(screen.getByText('Structured entry text.')).toBeTruthy()
    expect(screen.queryByText('No description is available for this item.')).toBeNull()

    const itemStatistics = screen.getByRole('region', { name: 'Item statistics' })
    expect(within(itemStatistics).getByText('Quantity')).toBeTruthy()
    expect(within(itemStatistics).queryByText('Armor Class')).toBeNull()
    expect(within(itemStatistics).queryByText('Damage')).toBeNull()
    expect(within(itemStatistics).queryByText('Range')).toBeNull()
    expect(within(itemStatistics).queryByText('Properties')).toBeNull()
    expect(itemStatistics.className).toContain('bg-surface-raised')
    expect(itemStatistics.className).not.toContain('bg-background')

    fireEvent.mouseMove(screen.getByText('Base Relic'))
    expect(screen.getByRole('dialog').textContent).toContain('Base Relic')
    expect(screen.getByRole('dialog').textContent).toContain('Resolved base-item tooltip text.')

    const itemHeader = screen.getByText('Item')
    expect(itemHeader.closest('[data-slot="scroll-area"]')).toBeNull()
    expect(
      screen
        .getByRole('button', { name: 'Inspect Canonical Item' })
        .closest('[data-slot="scroll-area"]'),
    ).not.toBeNull()

    const summary = screen.getByRole('region', { name: 'Inventory summary' })
    const summaryGrid = container.querySelector('[data-slot="equipment-summary-grid"]')
    expect(summary.className).toContain('@container')
    expect(summary.className).not.toContain('overflow-x-auto')
    expect(summaryGrid?.className).toContain('@min-[820px]:grid-cols-[1fr_0.8fr_1.8fr]')
    expect(summaryGrid?.className).not.toContain('min-w-[820px]')
    expect(within(summary).queryByText('Armor Class')).toBeNull()
    expect(screen.getByLabelText('CP').parentElement?.parentElement?.className).toContain(
      '@min-[380px]:grid-cols-5',
    )

    fireEvent.click(screen.getByRole('button', { name: 'Inspect Custom Item' }))
    expect(screen.getByText('Stored custom description.')).toBeTruthy()
    expect(screen.queryByText(/Canonical rules text/)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Inspect Potion of Healing' }))
    expect(
      container
        .querySelector('[data-slot="item-detail-category-icon"]')
        ?.getAttribute('data-item-category'),
    ).toBe('Potions')
  })

  test('unequips invalid armor when restrictions are enabled', () => {
    const baseCharacter = makeCharacterFixture()
    const character = makeCharacterFixture({
      variantRules: { ...baseCharacter.variantRules, ignoreEquipRestrictions: true },
      proficiencies: {
        ...baseCharacter.proficiencies,
        armor: ['light armor', 'shields'],
      },
      equipment: [
        {
          id: 'heavy',
          name: 'Plate',
          type: 'HA',
          armorType: 'heavy',
          quantity: 1,
          equipped: true,
        },
        {
          id: 'light-first',
          name: 'Leather Armor',
          type: 'LA',
          armorType: 'light',
          quantity: 1,
          equipped: true,
        },
        {
          id: 'light-second',
          name: 'Studded Leather',
          type: 'LA',
          armorType: 'light',
          quantity: 1,
          equipped: true,
        },
        {
          id: 'shield',
          name: 'Shield',
          type: 'S',
          armorType: 'shield',
          quantity: 1,
          equipped: true,
        },
        {
          id: 'sword',
          name: 'Longsword',
          type: 'M',
          weaponCategory: 'martial',
          quantity: 1,
          equipped: true,
        },
      ],
    })
    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    })

    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Toggle equipment restrictions' }))

    const updated = useCharacterStore.getState().activeCharacter
    expect(updated?.variantRules?.ignoreEquipRestrictions).toBe(false)
    expect(updated?.equipment.filter((item) => item.equipped).map((item) => item.id)).toEqual([
      'light-first',
      'shield',
      'sword',
    ])
  })
})
