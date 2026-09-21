import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ManualEffectsEditor } from '@/components/character/ManualEffectsEditor'
import { useCharacterStore } from '@/store/characterStore'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

function resetCharacter() {
  const character = makeCharacterFixture({ manualEffects: [], suppressedEffectIds: [] })
  useCharacterStore.setState({
    characters: [character],
    activeCharacterId: character.id,
    activeCharacter: character,
  })
}

describe('ManualEffectsEditor', () => {
  beforeEach(resetCharacter)

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  test('adds, suppresses, re-enables, and removes a typed manual adjustment', async () => {
    const user = userEvent.setup()
    render(<ManualEffectsEditor />)

    await user.type(screen.getByLabelText('What caused it?'), 'Table ruling')
    await user.type(screen.getByLabelText('Value'), '2')
    await user.type(screen.getByLabelText('Condition or note (optional)'), 'While active')
    await user.click(screen.getByRole('button', { name: 'Add adjustment' }))

    const added = useCharacterStore.getState().activeCharacter?.manualEffects?.[0]
    expect(added).toMatchObject({
      label: 'Table ruling',
      target: { kind: 'ability-score', ability: 'strength' },
      operation: { kind: 'add', value: 2 },
      source: { kind: 'manual', name: 'Table ruling' },
      condition: 'While active',
    })

    await user.click(screen.getByRole('switch', { name: 'Disable Table ruling' }))
    expect(useCharacterStore.getState().activeCharacter?.suppressedEffectIds).toEqual([added?.id])
    await user.click(screen.getByRole('switch', { name: 'Enable Table ruling' }))
    expect(useCharacterStore.getState().activeCharacter?.suppressedEffectIds).toEqual([])

    await user.click(screen.getByRole('button', { name: 'Remove Table ruling' }))
    expect(useCharacterStore.getState().activeCharacter?.manualEffects).toEqual([])
  }, 10_000)
})
