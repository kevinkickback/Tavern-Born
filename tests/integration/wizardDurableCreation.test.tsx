import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { toast } from 'sonner'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { CharacterCreationWizard } from '@/components/character/wizard/CharacterCreationWizard'
import type { CharacterWizardData } from '@/components/character/wizard/types'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import {
  makeClassFixture,
  makeGameDataFixture,
  makeRaceFixture,
} from '../fixtures/gameDataFixtures'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/components/character/wizard/validation', () => ({
  validateStep: () => ({ valid: true }),
}))
vi.mock('@/hooks/data/useWizardGameData', () => ({
  useWizardGameData: () => {
    const race = makeRaceFixture({ name: 'Human', source: 'PHB' })
    const variant = makeRaceFixture({
      name: 'Variant',
      source: 'PHB',
      ability: [{ choose: { from: ['str', 'dex', 'con', 'int', 'wis', 'cha'], count: 2 } }],
      feats: [{ any: 1 }],
    })
    const classEntity = makeClassFixture({ name: 'Fighter', source: 'PHB' })
    const background = { name: 'Soldier', source: 'PHB' }
    return {
      ...makeGameDataFixture(),
      races: [race],
      classes: [classEntity],
      backgrounds: [background],
      sources: useGameDataStore.getState().gameData?.sources ?? [
        { abbreviation: 'PHB', name: 'Player Handbook' },
        { abbreviation: 'XGE', name: 'Test recommended source' },
        { abbreviation: 'TCE', name: 'Test recommended source two' },
        { abbreviation: 'HB', name: 'Test additional content' },
      ],
      itemLookup: new Map(),
      resolveRace: ({ subraceName }: { subraceName?: string }) => ({
        parentRace: race,
        subraceData: subraceName === 'Variant' ? variant : undefined,
      }),
      resolveClass: () => classEntity,
      resolveBackground: () => background,
    }
  },
}))
vi.mock('@/components/character/wizard/steps', () => ({
  BasicsStep: ({
    data,
    onChange,
  }: {
    data: CharacterWizardData
    onChange: (patch: Partial<CharacterWizardData>) => void
  }) => (
    <>
      <button
        type="button"
        onClick={() => onChange({ gender: data.gender === 'Female' ? 'Male' : 'Female' })}
      >
        Change gender
      </button>
      <button type="button" onClick={() => onChange({ gender: data.gender })}>
        Keep gender
      </button>
      <button
        type="button"
        onClick={() =>
          onChange({
            abilityScoreMethod:
              data.abilityScoreMethod === 'point-buy' ? 'standard-array' : 'point-buy',
          })
        }
      >
        Change ability method
      </button>
      <button
        type="button"
        onClick={() =>
          onChange({
            portraitTransform:
              data.portraitTransform.zoom === 150
                ? { ...data.portraitTransform, zoom: 160 }
                : { rotation: 0, panY: 25, panX: 25, zoom: 150 },
          })
        }
      >
        Change portrait crop
      </button>
      <button type="button" onClick={() => onChange({ allowedSources: ['TCE', 'HB', 'XGE'] })}>
        Change sources
      </button>
      <button type="button" onClick={() => onChange({ allowedSources: ['TCE', 'XGE'] })}>
        Restore sources
      </button>
      <button type="button" onClick={() => onChange({ allowedSources: [] })}>
        Clear sources
      </button>
      <output aria-label="Sources">{data.allowedSources.join(',')}</output>
      <button
        type="button"
        onClick={() =>
          onChange({
            allowedSources: data.allowedSources.includes('HB')
              ? data.allowedSources.filter((source) => source !== 'HB')
              : [...data.allowedSources, 'HB'],
          })
        }
      >
        Toggle additional source
      </button>
      <button type="button" onClick={() => onChange({ subrace: 'Variant', subraceSource: 'PHB' })}>
        Choose Variant
      </button>
      <input
        aria-label="Character name"
        value={data.name}
        onChange={(event) =>
          onChange({
            name: event.target.value,
            originSystem: '2014',
            race: 'Human',
            raceSource: 'PHB',
            class: 'Fighter',
            classSource: 'PHB',
            background: 'Soldier',
            backgroundSource: 'PHB',
          })
        }
      />
    </>
  ),
  RulesStep: () => null,
  ContentStep: ({ isBundledSrd }: { isBundledSrd: boolean }) => (
    <p>{isBundledSrd ? 'Included SRD is active' : 'Additional sources are active'}</p>
  ),
  RaceStep: () => null,
  ClassStep: () => null,
  BackgroundStep: () => null,
  AbilityScoresStep: () => null,
  ReviewStep: ({ data }: { data: CharacterWizardData }) => <p>Review {data.name}</p>,
}))

