import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { INITIAL_CHARACTER_DATA } from '@/components/character/wizard/constants'
import { ClassStep } from '@/components/character/wizard/steps/4-ClassStep'
import type { Class5e } from '@/types/5etools'

vi.mock('@/components/character/TraitTooltip', () => ({
  TraitTooltip: ({ children }: { children: React.ReactNode }) => children,
}))

describe('ClassStep', () => {
  afterEach(() => {
    cleanup()
  })

  test('shows required class details for selected class', () => {
    const classes: Class5e[] = [
      {
        name: 'Wizard',
        source: 'PHB',
        hd: { faces: 6 },
        proficiency: ['intelligence', 'wisdom'],
        spellcastingAbility: 'intelligence',
        entries: ['Short generic class text.'],
        fluffEntries: [
          'Wizards are supreme magic-users, defined and united as a class by the spells they cast. Drawing on the subtle weave of magic that permeates the cosmos, wizards cast spells of explosive fire, arcing lightning, subtle deception, and brute-force mind control. Their magic conjures monsters from other planes of existence, glimpses the future, or turns slain foes into zombies. Their mightiest spells change one substance into another, call meteors down from the sky, or open portals to other worlds.',
        ],
        classFeatureRefs: [
          {
            ref: 'Spellcasting|Wizard|PHB|1',
            name: 'Spellcasting',
            source: 'PHB',
            className: 'Wizard',
            classSource: 'PHB',
            level: 1,
            feature: {
              name: 'Spellcasting',
              source: 'PHB',
              entries: ['You have learned to cast spells through study.'],
            },
          },
        ],
        startingProficiencies: {
          armor: ['None'],
          weapons: ['Daggers', 'Quarterstaffs'],
          tools: ["Calligrapher's supplies"],
        },
      } as Class5e,
    ]

    const { getByText } = render(
      <ClassStep
        data={{
          ...INITIAL_CHARACTER_DATA,
          class: 'Wizard',
          classSource: 'PHB',
        }}
        onChange={vi.fn()}
        classes={classes}
      />,
    )

    expect(getByText('Hit Dice')).toBeTruthy()
    expect(getByText('Armor Proficiencies')).toBeTruthy()
    expect(getByText('Weapon Proficiencies')).toBeTruthy()
    expect(getByText('Tool Proficiencies')).toBeTruthy()
    expect(getByText('Saving Throws')).toBeTruthy()
    expect(getByText('Spellcasting Stat')).toBeTruthy()
    expect(getByText('d6')).toBeTruthy()
    expect(getByText('Intelligence, Wisdom')).toBeTruthy()
    expect(getByText(/supreme magic-users/i)).toBeTruthy()
    expect(getByText('Spellcasting')).toBeTruthy()
  })

  test('selecting a class updates class and source', () => {
    const onChange = vi.fn()
    const classes: Class5e[] = [
      { name: 'Wizard', source: 'PHB' } as Class5e,
      { name: 'Fighter', source: 'PHB' } as Class5e,
    ]

    const { getByRole } = render(
      <ClassStep
        data={{
          ...INITIAL_CHARACTER_DATA,
          class: '',
          classSource: '',
        }}
        onChange={onChange}
        classes={classes}
      />,
    )

    fireEvent.click(getByRole('button', { name: /wizard/i }))

    expect(onChange).toHaveBeenCalledWith({
      class: 'Wizard',
      classSource: 'PHB',
    })
  })

  test('suppresses older class reprints when preferNewerPrintings is enabled', () => {
    const classes: Class5e[] = [
      {
        name: 'Fighter',
        source: 'MPMM',
        reprintedAs: ['Fighter|XPHB'],
      } as Class5e,
      {
        name: 'Fighter',
        source: 'XPHB',
      } as Class5e,
    ]

    const { getAllByText, queryByText } = render(
      <ClassStep
        data={{
          ...INITIAL_CHARACTER_DATA,
          class: 'Fighter',
          classSource: 'XPHB',
          allowedSources: ['XPHB', 'MPMM'],
          variantRules: {
            ...INITIAL_CHARACTER_DATA.variantRules,
            preferNewerPrintings: true,
          },
        }}
        onChange={vi.fn()}
        classes={classes}
      />,
    )

    expect(getAllByText('Fighter').length).toBeGreaterThan(0)
    expect(queryByText('MPMM')).toBeNull()
  })
})
