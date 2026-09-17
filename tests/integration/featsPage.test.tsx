import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { FeatsPage } from '@/pages/feats/FeatsPage'
import { emptyProvenance, useCharacterStore } from '@/store/characterStore'
import type { Feat5e } from '@/types/5etools'
import type { FeatOptionSelections } from '@/types/character'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

vi.mock('@/lib/storage/idb-storage', () => ({
  createIdbStorage: () => ({
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  }),
}))

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

vi.mock('@/hooks/data/useFilteredGameData', () => ({
  useFilteredGameData: () => ({
    feats: [configurableFeat, configurableFeat2024, magicInitiate],
    spells: [],
    classes: [],
  }),
}))

vi.mock('@/hooks/data/useGameData', () => ({
  useClassLookup: () => new Map(),
}))

vi.mock('@/hooks/ui/useAnchoredHintPosition', () => ({
  useAnchoredHintPosition: ({ enabled }: { enabled: boolean }) =>
    enabled ? { reference: document.body, gap: 12, placement: 'bottom' } : null,
}))

vi.mock('@/components/modals/FeatSelectionModal', () => ({
  FeatSelectionModal: ({
    open,
    onConfirm,
  }: {
    open: boolean
    onConfirm: (feats: Feat5e[]) => void
  }) =>
    open ? (
      <div role="dialog" aria-label="Select bonus feat">
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
  const renderPage = (initialEntry = '/feats') =>
    render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <FeatsPage />
      </MemoryRouter>,
    )

  beforeEach(() => {
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

  test('resolves and configures a parameterized fixed background feat', () => {
    const provenance = emptyProvenance()
    provenance.feats['magic initiate'] = [
      {
        sourceType: 'background',
        sourceName: 'Acolyte',
        sourceRef: 'XPHB',
        grantType: 'fixed',
        grantVariant: 'cleric',
        label: 'Acolyte',
      },
    ]
    const character = makeCharacterFixture({ provenance })
    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    })

    renderPage('/feats?view=character&feat=Magic+Initiate&source=XPHB&focus=feat')

    expect(screen.getByRole('tab', { name: 'Feats' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getAllByText('You gain the following benefits.').length).toBeGreaterThan(0)
    expect(screen.getByText('Cleric')).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Select Magic Initiate' }).parentElement?.className,
    ).toContain('animate-route-focus')
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
  })

  test('opens a source-qualified feat from a route deep link', () => {
    renderPage('/feats?view=character&feat=Skilled&source=XPHB')

    expect(screen.getByRole('tab', { name: /^Character/ }).getAttribute('aria-selected')).toBe(
      'true',
    )
    expect(screen.getByText('Gain proficiency using the revised printing.')).toBeTruthy()
  })
})