const addCharacter = useCharacterStore.getState().addCharacter
beforeEach(() => {
  useCharacterStore.setState({
    characters: [],
    activeCharacterId: null,
    activeCharacter: null,
    isActiveCharacterDirty: false,
    addCharacter,
  })
  useGameDataStore.setState({ gameData: null, dataSourceConfig: null, sessionBundledSource: null })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  useCharacterStore.setState({ addCharacter })
})

function WizardHarness() {
  const [open, setOpen] = useState(true)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Reopen wizard
      </button>
      <CharacterCreationWizard open={open} onOpenChange={setOpen} />
    </>
  )
}

function wizardBackdrop() {
  const backdrop = document.querySelector<HTMLElement>('[data-slot="dialog-overlay"]')
  if (!backdrop) throw new Error('Wizard backdrop is missing')
  return backdrop
}

test('the content step uses the active session SRD while keeping the saved remote source', async () => {
  const remote = { type: 'remote', path: 'https://example.test/data', isValid: true } as const
  useGameDataStore.setState({
    dataSourceConfig: remote,
    sessionBundledSource: {
      type: 'bundled',
      path: 'srd/core',
      packId: 'core',
      packVersion: '1.0.0',
      isValid: true,
    },
  })
  render(<WizardHarness />)
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Next' }))
  await user.click(screen.getByRole('button', { name: 'Next' }))
  expect(screen.getByText('Included SRD is active')).toBeTruthy()
  expect(useGameDataStore.getState().dataSourceConfig).toBe(remote)
})

test('outside mouse and touch clicks preserve the current wizard step and entered input', async () => {
  const user = userEvent.setup()
  render(<WizardHarness />)
  const dialog = screen.getByRole('dialog', { name: 'Create New Character' })
  await user.type(within(dialog).getByRole('textbox', { name: 'Character name' }), 'Retained Hero')
  await user.click(within(dialog).getByRole('button', { name: 'Next' }))
  expect(within(dialog).getAllByText('Step 2 of 8').length).toBeGreaterThan(0)

  const backdrop = wizardBackdrop()
  await user.click(backdrop)
  await user.pointer([{ keys: '[TouchA>]', target: backdrop }, { keys: '[/TouchA]' }])

  expect(screen.getByRole('dialog', { name: 'Create New Character' })).toBe(dialog)
  expect(within(dialog).getAllByText('Step 2 of 8').length).toBeGreaterThan(0)
  await user.click(within(dialog).getByRole('button', { name: 'Back' }))
  expect(
    within(dialog).getByRole<HTMLInputElement>('textbox', { name: 'Character name' }).value,
  ).toBe('Retained Hero')
  expect(useCharacterStore.getState().characters).toEqual([])
})

