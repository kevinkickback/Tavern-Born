import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { makeSourceTag } from '@/lib/provenance'
import { FeatsPage } from '@/pages/feats/FeatsPage'
import { useFeatsPageController } from '@/pages/feats/hooks/useFeatsPageController'
import { emptyProvenance, useCharacterStore } from '@/store/characterStore'
import type { Feat5e } from '@/types/5etools'
import type { FeatOptionSelections } from '@/types/character'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

const configurableFeat = {
  name: 'Skilled',
  source: 'PHB',
  skillProficiencies: [{ choose: { from: ['Arcana', 'History'], count: 1 } }],
  entries: ['Gain proficiency in one skill.'],
} as Feat5e

const configurableFeat2024 = {
  ...configurableFeat,
  source: 'XPHB',
  entries: ['Gain proficiency using the revised printing.'],
} as Feat5e

const magicInitiate = {
  name: 'Magic Initiate',
  source: 'XPHB',
  category: 'O',
  entries: ['You gain the following benefits.'],
  additionalSpells: [
    { name: 'Cleric Spells' },
    { name: 'Druid Spells' },
    { name: 'Wizard Spells' },
  ],
} as Feat5e

let rawFeatLookup: Record<string, Feat5e> = {}

vi.mock('@/hooks/data/useFilteredGameData', () => ({
  useFilteredGameData: () => ({
    feats: [configurableFeat, configurableFeat2024, magicInitiate],
    spells: [],
    classes: [],
  }),
}))

vi.mock('@/hooks/data/useGameData', () => ({
  useClassLookup: () => new Map(),
  useFeatLookup: () => rawFeatLookup,
  useSpellLookup: () => ({}),
}))

vi.mock('@/hooks/ui/useAnchoredHintPosition', () => ({
  useAnchoredHintPosition: ({ enabled }: { enabled: boolean }) =>
    enabled ? { reference: document.body, gap: 12, placement: 'bottom' } : null,
}))

vi.mock('@/components/modals/FeatSelectionModal', () => ({
  FeatSelectionModal: ({
    open,
    maxSelections,
    onConfirm,
  }: {
    open: boolean
    maxSelections: number
    onConfirm: (feats: Feat5e[]) => void
  }) =>
    open ? (
      <div role="dialog" aria-label="Select bonus feat" data-max-selections={maxSelections}>
        <button type="button" onClick={() => onConfirm([configurableFeat])}>
          Select Skilled
        </button>
      </div>
    ) : null,
}))

vi.mock('@/components/modals/FeatOptionsModal', () => ({
  FeatOptionsModal: ({
    feat,
    fixedSpellcastingClass,
    onFinish,
  }: {
    feat: Feat5e
    fixedSpellcastingClass?: string
    onFinish: (selections: FeatOptionSelections) => void
  }) => (
    <div role="dialog" aria-label={`Configure ${feat.name}`}>
      {fixedSpellcastingClass && <span>{fixedSpellcastingClass}</span>}
      <button
        type="button"
        onClick={() =>
          onFinish(
            fixedSpellcastingClass
              ? { spellcastingClass: fixedSpellcastingClass }
              : { skills: ['Arcana'] },
          )
        }
      >
        Finish Setup
      </button>
    </div>
  ),
}))

