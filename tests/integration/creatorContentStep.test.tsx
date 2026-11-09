import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { INITIAL_CHARACTER_DATA } from '@/components/character/wizard/constants'
import { ContentStep } from '@/components/character/wizard/steps/ContentStep'
import type { CharacterWizardData } from '@/components/character/wizard/types'
import { validateStep } from '@/components/character/wizard/validation'
import { buildSourcesList } from '@/lib/5etools/parsers/basic'
import type { SourceBook } from '@/types/5etools'

const sources: SourceBook[] = [
  { name: "Player's Handbook", abbreviation: 'PHB', group: 'core' },
  { name: "Xanathar's Guide to Everything", abbreviation: 'XGE', group: 'supplement' },
  { name: "Tasha's Cauldron of Everything", abbreviation: 'TCE', group: 'supplement' },
  { name: 'Campaign Atlas', abbreviation: 'ATLAS', group: 'setting' },
  { name: 'Revised Player Handbook', abbreviation: 'XPHB', group: 'core' },
  { name: 'Revised Dungeon Master Guide', abbreviation: 'XDMG', group: 'core' },
  { name: 'Provenance only', abbreviation: 'PROV', group: 'other', hasCharacterOptions: false },
]
afterEach(cleanup)

test('source search is a view filter and hidden selections, presets and None use the full catalog', async () => {
  const user = userEvent.setup()
  function Harness() {
    const [data, setData] = useState<CharacterWizardData>({
      ...INITIAL_CHARACTER_DATA,
      originSystem: '2014' as const,
      allowedSources: ['XGE'],
    })
    return (
      <>
        <ContentStep
          data={data}
          sources={sources}
          onChange={(updates) =>
            setData((previous) => ({ ...previous, ...updates, originSystem: '2014' }))
          }
        />
        <output aria-label="Selected sources">{data.allowedSources.join(',')}</output>
      </>
    )
  }
  render(<Harness />)
  const search = screen.getByRole('textbox', { name: 'Search sources' })
  expect(screen.queryByRole('button', { name: /Provenance only/ })).toBeNull()
  expect(
    screen.getByRole<HTMLButtonElement>('button', { name: /Revised Dungeon Master Guide/ })
      .disabled,
  ).toBe(true)
  const coreGroup = screen.getByRole('heading', { name: 'Core Rulebooks' }).parentElement!
  const included = within(coreGroup).getByRole<HTMLButtonElement>('button', {
    name: /PHB Required/,
  })
  const incompatible = within(coreGroup).getByRole<HTMLButtonElement>('button', {
    name: /XPHB Requires the 2024 ruleset/,
  })
  expect(included.disabled).toBe(true)
  expect(incompatible.disabled).toBe(true)
  expect(included.getAttribute('aria-pressed')).toBe('true')
  await user.click(included)
  await user.click(incompatible)
  expect(screen.getByLabelText('Selected sources').textContent).toBe('XGE')
  await user.type(search, '  aTlAs ')
  expect(screen.queryByRole('button', { name: /Xanathar/ })).toBeNull()
  expect(screen.getByLabelText('Selected sources').textContent).toBe('XGE')
  await user.click(screen.getByRole('button', { name: /Campaign Atlas/ }))
  expect(screen.getByLabelText('Selected sources').textContent).toBe('XGE,ATLAS')
  await user.clear(search)
  await user.type(search, 'missing')
  expect(screen.getByText('No sources match your search.').getAttribute('role')).toBe('status')
  await user.click(screen.getByRole('button', { name: 'Recommended' }))
  expect(screen.getByLabelText('Selected sources').textContent).toBe('XGE,TCE')
  await user.click(screen.getByRole('button', { name: 'Clear' }))
  expect(screen.getByRole('button', { name: /Xanathar/ }).getAttribute('aria-pressed')).toBe('true')
  await user.type(search, 'tasha')
  await user.click(screen.getByRole('button', { name: 'None' }))
  expect(screen.getByLabelText('Selected sources').textContent).toBe('')
})

