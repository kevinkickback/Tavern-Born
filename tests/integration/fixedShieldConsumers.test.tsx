import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { clear, get } from 'idb-keyval'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { RulesPreviewManager } from '@/components/editor/RulesPreviewManager'
import { TooltipProvider } from '@/components/ui/tooltip'
import { composeGameDataLayers } from '@/lib/5etools/contentLayers'
import { computeEffectiveCharacterArmorClass } from '@/lib/calculations/armorClass'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { resolveClassChoiceOptionEntity } from '@/lib/character/classChoiceOptions'
import {
  addManualEquipmentBatchCommand,
  removeManualEquipmentCommand,
} from '@/lib/character/commands/equipmentCommands'
import { buildCompendiumEntries } from '@/lib/compendiumEntries'
import { mapCharacterSheet2024 } from '@/lib/pdf/characterSheetMapping2024'
import { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import { getPdfExportPreflight } from '@/lib/pdf/exportPreflight'
import { getCharacterReadiness } from '@/lib/readiness/characterReadiness'
import { readGameDataCache, writeGameDataCache } from '@/lib/storage/dataCache'
import { BuildReviewPage } from '@/pages/build/review/ReviewPage'
import { CompendiumEntryDetails } from '@/pages/compendium/CompendiumEntryDetails'
import { EquipmentPage } from '@/pages/equipment/EquipmentPage'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Character } from '@/types/character'
import { characterSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { loadFixedShields } from '../fixtures/fixedShieldFixtures'

vi.unmock('@/lib/storage/idb-storage')
beforeEach(async () => {
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(600)
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(900)
  await clear()
  await useCharacterStore.persist.rehydrate()
  await useCharacterStore.getState().setCharacters([])
  useCharacterStore.getState().setActiveCharacter(null)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  useGameDataStore.setState({ gameData: null })
})
function fixture() {
  const c = makeCharacterFixture({
    originSystem: '2024',
    allowedSources: ['XPHB'],
    equipment: [],
    classProgression: [],
    race: '',
    background: '',
  })
  c.proficiencies.armor = ['shields']
  c.abilityScores.dexterity = 10
  return c
}
function show(element: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={['/build/review?section=overview']}>
      <TooltipProvider>
        <RulesPreviewManager>{element}</RulesPreviewManager>
      </TooltipProvider>
    </MemoryRouter>,
  )
}

test('actual source-filtered selection/add/equip, details and PDF share concrete shield rules', async () => {
  const data = await loadFixedShields(),
    c = fixture()
  useGameDataStore.setState({ gameData: data })
  useCharacterStore.setState({ characters: [c], activeCharacter: c, activeCharacterId: c.id })
  show(<EquipmentPage />)
  const inventoryHeader = screen.getByRole('heading', { name: 'Inventory' }).closest('header')!
  fireEvent.click(within(inventoryHeader).getByRole('button', { name: 'Add Item' }))
  const dialog = screen.getByRole('dialog', { name: 'Add Item' })
  const list = dialog.querySelector<HTMLElement>('[data-selection-list-size]')!
  const choice = within(list).getByRole('button', { name: /^\+2 Shield\b/ })
  fireEvent.click(choice)
  const actions = within(dialog).getByText('Confirm', { selector: 'button' }).parentElement!
  fireEvent.click(within(actions).getByRole('button', { name: 'Confirm' }))
  expect(useCharacterStore.getState().activeCharacter!.equipment[0]).toMatchObject({
    name: '+2 Shield',
    source: 'XDMG',
    ac: 2,
  })
  const inventoryRow = screen.getByLabelText('Inspect +2 Shield').parentElement!
  fireEvent.click(within(inventoryRow).getByRole('switch', { name: 'Equip +2 Shield' }))
  fireEvent.click(within(inventoryRow).getByRole('button', { name: 'Increase +2 Shield quantity' }))
  fireEvent.click(within(inventoryRow).getByRole('button', { name: 'Inspect +2 Shield' }))
  expect(screen.getByText('While holding this shield, gain +2 AC.')).toBeTruthy()
  const current = useCharacterStore.getState().activeCharacter!
  expect(current.equipment[0].quantity).toBe(2)
  const vm = createCharacterSheetViewModel(current, data.lookups!)
  expect(vm.effectiveArmorClass).toBe(14)
  expect(mapCharacterSheet2024(vm).textFields.Text_8).toBe('14')
  expect(vm.magicItems[0].description).toContain('gain +2 AC')
  expect(
    resolveClassChoiceOptionEntity(
      { entityType: 'item', name: '+2 Shield', source: 'XDMG' },
      { ...data, creatures: [], optionalFeatures: [], subclassFeatures: [] },
    )?.name,
  ).toBe('+2 Shield')
  expect(useCharacterStore.getState().activeCharacter!.equipment).toEqual(current.equipment)
})

