import { render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { CharacterReadinessBadge } from '@/components/character/CharacterReadinessBadge'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

vi.mock('@/hooks/character/useCharacterReadiness', () => ({
  useCharacterReadiness: () => ({
    status: 'incomplete',
    blockingIssues: [{ id: 'identity:name' }, { id: 'identity:race' }],
  }),
}))

describe('CharacterReadinessBadge', () => {
  test('describes every blocking issue as requiring attention', () => {
    render(<CharacterReadinessBadge character={makeCharacterFixture()} />)

    expect(screen.getByLabelText('2 issues requiring attention')).toBeTruthy()
  })
})
