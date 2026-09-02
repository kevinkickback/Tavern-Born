import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
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
        <EquipmentPage />
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
    renderPage()

    expect(screen.getByText(/Canonical rules text/)).toBeTruthy()
    expect(screen.getByText('Additional Effect')).toBeTruthy()
    expect(screen.getByText('Structured entry text.')).toBeTruthy()
    expect(screen.queryByText('No description is available for this item.')).toBeNull()

    fireEvent.mouseMove(screen.getByText('Base Relic'))
    expect(screen.getByRole('tooltip').textContent).toContain('Base Relic')
    expect(screen.getByRole('tooltip').textContent).toContain('Resolved base-item tooltip text.')

    const itemHeader = screen.getByText('Item')
    expect(itemHeader.closest('[data-slot="scroll-area"]')).toBeNull()
    expect(
      screen
        .getByRole('button', { name: 'Inspect Canonical Item' })
        .closest('[data-slot="scroll-area"]'),
    ).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Inspect Custom Item' }))
    expect(screen.getByText('Stored custom description.')).toBeTruthy()
    expect(screen.queryByText(/Canonical rules text/)).toBeNull()
  })
})