test('command-produced equipped shields share Review and Compendium rules without saved mutation', async () => {
  const data = await loadFixedShields(),
    c = fixture()
  const item = data.items.find((x) => x.name === '+2 Shield' && x.source === 'XDMG')!
  const command = addManualEquipmentBatchCommand(c, c.provenance!, [item])
  const current = {
    ...c,
    ...command.characterPatch,
    equipment: command.characterPatch.equipment!.map((x) => ({
      ...x,
      equipped: true,
      quantity: 2,
    })),
    provenance: command.provenanceUpdate,
  }
  useGameDataStore.setState({ gameData: data })
  useCharacterStore.setState({
    characters: [current],
    activeCharacter: current,
    activeCharacterId: current.id,
  })
  show(<BuildReviewPage />)
  fireEvent.click(screen.getByText('Equipment'))
  expect(screen.getByText('While holding this shield, gain +2 AC.')).toBeTruthy()
  cleanup()
  const entry = buildCompendiumEntries(data).find(
    (x) => x.name === '+2 Shield' && x.source === 'XDMG',
  )!
  show(<CompendiumEntryDetails selectedEntry={entry} />)
  expect(screen.getByText('While holding this shield, gain +2 AC.')).toBeTruthy()
  expect(useCharacterStore.getState().activeCharacter!.equipment).toEqual(current.equipment)
})

test('durable schema11 reopen, cache recomposition and exact missing/restored rules preserve two owners and prose', async () => {
  const data = await loadFixedShields()
  useGameDataStore.setState({ gameData: data })
  const item = data.items.find((x) => x.name === '+1 Shield' && x.source === 'XDMG')!
  const added = await useCharacterStore.getState().addCharacter(fixture())
  useCharacterStore.getState().setActiveCharacter(added.id)
  const command = addManualEquipmentBatchCommand(added, added.provenance!, [item, item])
  const equipment = command.characterPatch.equipment!.map((x, i) => ({
    ...x,
    equipped: i === 0,
    quantity: i + 3,
    description: i ? '' : 'Player shield note',
  }))
  useCharacterStore
    .getState()
    .updateCharacter(added.id, { equipment, provenance: command.provenanceUpdate })
  await useCharacterStore.getState().saveActiveCharacter()
  const stored = await get<{ state: { characters: Character[] } }>('character-storage')
  const saved = characterSchema.parse(stored!.state.characters[0])
  expect(saved.schemaVersion).toBe(11)
  expect(saved.equipment).toEqual(JSON.parse(JSON.stringify(equipment)))
  expect(JSON.stringify(saved)).not.toContain('magicVariantGenerated')
  const ledger = saved.provenance
  useCharacterStore.getState().setActiveCharacter(null)
  await useCharacterStore.persist.rehydrate()
  useCharacterStore.getState().setActiveCharacter(added.id)
  await writeGameDataCache(data, { type: 'local', path: '/shield-test', isValid: true })
  const cached = await readGameDataCache()
  expect(cached?.cacheSchemaVersion).toBe(37)
  expect(
    composeGameDataLayers([cached!.data]).items.filter((x) => x.magicVariantGenerated),
  ).toHaveLength(6)
  show(<BuildReviewPage />)
  fireEvent.click(screen.getByRole('tab', { name: /Needs attention/ }))
  for (const [catalog, expected] of [
    [await loadFixedShields([]), 12],
    [data, 13],
  ] as const) {
    await act(() => useGameDataStore.setState({ gameData: catalog }))
    const current = useCharacterStore.getState().activeCharacter!
    const calculation = createCharacterCalculationContext(
      current,
      catalog.lookups!,
      catalog.lookups!,
    )
    const readiness = getCharacterReadiness(current, { calculation })
    expect(
      computeEffectiveCharacterArmorClass(
        current,
        calculation.abilityScores.total,
        calculation.effects.declarations,
      ),
    ).toBe(expected)
    expect(readiness.recommendations.filter((x) => x.section === 'equipment')).toHaveLength(
      expected === 12 ? 2 : 0,
    )
    expect(screen.queryAllByText('Restore rules for +1 Shield')).toHaveLength(
      expected === 12 ? 2 : 0,
    )
    const vm = createCharacterSheetViewModel(current, catalog.lookups!)
    expect(vm.magicItems[0].description).toBe('Player shield note')
    expect(
      getPdfExportPreflight(
        '2024',
        vm,
        readiness,
        calculation.effects.declarations,
        calculation.effects.resolutionContext,
      ).issues.filter((x) => x.id.startsWith('readiness:equipment:rules:')),
    ).toHaveLength(expected === 12 ? 2 : 0)
    expect(current.equipment).toEqual(saved.equipment)
    expect(current.provenance).toEqual(ledger)
  }
  const current = useCharacterStore.getState().activeCharacter!
  const removed = removeManualEquipmentCommand(
    current,
    current.provenance!,
    current.equipment[0].id,
  )
  expect(removed.characterPatch.equipment).toEqual([current.equipment[1]])
  expect(removed.provenanceUpdate.equipment['+1 shield']).toEqual(
    current.provenance!.equipment['+1 shield'],
  )
})
