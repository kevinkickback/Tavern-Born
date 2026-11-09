import { readFileSync } from 'node:fs'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { INITIAL_CHARACTER_DATA } from '@/components/character/wizard/constants'
import { RaceStep } from '@/components/character/wizard/steps/3-RaceStep'
import { validateStep } from '@/components/character/wizard/validation'
import { parseRaces } from '@/lib/5etools/parsers/races'
import { buildRecursiveLookup } from '@/lib/renderer/recursiveTooltip'
import type { Race5e } from '@/types/5etools'

describe('RaceStep', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  test('shortens complete lineage labels while selection values and opening stay unchanged', () => {
    const child = { name: 'Dragonborn (Draconblood; Brass)', source: 'EGW' } as Race5e
    const parent = {
      name: 'Dragonborn',
      source: 'TEST',
      subraces: [
        { name: 'Dragonborn (Zinc)', source: 'PHB' },
        child,
        { name: child.name, source: 'DMG' },
        { name: 'Forest', source: 'PHB' },
      ],
    } as Race5e
    const onChange = vi.fn()
    const { getByRole, getAllByRole } = render(
      <RaceStep
        recursiveLookup={buildRecursiveLookup({})}
        data={{
          ...INITIAL_CHARACTER_DATA,
          race: parent.name,
          raceSource: parent.source,
          subrace: child.name,
          subraceSource: child.source,
        }}
        onChange={onChange}
        races={[parent]}
      />,
    )
    expect(getByRole('heading', { name: /Dragonborn\s*\(Draconblood: Brass\)/ })).toBeTruthy()
    expect(getByRole('button', { name: 'Draconblood: Brass · EGW' })).toBeTruthy()
    expect(
      getAllByRole('button', { name: /^(Forest|Draconblood: Brass|Zinc)/ }).map(
        (button) => button.textContent,
      ),
    ).toEqual(['Draconblood: Brass · DMG', 'Draconblood: Brass · EGW', 'Forest', 'Zinc'])
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.click(getByRole('button', { name: 'Draconblood: Brass · DMG' }))
    expect(onChange).toHaveBeenCalledWith({
      subrace: child.name,
      subraceSource: 'DMG',
      raceAsiChoices: [],
    })
  })

  test('defaults to a source-backed ancestry for the 2014 Dragonborn and keeps later choices', () => {
    const races = parseRaces(
      JSON.parse(readFileSync('resources/srd/data/races.json', 'utf-8')),
    ) as Race5e[]
    const dragonborn = races.find(({ name, source }) => name === 'Dragonborn' && source === 'PHB')!
    const data = { ...INITIAL_CHARACTER_DATA, race: dragonborn.name, raceSource: dragonborn.source }
    const onChange = vi.fn()
    const step = (draft: typeof data, parent = dragonborn) => (
      <RaceStep
        recursiveLookup={buildRecursiveLookup({})}
        data={draft}
        onChange={onChange}
        races={[parent]}
      />
    )
    const { getByRole, getByText, queryByRole, rerender } = render(step(data))
    expect(getByText('Draconic Ancestry', { selector: 'span' })).toBeTruthy()
    expect(queryByRole('button', { name: 'Default' })).toBeNull()
    const firstAncestry = { subrace: 'Dragonborn (Black)', subraceSource: 'PHB' }
    expect(onChange).toHaveBeenLastCalledWith(firstAncestry)
    const pools = { races: [dragonborn], classes: [], backgrounds: [] }
    expect(validateStep('race', data, pools)).toMatchObject({ valid: false })
    expect(validateStep('review', data, pools)).toMatchObject({ valid: false })
    expect(validateStep('race', { ...data, ...firstAncestry }, pools).valid).toBe(true)

    fireEvent.click(getByRole('button', { name: 'Green' }))
    const chosen = { subrace: 'Dragonborn (Green)', subraceSource: 'PHB' }
    expect(onChange).toHaveBeenLastCalledWith({ ...chosen, raceAsiChoices: [] })
    expect(validateStep('race', { ...data, ...chosen }, pools).valid).toBe(true)
    expect(validateStep('review', { ...data, ...chosen, subraceSource: 'XPHB' }, pools).valid).toBe(
      false,
    )
    const chosenDraft = { ...data, ...chosen }
    const filtered = {
      ...dragonborn,
      subraces: dragonborn.subraces?.filter((ancestry) => ancestry.name !== chosen.subrace),
    }
    onChange.mockClear()
    rerender(step(chosenDraft, filtered))
    expect(onChange).not.toHaveBeenCalled()
    expect(validateStep('race', chosenDraft, { ...pools, races: [filtered] }).valid).toBe(false)
    rerender(step(chosenDraft))
    expect(getByRole('heading', { name: /Dragonborn\s*\(Green\)/ })).toBeTruthy()
    expect(validateStep('race', chosenDraft, pools).valid).toBe(true)
  })

  test('renders repeated trait names without duplicate React keys', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const trait = { type: 'entries', name: 'Keen Senses', entries: ['A benefit.'] }
    const { getAllByText, rerender } = render(
      <RaceStep
        recursiveLookup={buildRecursiveLookup({})}
        data={{ ...INITIAL_CHARACTER_DATA, race: 'Elf', raceSource: 'PHB' }}
        onChange={vi.fn()}
        races={[{ name: 'Elf', source: 'PHB', entries: [trait, trait] } as Race5e]}
      />,
    )
    expect(getAllByText('Keen Senses')).toHaveLength(2)
    rerender(
      <RaceStep
        recursiveLookup={buildRecursiveLookup({})}
        data={{ ...INITIAL_CHARACTER_DATA, race: 'Elf', raceSource: 'PHB' }}
        onChange={vi.fn()}
        races={[{ name: 'Elf', source: 'PHB', entries: [trait] } as Race5e]}
      />,
    )
    expect(getAllByText('Keen Senses')).toHaveLength(1)
    expect(consoleError).not.toHaveBeenCalled()
  })

  test('defaults to the first available subrace when none is selected', async () => {
    const onChange = vi.fn()
    const races: Race5e[] = [
      {
        name: 'Human',
        source: 'PHB',
        entries: ['Short generic race text.'],
        fluffEntries: [
          'Humans are diverse and ambitious, thriving in nearly every land and culture.',
        ],
        subraces: [
          { name: 'Default', source: 'PHB' } as Race5e,
          { name: 'Variant', source: 'PHB' } as Race5e,
        ],
      } as Race5e,
    ]

    render(
      <RaceStep
        recursiveLookup={buildRecursiveLookup({})}
        data={{
          ...INITIAL_CHARACTER_DATA,
          race: 'Human',
          raceSource: 'PHB',
        }}
        onChange={onChange}
        races={races}
      />,
    )

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith({
        subrace: 'Default',
        subraceSource: 'PHB',
      })
    })

    expect(document.body.textContent?.includes('diverse and ambitious')).toBe(true)
  })

  test('sorts the displayed races across sources and defaults to the first displayed race', async () => {
    const onChange = vi.fn()
    const races: Race5e[] = [
      { name: 'Elf', source: 'TCE' } as Race5e,
      { name: 'Dwarf', source: 'TCE' } as Race5e,
      { name: 'Elf', source: 'PHB' } as Race5e,
    ]

    const { getAllByRole, getByPlaceholderText } = render(
      <RaceStep
        recursiveLookup={buildRecursiveLookup({})}
        data={INITIAL_CHARACTER_DATA}
        onChange={onChange}
        races={races}
      />,
    )

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith({
        race: 'Dwarf',
        raceSource: 'TCE',
        subrace: '',
        subraceSource: '',
        raceAsiChoices: [],
        raceAsiBlockIndex: 0,
      })
    })
    const labels = () =>
      getAllByRole('button', { name: /^(Dwarf|Elf) (PHB|TCE)$/ }).map(
        (button) => button.textContent,
      )
    expect(labels()).toEqual(['DwarfTCE', 'ElfPHB', 'ElfTCE'])
    fireEvent.change(getByPlaceholderText('Search races...'), { target: { value: 'elf' } })
    expect(labels()).toEqual(['ElfPHB', 'ElfTCE'])
    expect(races.map(({ name, source }) => [name, source])).toEqual([
      ['Elf', 'TCE'],
      ['Dwarf', 'TCE'],
      ['Elf', 'PHB'],
    ])
  })

  test('keeps parent race traits visible when the default subrace is selected', () => {
    const races: Race5e[] = [
      {
        name: 'Human',
        source: 'PHB',
        entries: [
          {
            type: 'entries',
            name: 'Versatile',
            entries: ['Humans are broadly capable.'],
          },
        ],
        subraces: [{ name: 'Default', source: 'PHB' } as Race5e],
      } as Race5e,
    ]

    const { getByText } = render(
      <RaceStep
        recursiveLookup={buildRecursiveLookup({})}
        data={{
          ...INITIAL_CHARACTER_DATA,
          race: 'Human',
          raceSource: 'PHB',
          subrace: 'Default',
          subraceSource: 'PHB',
        }}
        onChange={vi.fn()}
        races={races}
      />,
    )

    expect(getByText('Versatile')).toBeTruthy()
  })

  test('describes the chosen flexible mode alongside ordinary child fixed bonuses', () => {
    const child = { name: 'Child', source: 'TEST', ability: [{ con: 1 }] } as Race5e
    const parent = { name: 'Parent', source: 'TEST', lineage: true, subraces: [child] } as Race5e
    const { getByText } = render(
      <RaceStep
        recursiveLookup={buildRecursiveLookup({})}
        data={{
          ...INITIAL_CHARACTER_DATA,
          originSystem: '2014',
          race: parent.name,
          raceSource: parent.source,
          subrace: child.name,
          subraceSource: child.source,
          raceAsiBlockIndex: 1,
        }}
        onChange={vi.fn()}
        races={[parent]}
      />,
    )
    expect(getByText('CON +1 · Choose 3 abilities (+1 each)')).toBeTruthy()
  })

  test('renders the filtered race collection supplied by the wizard controller', () => {
    const races: Race5e[] = [
      {
        name: 'Aasimar',
        source: 'XPHB',
      } as Race5e,
    ]

    const { getAllByText, queryByText } = render(
      <RaceStep
        recursiveLookup={buildRecursiveLookup({})}
        data={{
          ...INITIAL_CHARACTER_DATA,
          race: 'Aasimar',
          raceSource: 'XPHB',
        }}
        onChange={vi.fn()}
        races={races}
      />,
    )

    expect(getAllByText('Aasimar').length).toBeGreaterThan(0)
    expect(getAllByText('XPHB').length).toBeGreaterThan(0)
    expect(queryByText('MPMM')).toBeNull()
  })
})
