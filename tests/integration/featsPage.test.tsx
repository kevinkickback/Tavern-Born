import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
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
    feats: [configurableFeat, magicInitiate],
    spells: [],
    classes: [],
  }),
}))

vi.mock('@/hooks/data/useGameData', () => ({
  useClassLookup: () => new Map(),
}))

vi.mock('@/hooks/ui/useAnchoredHintPosition', () => ({
  useAnchoredHintPosition: ({ enabled }: { enabled: boolean }) =>
    enabled ? { top: 40, left: 40, arrowLeft: 20, anchorTop: 20, gap: 12 } : null,
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
    render(<FeatsPage />)

    expect(screen.queryByRole('tab', { name: /Needs Setup/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Add Bonus Feat' }))
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

    render(<FeatsPage />)

    const editButtons = screen.getAllByRole('button', { name: 'Edit Setup' })
    expect(editButtons).toHaveLength(2)
    for (const button of editButtons) {
      expect(button.className).toContain('border-accent/40')
      expect(button.className).toContain('text-accent')
      expect(button.getAttribute('data-feat-edit-setup-btn')).toBe('true')
    }
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

    render(<FeatsPage />)

    expect(screen.getByText('You gain the following benefits.')).toBeTruthy()
    expect(screen.getByText('Cleric')).toBeTruthy()
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
})
