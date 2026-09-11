import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { INITIAL_CHARACTER_DATA } from '@/components/character/wizard/constants'
import { RulesStep } from '@/components/character/wizard/steps/2-RulesStep'
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
        raceResolution={{
          parentRace: undefined,
          subraceData: undefined,
          mergedRace: undefined,
          subraceIsNested: false,
        }}
        sources={[]}
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

describe('RulesStep average hit-points toggle', () => {
  afterEach(() => {
    cleanup()
  })

  test('is enabled by default and can be switched off', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<RulesStep data={INITIAL_CHARACTER_DATA} onChange={onChange} sources={[]} />)

    const averageHitPoints = screen.getByRole('switch', { name: 'Average Hit Points' })
    expect((averageHitPoints as HTMLButtonElement).getAttribute('data-state')).toBe('checked')

    await user.click(averageHitPoints)
    expect(onChange).toHaveBeenCalledWith({
      variantRules: expect.objectContaining({ averageHitPoints: false }),
    })
  })
})
