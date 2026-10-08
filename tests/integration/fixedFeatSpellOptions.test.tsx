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

function seed(
  spells: Spell5e[],
  saved = true,
  reference = 'Secret Spark|OTHER',
  allowedSources = ['TEST'],
) {
  const provenance = emptyProvenance()
  provenance.feats.training = [
    {
      sourceType: 'background',
      sourceName: 'Scholar',
      sourceRef: 'OTHER',
      grantSource: 'OTHER',
      grantType: 'fixed',
      label: 'Scholar',
    },
  ]
  let character = makeCharacterFixture({
    originSystem: '2024',
    background: 'Scholar',
    backgroundSource: 'OTHER',
    allowedSources: ['OTHER'],
    provenance,
  })
  if (saved) {
    const committed = commitFeatOptionsCommand(
      character,
      provenance,
      { ...feat, fixedGrant: true },
      { spells: [reference] },
      [requested],
    )
    character = {
      ...character,
      ...committed.characterPatch,
      provenance: committed.provenanceUpdate,
    }
  }
  character = { ...character, allowedSources }
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

test.each([
  0, 1,
])('a cleared out-of-filter saved spell cannot be selected in spell step %s', (stepIndex) => {
  seed([requested])
  act(() => {
    const active = useCharacterStore.getState().activeCharacter!
    useCharacterStore.setState({
      activeCharacter: {
        ...active,
        fixedFeatOptions: {
          'training|other|': { spells: ['Secret Spark|OTHER', 'Saved Ray|OTHER'] },
        },
      },
    })
    const data = makeGameDataFixture({
      feats: [
        {
          ...feat,
          additionalSpells: [
            {
              known: {
                _: [
                  { choose: 'level=0', count: 1 },
                  { choose: 'level=1', count: 1 },
                ],
              },
            },
          ],
        },
      ],
      spells: [requested, { ...requested, name: 'Saved Ray', level: 1 }],
    })
    useGameDataStore.setState({ gameData: { ...data, lookups: buildGameDataLookups(data) } })
  })
  editSetup()
  if (stepIndex === 1) fireEvent.click(screen.getByRole('button', { name: /Next/ }))
  const rejectedName = stepIndex === 0 ? /Saved Ray/ : /Secret Spark/
  const retainedName = stepIndex === 0 ? /Secret Spark/ : /Saved Ray/
  const rejected = screen.getByRole('checkbox', { name: rejectedName })
  expect(rejected.getAttribute('aria-checked')).toBe('true')
  fireEvent.click(rejected)
  expect(screen.queryByRole('checkbox', { name: rejectedName })).toBeNull()
  expect(screen.getByRole('checkbox', { name: retainedName }).getAttribute('aria-checked')).toBe(
    'true',
  )
})

test('refreshing feat catalog casing does not duplicate option ownership on unchanged Finish', () => {
  const before = seed([requested])
  act(() => {
    const data = makeGameDataFixture({
      feats: [{ ...feat, name: 'training', source: 'other' }],
      spells: [requested],
    })
    useGameDataStore.setState({ gameData: { ...data, lookups: buildGameDataLookups(data) } })
  })
  editSetup()
  fireEvent.click(screen.getByRole('button', { name: /Finish/ }))
  const after = useCharacterStore.getState().activeCharacter!
  expect(after.provenance.spells['secret spark']).toHaveLength(1)
  expect(after.spells).toEqual(before.spells)
  expect(after.fixedFeatOptions).toEqual(before.fixedFeatOptions)
})

test('a retained spell outside the refreshed feat filter stays visible and replaceable', () => {
  seed([requested])
  act(() => {
    const data = makeGameDataFixture({
      feats: [feat],
      spells: [
        { ...requested, level: 1 },
        { ...requested, name: 'Allowed Spark', source: 'TEST' },
      ],
    })
    useGameDataStore.setState({ gameData: { ...data, lookups: buildGameDataLookups(data) } })
  })
  editSetup()
  const saved = screen.getByRole('checkbox', { name: /Secret Spark/ })
  expect(saved.getAttribute('aria-checked')).toBe('true')
  expect(screen.getByText('Saved choice')).toBeTruthy()
  fireEvent.click(saved)
  fireEvent.click(screen.getByRole('checkbox', { name: /Allowed Spark/ }))
  fireEvent.click(screen.getByRole('button', { name: /Finish/ }))
  const after = useCharacterStore.getState().activeCharacter!
  expect(after.fixedFeatOptions).toEqual({ 'training|other|': { spells: ['Allowed Spark|TEST'] } })
  expect(after.provenance.spells['secret spark']).toBeUndefined()
})

test('a complete tagged saved spell resolves its exact printing and preserves its literal option', () => {
  const before = seed([competitor, requested], true, '{@spell Secret Spark|OTHER|Saved display}')
  editSetup()
  expect(screen.getByRole('checkbox', { name: /Secret Spark/ }).getAttribute('aria-checked')).toBe(
    'true',
  )
  expect(screen.getByRole('button', { name: /Finish/ }).hasAttribute('disabled')).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: /Finish/ }))
  const after = useCharacterStore.getState().activeCharacter!
  const special = after.spells.spellProfiles.find((profile) => profile.type === 'special')
  expect(special?.cantrips).toEqual(['Secret Spark'])
  expect(special?.spellsKnown).toEqual([])
  expect(after.fixedFeatOptions).toEqual(before.fixedFeatOptions)
})

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