test.each([
  'Cancel',
  'Close',
  'Escape',
] as const)('%s confirms changed input and only confirmed discard resets the wizard', async (action) => {
  const user = userEvent.setup()
  render(<WizardHarness />)
  const dialog = screen.getByRole('dialog', { name: 'Create New Character' })
  await user.type(within(dialog).getByRole('textbox', { name: 'Character name' }), 'Discarded Hero')
  await user.click(within(dialog).getByRole('button', { name: 'Next' }))

  const origin =
    action === 'Escape'
      ? document.activeElement
      : within(dialog).getByRole('button', { name: action })
  const requestClose = async () => {
    if (action === 'Escape') await user.keyboard('{Escape}')
    else await user.click(within(dialog).getByRole('button', { name: action }))
  }
  await requestClose()
  const confirmation = screen.getByRole('alertdialog', { name: 'Discard character creation?' })
  const keepEditing = within(confirmation).getByRole('button', { name: 'Keep editing' })
  expect(document.activeElement).toBe(keepEditing)
  expect(screen.queryByRole('dialog', { name: 'Create New Character' })).toBeNull()
  await user.tab()
  expect(document.activeElement).toBe(
    within(confirmation).getByRole('button', { name: 'Discard changes' }),
  )
  await user.tab()
  expect(document.activeElement).toBe(keepEditing)
  await user.keyboard('{Escape}')
  await waitFor(() => expect(document.activeElement).toBe(origin))
  expect(screen.getByRole('dialog', { name: 'Create New Character' })).toBe(dialog)
  expect(within(dialog).getAllByText('Step 2 of 8').length).toBeGreaterThan(0)

  await requestClose()
  await user.click(screen.getByRole('button', { name: 'Keep editing' }))
  await waitFor(() => expect(document.activeElement).toBe(origin))
  await user.click(within(dialog).getByRole('button', { name: 'Back' }))
  expect(
    within(dialog).getByRole<HTMLInputElement>('textbox', { name: 'Character name' }).value,
  ).toBe('Discarded Hero')
  await requestClose()
  await user.click(screen.getByRole('button', { name: 'Discard changes' }))

  expect(screen.queryByRole('dialog', { name: 'Create New Character' })).toBeNull()
  await user.click(screen.getByRole('button', { name: 'Reopen wizard' }))
  const reopened = screen.getByRole('dialog', { name: 'Create New Character' })
  expect(within(reopened).getAllByText('Step 1 of 8').length).toBeGreaterThan(0)
  expect(
    within(reopened).getByRole<HTMLInputElement>('textbox', { name: 'Character name' }).value,
  ).toBe('')
  expect(useCharacterStore.getState().characters).toEqual([])
})

test.each([
  'Cancel',
  'Close',
  'Escape',
] as const)('%s closes an untouched wizard without confirmation', async (action) => {
  const user = userEvent.setup()
  render(<WizardHarness />)
  if (action === 'Escape') await user.keyboard('{Escape}')
  else await user.click(screen.getByRole('button', { name: action }))
  expect(screen.queryByRole('alertdialog')).toBeNull()
  expect(screen.queryByRole('dialog')).toBeNull()
})

test('non-text input requires confirmation and the confirmation backdrop retains it', async () => {
  const user = userEvent.setup()
  render(<WizardHarness />)
  await user.click(screen.getByRole('button', { name: 'Change gender' }))
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  const confirmation = screen.getByRole('alertdialog', { name: 'Discard character creation?' })
  const backdrop = document.querySelector<HTMLElement>('[data-slot="alert-dialog-overlay"]')!
  await user.click(backdrop)
  expect(screen.getByRole('alertdialog')).toBe(confirmation)
  await user.click(within(confirmation).getByRole('button', { name: 'Keep editing' }))
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.getByRole('alertdialog')).toBeTruthy()
})

test('no-op and fully reverted structured choices close without confirmation', async () => {
  const user = userEvent.setup()
  render(<WizardHarness />)
  await user.click(screen.getByRole('button', { name: 'Keep gender' }))
  for (const name of ['Change gender', 'Change ability method', 'Change portrait crop']) {
    await user.click(screen.getByRole('button', { name }))
    await user.click(screen.getByRole('button', { name }))
  }
  await user.click(screen.getByRole('button', { name: 'Change sources' }))
  await user.click(screen.getByRole('button', { name: 'Restore sources' }))
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.queryByRole('alertdialog')).toBeNull()
  expect(screen.queryByRole('dialog')).toBeNull()
})

