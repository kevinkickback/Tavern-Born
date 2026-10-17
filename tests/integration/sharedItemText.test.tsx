import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { clear, get } from 'idb-keyval'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { RulesPreviewManager } from '@/components/editor/RulesPreviewManager'
import { TooltipProvider } from '@/components/ui/tooltip'
import { FiveEToolsDataLoader } from '@/lib/5etools/dataLoader'
import { filterCharacterItems } from '@/lib/5etools/playerItemAvailability'
import {
  addManualEquipmentBatchCommand,
  removeManualEquipmentCommand,
} from '@/lib/character/commands/equipmentCommands'
import { buildCompendiumEntries } from '@/lib/compendiumEntries'
import { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import { readGameDataCache, writeGameDataCache } from '@/lib/storage/dataCache'
import { BuildReviewPage } from '@/pages/build/review/ReviewPage'
import { CompendiumEntryDetails } from '@/pages/compendium/CompendiumEntryDetails'
import { EquipmentPage } from '@/pages/equipment/EquipmentPage'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { ItemEntry5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { firePotion, itemTextTypes, resistanceFragments } from '../fixtures/itemEntryFixtures'

// Exercise the real acknowledged IndexedDB boundary rather than the shared UI storage mock.
vi.unmock('@/lib/storage/idb-storage')

function catalog(fragments = resistanceFragments) {
  const loader = new FiveEToolsDataLoader(
    {
      type: 'local',
      path: '/fixture',
      isValid: true,
      availableResources: ['items.json', 'items-base.json'],
    },
    {
      type: 'local',
      readJson: async (file) =>
        structuredClone(
          file === 'items.json'
            ? { item: [firePotion] }
            : { baseitem: [], itemType: itemTextTypes, itemEntry: fragments },
        ),
    },
  )
  return loader.loadAllData()
}

function show(element: ReactElement) {
  return render(
    <MemoryRouter initialEntries={['/build/review?section=overview']}>
      <TooltipProvider>
        <RulesPreviewManager>{element}</RulesPreviewManager>
      </TooltipProvider>
    </MemoryRouter>,
  )
}

describe('shared item text consumers and persistence', () => {
  beforeEach(async () => {
    await clear()
    await useCharacterStore.persist.rehydrate()
    await useCharacterStore.getState().setCharacters([])
    useCharacterStore.getState().setActiveCharacter(null)
    useGameDataStore.setState({ gameData: null })
  })
  afterEach(() => {
    cleanup()
    useGameDataStore.setState({ gameData: null })
  })

  test('item details, Review, Compendium and PDF descriptions share loaded text', async () => {
    const data = await catalog()
    const item = data.items[0]
    const character = makeCharacterFixture({
      race: '',
      background: '',
      classProgression: [],
      allowedSources: ['PHB'],
      equipment: [
        {
          id: 'potion',
          name: item.name,
          source: item.source,
          type: item.type,
          quantity: 1,
          equipped: false,
          rarity: 'uncommon',
          description: 'Player-written description.',
        },
      ],
    })
    useGameDataStore.setState({ gameData: data })
    useCharacterStore.setState({
      characters: [character],
      activeCharacter: character,
      activeCharacterId: character.id,
    })
    const expected = 'When you drink this potion, you gain resistance to fire damage for 1 hour.'
    expect(
      filterCharacterItems(data.items, { allowedSources: ['PHB'], originSystem: '2014' }),
    ).toEqual([item])
    expect(data.sources.map((source) => source.abbreviation)).toEqual(['DMG'])
    show(<EquipmentPage />)
    expect(screen.getByText(expected)).toBeTruthy()
    cleanup()
    show(<BuildReviewPage />)
    fireEvent.click(screen.getByText('Equipment'))
    expect(screen.getByText(expected)).toBeTruthy()
    expect(screen.queryByText('Player-written description.')).toBeNull()
    cleanup()
    const entry = buildCompendiumEntries(data).find((entry) => entry.name === item.name)!
    expect(entry.description).toContain('resistance to fire damage')
    show(<CompendiumEntryDetails selectedEntry={entry} />)
    expect(screen.getByText(expected)).toBeTruthy()
    const vm = createCharacterSheetViewModel(character, data.lookups!)
    expect(vm.magicItems[0].description).toBe('Player-written description.')
    expect(
      createCharacterSheetViewModel(
        { ...character, equipment: [{ ...character.equipment[0], description: '' }] },
        data.lookups!,
      ).magicItems[0].description,
    ).toBe(expected)
    expect(useCharacterStore.getState().activeCharacter?.equipment).toEqual(character.equipment)
  })

  test('real save, IDB reopen and remove-one-of-two preserve owned inventory while source text disappears/restores', async () => {
    const data = await catalog()
    useGameDataStore.setState({ gameData: data })
    const initial = makeCharacterFixture({
      id: 'item-text-save',
      race: '',
      background: '',
      classProgression: [],
      equipment: [],
    })
    const added = await useCharacterStore.getState().addCharacter(initial)
    useCharacterStore.getState().setActiveCharacter(added.id)
    const current = useCharacterStore.getState().activeCharacter!
    const command = addManualEquipmentBatchCommand(current, current.provenance!, [
      data.items[0],
      data.items[0],
    ])
    useCharacterStore.getState().updateCharacter(added.id, {
      ...command.characterPatch,
      provenance: command.provenanceUpdate,
    })
    const draft = useCharacterStore.getState().activeCharacter!
    const equipment = draft.equipment.map((item, index) => ({
      ...item,
      quantity: index + 2,
      equipped: true,
      attuned: true,
      description: index ? '' : 'Player-written description.',
    }))
    useCharacterStore.getState().updateCharacter(added.id, { equipment })
    await useCharacterStore.getState().saveActiveCharacter()
    const stored = await get<{ state: { characters: Character[] } }>('character-storage')
    expect(stored!.state.characters[0].equipment).toEqual(equipment)
    expect(JSON.stringify(stored)).not.toContain('entriesTemplate')
    const originalLedger = stored!.state.characters[0].provenance
    useCharacterStore.getState().setActiveCharacter(null)
    await useCharacterStore.persist.rehydrate()
    useCharacterStore.getState().setActiveCharacter(added.id)
    expect(useCharacterStore.getState().activeCharacter!.equipment).toEqual(equipment)
    const cacheConfig = { type: 'local' as const, path: '/fixture', isValid: true }
    await writeGameDataCache(data, cacheConfig)
    const cached = await readGameDataCache()
    expect(cached?.cacheSchemaVersion).toBe(37)
    expect(cached?.data.items[0].entries).toEqual(data.items[0].entries)
    useGameDataStore.setState({ gameData: cached!.data })
    const empty: ItemEntry5e[] = []
    for (const fragments of [empty, resistanceFragments]) {
      const refreshed = await catalog(fragments)
      await act(() => useGameDataStore.setState({ gameData: refreshed }))
      const reopened = useCharacterStore.getState().activeCharacter!
      expect(reopened.equipment).toEqual(equipment)
      expect(reopened.provenance).toEqual(originalLedger)
      const descriptions = createCharacterSheetViewModel(
        reopened,
        refreshed.lookups!,
      ).magicItems.map((item) => item.description)
      expect(descriptions[0]).toBe('Player-written description.')
      expect(descriptions[1]).toBe(
        fragments.length
          ? 'When you drink this potion, you gain resistance to fire damage for 1 hour.'
          : '[Item rules text unavailable]',
      )
    }
    const reopened = useCharacterStore.getState().activeCharacter!
    const removed = removeManualEquipmentCommand(reopened, reopened.provenance!, equipment[0].id)
    useCharacterStore.getState().updateCharacter(added.id, {
      ...removed.characterPatch,
      provenance: removed.provenanceUpdate,
    })
    await useCharacterStore.getState().saveActiveCharacter()
    useCharacterStore.getState().setActiveCharacter(null)
    await useCharacterStore.persist.rehydrate()
    useCharacterStore.getState().setActiveCharacter(added.id)
    const final = useCharacterStore.getState().activeCharacter!
    expect(final.equipment).toEqual([equipment[1]])
    expect(Object.values(final.provenance!.equipment).flat()).not.toHaveLength(0)
    expect(final.schemaVersion).toBe(11)
  })
})