test('editing a padded saved reference preserves canonical materialized spells and original options', () => {
  const seeded = seed([requested], true, ' Secret Spark | OTHER ')
  const before = {
    ...seeded,
    spells: {
      ...seeded.spells,
      spellProfiles: seeded.spells.spellProfiles.map((profile) =>
        profile.type === 'special'
          ? {
              ...profile,
              cantrips: ['Secret Spark'],
              spellsKnown: [],
              fixedSpells: ['Secret Spark'],
            }
          : profile,
      ),
    },
  }
  act(() => {
    useCharacterStore.setState({ activeCharacter: before, characters: [before] })
  })
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

test.each([
  'secret spark|other',
  ' Secret Spark | OTHER ',
])('an eligible normalized saved choice stays checked and removable: %s', (reference) => {
  const before = seed([requested], true, reference, ['OTHER'])
  editSetup()
  const checkbox = screen.getByRole('checkbox', { name: /Secret Spark/ })
  expect(checkbox.getAttribute('aria-checked')).toBe('true')
  expect(checkbox.hasAttribute('disabled')).toBe(false)
  act(() => {
    fireEvent.click(screen.getByRole('button', { name: /Finish/ }))
  })
  expect(useCharacterStore.getState().activeCharacter?.fixedFeatOptions).toEqual(
    before.fixedFeatOptions,
  )
  editSetup()
  fireEvent.click(screen.getByRole('checkbox', { name: /Secret Spark/ }))
  expect(screen.getByRole('button', { name: /Finish/ }).hasAttribute('disabled')).toBe(true)
})

test.each([
  'secret spark|other',
  ' Secret Spark | OTHER ',
])('enabling a source in an open dialog preserves the exact saved selection: %s', (reference) => {
  seed([requested], true, reference)
  editSetup()
  expect(screen.getByRole('checkbox', { name: /Secret Spark/ }).getAttribute('aria-checked')).toBe(
    'true',
  )
  act(() => {
    const active = useCharacterStore.getState().activeCharacter!
    useCharacterStore.setState({ activeCharacter: { ...active, allowedSources: ['OTHER'] } })
  })
  const checkbox = screen.getByRole('checkbox', { name: /Secret Spark/ })
  expect(checkbox.getAttribute('aria-checked')).toBe('true')
  expect(checkbox.hasAttribute('disabled')).toBe(false)
  fireEvent.click(checkbox)
  expect(screen.getByRole('button', { name: /Finish/ }).hasAttribute('disabled')).toBe(true)
})

test('normalized saved selection does not select or borrow another same-name printing', () => {
  seed([{ ...competitor, level: 0 }, requested], true, 'secret spark|other', ['OTHER', 'TEST'])
  editSetup()
  const checkboxes = screen.getAllByRole('checkbox', { name: /Secret Spark/ })
  expect(checkboxes.map((checkbox) => checkbox.getAttribute('aria-checked'))).toEqual([
    'false',
    'true',
  ])
  fireEvent.click(checkboxes[1])
  fireEvent.click(checkboxes[0])
  act(() => {
    fireEvent.click(screen.getByRole('button', { name: /Finish/ }))
  })
  expect(useCharacterStore.getState().activeCharacter?.fixedFeatOptions).toEqual({
    'training|other|': { spells: ['Secret Spark|TEST'] },
  })
})

test('catalog casing changes preserve the original saved reference and its removal', () => {
  const before = seed([requested], true, 'Secret Spark|OTHER', ['OTHER'])
  editSetup()
  act(() => {
    const data = makeGameDataFixture({
      feats: [feat],
      spells: [{ ...requested, name: 'secret spark', source: 'other' }],
    })
    useGameDataStore.setState({ gameData: { ...data, lookups: buildGameDataLookups(data) } })
  })
  const checkbox = screen.getByRole('checkbox', { name: /secret spark/i })
  expect(checkbox.getAttribute('aria-checked')).toBe('true')
  expect(checkbox.hasAttribute('disabled')).toBe(false)
  expect(useCharacterStore.getState().activeCharacter?.fixedFeatOptions).toEqual(
    before.fixedFeatOptions,
  )
  fireEvent.click(checkbox)
  expect(screen.getByRole('button', { name: /Finish/ }).hasAttribute('disabled')).toBe(true)
})