test('late automatic source defaults stay pristine after an edit is reverted, while source edits are protected', async () => {
  const user = userEvent.setup()
  useGameDataStore.setState({
    gameData: makeGameDataFixture({
      sources: [{ abbreviation: 'PHB', name: 'Player Handbook', group: 'core' }],
    }),
  })
  render(<WizardHarness />)
  expect(screen.getByLabelText('Sources').textContent).toBe('')
  await user.click(screen.getByRole('button', { name: 'Change gender' }))
  await act(() =>
    useGameDataStore.setState({
      gameData: makeGameDataFixture({
        sources: [
          { abbreviation: 'PHB', name: 'Player Handbook', group: 'core' },
          { abbreviation: 'XGE', name: 'Test recommended source', group: 'supplement' },
          { abbreviation: 'TCE', name: 'Test recommended source two', group: 'supplement' },
          { abbreviation: 'HB', name: 'Test additional content', group: 'other' },
        ],
      }),
    }),
  )
  expect(screen.getByLabelText('Sources').textContent).toBe('XGE,TCE')
  await user.click(screen.getByRole('button', { name: 'Change gender' }))
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.queryByRole('alertdialog')).toBeNull()
  await user.click(screen.getByRole('button', { name: 'Reopen wizard' }))
  await user.click(screen.getByRole('button', { name: 'Change sources' }))
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.getByRole('alertdialog', { name: 'Discard character creation?' })).toBeTruthy()
})

test.each([
  false,
  true,
])('reverted source edits ignore later automatic defaults while remaining input is protected (%s)', async (keepGenderChange) => {
  const user = userEvent.setup()
  const sources = [
    { abbreviation: 'PHB', name: 'Player Handbook', group: 'core' },
    { abbreviation: 'HB', name: 'Test additional content', group: 'other' },
  ]
  useGameDataStore.setState({ gameData: makeGameDataFixture({ sources }) })
  render(<WizardHarness />)
  expect(screen.getByLabelText('Sources').textContent).toBe('')
  if (keepGenderChange) await user.click(screen.getByRole('button', { name: 'Change gender' }))
  await user.click(screen.getByRole('button', { name: 'Toggle additional source' }))
  await user.click(screen.getByRole('button', { name: 'Toggle additional source' }))
  expect(screen.getByLabelText('Sources').textContent).toBe('')
  await act(() =>
    useGameDataStore.setState({
      gameData: makeGameDataFixture({
        sources: [
          ...sources,
          { abbreviation: 'XGE', name: 'Test recommended source', group: 'supplement' },
        ],
      }),
    }),
  )
  expect(screen.getByLabelText('Sources').textContent).toBe('XGE')
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  if (keepGenderChange) {
    expect(screen.getByRole('alertdialog')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Keep editing' }))
    await user.click(screen.getByRole('button', { name: 'Change gender' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
  }
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.queryByRole('alertdialog')).toBeNull()

  await user.click(screen.getByRole('button', { name: 'Reopen wizard' }))
  await user.click(screen.getByRole('button', { name: 'Toggle additional source' }))
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.getByRole('alertdialog')).toBeTruthy()
  await user.click(screen.getByRole('button', { name: 'Keep editing' }))
  await user.click(screen.getByRole('button', { name: 'Toggle additional source' }))
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.queryByRole('dialog')).toBeNull()
})

test('explicit empty sources survive refresh while confirmation is open and reset on discard', async () => {
  const user = userEvent.setup()
  useGameDataStore.setState({
    gameData: makeGameDataFixture({
      sources: [
        { abbreviation: 'PHB', name: 'Player Handbook', group: 'core' },
        { abbreviation: 'XGE', name: 'Initial recommended source', group: 'supplement' },
        { abbreviation: 'TCE', name: 'Test recommended source two', group: 'supplement' },
        { abbreviation: 'HB', name: 'Test additional content', group: 'other' },
      ],
    }),
  })
  render(<WizardHarness />)
  expect(screen.getByLabelText('Sources').textContent).toBe('XGE,TCE')
  await user.click(screen.getByRole('button', { name: 'Clear sources' }))
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.getByRole('alertdialog')).toBeTruthy()
  await act(() =>
    useGameDataStore.setState({
      gameData: makeGameDataFixture({
        sources: [
          { abbreviation: 'PHB', name: 'Player Handbook', group: 'core' },
          { abbreviation: 'XGE', name: 'Refreshed recommended source', group: 'supplement' },
          { abbreviation: 'TCE', name: 'Test recommended source two', group: 'supplement' },
          { abbreviation: 'HB', name: 'Test additional content', group: 'other' },
        ],
      }),
    }),
  )
  await user.click(screen.getByRole('button', { name: 'Keep editing' }))
  expect(screen.getByLabelText('Sources').textContent).toBe('')
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.getByRole('alertdialog')).toBeTruthy()
  await user.click(screen.getByRole('button', { name: 'Keep editing' }))
  await user.click(screen.getByRole('button', { name: 'Restore sources' }))
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.queryByRole('dialog')).toBeNull()
  await user.click(screen.getByRole('button', { name: 'Reopen wizard' }))
  expect(screen.getByLabelText('Sources').textContent).toBe('XGE,TCE')
  await user.click(screen.getByRole('button', { name: 'Clear sources' }))
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  await user.click(screen.getByRole('button', { name: 'Discard changes' }))
  await user.click(screen.getByRole('button', { name: 'Reopen wizard' }))
  expect(screen.getByLabelText('Sources').textContent).toBe('XGE,TCE')
})

