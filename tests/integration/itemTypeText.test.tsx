import { act, cleanup, fireEvent, render, renderHook, screen, within } from '@testing-library/react'
import { clear, get } from 'idb-keyval'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { INITIAL_CHARACTER_DATA } from '@/components/character/wizard/constants'
import { ClassStep } from '@/components/character/wizard/steps/4-ClassStep'
import { RulesPreviewManager } from '@/components/editor/RulesPreviewManager'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useWizardGameData } from '@/hooks/data/useWizardGameData'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
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
import { SpellsPage } from '@/pages/spells/SpellsPage'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Class5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { makeSpellFixture } from '../fixtures/gameDataFixtures'
import { instrumentRules, loadItemTypeText, lute } from '../fixtures/itemTypeTextFixtures'

vi.unmock('@/lib/storage/idb-storage')

function show(element: ReactElement, route = '/build/review?section=overview') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <TooltipProvider>
        <RulesPreviewManager>{element}</RulesPreviewManager>
      </TooltipProvider>
    </MemoryRouter>,
  )
}

describe('category-text display contexts and storage boundary', () => {
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

  test('spell-page item descendants use current books, catalog properties and refreshed metadata', async () => {
    const root = makeSpellFixture({
      name: 'Root Spell',
      source: 'PHB',
      level: 0,
      entries: ['Use a {@item Lute|PHB}.'],
    })
    const makeData = async (support: unknown = [instrumentRules]) => {
      const data = await loadItemTypeText([{ ...lute, property: ['Q'] }], support)
      data.spells = [root]
      data.itemProperties = [
        { abbreviation: 'Q', source: 'PHB', name: 'Catalog property label', entries: [] },
      ]
      data.lookups = buildGameDataLookups(data)
      return data
    }
    const character = makeCharacterFixture({
      race: '',
      background: '',
      classProgression: [],
      allowedSources: [],
    })
    character.spells.spellProfiles = character.spells.spellProfiles
      .filter((profile) => profile.type === 'special')
      .map((profile) => ({ ...profile, cantrips: ['Root Spell|PHB'] }))
    useCharacterStore.setState({
      characters: [character],
      activeCharacter: character,
      activeCharacterId: character.id,
    })
    const before = structuredClone(character)
    const data = await makeData()
    useGameDataStore.setState({ gameData: data })
    show(<SpellsPage />, '/spells')
    const openItem = async () => {
      fireEvent.mouseEnter(screen.getByRole('button', { name: 'Root Spell' }))
      const spell = await screen.findByRole('dialog', { name: 'Root Spell preview' })
      fireEvent.mouseMove(within(spell).getByRole('button', { name: 'Lute' }))
      return screen.findByRole('dialog', { name: 'Lute preview' })
    }
    const closePreviews = () => {
      fireEvent.keyDown(document, { key: 'Escape' })
      fireEvent.keyDown(document, { key: 'Escape' })
    }
    const disabled = await openItem()
    expect(disabled.textContent).not.toContain('Instrument category guidance.')
    expect(disabled.textContent).toContain('Catalog property label')
    await act(async () => {
      await useCharacterStore.getState().updateCharacter(character.id, { allowedSources: ['XGE'] })
    })
    // The open chain keeps its snapshot; a new root on the same mounted page uses current books.
    expect(disabled.textContent).not.toContain('Instrument category guidance.')
    closePreviews()
    expect((await openItem()).textContent).toContain('Instrument category guidance.')
    const missing = await makeData([])
    const incompatible = {
      ...data,
      sources: data.sources.map((book) =>
        book.abbreviation === 'XGE' ? { ...book, minimumRuleset: '2024' as const } : book,
      ),
    }
    for (const [catalog, expected] of [
      [missing, false],
      [incompatible, false],
      [data, true],
    ] as const) {
      await act(async () => {
        await useGameDataStore.setState({ gameData: catalog })
      })
      closePreviews()
      const item = await openItem()
      expect(item.textContent?.includes('Instrument category guidance.')).toBe(expected)
      expect(item.textContent).toContain('Catalog property label')
    }
    await act(async () => {
      await useCharacterStore.getState().updateCharacter(character.id, { allowedSources: [] })
    })
    closePreviews()
    expect((await openItem()).textContent).not.toContain('Instrument category guidance.')
    const after = useCharacterStore.getState().activeCharacter!
    expect(after.equipment).toEqual(before.equipment)
    expect(after.provenance).toEqual(before.provenance)
    expect(after.spells).toEqual(before.spells)
  })

  test('live item screens, raw Compendium and exported-character PDF keep source context and preserve save/reopen/removal', async () => {
    const horn = {
      ...lute,
      name: 'Horn of Blasting',
      source: 'DMG',
      rarity: 'rare',
      srd: true,
      entries: ['Own instrument rules.'],
      additionalEntries: ['Native additional guidance.'],
    }
    const data = await loadItemTypeText([horn])
    useGameDataStore.setState({ gameData: data })
    const added = await useCharacterStore.getState().addCharacter(
      makeCharacterFixture({
        id: 'category-save',
        race: '',
        background: '',
        classProgression: [],
        allowedSources: ['XGE'],
        equipment: [],
      }),
    )
    useCharacterStore.getState().setActiveCharacter(added.id)
    const initial = useCharacterStore.getState().activeCharacter!
    const command = addManualEquipmentBatchCommand(initial, initial.provenance!, [
      data.items[0],
      data.items[0],
    ])
    useCharacterStore.getState().updateCharacter(added.id, {
      ...command.characterPatch,
      provenance: command.provenanceUpdate,
    })
    const equipment = useCharacterStore
      .getState()
      .activeCharacter!.equipment.map((item, index) => ({
        ...item,
        quantity: index + 2,
        equipped: true,
        attuned: true,
        description: index ? '' : 'Player notes.',
      }))
    useCharacterStore.getState().updateCharacter(added.id, { equipment })
    await useCharacterStore.getState().saveActiveCharacter()
    const stored = await get<{ state: { characters: Character[] } }>('character-storage')
    const ledger = stored!.state.characters[0].provenance
    expect(stored!.state.characters[0].equipment).toEqual(equipment)
    expect(JSON.stringify(stored)).not.toContain('itemTypeText')
    expect(JSON.stringify(stored)).not.toContain('Instrument category guidance.')
    show(<EquipmentPage />)
    expect(screen.getByText('Native additional guidance.')).toBeTruthy()
    expect(screen.getByText('Instrument category guidance.')).toBeTruthy()
    await act(async () => {
      useCharacterStore.getState().updateCharacter(added.id, { allowedSources: [] })
      await useCharacterStore.getState().saveActiveCharacter()
    })
    expect(screen.queryByText('Instrument category guidance.')).toBeNull()
    expect(screen.getByText('Native additional guidance.')).toBeTruthy()
    await act(async () => {
      useCharacterStore.getState().updateCharacter(added.id, { allowedSources: ['XGE'] })
      await useCharacterStore.getState().saveActiveCharacter()
    })
    expect(screen.getByText('Instrument category guidance.')).toBeTruthy()
    cleanup()
    show(<BuildReviewPage />)
    fireEvent.click(screen.getByText('Equipment'))
    expect(screen.getAllByText('Native additional guidance.')).toHaveLength(2)
    expect(screen.getAllByText('Instrument category guidance.')).toHaveLength(2)
    expect(screen.queryByText('Player notes.')).toBeNull()
    cleanup()
    useCharacterStore.getState().updateCharacter(added.id, { allowedSources: [] })
    const entry = buildCompendiumEntries(data).find((row) => row.name === horn.name)!
    show(<CompendiumEntryDetails selectedEntry={entry} />)
    expect(screen.getByText('Instrument category guidance.')).toBeTruthy()
    cleanup()
    const active = useCharacterStore.getState().activeCharacter!
    const pdfCharacter = { ...active, allowedSources: ['XGE'] }
    const vm = createCharacterSheetViewModel(pdfCharacter, {
      ...data.lookups!,
      sourceCatalog: data.sources,
    })
    expect(vm.magicItems[0].description).toBe('Player notes.')
    expect(vm.magicItems[1].description).toContain('Native additional guidance.')
    expect(vm.magicItems[1].description).toContain('Instrument category guidance.')
    expect(
      createCharacterSheetViewModel(pdfCharacter, {
        ...data.lookups!,
        sourceCatalog: data.sources.map((book) =>
          book.abbreviation === 'XGE' ? { ...book, minimumRuleset: '2024' as const } : book,
        ),
      }).magicItems[1].description,
    ).not.toContain('Instrument category guidance.')
    const config = { type: 'local' as const, path: '/fixture', isValid: true }
    await writeGameDataCache(data, config)
    const cached = await readGameDataCache()
    expect(cached?.cacheSchemaVersion).toBe(34)
    expect(cached?.data.items[0].itemTypeText).toEqual(data.items[0].itemTypeText)
    for (const support of [[], [instrumentRules]]) {
      const refreshed = await loadItemTypeText([horn], support)
      useGameDataStore.setState({ gameData: refreshed })
      expect(useCharacterStore.getState().activeCharacter!.equipment).toEqual(equipment)
      expect(useCharacterStore.getState().activeCharacter!.provenance).toEqual(ledger)
      const description = createCharacterSheetViewModel(pdfCharacter, refreshed.lookups!)
        .magicItems[1].description
      expect(description?.includes('Instrument category guidance.')).toBe(support.length > 0)
    }
    await useCharacterStore.getState().saveActiveCharacter()
    useCharacterStore.getState().setActiveCharacter(null)
    await useCharacterStore.persist.rehydrate()
    useCharacterStore.getState().setActiveCharacter(added.id)
    const reopened = useCharacterStore.getState().activeCharacter!
    expect(reopened.equipment).toEqual(equipment)
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

  test('creator proficiency previews use draft books, retain opened snapshots and refresh after closing/reopening', async () => {
    const group = { ...lute, name: 'Musical Instrument', weight: undefined, value: undefined }
    const sword = {
      name: 'Longsword',
      source: 'PHB',
      type: 'M',
      dmg1: '1d8',
      dmgType: 'S',
      property: ['V'],
      weight: 3,
      value: 1500,
    }
    const data = await loadItemTypeText([group, sword])
    const bard = {
      name: 'Bard',
      source: 'PHB',
      hd: { faces: 8 },
      startingProficiencies: {
        armor: [],
        weapons: ['{@item Longsword|PHB}'],
        tools: ['{@item Musical Instrument|PHB|musical instruments}'],
      },
    } as Class5e
    data.classes = [bard]
    useGameDataStore.setState({ gameData: data })
    const active = makeCharacterFixture({ allowedSources: [], race: '', classProgression: [] })
    useCharacterStore.setState({
      activeCharacter: active,
      activeCharacterId: active.id,
      characters: [active],
    })
    const draft = {
      ...INITIAL_CHARACTER_DATA,
      originSystem: '2014' as const,
      class: 'Bard',
      classSource: 'PHB',
      allowedSources: ['XGE'],
    }
    const hook = renderHook(
      ({ allowedSources }) => useWizardGameData({ allowedSources, originSystem: '2014' }),
      { initialProps: { allowedSources: ['XGE'] } },
    )
    const view = show(
      <ClassStep
        data={draft}
        classes={[bard]}
        recursiveLookup={hook.result.current.recursiveLookup}
        onChange={vi.fn()}
      />,
    )
    fireEvent.mouseMove(screen.getByRole('button', { name: 'musical instruments' }))
    const preview = await screen.findByRole('dialog', { name: 'Musical Instrument preview' })
    expect(preview.textContent).toContain('Instrument category guidance.')
    hook.rerender({ allowedSources: [] })
    view.rerender(
      <MemoryRouter>
        <TooltipProvider>
          <RulesPreviewManager>
            <ClassStep
              data={{ ...draft, allowedSources: [] }}
              classes={[bard]}
              recursiveLookup={hook.result.current.recursiveLookup}
              onChange={vi.fn()}
            />
          </RulesPreviewManager>
        </TooltipProvider>
      </MemoryRouter>,
    )
    expect(
      screen.getByRole('dialog', { name: 'Musical Instrument preview' }).textContent,
    ).toContain('Instrument category guidance.')
    view.unmount()
    await act(async () => {
      useCharacterStore.getState().updateCharacter(active.id, { allowedSources: ['XGE'] })
      await useCharacterStore.getState().saveActiveCharacter()
    })
    // A new root after closing uses current source context, rather than rebinding the prior snapshot.
    const disabledView = show(
      <ClassStep
        data={{ ...draft, allowedSources: [] }}
        classes={[bard]}
        recursiveLookup={hook.result.current.recursiveLookup}
        onChange={vi.fn()}
      />,
    )
    fireEvent.mouseMove(screen.getByRole('button', { name: 'musical instruments' }))
    expect(
      (await screen.findByRole('dialog', { name: 'Musical Instrument preview' })).textContent,
    ).not.toContain('Instrument category guidance.')
    fireEvent.mouseMove(screen.getByRole('button', { name: 'Longsword' }))
    const weapon = await screen.findByRole('dialog', { name: 'Longsword preview' })
    expect(within(weapon).getByText('Damage')).toBeTruthy()
    expect(within(weapon).getByRole('cell', { name: 'Value' })).toBeTruthy()
    expect(within(weapon).getByText('Properties')).toBeTruthy()
    expect(weapon.textContent).not.toContain('No description available')
    disabledView.unmount()
    hook.rerender({ allowedSources: ['XGE'] })
    show(
      <ClassStep
        data={draft}
        classes={[bard]}
        recursiveLookup={hook.result.current.recursiveLookup}
        onChange={vi.fn()}
      />,
    )
    fireEvent.mouseMove(screen.getByRole('button', { name: 'musical instruments' }))
    expect(
      (await screen.findByRole('dialog', { name: 'Musical Instrument preview' })).textContent,
    ).toContain('Instrument category guidance.')
  })
})