test('search is local to Additional Content and survives catalog refresh without editing the draft', async () => {
  const user = userEvent.setup()
  const onChange = vi.fn()
  const data = { ...INITIAL_CHARACTER_DATA, originSystem: '2024' as const }
  const { rerender } = render(<ContentStep data={data} sources={sources} onChange={onChange} />)
  expect(screen.getByRole<HTMLButtonElement>('button', { name: /XPHB Required/ }).disabled).toBe(
    true,
  )
  expect(
    screen.getByRole<HTMLButtonElement>('button', {
      name: /PHB Replaced by the revised core rulebook/,
    }).disabled,
  ).toBe(true)
  await user.type(screen.getByRole('textbox', { name: 'Search sources' }), 'missing')
  expect(onChange).not.toHaveBeenCalled()
  expect(screen.queryByRole('switch')).toBeNull()
  rerender(
    <ContentStep
      data={data}
      sources={sources.filter((source) => source.abbreviation === 'XPHB')}
      onChange={onChange}
    />,
  )
  expect(screen.queryByRole('textbox', { name: 'Search sources' })).toBeNull()
  expect(screen.getByRole('button', { name: /XPHB Required/ })).toBeTruthy()
  expect(
    screen.getByRole('button', { name: /PHB.*Replaced by the revised core rulebook/ }),
  ).toBeTruthy()
  rerender(
    <ContentStep
      data={data}
      sources={[...sources, { name: 'Restored book', abbreviation: 'RESTORE', group: 'other' }]}
      onChange={onChange}
    />,
  )
  expect(onChange).not.toHaveBeenCalled()
  expect(screen.queryByRole('button', { name: /Restored book/ })).toBeNull()
  await user.click(screen.getByRole('button', { name: 'Clear' }))
  expect(screen.getByRole('button', { name: /Restored book/ })).toBeTruthy()
})

test('core-only catalogs explain that no additional sources are available without changing the draft', () => {
  const onChange = vi.fn()
  const core = buildSourcesList(['PHB'], {
    book: [{ id: 'PHB', name: 'Player Handbook', group: 'core' }],
  })
  render(
    <ContentStep
      data={{ ...INITIAL_CHARACTER_DATA, originSystem: '2014' }}
      sources={core}
      onChange={onChange}
    />,
  )
  expect(screen.getByRole<HTMLButtonElement>('button', { name: /PHB Required/ }).disabled).toBe(
    true,
  )
  expect(
    screen.getByRole<HTMLButtonElement>('button', { name: /XPHB.*Requires the 2024 ruleset/ })
      .disabled,
  ).toBe(true)
  expect(screen.getByText(/No additional content is available/)).toBeTruthy()
  expect(screen.queryByRole('textbox', { name: 'Search sources' })).toBeNull()
  expect(onChange).not.toHaveBeenCalled()
})

test('supported organized play and explicitly selectable unfamiliar groups remain searchable and selectable', async () => {
  const user = userEvent.setup(),
    onChange = vi.fn()
  const organized = buildSourcesList(['ALCurseOfStrahd'], { book: [] })
  expect(organized[0]).toMatchObject({
    abbreviation: 'ALCURSEOFSTRAHD',
    group: 'organized-play',
    hasCharacterOptions: true,
  })
  render(
    <ContentStep
      data={{ ...INITIAL_CHARACTER_DATA, originSystem: '2014' }}
      sources={[
        ...organized,
        {
          name: 'Campaign Almanac',
          abbreviation: 'CAMPAIGN',
          group: 'campaign',
          hasCharacterOptions: true,
        },
      ]}
      onChange={onChange}
    />,
  )
  expect(screen.getByRole('heading', { name: 'Organized Play' })).toBeTruthy()
  const search = screen.getByRole('textbox', { name: 'Search sources' })
  await user.type(search, 'alcurseofstrahd')
  await user.click(screen.getByRole('button', { name: /AL: Curse of Strahd/ }))
  expect(onChange).toHaveBeenLastCalledWith({ allowedSources: ['ALCURSEOFSTRAHD'] })
  await user.clear(search)
  await user.type(search, 'campaign')
  expect(screen.getByRole('heading', { name: 'campaign' })).toBeTruthy()
  await user.click(screen.getByRole('button', { name: /Campaign Almanac/ }))
  expect(onChange).toHaveBeenLastCalledWith({ allowedSources: ['CAMPAIGN'] })
})

test('semantic validation gates the owning step and permits explicit empty Content', () => {
  const data = { ...INITIAL_CHARACTER_DATA, originSystem: '2014' as const }
  const pools = { races: [{ name: 'Human', source: 'PHB' }], classes: [{}], backgrounds: [{}] }
  expect(validateStep('basics', data, pools).error).toBe('Character name is required')
  expect(validateStep('rules', { ...data, allowedSources: [''] }, pools).valid).toBe(true)
  expect(validateStep('content', { ...data, allowedSources: [] }, pools).valid).toBe(true)
  expect(validateStep('content', { ...data, allowedSources: [''] }, pools).valid).toBe(false)
  for (const id of ['race', 'class', 'background'] as const) {
    expect(validateStep(id, data, pools).error).toBe(`Please select a ${id}`)
    expect(validateStep(id, data, { races: [], classes: [], backgrounds: [] }).error).toMatch(
      /No .* available/,
    )
  }
  expect(validateStep('review', data, pools).valid).toBe(true)
})
