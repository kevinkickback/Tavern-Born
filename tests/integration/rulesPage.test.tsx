import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { RulesPage } from '@/pages/rules/RulesPage'
import { useCharacterStore } from '@/store/characterStore'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

vi.mock('@/lib/storage/idb-storage', () => ({
  createIdbStorage: () => ({
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  }),
}))

describe('RulesPage', () => {
  const renderPage = () =>
    render(
      <MemoryRouter>
        <RulesPage />
      </MemoryRouter>,
    )

  beforeEach(() => {
    const character = makeCharacterFixture({
      originSystem: '2014',
      variantRules: {
        abilityScoreMethod: 'point-buy',
        averageHitPoints: true,
        optionalClassFeatures: false,
        bladesingerAnyRace: false,
        battleragerAnyRace: false,
        preferNewerPrintings: true,
        ignoreEquipRestrictions: false,
      },
    })
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

  test('shows each rule section in a settings-style tab', async () => {
    const user = userEvent.setup()
    const { container } = renderPage()

    expect(screen.getByRole('alert').className).toContain('border-warning/35')
    expect(screen.getByRole('alert').className).toContain('bg-warning/10')
    expect(screen.getByRole('tablist', { name: 'Rules category' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Ruleset' }).getAttribute('aria-selected')).toBe('true')
    expect(container.querySelectorAll('[data-slot="rules-section"]')).toHaveLength(1)
    expect(container.querySelector('[data-slot="rules-section"]')?.className).toContain(
      'bg-workspace-pane',
    )
    expect(screen.getByText('5e Legacy (2014)')).toBeTruthy()
    expect(screen.getByText('Fixed').className).toContain('bg-accent')

    await user.click(screen.getByRole('tab', { name: 'Advancement' }))

    expect(screen.getByLabelText('Average Hit Points')).toBeTruthy()
    expect(screen.getByLabelText('Optional Class Features')).toBeTruthy()

    await user.click(screen.getByRole('tab', { name: 'Character Options' }))

    expect(screen.getByLabelText('Bladesinger Any Race')).toBeTruthy()
    expect(screen.getByLabelText('Battlerager Any Race')).toBeTruthy()
    expect(screen.getByLabelText('Prefer Newer Printings')).toBeTruthy()
    expect(screen.getByLabelText('Ignore Equipment Restrictions')).toBeTruthy()
  })

  test('updates rules on the active character without replacing existing choices', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('tab', { name: 'Advancement' }))

    await user.click(screen.getByLabelText('Average Hit Points'))
    await user.click(screen.getByLabelText('Optional Class Features'))
    await user.click(screen.getByRole('button', { name: /Custom/ }))

    expect(useCharacterStore.getState().activeCharacter?.variantRules).toEqual(
      expect.objectContaining({
        averageHitPoints: false,
        optionalClassFeatures: true,
        abilityScoreMethod: 'custom',
      }),
    )
  })
})
