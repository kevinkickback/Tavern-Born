import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, test } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { FeatsPage } from '@/pages/feats/FeatsPage'
import { emptyProvenance, useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Feat5e } from '@/types/5etools'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { makeGameDataFixture } from '../fixtures/gameDataFixtures'

const requested: Feat5e = {
  name: 'Training',
  source: 'OTHER',
  entries: ['Requested training rules.'],
  prerequisite: [{ ability: [{ dex: 13 }] }],
  skillProficiencies: [{ choose: { from: ['History'], count: 1 } }],
}
const competitor: Feat5e = {
  name: 'Training',
  source: 'TEST',
  entries: ['Competing training rules.'],
  prerequisite: [],
  skillProficiencies: [{ choose: { from: ['Arcana'], count: 1 } }],
}

function catalog(feats: Feat5e[]) {
  const data = makeGameDataFixture({ feats })
  return { ...data, lookups: buildGameDataLookups(data) }
}

function seed(feats: Feat5e[], grantSource = 'OTHER') {
  const provenance = emptyProvenance()
  provenance.feats.training = [
    {
      sourceType: 'background',
      sourceName: 'Scholar',
      sourceRef: 'OTHER',
      grantSource,
      grantType: 'fixed',
      grantVariant: 'sage',
      label: 'Scholar',
    },
  ]
  const character = makeCharacterFixture({
    originSystem: '2024',
    background: 'Scholar',
    backgroundSource: 'OTHER',
    allowedSources: ['TEST'],
    provenance,
    fixedFeatOptions: { 'training|other|sage': { skills: ['History'] } },
  })
  useCharacterStore.setState({
    activeCharacter: character,
    activeCharacterId: character.id,
    characters: [character],
  })
  useGameDataStore.setState({ gameData: catalog(feats), error: null, isLoading: false })
  render(
    <TooltipProvider>
      <MemoryRouter>
        <FeatsPage />
      </MemoryRouter>
    </TooltipProvider>,
  )
  return character
}

function replaceCatalog(feats: Feat5e[]) {
  act(() => {
    useGameDataStore.setState({ gameData: catalog(feats) })
  })
}

function expectRestoredSelection() {
  expect(screen.getByText('Prerequisites unmet')).toBeTruthy()
  expect(screen.queryByText('Feat data unavailable')).toBeNull()
  expect(screen.getAllByText('Requested training rules.')).toHaveLength(2)
  expect(screen.queryByText('Competing training rules.')).toBeNull()
  expect(screen.getByRole('button', { name: 'Select Training' }).getAttribute('aria-pressed')).toBe(
    'true',
  )
}

afterEach(cleanup)

test.each([
  'OTHER',
  'other',
  ' OTHER ',
])('a selection made with missing rules follows its restored exact printing: %j', (grantSource) => {
  const character = seed([competitor], grantSource)
  fireEvent.click(screen.getByRole('button', { name: 'Select training' }))
  expect(screen.getAllByText('Feat data unavailable')).toHaveLength(2)
  expect(screen.queryByText('Prerequisites met')).toBeNull()

  replaceCatalog([competitor, requested])
  expectRestoredSelection()

  replaceCatalog([competitor])
  expect(screen.getAllByText('Feat data unavailable')).toHaveLength(2)
  expect(screen.queryByText('Prerequisites unmet')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Edit Setup' }))
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  expect(screen.queryByRole('button', { name: 'Finish' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(useCharacterStore.getState().activeCharacter).toEqual(character)
  expect(screen.getByRole('button', { name: 'Select training' }).getAttribute('aria-pressed')).toBe(
    'true',
  )

  replaceCatalog([requested, competitor])
  expectRestoredSelection()
  expect(useCharacterStore.getState().activeCharacter).toEqual(character)
})

test('reselecting an unavailable fixed feat retains its exact inspector identity after refresh', () => {
  const character = seed([competitor, requested])
  fireEvent.click(screen.getByRole('button', { name: 'Select Training' }))
  expectRestoredSelection()
  replaceCatalog([competitor])
  fireEvent.click(screen.getByRole('button', { name: 'Select training' }))
  replaceCatalog([competitor, requested])
  expectRestoredSelection()
  expect(useCharacterStore.getState().activeCharacter).toEqual(character)
})
