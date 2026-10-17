import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'
import { useCharacterActions } from '@/hooks/character/useCharacterActions'
import { useCharacterCalculationContext } from '@/hooks/character/useCharacterCalculationContext'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { mapCharacterSheet2014 } from '@/lib/pdf/characterSheetMapping2014'
import { mapCharacterSheet2014Official } from '@/lib/pdf/characterSheetMapping2014Official'
import { mapCharacterSheet2024 } from '@/lib/pdf/characterSheetMapping2024'
import { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import { getPdfExportPreflight } from '@/lib/pdf/exportPreflight'
import { SourceDerivedEffects } from '@/pages/adjustments/components/DerivedMechanicsOverview'
import { BuildReviewPage } from '@/pages/build/review/ReviewPage'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Item5e } from '@/types/5etools'
import { makeGameDataFixture } from '../fixtures/gameDataFixtures'
import { characterWithWeapons, venom } from '../fixtures/weaponBonusFixtures'

afterEach(() => {
  cleanup()
  useGameDataStore.setState({ gameData: null })
  vi.clearAllMocks()
})

test('actual Actions hook, Review and three PDF mappings share fixed totals across catalog replacement', async () => {
  const character = characterWithWeapons()
  character.allowedSources = ['DMG']
  const publish = (items: Item5e[]) => {
    const data = makeGameDataFixture({
      items,
      sources: [{ abbreviation: 'DMG', name: 'Dungeon Master Guide', group: 'Core' }],
    })
    data.lookups = buildGameDataLookups(data)
    useGameDataStore.setState({ gameData: data })
    return data
  }
  const data = publish([venom])
  useCharacterStore.setState({
    characters: [character],
    activeCharacterId: character.id,
    activeCharacter: character,
  })
  const before = JSON.stringify(character)
  const hook = renderHook(() => useCharacterActions(character))
  expect(hook.result.current.find((action) => action.id === 'weapon:owned-0')?.attackBonus).toBe(6)
  const pdf = createCharacterSheetViewModel(character, data.lookups!)
  expect(pdf.weaponRows[0]).toMatchObject({ attackBonus: '+6', damage: '1d4 + 4' })
  expect(mapCharacterSheet2014(pdf).textFields['Attack.1.To Hit']).toBe('+6')
  expect(mapCharacterSheet2014(pdf).textFields['Attack.1.Damage']).toBe('1d4 + 4')
  expect(mapCharacterSheet2014Official(pdf).textFields['Wpn1 AtkBonus']).toBe('+6')
  expect(mapCharacterSheet2014Official(pdf).textFields['Wpn1 Damage']).toBe('1d4 + 4 Pierc.')
  expect(mapCharacterSheet2024(pdf).textFields.Text_67).toBe('+6')
  expect(mapCharacterSheet2024(pdf).textFields.Text_73).toBe('1d4 + 4 Piercing')
  render(
    <MemoryRouter initialEntries={['/build/review?section=overview']}>
      <BuildReviewPage />
    </MemoryRouter>,
  )
  fireEvent.click(screen.getByText('Attacks & actions'))
  expect(screen.getByText(/\+6 to hit/)).toBeTruthy()
  await act(() => publish([{ ...venom, source: 'XDMG', bonusWeapon: '+3' }]))
  expect(hook.result.current.find((action) => action.id === 'weapon:owned-0')?.attackBonus).toBe(5)
  expect(screen.getByText(/\+5 to hit/)).toBeTruthy()
  await act(() => publish([venom]))
  expect(hook.result.current.find((action) => action.id === 'weapon:owned-0')?.attackBonus).toBe(6)
  expect(screen.getByText(/\+6 to hit/)).toBeTruthy()
  expect(JSON.stringify(useCharacterStore.getState().activeCharacter)).toBe(before)
})

test('unsupported weapon note is visible in source effects and Review and warns in PDF preflight even unattuned', () => {
  const data: Item5e = { ...venom, name: 'Hazirawn', source: 'HotDQ', reqAttune: true }
  const character = characterWithWeapons([data])
  character.allowedSources = ['HotDQ']
  const gameData = makeGameDataFixture({
    items: [data],
    sources: [{ abbreviation: 'HotDQ', name: 'Hoard of the Dragon Queen', group: 'Adventure' }],
  })
  gameData.lookups = buildGameDataLookups(gameData)
  useGameDataStore.setState({ gameData })
  useCharacterStore.setState({
    characters: [character],
    activeCharacter: character,
    activeCharacterId: character.id,
  })
  const { result } = renderHook(() => useCharacterCalculationContext(character))
  const calculation = result.current!
  render(
    <SourceDerivedEffects
      effects={calculation.effects.declarations}
      resolutionContext={calculation.effects.resolutionContext}
    />,
  )
  expect(
    screen.getByText(/Its \+1 unattuned and \+2 attuned bonuses need manual handling\./),
  ).toBeTruthy()
  cleanup()
  render(
    <MemoryRouter initialEntries={['/build/review?section=overview']}>
      <BuildReviewPage />
    </MemoryRouter>,
  )
  fireEvent.click(screen.getByText('Traits & features'))
  expect(
    screen.getByText('Its +1 unattuned and +2 attuned bonuses need manual handling.'),
  ).toBeTruthy()
  const pdf = createCharacterSheetViewModel(character, gameData.lookups!)
  expect(pdf.weaponRows[0]).toMatchObject({ attackBonus: '+5', damage: '1d4 + 3' })
  const warning = getPdfExportPreflight(
    '2014',
    pdf,
    null,
    calculation.effects.declarations,
    calculation.effects.resolutionContext,
  )
  expect(warning.issues).toContainEqual(
    expect.objectContaining({
      id: 'unsupported:item:owned-0:weapon-note',
      category: 'unsupported',
    }),
  )
})