test('clearing already empty sources remains a no-op for delayed defaults', async () => {
  const user = userEvent.setup()
  useGameDataStore.setState({
    gameData: makeGameDataFixture({
      sources: [{ abbreviation: 'PHB', name: 'Player Handbook', group: 'core' }],
    }),
  })
  render(<WizardHarness />)
  await user.click(screen.getByRole('button', { name: 'Clear sources' }))
  await act(() =>
    useGameDataStore.setState({
      gameData: makeGameDataFixture({
        sources: [{ abbreviation: 'XGE', name: 'Late recommended source', group: 'supplement' }],
      }),
    }),
  )
  expect(screen.getByLabelText('Sources').textContent).toBe('XGE')
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.queryByRole('alertdialog')).toBeNull()
})

test('keeps wizard input and permits retry after a delayed creation failure', async () => {
  const user = userEvent.setup()
  const onOpenChange = vi.fn()
  let rejectWrite: (error: Error) => void = () => undefined
  const creation = vi.spyOn(useCharacterStore.getState(), 'addCharacter').mockImplementationOnce(
    () =>
      new Promise((_, reject) => {
        rejectWrite = reject
      }),
  )
  render(<CharacterCreationWizard open onOpenChange={onOpenChange} />)
  await user.type(screen.getByRole('textbox', { name: 'Character name' }), 'Recoverable Hero')
  await user.click(screen.getByRole('button', { name: 'Choose Variant' }))
  for (let step = 1; step < 8; step++)
    await user.click(screen.getByRole('button', { name: 'Next' }))
  await user.click(screen.getByRole('button', { name: 'Create' }))
  expect(screen.getByRole('button', { name: 'Creating…' }).hasAttribute('disabled')).toBe(true)
  expect(screen.getByRole('button', { name: 'Back' }).hasAttribute('disabled')).toBe(true)
  expect(screen.getByRole('button', { name: 'Cancel' }).hasAttribute('disabled')).toBe(true)
  expect(screen.getByRole('button', { name: 'Close' }).hasAttribute('disabled')).toBe(true)
  await user.keyboard('{Escape}')
  await user.click(wizardBackdrop())
  expect(screen.queryByRole('alertdialog')).toBeNull()
  expect(onOpenChange).not.toHaveBeenCalled()
  expect(toast.success).not.toHaveBeenCalled()
  expect(useCharacterStore.getState().characters).toEqual([])

  await act(() => {
    rejectWrite(new Error('Storage unavailable'))
  })
  expect(screen.getByText('Review Recoverable Hero')).toBeTruthy()
  expect(screen.getByRole('alert').textContent).toContain('Storage unavailable')
  expect(onOpenChange).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Create' }))
  await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  expect(screen.queryByRole('alertdialog')).toBeNull()
  expect(creation).toHaveBeenCalledTimes(2)
  expect(toast.success).toHaveBeenCalledWith('Character created')
  expect(useCharacterStore.getState().characters).toHaveLength(1)
  expect(useCharacterStore.getState().activeCharacter?.name).toBe('Recoverable Hero')
  expect(useCharacterStore.getState().activeCharacter).toMatchObject({
    race: 'Human',
    raceSource: 'PHB',
    subrace: 'Variant',
    subraceSource: 'PHB',
  })
})
