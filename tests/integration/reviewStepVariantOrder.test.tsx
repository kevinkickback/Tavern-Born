import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'
import { INITIAL_CHARACTER_DATA } from '@/components/character/wizard/constants'
import { ReviewStep } from '@/components/character/wizard/steps/7-ReviewStep'

describe('ReviewStep variant rule ordering', () => {
  afterEach(() => {
    cleanup()
  })

  test('renders variant rules in the same order as the Rules step', () => {
    render(
      <ReviewStep
        data={{
          ...INITIAL_CHARACTER_DATA,
          name: 'Aelar',
          race: 'Human',
          class: 'Wizard',
          background: 'Sage',
        }}
      />,
    )

    const optionalClassFeatures = screen.getByText('Optional Class Features')
    const bladesingerAnyRace = screen.getByText('Bladesinger Any Race')
    const battleragerAnyRace = screen.getByText('Battlerager Any Race')
    const averageHitPoints = screen.getByText('Average Hit Points')
    const preferNewerPrintings = screen.getByText('Prefer Newer Printings')

    expect(
      optionalClassFeatures.compareDocumentPosition(bladesingerAnyRace) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      bladesingerAnyRace.compareDocumentPosition(battleragerAnyRace) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      battleragerAnyRace.compareDocumentPosition(averageHitPoints) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      averageHitPoints.compareDocumentPosition(preferNewerPrintings) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })
})
