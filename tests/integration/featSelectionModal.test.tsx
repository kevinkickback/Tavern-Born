import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { RulesPreviewManager } from '@/components/editor/RulesPreviewManager'
import { FeatSelectionModal } from '@/components/modals/FeatSelectionModal'
import { FeatDetailCard, FeatDetailsInspector } from '@/pages/feats/components/FeatCards'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Feat5e } from '@/types/5etools'
import { makePrereqCharacterSnapshotFixture } from '../fixtures/characterFixtures'
import { makeGameDataFixture } from '../fixtures/gameDataFixtures'
import { defensiveDuelistPrerequisite } from '../fixtures/prerequisiteFixtures'

const selectionModalCapture = vi.hoisted(() => ({ props: undefined as unknown }))

vi.mock('@/components/modals/SelectionModal', () => ({
  SelectionModal: (props: {
    items: Feat5e[]
    renderCard: (item: Feat5e, selected: boolean, canSelect: boolean) => ReactNode
  }) => {
    selectionModalCapture.props = props
    return <div>{props.items[0] ? props.renderCard(props.items[0], false, true) : null}</div>
  },
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

  test('filters real ability maps correctly and exposes manual review for unknown conditions', () => {
    const unknown: Feat5e = {
      name: 'Unverified Fixture',
      source: 'TEST',
      prerequisite: [{ feat: ['Other|TEST'] }],
    }
    render(
      <FeatSelectionModal
        open
        onOpenChange={vi.fn()}
        feats={[unknown, defensiveDuelistPrerequisite]}
        maxSelections={1}
        characterSnapshot={makePrereqCharacterSnapshotFixture({ abilityScores: { dexterity: 20 } })}
        onConfirm={vi.fn()}
      />,
    )
    const props = selectionModalCapture.props as {
      matchItem: (item: Feat5e, search: string, filters: Record<string, Set<string>>) => boolean
      filterSections: Array<{ options: Array<{ label: string }> }>
    }
    expect(props.matchItem(defensiveDuelistPrerequisite, '', {})).toBe(true)
    expect(props.matchItem(unknown, '', {})).toBe(false)
    expect(props.matchItem(unknown, '', { prereq: new Set(['showUnmet']) })).toBe(true)
    expect(props.filterSections[0].options[0].label).toContain('unverified')
    expect(screen.getByText('Requires manual review: feat')).toBeTruthy()
  })

  test('distinguishes manual review from unmet prerequisites in saved feat details', () => {
    const featData: Feat5e = {
      name: 'Unverified Fixture',
      source: 'TEST',
      prerequisite: [{ campaign: ['Unknown'] }],
    }
    const characterSnapshot = makePrereqCharacterSnapshotFixture()
    const { rerender } = render(
      <FeatDetailsInspector
        featName={featData.name}
        featData={featData}
        characterSnapshot={characterSnapshot}
      />,
    )
    expect(screen.getByText('Prerequisites need review')).toBeTruthy()
    expect(screen.getByText('Requires manual review: campaign')).toBeTruthy()
    rerender(
      <FeatDetailsInspector
        featName="Defensive Duelist"
        featData={defensiveDuelistPrerequisite}
        characterSnapshot={{ ...characterSnapshot, abilityScores: { dexterity: 8 } }}
      />,
    )
    expect(screen.getByText('Prerequisites unmet')).toBeTruthy()
    rerender(
      <FeatDetailCard
        feat={{ id: 'fixture', name: featData.name, source: featData.source }}
        featData={featData}
        characterSnapshot={characterSnapshot}
      />,
    )
    expect(screen.getByText('Prereqs need review')).toBeTruthy()
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
