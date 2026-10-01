import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import { useRetainedCharacterDetails } from '@/hooks/data/useGameData'
import { useGameDataStore } from '@/store/gameDataStore'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { makeGameDataFixture } from '../fixtures/gameDataFixtures'

afterEach(cleanup)

test.each([
  false,
  true,
])('uses the character reprint preference (%s) for retained choices', (preferNewerPrintings) => {
  const data = makeGameDataFixture({
    feats: [
      {
        name: 'Shared Feat',
        source: 'OLD',
        reprintedAs: ['Shared Feat|NEW'],
        entries: ['old details'],
      },
      { name: 'Shared Feat', source: 'NEW', entries: ['new details'] },
    ],
  })
  useGameDataStore.setState({ gameData: data })
  const character = makeCharacterFixture({
    allowedSources: ['OLD', 'NEW'],
    variantRules: { preferNewerPrintings },
    classChoiceSelections: [
      {
        choiceId: 'feat-choice',
        label: 'Feat Choice',
        kind: 'feat',
        className: 'Wizard',
        classSource: 'PHB',
        classLevel: 3,
        selected: [{ entityType: 'feat', name: 'Shared Feat', source: 'OLD', slotLevel: 3 }],
      },
    ],
  })
  const { result } = renderHook(() => useRetainedCharacterDetails(character))
  expect(result.current.choiceDetailsById.get('feat-choice')).toEqual([
    {
      availability: preferNewerPrintings ? 'source-unavailable' : 'available',
      entries: ['old details'],
    },
  ])
})
