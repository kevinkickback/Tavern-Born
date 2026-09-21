import { cleanup, render, screen, within } from '@testing-library/react'
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

  test('disables content-specific rules whose records are unavailable', () => {
    render(
      <RulesStep
        data={{
          ...INITIAL_CHARACTER_DATA,
          variantRules: { ...INITIAL_CHARACTER_DATA.variantRules, preferNewerPrintings: false },
        }}
        onChange={vi.fn()}
        sources={[]}
      />,
    )

    expect(
      (screen.getByRole('switch', { name: 'Optional Class Features' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
    expect(
      (screen.getByRole('switch', { name: 'Bladesinger Any Race' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(
      (screen.getByRole('switch', { name: 'Battlerager Any Race' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(
      (screen.getByRole('switch', { name: 'Prefer Newer Printings' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
    expect(screen.getAllByText('Unavailable with selected content')).toHaveLength(4)
  })

  test('enables a content-specific rule when its matching record is available', () => {
    render(
      <RulesStep
        data={INITIAL_CHARACTER_DATA}
        onChange={vi.fn()}
        sources={[]}
        contentAvailability={{
          optionalClassFeatures: true,
          bladesingerAnyRace: true,
          battleragerAnyRace: false,
          preferNewerPrintings: true,
        }}
      />,
    )

    expect(
      (screen.getByRole('switch', { name: 'Optional Class Features' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false)
    expect(
      (screen.getByRole('switch', { name: 'Bladesinger Any Race' }) as HTMLButtonElement).disabled,
    ).toBe(false)
    expect(
      (screen.getByRole('switch', { name: 'Battlerager Any Race' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(
      (screen.getByRole('switch', { name: 'Prefer Newer Printings' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false)
  })

  test('explains that newer printings are always preferred for 2024 characters', () => {
    render(
      <RulesStep
        data={{ ...INITIAL_CHARACTER_DATA, originSystem: '2024' }}
        onChange={vi.fn()}
        sources={[]}
      />,
    )

    const preferNewerPrintings = screen.getByRole('switch', {
      name: 'Prefer Newer Printings',
    }) as HTMLButtonElement
    expect(preferNewerPrintings.disabled).toBe(true)
    expect(preferNewerPrintings.getAttribute('data-state')).toBe('checked')
    expect(screen.getByText('Always on for 2024 characters')).toBeTruthy()
  })

  test('allows a saved unavailable rule to be switched off', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <RulesStep
        data={{
          ...INITIAL_CHARACTER_DATA,
          variantRules: {
            ...INITIAL_CHARACTER_DATA.variantRules,
            bladesingerAnyRace: true,
            preferNewerPrintings: false,
          },
        }}
        onChange={onChange}
        sources={[]}
      />,
    )

    const bladesingerRule = screen.getByRole('switch', { name: 'Bladesinger Any Race' })
    expect((bladesingerRule as HTMLButtonElement).disabled).toBe(false)
    expect(screen.getByText('Currently inactive')).toBeTruthy()

    await user.click(bladesingerRule)

    expect(onChange).toHaveBeenCalledWith({
      variantRules: expect.objectContaining({ bladesingerAnyRace: false }),
    })
  })

  test('marks a saved unavailable rule inactive during review', () => {
    render(
      <ReviewStep
        data={{
          ...INITIAL_CHARACTER_DATA,
          variantRules: { ...INITIAL_CHARACTER_DATA.variantRules, bladesingerAnyRace: true },
        }}
        raceResolution={{
          parentRace: undefined,
          subraceData: undefined,
          mergedRace: undefined,
          subraceIsNested: false,
        }}
        sources={[]}
        variantRuleAvailability={{
          optionalClassFeatures: false,
          bladesingerAnyRace: false,
          battleragerAnyRace: false,
          preferNewerPrintings: false,
        }}
      />,
    )

    const bladesingerRow = screen.getByText('Bladesinger Any Race').parentElement
    expect(bladesingerRow).not.toBeNull()
    expect(within(bladesingerRow as HTMLElement).getByText('Inactive')).toBeTruthy()
  })

  test('normalizes core sources when the ruleset changes', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <RulesStep
        data={{
          ...INITIAL_CHARACTER_DATA,
          originSystem: '2014',
          allowedSources: ['DMG', 'XDMG'],
        }}
        onChange={onChange}
        sources={[
          { abbreviation: 'DMG', name: "Dungeon Master's Guide (2014)", group: 'core' },
          { abbreviation: 'XDMG', name: "Dungeon Master's Guide (2024)", group: 'core' },
        ]}
      />,
    )

    await user.click(screen.getByRole('button', { name: /5\.5e Revised/ }))

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        originSystem: '2024',
        allowedSources: ['XDMG'],
        variantRules: expect.objectContaining({ preferNewerPrintings: true }),
      }),
    )
  })

  test('does not offer provenance-only bundled sources', () => {
    render(
      <RulesStep
        data={INITIAL_CHARACTER_DATA}
        onChange={vi.fn()}
        sources={[
          { abbreviation: 'PHB', name: "Player's Handbook", group: 'core' },
          {
            abbreviation: 'DMG',
            name: "Dungeon Master's Guide",
            group: 'core',
            hasCharacterOptions: false,
          },
          {
            abbreviation: 'MM',
            name: 'Monster Manual',
            group: 'core',
            hasCharacterOptions: false,
          },
        ]}
      />,
    )

    expect(screen.queryByRole('button', { name: /Dungeon Master's Guide/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Monster Manual/ })).toBeNull()
  })

  test('explains how to load more sources when using the bundled SRD', () => {
    const { container } = render(
      <RulesStep
        data={{ ...INITIAL_CHARACTER_DATA, allowedSources: ['PHB'] }}
        onChange={vi.fn()}
        sources={[{ abbreviation: 'PHB', name: "Player's Handbook", group: 'core' }]}
        isBundledSrd
      />,
    )

    expect(screen.getByText('Using the included SRD')).toBeTruthy()
    expect(screen.getByText(/open Settings → Game Data/)).toBeTruthy()
    expect(screen.getByText(/add compatible 5etools data/)).toBeTruthy()
    expect(screen.getByText('Using the included SRD').parentElement?.className).not.toContain(
      'border',
    )
    expect(container.querySelector('[data-allowed-sources-count]')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Recommended' })).toBeNull()
  })
})
