import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, test } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { commitFeatOptionsCommand } from '@/lib/character/commands/featCommands'
import { FeatsPage } from '@/pages/feats/FeatsPage'
import { emptyProvenance, useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Feat5e, Spell5e } from '@/types/5etools'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { makeGameDataFixture } from '../fixtures/gameDataFixtures'

const feat: Feat5e = {
  name: 'Training',
  source: 'OTHER',
  entries: ['Requested training rules.'],
  additionalSpells: [{ known: { _: [{ choose: 'level=0', count: 1 }] } }],
}
const requested: Spell5e = {
  name: 'Secret Spark',
  source: 'OTHER',
  level: 0,
  school: 'E',
  time: [{ number: 1, unit: 'action' }],
  range: { type: 'point', distance: { type: 'feet', amount: 30 } },
  components: { v: true },
  duration: [{ type: 'instant' }],
  entries: ['The saved cantrip.'],
}
const competitor: Spell5e = { ...requested, source: 'TEST', level: 1 }
const unselected: Spell5e = { ...requested, name: 'Other Spark' }

function seed(spells: Spell5e[], saved = true) {
  const provenance = emptyProvenance()
  provenance.feats.training = [
    {
      sourceType: 'background',
      sourceName: 'Scholar',
      sourceRef: 'OTHER',
      grantType: 'fixed',
      label: 'Scholar',
    },
  ]
  let character = makeCharacterFixture({
    originSystem: '2024',
    allowedSources: ['OTHER'],
    provenance,
  })
  if (saved) {
    const committed = commitFeatOptionsCommand(
      character,
      provenance,
      { ...feat, fixedGrant: true },
      { spells: ['Secret Spark|OTHER'] },
      [requested],
    )
    character = {
      ...character,
      ...committed.characterPatch,
      provenance: committed.provenanceUpdate,
    }
  }
  character = { ...character, allowedSources: ['TEST'] }
  useCharacterStore.setState({
    activeCharacter: character,
    activeCharacterId: character.id,
    characters: [character],
  })
  const data = makeGameDataFixture({ feats: [feat], spells })
  useGameDataStore.setState({
    gameData: { ...data, lookups: buildGameDataLookups(data) },
    error: null,
    isLoading: false,
  })
  render(
    <TooltipProvider>
      <MemoryRouter>
        <FeatsPage />
      </MemoryRouter>
    </TooltipProvider>,
  )
  return character
}

function editSetup() {
  fireEvent.click(screen.getByRole('button', { name: 'Edit Setup' }))
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
}

afterEach(cleanup)

test('an unchanged fixed setup edit preserves a saved hidden-source cantrip and its exact options', () => {
  const before = seed([requested])
  editSetup()
  act(() => {
    fireEvent.click(screen.getByRole('button', { name: /Finish/ }))
  })
  const after = useCharacterStore.getState().activeCharacter
  expect(after?.spells).toEqual(before.spells)
  expect(after?.fixedFeatOptions).toEqual(before.fixedFeatOptions)
  expect(after?.provenance).toEqual(before.provenance)
})

test('the saved printing controls classification even when a same-name competing spell is first', () => {
  const before = seed([competitor, requested])
  editSetup()
  act(() => {
    fireEvent.click(screen.getByRole('button', { name: /Finish/ }))
  })
  expect(useCharacterStore.getState().activeCharacter?.spells).toEqual(before.spells)
})

test('editing exposes the retained exact spell without enabling new hidden-source choices', () => {
  seed([competitor, requested, unselected])
  editSetup()
  expect(screen.getByRole('checkbox', { name: /Secret Spark/ }).getAttribute('aria-checked')).toBe(
    'true',
  )
  expect(screen.getByText('Saved choice')).toBeTruthy()
  expect(screen.queryByRole('checkbox', { name: /Other Spark/ })).toBeNull()
})

test('a missing saved printing blocks finishing instead of borrowing another printing', () => {
  const before = seed([competitor])
  editSetup()
  expect(screen.getByText('Spell data unavailable: Secret Spark (OTHER)')).toBeTruthy()
  expect(screen.getByRole('button', { name: /Finish/ }).hasAttribute('disabled')).toBe(true)
  expect(useCharacterStore.getState().activeCharacter).toEqual(before)
})

test('new fixed feat spell choices continue to honor allowed sources', () => {
  seed([requested, unselected], false)
  fireEvent.click(screen.getByRole('button', { name: 'Complete Setup' }))
  expect(screen.getByText('No matching spells found.')).toBeTruthy()
  expect(screen.queryByRole('checkbox')).toBeNull()
  expect(screen.getByRole('button', { name: /Finish/ }).hasAttribute('disabled')).toBe(true)
})

test('a missing saved spell can be replaced with an eligible exact choice', () => {
  const replacement = { ...requested, name: 'Allowed Spark', source: 'TEST' }
  const before = seed([competitor, replacement])
  editSetup()
  fireEvent.click(screen.getByRole('checkbox', { name: /Spell data unavailable/ }))
  fireEvent.click(screen.getByRole('checkbox', { name: /Allowed Spark/ }))
  act(() => {
    fireEvent.click(screen.getByRole('button', { name: /Finish/ }))
  })
  const after = useCharacterStore.getState().activeCharacter
  const special = after?.spells.spellProfiles.find((profile) => profile.type === 'special')
  expect(special?.cantrips).toEqual(['Allowed Spark'])
  expect(special?.spellsKnown).toEqual([])
  expect(after?.fixedFeatOptions).toEqual({ 'training|other|': { spells: ['Allowed Spark|TEST'] } })
  expect(after?.provenance?.feats).toEqual(before.provenance?.feats)
})
