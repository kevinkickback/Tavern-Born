import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import type { ClassFeatureDisplay } from '@/pages/build/class/components/DetailsPanel'
import { BuildClassPassiveFeatureList } from '@/pages/build/class/components/PassiveFeatureList'

afterEach(cleanup)
test('same-name earned upgrades highlight only their complete selected declaration', () => {
  const features: ClassFeatureDisplay[] = [6, 10].map((level) => ({
    name: 'Deft Explorer Improvement',
    source: 'TCE',
    entries: ['Upgrade ' + level],
    origin: {
      kind: 'declared',
      owner: ['class', 'ranger', 'phb'],
      target: `class-feature|deft explorer improvement|ranger|phb|${level}|tce`,
      earnedLevel: level,
    },
  }))
  render(
    <BuildClassPassiveFeatureList
      passiveFeatures={features}
      selectedFeature={{ ...features[0], entries: features[0].entries! }}
      detailCollapsed={false}
      onSelectFeature={vi.fn()}
      onExpandDetails={vi.fn()}
    />,
  )
  const buttons = screen.getAllByRole('button', { name: 'Deft Explorer Improvement' })
  expect(buttons.map((button) => button.getAttribute('aria-pressed'))).toEqual(['true', 'false'])
})
