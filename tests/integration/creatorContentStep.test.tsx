import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { INITIAL_CHARACTER_DATA } from '@/components/character/wizard/constants'
import { ContentStep } from '@/components/character/wizard/steps/ContentStep'
import type { CharacterWizardData } from '@/components/character/wizard/types'
import { validateStep } from '@/components/character/wizard/validation'
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
  expect(screen.queryByRole('button', { name: /Revised Player Handbook/ })).toBeNull()
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

test('search leaves content availability unchanged and preserves inactive intent and the 2024 lock', async () => {
  const user = userEvent.setup(),
    onChange = vi.fn()
  const data = {
    ...INITIAL_CHARACTER_DATA,
    originSystem: '2024' as const,
    variantRules: { ...INITIAL_CHARACTER_DATA.variantRules, anyRaceSubclasses: true },
  }
  const { rerender } = render(
    <ContentStep
      data={data}
      sources={sources}
      onChange={onChange}
      contentAvailability={{
        optionalClassFeatures: true,
        anyRaceSubclasses: false,
        preferNewerPrintings: false,
      }}
    />,
  )
  await user.type(screen.getByRole('textbox', { name: 'Search sources' }), 'missing')
  expect(onChange).not.toHaveBeenCalled()
  expect(
    screen.getByRole<HTMLButtonElement>('switch', { name: 'Allow Optional Class Features' })
      .disabled,
  ).toBe(false)
  expect(
    screen.getByRole<HTMLButtonElement>('switch', { name: 'Any-Race Subclasses' }).disabled,
  ).toBe(false)
  expect(screen.getByText('Currently inactive')).toBeTruthy()
  expect(
    screen.getByRole<HTMLButtonElement>('switch', { name: 'Prefer Newer Printings' }).disabled,
  ).toBe(true)
  expect(
    screen.getByRole('switch', { name: 'Prefer Newer Printings' }).getAttribute('data-state'),
  ).toBe('checked')
  rerender(
    <ContentStep
      data={data}
      sources={[...sources, { name: 'Restored book', abbreviation: 'RESTORE', group: 'other' }]}
      onChange={onChange}
    />,
  )
  expect(onChange).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Clear' }))
  expect(screen.getByRole('button', { name: /Restored book/ })).toBeTruthy()
})

test('semantic validation gates the owning step and permits explicit empty Content', () => {
  const data = { ...INITIAL_CHARACTER_DATA, originSystem: '2014' as const }
  const pools = { races: [{}], classes: [{}], backgrounds: [{}] }
  expect(validateStep('basics', data, pools).fields).toEqual(['name'])
  expect(validateStep('rules', { ...data, originSystem: '' }, pools).fields).toContain(
    'originSystem',
  )
  expect(validateStep('rules', { ...data, allowedSources: [''] }, pools).valid).toBe(true)
  expect(validateStep('content', { ...data, allowedSources: [] }, pools).valid).toBe(true)
  expect(validateStep('content', { ...data, allowedSources: [''] }, pools).fields).toEqual([
    'allowedSources',
  ])
  for (const id of ['race', 'class', 'background'] as const) {
    expect(validateStep(id, data, pools).fields).toEqual([id])
    expect(validateStep(id, data, { races: [], classes: [], backgrounds: [] }).error).toMatch(
      /No .* available/,
    )
  }
  expect(validateStep('review', data, pools).valid).toBe(true)
})
