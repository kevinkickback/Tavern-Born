import { readFileSync } from 'node:fs'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { RulesPreviewManager } from '@/components/editor/RulesPreviewManager'
import { TooltipProvider } from '@/components/ui/tooltip'
import { composeGameDataLayers } from '@/lib/5etools/contentLayers'
import { createEmptyGameData } from '@/lib/5etools/emptyGameData'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { parseItemProperties, parseItems, parseItemTypes } from '@/lib/5etools/parsers/basic'
import { EquipmentPage } from '@/pages/equipment/EquipmentPage'
import { RulesPage } from '@/pages/rules/RulesPage'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { GameData, Item5e } from '@/types/5etools'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

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

  test('shows full property names in the item details pane', () => {
    const character = useCharacterStore.getState().activeCharacter!
    const withProperties = {
      ...character,
      equipment: character.equipment.map((item) =>
        item.id === 'canonical-item' ? { ...item, properties: ['L|PHB'] } : item,
      ),
    }
    useCharacterStore.setState({
      characters: [withProperties],
      activeCharacter: withProperties,
    })
    const gameData = useGameDataStore.getState().gameData!
    useGameDataStore.setState({
      gameData: {
        ...gameData,
        lookups: { ...gameData.lookups!, itemPropertyByAbbr: { L: 'Light' } },
      },
    })

    renderPage()

    const statistics = screen.getByRole('region', { name: 'Item statistics' })
    expect(within(statistics).getByText('Light')).toBeTruthy()
    expect(within(statistics).queryByText('L')).toBeNull()
  })

  test('shows authored group members and keeps ordinary item facts without inventing prose', () => {
    const bases = JSON.parse(readFileSync('resources/srd/data/items-base.json', 'utf8'))
    const catalog = composeGameDataLayers([
      {
        ...createEmptyGameData(),
        items: parseItems(
          JSON.parse(readFileSync('resources/srd/data/items.json', 'utf8')),
        ) as Item5e[],
        itemsBase: parseItems(bases) as Item5e[],
        itemTypes: parseItemTypes(bases),
        itemProperties: parseItemProperties(bases),
      },
    ])
    useGameDataStore.setState({ gameData: { ...catalog, lookups: buildGameDataLookups(catalog) } })
    const character = makeCharacterFixture({
      allowedSources: ['PHB', 'DMG'],
      equipment: [
        {
          id: 'group',
          name: 'Musical Instrument',
          source: 'PHB',
          type: 'INS',
          quantity: 1,
          equipped: false,
        },
        { id: 'hammer', name: 'Warhammer', source: 'PHB', type: 'M', quantity: 1, equipped: false },
        { id: 'sling', name: 'Sling', source: 'PHB', type: 'R', quantity: 1, equipped: false },
        {
          id: 'saved-group',
          name: 'Dragon Scale Mail',
          source: 'DMG',
          type: 'MA',
          quantity: 1,
          equipped: false,
          description: 'Player-authored notes for the saved group.',
        },
      ],
    })
    useCharacterStore.setState({ characters: [character], activeCharacter: character })
    renderPage()

    const drum = screen.getByRole('button', { name: 'Drum (PHB)' })
    expect(screen.queryByRole('button', { name: 'Drum (XPHB)' })).toBeNull()
    fireEvent.mouseMove(drum)
    const preview = screen.getByRole('dialog', { name: 'Drum preview' })
    expect(preview.textContent).toContain('6 gp')
    expect(preview.textContent).toContain('3 lb')

    fireEvent.click(screen.getByRole('button', { name: 'Inspect Warhammer' }))
    const facts = () => within(screen.getByRole('region', { name: 'Item statistics' }))
    expect(facts().getByText('15 gp')).toBeTruthy()
    expect(facts().getByText('1d8 Bludgeoning (1d10 versatile)')).toBeTruthy()
    expect(facts().getByText('Versatile')).toBeTruthy()
    expect(screen.getByText('No description is available for this item.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Inspect Sling' }))
    expect(facts().getByText('30/120')).toBeTruthy()
    expect(screen.getByText(/The range lists two numbers/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Inspect Dragon Scale Mail' }))
    expect(screen.getByText('Player-authored notes for the saved group.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Black Dragon Scale Mail (DMG)' })).toBeTruthy()
  })

  test.each([
    { savedName: baseRelic.name, savedSource: undefined, item: baseRelic },
    {
      savedName: 'Base|Relic',
      savedSource: 'PHB',
      item: { ...baseRelic, name: 'Base', source: 'Relic|PHB' },
    },
  ])('shows saved physical values without substituting a different item for $savedName', ({
    savedName,
    savedSource,
    item,
  }) => {
    const character = makeCharacterFixture({
      equipment: [
        {
          id: 'saved',
          name: savedName,
          source: savedSource,
          type: 'M',
          quantity: 2,
          equipped: false,
          dmg1: '1d4',
          dmgType: 's',
          weight: 2,
          description: 'Saved rules text.',
        },
      ],
    })
    useCharacterStore.setState({ characters: [character], activeCharacter: character })
    const catalog = useGameDataStore.getState().gameData!
    useGameDataStore.setState({
      gameData: {
        ...catalog,
        lookups: {
          ...catalog.lookups!,
          itemLookup: new Map([[`${item.name}|${item.source}`.toLowerCase(), item]]),
        },
      },
    })
    renderPage()
    const statistics = screen.getByRole('region', { name: 'Item statistics' })
    expect(within(statistics).getByText('1d4 Slashing')).toBeTruthy()
    expect(within(statistics).getByText('2 lb each')).toBeTruthy()
    expect(screen.getByText('Saved rules text.')).toBeTruthy()
    expect(screen.queryByText('Resolved base-item tooltip text.')).toBeNull()
  })

  test('recovers property names when the saved lookup only contains Versatile', () => {
    const character = useCharacterStore.getState().activeCharacter!
    const withProperties = {
      ...character,
      equipment: character.equipment.map((item) =>
        item.id === 'canonical-item' ? { ...item, properties: ['A', 'H', '2H'] } : item,
      ),
    }
    useCharacterStore.setState({
      characters: [withProperties],
      activeCharacter: withProperties,
    })
    const gameData = useGameDataStore.getState().gameData!
    useGameDataStore.setState({
      gameData: {
        ...gameData,
        itemProperties: [
          { abbreviation: 'A', source: 'PHB', entries: [{ name: 'Ammunition' }] },
          { abbreviation: 'H', source: 'PHB', entries: [{ name: 'Heavy' }] },
          { abbreviation: '2H', source: 'PHB', entries: [{ name: 'Two-Handed' }] },
        ],
        lookups: { ...gameData.lookups!, itemPropertyByAbbr: { V: 'Versatile' } },
      },
    })

    renderPage()

    const statistics = screen.getByRole('region', { name: 'Item statistics' })
    expect(within(statistics).getByText('Ammunition, Heavy, Two-Handed')).toBeTruthy()
    expect(within(statistics).queryByText('A, H, 2H')).toBeNull()
  })

  test('shares the Heavy toggle with Rules and preserves armor and inventory', () => {
    const original = useCharacterStore.getState().activeCharacter!
    const character = {
      ...original,
      variantRules: { ignoreEquipRestrictions: true, allowAbilityScoresAbove20: true },
    }
    useCharacterStore.setState({ characters: [character], activeCharacter: character })

    const equipment = renderPage()
    const heavy = screen.getByRole('button', {
      name: 'Ignore Heavy Weapon Requirements',
      pressed: false,
    })
    fireEvent.click(heavy)
    expect(heavy.getAttribute('aria-pressed')).toBe('true')
    const saved = characterPersistenceSchema.parse(useCharacterStore.getState().activeCharacter)
    expect(saved.variantRules).toMatchObject({
      ignoreEquipRestrictions: true,
      allowAbilityScoresAbove20: true,
      ignoreHeavyWeaponRequirements: true,
    })
    expect(saved.equipment).toEqual(character.equipment)
    equipment.unmount()

    const rules = render(
      <MemoryRouter initialEntries={['/rules?section=character-options']}>
        <RulesPage />
      </MemoryRouter>,
    )
    fireEvent.click(
      screen.getByRole('switch', { name: 'Ignore Heavy Weapon Requirements', checked: true }),
    )
    rules.unmount()

    renderPage()
    expect(
      screen.getByRole('button', { name: 'Ignore Heavy Weapon Requirements', pressed: false }),
    ).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Toggle equipment restrictions', pressed: true }),
    ).toBeTruthy()
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
          id: 'shield-second',
          name: 'Other Shield',
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
