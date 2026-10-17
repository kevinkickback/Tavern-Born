import { act, cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, test } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import { AdjustmentsPage } from '@/pages/adjustments/AdjustmentsPage'
import { BuildReviewPage } from '@/pages/build/review/ReviewPage'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Race5e } from '@/types/5etools'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { resetCharacterStore } from '../fixtures/characterStoreFixtures'
import { makeGameDataFixture } from '../fixtures/gameDataFixtures'
import { defenseSelection, manualFire } from '../fixtures/racialDefenseCharacter'

function install(races: Race5e[]) {
  const data = makeGameDataFixture({
    races,
    sources: [
      { abbreviation: 'PHB', name: 'Parent book', group: 'core' },
      { abbreviation: 'HB', name: 'Child book', group: 'other' },
    ],
  })
  data.lookups = buildGameDataLookups(data)
  useGameDataStore.setState({ gameData: data })
}
async function start() {
  resetCharacterStore()
  useGameDataStore.setState({ gameData: null })
  const { race, child, character } = defenseSelection()
  const [imported] = await useCharacterStore.getState().importCharacters([manualFire(character)])
  useCharacterStore.getState().setActiveCharacter(imported.id)
  install([race])
  await useCharacterStore.getState().saveActiveCharacter()
  return { race, child }
}
afterEach(async () => {
  cleanup()
  await useCharacterStore.getState().saveActiveCharacter()
  resetCharacterStore()
  useGameDataStore.setState({ gameData: null })
})

test('Review and PDF keep independent fire while exact refresh removes acid/poisoned, then stay coherent offline', async () => {
  const { race } = await start()
  const removedChild = defenseSelection({ resist: [], immune: null, conditionImmune: [] }).child
  render(
    <TooltipProvider>
      <MemoryRouter initialEntries={['/build/review?section=overview']}>
        <BuildReviewPage />
      </MemoryRouter>
    </TooltipProvider>,
  )
  const combat = screen.getByText('Damage immunities').closest('details')!
  expect(within(combat).getByText('acid')).toBeTruthy()
  act(() =>
    install([
      {
        ...race,
        subraces: [removedChild],
      },
    ]),
  )
  expect(screen.queryByText('Damage immunities')).toBeNull()
  expect(screen.queryByText('Condition immunities')).toBeNull()
  const resistance = screen.getByText('Damage resistances').parentElement!
  expect(resistance.textContent).toContain('fire')
  await useCharacterStore.getState().saveActiveCharacter()
  act(() => install([]))
  expect(screen.getByText('Damage resistances').parentElement?.textContent).toContain('fire')
  const reopened = characterPersistenceSchema.parse(
    JSON.parse(JSON.stringify(useCharacterStore.getState().characters[0])),
  )
  expect(createCharacterSheetViewModel(reopened, {}).defensiveTraits).toEqual(['fire resistance'])
})

test('Adjustments retains exact parent attribution offline; raw filtered ancestry does not retract defenses', async () => {
  await start()
  const original = useCharacterStore.getState().activeCharacter!
  act(() =>
    useCharacterStore.getState().updateCharacter(original.id, { allowedSources: ['OTHER'] }),
  )
  render(
    <TooltipProvider>
      <MemoryRouter initialEntries={['/adjustments?section=effects']}>
        <AdjustmentsPage />
      </MemoryRouter>
    </TooltipProvider>,
  )
  expect(screen.getAllByText(/Defense Parent.*PHB/).length).toBeGreaterThan(0)
  expect(screen.getAllByText('Independent fire').length).toBeGreaterThan(0)
  act(() => install([]))
  expect(screen.getAllByText(/Defense Parent.*PHB/).length).toBeGreaterThan(0)
  expect(useCharacterStore.getState().activeCharacter?.racialDefenses).toEqual(
    original.racialDefenses,
  )
})
