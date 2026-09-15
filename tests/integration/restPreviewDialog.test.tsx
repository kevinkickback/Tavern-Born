import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { RestPreviewDialog } from '@/components/modals/RestPreviewDialog'
import type { RestPreviewOptions } from '@/hooks/character/useRestPreview'
import type { RestResult } from '@/lib/character/commands/restCommands'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

const commit = vi.fn()
const basePatch = {
  spells: makeCharacterFixture().spells,
  classResources: {},
  hitDiceUsed: 2,
  hitPoints: makeCharacterFixture().hitPoints,
}

function resultFor(options: RestPreviewOptions): RestResult {
  const changes = [
    {
      id: 'resource:test-focus',
      label: 'Test Focus',
      before: 0,
      after: 1,
    },
  ]
  if (options.restoreHitPoints) {
    changes.push({ id: 'hit-points', label: 'Current hit points', before: 4, after: 10 })
  }
  if (options.hitDiceRecovered > 0) {
    changes.push({
      id: 'hit-dice',
      label: 'Hit dice used',
      before: 2,
      after: 2 - options.hitDiceRecovered,
    })
  }
  return { patch: basePatch, changes }
}

vi.mock('@/hooks/character/useRestPreview', () => ({
  useRestPreview: () => ({
    hitDiceUsed: 2,
    preview: resultFor,
    commit,
  }),
}))

describe('RestPreviewDialog', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  test('explains short-rest HP choices and commits the displayed preview', async () => {
    const user = userEvent.setup()
    render(<RestPreviewDialog open onOpenChange={vi.fn()} />)

    expect(screen.getByText('Hit points and hit dice stay unchanged')).toBeTruthy()
    expect(screen.getByText('Test Focus')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Apply short rest' }))
    expect(commit).toHaveBeenCalledTimes(1)
    expect(commit.mock.calls[0][0].changes).toEqual([
      { id: 'resource:test-focus', label: 'Test Focus', before: 0, after: 1 },
    ])
  })

  test('previews long-rest HP and hit-die choices before applying them', async () => {
    const user = userEvent.setup()
    render(<RestPreviewDialog open onOpenChange={vi.fn()} />)

    await user.click(screen.getByText('Long rest'))
    await user.click(
      screen.getByRole('checkbox', {
        name: 'Restore current hit points to maximum and clear temporary hit points',
      }),
    )
    const hitDiceInput = screen.getByRole('spinbutton', { name: 'Hit dice to recover' })
    await user.clear(hitDiceInput)
    await user.type(hitDiceInput, '1')

    expect(screen.getByText('Current hit points')).toBeTruthy()
    expect(screen.getByText('Hit dice used')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Apply long rest' }))
    expect(commit.mock.calls[0][0].changes).toHaveLength(3)
  })
})
