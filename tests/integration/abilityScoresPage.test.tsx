import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { BuildAbilityScoresPage } from '@/pages/build/ability-scores/AbilityScoresPage'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Background5e, GameData, Race5e } from '@/types/5etools'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

Element.prototype.hasPointerCapture = () => false
Element.prototype.setPointerCapture = () => undefined
Element.prototype.releasePointerCapture = () => undefined
Element.prototype.scrollIntoView = () => undefined

vi.mock('@/lib/storage/idb-storage', () => ({
  createIdbStorage: () => ({
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  }),
}))

const ability = [
  {
    choose: {
      weighted: { from: ['str', 'dex', 'con'], weights: [2, 1] },
    },
  },
]
const testRace: Race5e = { name: 'Test Race', source: 'TEST' }
const testBackground: Background5e = {
  name: 'Test Background',
  source: 'TEST',
  edition: 'one',
  ability,
  feats: [{ anyFromCategory: { category: ['O'], count: 1 } }],
}

describe('BuildAbilityScoresPage', () => {
  beforeEach(() => {
    const character = makeCharacterFixture({
      originSystem: '2024',
      race: testRace.name,
      raceSource: testRace.source,
      background: testBackground.name,
      backgroundSource: testBackground.source,
      backgroundAsiChoices: [],
    })
    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    })
    useGameDataStore.setState({
      gameData: {
        races: [testRace],
        classes: [],
        backgrounds: [testBackground],
        organizations: [],
        spells: [],
        feats: [],
        items: [],
        itemsBase: [],
        itemProperties: [],
        itemTypes: [],
        classFeatures: [],
        actions: [],
        conditions: [],
        deities: [],
        skills: [],
        senses: [],
        languages: [],
        magicvariants: [],
        optionalfeatures: [],
        variantrules: [],
        trapHazards: [],
        rewards: [],
        cultsBoons: [],
        sources: [],
      } as GameData,
    })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  test('edits revised background bonuses in the canonical ability-score section', async () => {
    const user = userEvent.setup()
    render(<BuildAbilityScoresPage />)

    expect(screen.getByTestId('background-ability-choices')).toBeTruthy()
    await user.click(screen.getByLabelText('Background ability bonus +2'))
    await user.click(screen.getByRole('option', { name: 'STR' }))

    expect(useCharacterStore.getState().activeCharacter?.backgroundAsiChoices).toEqual([
      'strength',
      '',
    ])
  })
})