describe('FeatsPage bonus feat configuration', () => {
  test.each([
    'fixed',
    'class',
    'choice',
  ] as const)('editing a %s copy loads only that owner’s saved setup', (owner) => {
    const feat = { id: 'chosen', name: 'Skilled', source: 'PHB', description: '' }
    const character = makeCharacterFixture({
      feats: [{ ...feat, options: { skills: ['Arcana'] } }],
      fixedFeatOptions: { 'skilled|phb|': { skills: ['Stealth'] } },
      classFeatChoices: [
        {
          id: 'class',
          className: 'Fighter',
          classSource: 'PHB',
          progressionName: 'Training',
          categories: [],
          feats: [{ ...feat, options: { skills: ['History'] } }],
        },
      ],
      provenance: {
        ...emptyProvenance(),
        choices: [
          {
            id: 'choice',
            domain: 'feats',
            sourceTag: makeSourceTag('race', 'Human', 'placeholder', 'PHB'),
            chooseCount: 1,
            optionPool: [],
            selected: ['Skilled'],
            status: 'resolved',
            selectedRefs: [{ name: 'Skilled', source: 'PHB', options: { skills: ['Nature'] } }],
          },
        ],
      },
    })
    useCharacterStore.setState({
      characters: [character],
      activeCharacter: character,
      activeCharacterId: character.id,
    })
    const { result } = renderHook(() => useFeatsPageController(), {
      wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
    })
    act(() =>
      result.current.handleEditSetup(
        'Skilled',
        'PHB',
        undefined,
        owner === 'choice' ? 'choice' : undefined,
        owner === 'class' ? 'class' : undefined,
        owner === 'fixed',
      ),
    )
    expect(result.current.featEditCandidate?.priorOptions).toEqual({
      skills: [owner === 'fixed' ? 'Stealth' : owner === 'class' ? 'History' : 'Nature'],
    })
    act(() => result.current.setFeatEditCandidate(null))
    act(() =>
      result.current.handleEditSetup(
        'Skilled',
        'PHB',
        owner === 'fixed' ? 'unconfigured' : undefined,
        owner === 'choice' ? 'missing-choice' : undefined,
        owner === 'class' ? 'missing-class' : undefined,
        owner === 'fixed',
      ),
    )
    expect(result.current.featEditCandidate).toBeNull()
  })

  const renderPage = (initialEntry = '/feats') =>
    render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <FeatsPage />
      </MemoryRouter>,
    )

  beforeEach(() => {
    rawFeatLookup = {}
    const character = makeCharacterFixture({ specialFeats: [] })
    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  test('automatically configures a newly selected bonus feat', () => {
    renderPage()

    expect(screen.queryByRole('tab', { name: /Needs Setup/ })).toBeNull()
    const addBonusFeat = screen.getByRole('button', { name: 'Add Bonus Feat' })
    expect(addBonusFeat.className).toContain('bg-primary')
    fireEvent.click(addBonusFeat)
    expect(
      screen.getByRole('dialog', { name: 'Select bonus feat' }).getAttribute('data-max-selections'),
    ).toBe('Infinity')
    fireEvent.click(screen.getByRole('button', { name: 'Select Skilled' }))

    expect(screen.queryByRole('dialog', { name: 'Select bonus feat' })).toBeNull()
    expect(screen.getByRole('dialog', { name: 'Configure Skilled' })).toBeTruthy()

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Finish Setup' }))
    })

    expect(useCharacterStore.getState().activeCharacter?.specialFeats?.[0].options).toEqual({
      skills: ['Arcana'],
    })
    expect(screen.getByRole('button', { name: 'Edit Setup' }).className).toContain(
      'border-accent/40',
    )
  })

  test('uses accent Edit Setup buttons for character and bonus feats', () => {
    const configuredFeat = {
      id: 'skilled-phb',
      name: 'Skilled',
      source: 'PHB',
      description: '',
      options: { skills: ['Arcana'] },
    }
    const character = makeCharacterFixture({
      feats: [configuredFeat],
      specialFeats: [{ ...configuredFeat, id: 'bonus-skilled-phb' }],
    })
    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    })

    renderPage()

    const editButtons = screen.getAllByRole('button', { name: 'Edit Setup' })
    expect(editButtons).toHaveLength(2)
    for (const button of editButtons) {
      expect(button.className).toContain('border-accent/40')
      expect(button.className).toContain('text-accent')
      expect(button.getAttribute('data-feat-edit-setup-btn')).toBe('true')
    }
    const addFeatButton = screen.getByRole('button', { name: 'Add Feat' })
    expect(addFeatButton.className).toContain('bg-primary')
    expect(addFeatButton.parentElement?.parentElement?.className).toContain('pb-2')
    expect(screen.getByRole('status').textContent).toContain(
      "You can revise a configured feat's spells, skills, or other choices later.",
    )
    expect(screen.getByRole('status').textContent).toContain('Edit Setup')
  })

  test('resolves and configures a parameterized fixed background feat', async () => {
    const provenance = emptyProvenance()
    provenance.feats['magic initiate'] = [
      {
        sourceType: 'background',
        sourceName: 'Acolyte',
        sourceRef: 'XPHB',
        grantSource: 'XPHB',
        grantType: 'fixed',
        grantVariant: 'cleric',
        label: 'Acolyte',
      },
    ]
    const character = makeCharacterFixture({
      provenance,
      originSystem: '2024',
      background: 'Acolyte',
      backgroundSource: 'XPHB',
    })
    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    })

    renderPage('/feats?view=character&feat=Magic+Initiate&source=XPHB&focus=feat')

    expect(screen.getByRole('tab', { name: 'Feats' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getAllByText('You gain the following benefits.').length).toBeGreaterThan(0)
    expect(screen.getByText('Cleric')).toBeTruthy()
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Select Magic Initiate' }).parentElement?.className,
      ).toContain('animate-route-focus'),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Complete Setup' }))
    expect(screen.getByRole('dialog', { name: 'Configure Magic Initiate' }).textContent).toContain(
      'Cleric Spells',
    )

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Finish Setup' }))
    })

    expect(
      useCharacterStore.getState().activeCharacter?.fixedFeatOptions?.[
        'magic initiate|xphb|cleric'
      ],
    ).toEqual({ spellcastingClass: 'Cleric Spells' })
  })

  test('selects and removes regular feats by name and source', () => {
    const character = makeCharacterFixture({
      feats: [
        { id: 'skilled-phb', name: 'Skilled', source: 'PHB', description: '' },
        { id: 'skilled-xphb', name: 'Skilled', source: 'XPHB', description: '' },
      ],
    })
    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    })

    renderPage()

    const selectButtons = screen.getAllByRole('button', { name: 'Select Skilled' })
    fireEvent.click(selectButtons[1])
    expect(selectButtons[0].getAttribute('aria-pressed')).toBe('false')
    expect(selectButtons[1].getAttribute('aria-pressed')).toBe('true')
    expect(screen.getAllByText('XPHB').length).toBeGreaterThan(0)

    const removeButtons = screen.getAllByRole('button', { name: 'Remove Skilled' })
    act(() => fireEvent.click(removeButtons[0]))
    expect(useCharacterStore.getState().activeCharacter?.feats).toEqual([
      expect.objectContaining({ name: 'Skilled', source: 'XPHB' }),
    ])
    expect(
      screen.getByRole('button', { name: 'Select Skilled' }).getAttribute('aria-pressed'),
    ).toBe('true')
    expect(screen.getAllByText('Gain proficiency using the revised printing.')).toHaveLength(2)
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Remove Skilled' })))
    expect(screen.queryByText('Gain proficiency using the revised printing.')).toBeNull()
  })

  test('keeps a missing fixed source and its saved options without offering another printing', () => {
    const provenance = emptyProvenance()
    provenance.feats['magic initiate'] = [
      {
        sourceType: 'background',
        sourceName: 'Acolyte',
        sourceRef: 'XPHB',
        grantSource: 'MISSING',
        grantType: 'fixed',
        grantVariant: 'cleric',
        label: 'Acolyte',
      },
    ]
    const character = makeCharacterFixture({
      provenance,
      originSystem: '2024',
      background: 'Acolyte',
      backgroundSource: 'XPHB',
      fixedFeatOptions: { 'magic initiate|missing|cleric': { spellcastingClass: 'Cleric Spells' } },
    })
    useCharacterStore.setState({
      activeCharacter: character,
      activeCharacterId: character.id,
      characters: [character],
    })
    renderPage('/feats?view=character')
    expect(screen.getByText('Feat data unavailable')).toBeTruthy()
    expect(screen.getByText('MISSING')).toBeTruthy()
    expect(screen.getByText('Cleric')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Complete Setup' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Edit Setup' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Select magic initiate' }))
    expect(screen.queryByText('Prerequisites met')).toBeNull()
    expect(screen.queryByText('Prerequisites unmet')).toBeNull()
    expect(useCharacterStore.getState().activeCharacter).toEqual(character)
  })

  test('configures the exact raw fixed feat hidden from the selection catalog', () => {
    rawFeatLookup = { 'Magic Initiate|OTHER': { ...magicInitiate, source: 'OTHER' } }
    const provenance = emptyProvenance()
    provenance.feats['magic initiate'] = [
      {
        sourceType: 'background',
        sourceName: 'Acolyte',
        sourceRef: 'XPHB',
        grantSource: 'OTHER',
        grantType: 'fixed',
        grantVariant: 'cleric',
        label: 'Acolyte',
      },
    ]
    const character = makeCharacterFixture({
      provenance,
      originSystem: '2024',
      background: 'Acolyte',
      backgroundSource: 'XPHB',
    })
    useCharacterStore.setState({
      activeCharacter: character,
      activeCharacterId: character.id,
      characters: [character],
    })
    renderPage('/feats?view=character&feat=Magic+Initiate&source=OTHER&focus=feat')
    fireEvent.click(screen.getByRole('button', { name: 'Complete Setup' }))
    expect(screen.getByRole('dialog', { name: 'Configure Magic Initiate' }).textContent).toContain(
      'Cleric Spells',
    )
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Finish Setup' })))
    expect(
      useCharacterStore.getState().activeCharacter?.fixedFeatOptions?.[
        'magic initiate|other|cleric'
      ],
    ).toEqual({ spellcastingClass: 'Cleric Spells' })
    expect(
      useCharacterStore.getState().activeCharacter?.fixedFeatOptions?.[
        'magic initiate|xphb|cleric'
      ],
    ).toBeUndefined()
    expect(
      useCharacterStore.getState().activeCharacter?.provenance?.feats['magic initiate']?.[0]
        .grantSource,
    ).toBe('OTHER')
    fireEvent.click(screen.getByRole('button', { name: 'Edit Setup' }))
    expect(screen.getByRole('alertdialog').textContent).toContain('Edit feat setup?')
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByRole('dialog', { name: 'Configure Magic Initiate' }).textContent).toContain(
      'Cleric Spells',
    )
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Finish Setup' })))
    expect(
      useCharacterStore.getState().activeCharacter?.fixedFeatOptions?.[
        'magic initiate|other|cleric'
      ],
    ).toEqual({ spellcastingClass: 'Cleric Spells' })
  })

  test('opens a source-qualified feat from a route deep link', () => {
    renderPage('/feats?view=character&feat=Skilled&source=XPHB')

    expect(screen.getByRole('tab', { name: /^Character/ }).getAttribute('aria-selected')).toBe(
      'true',
    )
    expect(screen.getByText('Gain proficiency using the revised printing.')).toBeTruthy()
  })
})
