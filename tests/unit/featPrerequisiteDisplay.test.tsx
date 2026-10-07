import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test } from 'vitest'
import { FeatDetailCard, FeatDetailsInspector } from '@/pages/feats/components/FeatCards'
import type { Feat5e, Raw5ePrereq } from '@/types/5etools'

const feat = { name: 'Training', source: 'TEST' }
const characterSnapshot = { progression: [], abilityScores: { dexterity: 10 } }

function contents(featData: Feat5e | undefined) {
  return (
    <MemoryRouter>
      <FeatDetailCard
        feat={{ id: 'fixed-training', ...feat }}
        featData={featData}
        characterSnapshot={characterSnapshot}
        fixedGrant
      />
      <FeatDetailsInspector
        featName={feat.name}
        featData={featData}
        characterSnapshot={characterSnapshot}
      />
    </MemoryRouter>
  )
}

describe('feat prerequisite display', () => {
  afterEach(cleanup)

  test.each([
    { prerequisite: undefined, label: 'Prerequisites met' },
    { prerequisite: [{ ability: [{ dex: 13 }] }], label: 'Prerequisites unmet' },
    { prerequisite: [{ fixtureOnly: true }], label: 'Prerequisites need review' },
  ])('retains the evaluated result for available rules: $label', ({ prerequisite, label }) => {
    render(contents({ ...feat, prerequisite: prerequisite as Raw5ePrereq[] | undefined }))
    expect(screen.getByText(label)).toBeTruthy()
    expect(screen.queryByText('Feat data unavailable')).toBeNull()
  })

  test('clears prerequisite claims when rules disappear and reevaluates when restored', () => {
    const available = { ...feat, prerequisite: [{ ability: [{ dex: 13 }] }] }
    const { rerender } = render(contents(available))
    expect(screen.getByText('Prerequisites unmet')).toBeTruthy()

    rerender(contents(undefined))
    expect(screen.getAllByText('Feat data unavailable')).toHaveLength(2)
    expect(screen.queryByText('Prerequisites met')).toBeNull()
    expect(screen.queryByText('Prerequisites unmet')).toBeNull()
    expect(screen.queryByText('Prereqs unmet')).toBeNull()
    expect(screen.queryByText('Prerequisites need review')).toBeNull()

    rerender(contents(available))
    expect(screen.getByText('Prerequisites unmet')).toBeTruthy()
    expect(screen.queryByText('Feat data unavailable')).toBeNull()
  })
})
