import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { RulesPreviewManager } from '@/components/editor/RulesPreviewManager'
import { FeatSelectionModal } from '@/components/modals/FeatSelectionModal'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Feat5e } from '@/types/5etools'
import { makePrereqCharacterSnapshotFixture } from '../fixtures/characterFixtures'
import { makeGameDataFixture } from '../fixtures/gameDataFixtures'

vi.mock('@/components/modals/SelectionModal', () => ({
  SelectionModal: ({
    items,
    renderCard,
  }: {
    items: Feat5e[]
    renderCard: (item: Feat5e, selected: boolean, canSelect: boolean) => ReactNode
  }) => <div>{items[0] ? renderCard(items[0], false, true) : null}</div>,
}))

const watchfulFeat: Feat5e = {
  name: 'Watchful Fixture',
  source: 'PHB',
  entries: [
    'Always on the lookout for danger, you gain the following benefits:',
    {
      type: 'list',
      items: [
        'You have advantage while resisting the {@condition Prone|PHB} condition.',
        'You add your proficiency bonus to initiative rolls.',
      ],
    },
  ],
}

describe('FeatSelectionModal', () => {
  afterEach(() => {
    cleanup()
    useGameDataStore.setState({ gameData: null })
  })

  test('shows structured feat benefits and keeps an inline preview interactive', async () => {
    useGameDataStore.setState({
      gameData: makeGameDataFixture({
        feats: [watchfulFeat],
        conditions: [
          {
            name: 'Prone',
            source: 'PHB',
            entries: ['A prone creature has limited movement.'],
          },
        ],
      }),
    })

    render(
      <RulesPreviewManager>
        <FeatSelectionModal
          open
          onOpenChange={vi.fn()}
          feats={[watchfulFeat]}
          maxSelections={1}
          characterSnapshot={makePrereqCharacterSnapshotFixture()}
          onConfirm={vi.fn()}
        />
      </RulesPreviewManager>,
    )

    expect(
      await screen.findByText('Always on the lookout for danger, you gain the following benefits:'),
    ).toBeTruthy()
    expect(screen.getByText(/You have advantage while resisting/)).toBeTruthy()
    expect(screen.getByText(/proficiency bonus to initiative rolls/)).toBeTruthy()
    expect(document.querySelector('.line-clamp-5')).toBeTruthy()

    const proneTrigger = screen.getByRole('button', { name: 'Prone' })
    fireEvent.mouseMove(proneTrigger)
    const preview = screen.getByRole('dialog', { name: 'Prone preview' })
    expect(preview.className).toContain('pointer-events-auto')

    const descriptionWrapper = proneTrigger.closest('.line-clamp-5')?.parentElement
    expect(descriptionWrapper).toBeTruthy()
    fireEvent.mouseLeave(descriptionWrapper as HTMLElement, { relatedTarget: preview })
    fireEvent.mouseEnter(preview)

    await new Promise((resolve) => setTimeout(resolve, 250))
    expect(screen.getByRole('dialog', { name: 'Prone preview' })).toBeTruthy()
  })
})
