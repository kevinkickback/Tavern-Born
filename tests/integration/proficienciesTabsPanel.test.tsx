import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest'
import type { ChoiceRecord, ProficiencyProvenance } from '@/lib/provenance/types'
import {
  BuildProficienciesTabsPanel,
  type ProficiencyTabValue,
} from '@/pages/build/proficiencies/components/TabsPanel'
import { buildToolChoiceSlots } from '@/pages/build/proficiencies/model/data'

beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false
  Element.prototype.setPointerCapture = () => undefined
  Element.prototype.releasePointerCapture = () => undefined
  Element.prototype.scrollIntoView = () => undefined
})

afterEach(() => {
  cleanup()
})

const emptyProficiencies: ProficiencyProvenance = {
  armor: {},
  weapons: {},
  tools: {},
  languages: {},
  skills: {},
  savingThrows: {},
}

const sourceTag = {
  sourceType: 'manual' as const,
  sourceName: 'Test choice',
  grantType: 'placeholder' as const,
  label: 'User Choice',
}

type PanelProps = ComponentProps<typeof BuildProficienciesTabsPanel>

function choice(
  domain: ChoiceRecord['domain'],
  optionPool: string[],
  selected: string[] = [],
): ChoiceRecord {
  return {
    id: `test:${domain}`,
    domain,
    sourceTag,
    chooseCount: 2,
    optionPool,
    selected,
    status: 'pending',
  }
}

function panelProps(
  activeTab: ProficiencyTabValue,
  overrides: Partial<PanelProps> = {},
): PanelProps {
  return {
    skills: [],
    savingThrows: [],
    availableArmor: [],
    availableWeapons: [],
    availableLanguages: [],
    currentProficiencies: { armor: [], weapons: [], tools: [], languages: [] },
    ledger: { choices: [], proficiencies: emptyProficiencies },
    toolChoiceSlots: [],
    visibleToolCandidates: [],
    languageTypes: new Map(),
    toolTypeMap: new Map(),
    weaponInfoMap: new Map(),
    onFocusChange: vi.fn(),
    onExpandDetails: vi.fn(),
    onResolveChoiceSelection: vi.fn(),
    onExpertiseAction: vi.fn(),
    expertiseActions: {},
    activeTab,
    ...overrides,
  }
}

function renderPanel(activeTab: ProficiencyTabValue, overrides: Partial<PanelProps> = {}) {
  const props = panelProps(activeTab, overrides)
  render(<BuildProficienciesTabsPanel {...props} />)
  return props
}

async function selectSort(label: string) {
  const user = userEvent.setup()
  await user.click(screen.getByRole('combobox'))
  await user.click(screen.getByRole('option', { name: label }))
}

describe('BuildProficienciesTabsPanel category panels', () => {
  test('the one-time hint follows owned circle actions without legacy slots and stays dismissed', async () => {
    localStorage.removeItem('tb:hint-dismissed:skills-expertise')
    const rect = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue(new DOMRect(30, 90, 100, 40))
    const props = panelProps('skills', {
      skills: [
        {
          name: 'stealth',
          ability: 'dexterity',
          proficient: true,
          expertise: false,
          modifierString: '+2',
        },
      ],
      expertiseActions: {
        stealth: [
          {
            id: 'class:add',
            ownerId: 'rogue',
            kind: 'class',
            adding: true,
            label: 'Use Expertise — Rogue (PHB), level 1',
          },
        ],
      },
      onExpertiseAction: vi.fn(),
    })
    const view = render(<BuildProficienciesTabsPanel {...props} />)
    expect(
      await screen.findByText('Click the circle beside a skill to add or remove Expertise.'),
    ).toBeTruthy()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Dismiss hint' }))
    view.unmount()
    render(<BuildProficienciesTabsPanel {...props} />)
    expect(
      screen.queryByText('Click the circle beside a skill to add or remove Expertise.'),
    ).toBeNull()
    rect.mockRestore()
    localStorage.removeItem('tb:hint-dismissed:skills-expertise')
  })

  test('mutes excluded unchosen skills only while a skill pool has capacity, preserving actions and other categories', () => {
    const skills = ['arcana', 'stealth', 'nature'].map((name) => ({
      name,
      ability: 'dexterity',
      proficient: false,
      expertise: false,
      modifierString: '+0',
    }))
    const first = choice('skills', ['Stealth'], [])
    first.chooseCount = 1
    const second = { ...choice('skills', ['Nature'], []), id: 'other:skills', chooseCount: 1 }
    const props = panelProps('skills', {
      skills,
      ledger: { choices: [first, second], proficiencies: emptyProficiencies },
    })
    const { rerender } = render(<BuildProficienciesTabsPanel {...props} />)
    const arcana = () => screen.getByRole('group', { name: 'Arcana proficiency' })
    expect(arcana().className).toContain('bg-muted/30')
    expect(arcana().querySelectorAll('svg')).toHaveLength(0)
    expect(
      screen.getByRole('button', { name: /Stealth.*DEX/i }).getAttribute('aria-disabled'),
    ).toBe('false')
    expect(screen.getByRole('button', { name: /Nature.*DEX/i }).getAttribute('aria-disabled')).toBe(
      'false',
    )
    rerender(
      <BuildProficienciesTabsPanel
        {...props}
        ledger={{
          choices: [
            { ...first, selected: ['Stealth'] },
            { ...second, selected: ['Nature'] },
          ],
          proficiencies: emptyProficiencies,
        }}
      />,
    )
    expect(arcana().className).not.toContain('bg-muted/30')
    rerender(
      <BuildProficienciesTabsPanel
        {...props}
        ledger={{ choices: [choice('languages', ['Elvish'])], proficiencies: emptyProficiencies }}
      />,
    )
    expect(arcana().className).not.toContain('bg-muted/30')
    rerender(
      <BuildProficienciesTabsPanel
        {...props}
        ledger={{ choices: [choice('skills', [])], proficiencies: emptyProficiencies }}
      />,
    )
    expect(arcana().className).not.toContain('bg-muted/30')
  })

  test('a filled circle requires explicit confirmation even for one additional source', async () => {
    const props = renderPanel('skills', {
      skills: [
        {
          name: 'stealth',
          ability: 'dexterity',
          proficient: true,
          expertise: true,
          modifierString: '+4',
        },
      ],
      expertiseActions: {
        stealth: [
          {
            id: 'feat:add:bonus',
            ownerId: 'bonus',
            kind: 'feat',
            adding: true,
            label: 'Use Skill Expert (TCE) — Bonus feat',
          },
        ],
      },
      onExpertiseAction: vi.fn(),
    })
    const user = userEvent.setup()
    const circle = screen.getByRole('button', { name: 'Choose expertise source: Stealth' })
    expect(circle.getAttribute('aria-pressed')).toBe('true')
    await user.click(circle)
    expect(props.onExpertiseAction).not.toHaveBeenCalled()
    expect(screen.getByText(/This skill already has Expertise/)).toBeTruthy()
    await user.keyboard('{Escape}')
    expect(props.onExpertiseAction).not.toHaveBeenCalled()
    await user.click(circle)
    await user.click(screen.getByRole('menuitem', { name: 'Use Skill Expert (TCE) — Bonus feat' }))
    expect(props.onExpertiseAction).toHaveBeenCalledExactlyOnceWith('stealth', 'feat:add:bonus')
  })

  test('preserves skill states, choice actions, and expertise actions', async () => {
    const props = renderPanel('skills', {
      skills: [
        {
          name: 'acrobatics',
          ability: 'dexterity',
          proficient: false,
          expertise: false,
          modifierString: '+2',
        },
        {
          name: 'arcana',
          ability: 'intelligence',
          proficient: true,
          expertise: false,
          modifierString: '+3',
        },
        {
          name: 'athletics',
          ability: 'strength',
          proficient: false,
          expertise: false,
          modifierString: '+1',
        },
        {
          name: 'stealth',
          ability: 'dexterity',
          proficient: false,
          expertise: false,
          modifierString: '+2',
        },
      ],
      ledger: {
        choices: [choice('skills', ['Acrobatics', 'Stealth'], ['Acrobatics'])],
        proficiencies: emptyProficiencies,
      },
      expertiseActions: {
        arcana: [
          {
            id: 'class:add:arcana',
            ownerId: 'test-owner',
            kind: 'class',
            adding: true,
            label: 'Add expertise: Arcana',
          },
        ],
      },
    })
    const user = userEvent.setup()

    expect(screen.getByText('Chosen')).toBeTruthy()
    expect(screen.getByText('Granted')).toBeTruthy()
    expect(screen.getByText('Available')).toBeTruthy()
    expect(screen.getByText('Unavailable')).toBeTruthy()

    await user.click(screen.getByTitle('Remove choice: Acrobatics'))
    expect(props.onResolveChoiceSelection).toHaveBeenCalledWith('skills', 'acrobatics', false)

    await user.click(screen.getByTitle('Add expertise: Arcana'))
    expect(props.onExpertiseAction).toHaveBeenCalledWith('arcana', 'class:add:arcana')
  })

  test('preserves saving-throw and armor state presentation', () => {
    const { unmount } = render(
      <BuildProficienciesTabsPanel
        {...panelProps('saving-throws')}
        savingThrows={[
          { ability: 'strength', proficient: true, modifierString: '+4' },
          { ability: 'dexterity', proficient: false, modifierString: '+1' },
        ]}
      />,
    )
    expect(
      within(screen.getByText('Strength').closest('button')!).getByText('Granted'),
    ).toBeTruthy()
    expect(
      within(screen.getByText('Dexterity').closest('button')!).getByText('Unavailable'),
    ).toBeTruthy()
    unmount()

    renderPanel('armor', {
      availableArmor: ['light', 'shields', 'heavy'],
      currentProficiencies: { armor: ['light'], weapons: [], tools: [], languages: [] },
      ledger: {
        choices: [choice('armor', ['shields', 'heavy'], ['shields'])],
        proficiencies: emptyProficiencies,
      },
    })
    expect(within(screen.getByText('Light').closest('button')!).getByText('Granted')).toBeTruthy()
    expect(within(screen.getByText('Shields').closest('button')!).getByText('Chosen')).toBeTruthy()
    expect(within(screen.getByText('Heavy').closest('button')!).getByText('Available')).toBeTruthy()
  })

  test('preserves weapon category grouping and proficiency ordering', async () => {
    renderPanel('weapons', {
      availableWeapons: ['Club', 'Longbow', 'Net'],
      currentProficiencies: { armor: [], weapons: ['Club'], tools: [], languages: [] },
      weaponInfoMap: new Map([
        ['club', { category: 'simple', ranged: false }],
        ['longbow', { category: 'martial', ranged: true }],
      ]),
    })

    await selectSort('By category')
    expect(screen.getByText('Simple Weapons')).toBeTruthy()
    expect(screen.getByText('Martial Weapons')).toBeTruthy()
    expect(screen.getByText('Other')).toBeTruthy()

    await selectSort('Proficient first')
    expect(screen.getByText('Proficient')).toBeTruthy()
    expect(screen.getByText('Not Proficient')).toBeTruthy()
  })

  test('chooses a concrete instrument from its row and prompts for overlapping owners', async () => {
    const enter = {
      ...choice('tools', ['musical instrument']),
      chooseCount: 1,
      sourceTag: {
        ...sourceTag,
        sourceType: 'background' as const,
        sourceName: 'Entertainer',
        sourceRef: 'XPHB',
      },
    }
    const warforged = {
      ...choice('tools', ['tool']),
      id: 'warforged-tools',
      chooseCount: 1,
      sourceTag: {
        ...sourceTag,
        sourceType: 'race' as const,
        sourceName: 'Warforged',
        sourceRef: 'EFA',
      },
    }
    const props = (choices: ChoiceRecord[]) =>
      panelProps('tools', {
        visibleToolCandidates: ['Lute', 'Disguise Kit'],
        ledger: { choices, proficiencies: emptyProficiencies },
        toolChoiceSlots: buildToolChoiceSlots({
          choices,
          selectedTools: [],
          toolSubtypeOptionsByKind: {
            "artisan's tools": [],
            'musical instrument': ['Lute'],
            'gaming set': [],
            tool: ['Lute', 'Disguise Kit'],
          },
        }),
      })
    const single = props([enter])
    const { rerender } = render(<BuildProficienciesTabsPanel {...single} />)
    const user = userEvent.setup()
    const lute = () => screen.getByTitle('Choose: Lute')
    expect(within(lute()).getByText('Available')).toBeTruthy()
    await user.click(lute())
    expect(single.onResolveChoiceSelection).toHaveBeenCalledWith('tools', 'Lute', true, enter.id)
    const overlap = props([enter, warforged])
    rerender(<BuildProficienciesTabsPanel {...overlap} />)
    await user.click(lute())
    expect(overlap.onResolveChoiceSelection).not.toHaveBeenCalled()
    await user.click(screen.getByRole('menuitem', { name: /Warforged.*EFA/ }))
    expect(overlap.onResolveChoiceSelection).toHaveBeenCalledWith(
      'tools',
      'Lute',
      true,
      warforged.id,
    )
    expect(screen.getAllByRole('combobox')).toHaveLength(1)

    const first = {
      ...enter,
      sourceTag: { ...enter.sourceTag, sourceName: 'House Agent', sourceRef: 'ERLW' },
    }
    const second = { ...first, id: 'house-agent-other-instrument' }
    const repeated = props([first, second])
    rerender(<BuildProficienciesTabsPanel {...repeated} />)
    await user.click(lute())
    expect(screen.getByRole('menuitem', { name: /House Agent.*Musical Instrument 1/ })).toBeTruthy()
    await user.click(screen.getByRole('menuitem', { name: /House Agent.*Musical Instrument 2/ }))
    expect(repeated.onResolveChoiceSelection).toHaveBeenCalledWith('tools', 'Lute', true, second.id)
  })

  test('labels an overlapping saved subrace tool choice with its parent race', async () => {
    const tool = "Smith's Tools"
    const guild = {
      ...choice('tools', ["artisan's tools"], [tool]),
      id: 'guild-artisan-tools',
      sourceTag: {
        ...sourceTag,
        sourceType: 'background' as const,
        sourceName: 'Guild Artisan',
        sourceRef: 'PHB',
      },
    }
    const mark = {
      ...guild,
      id: 'mark-of-making-tools',
      sourceTag: {
        ...sourceTag,
        sourceType: 'subrace' as const,
        sourceName: 'Mark of Making',
        sourceRef: 'ERLW',
      },
    }
    const props = panelProps('tools', {
      raceSelection: { race: 'Human', subrace: 'Mark of Making', subraceSource: 'ERLW' },
      visibleToolCandidates: [tool],
      ledger: { choices: [guild, mark], proficiencies: emptyProficiencies },
    })
    render(<BuildProficienciesTabsPanel {...props} />)
    const user = userEvent.setup()
    await user.click(screen.getByTitle(`Remove choice: ${tool}`))
    expect(screen.getByRole('menuitem', { name: /Guild Artisan.*PHB/ })).toBeTruthy()
    await user.click(screen.getByRole('menuitem', { name: /Human \(Mark of Making\).*ERLW/ }))
    expect(props.onResolveChoiceSelection).toHaveBeenCalledWith('tools', tool, false, mark.id)
  })

  test('preserves tool subtype and language type grouping', async () => {
    const { unmount } = render(
      <BuildProficienciesTabsPanel
        {...panelProps('tools')}
        visibleToolCandidates={["Smith's Tools", 'Lute', 'Dice Set', 'Thieves’ Tools']}
        toolTypeMap={
          new Map([
            ["smith's tools", "artisan's tools"],
            ['lute', 'musical instrument'],
            ['dice set', 'gaming set'],
          ])
        }
      />,
    )
    await selectSort('By type')
    expect(screen.getByText("Artisan's Tools")).toBeTruthy()
    expect(screen.getByText('Musical Instruments')).toBeTruthy()
    expect(screen.getByText('Gaming Sets')).toBeTruthy()
    expect(screen.getByText('Other Tools')).toBeTruthy()
    unmount()

    renderPanel('languages', {
      availableLanguages: ['Common', 'Abyssal', 'Druidic', 'Telepathy'],
      languageTypes: new Map([
        ['common', 'standard'],
        ['abyssal', 'exotic'],
        ['druidic', 'secret'],
      ]),
    })
    await selectSort('By type')
    expect(screen.getByText('Standard')).toBeTruthy()
    expect(screen.getByText('Exotic')).toBeTruthy()
    expect(screen.getByText('Secret')).toBeTruthy()
    expect(screen.getByText('Other')).toBeTruthy()
  })
})
