import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest'
import type { ChoiceRecord, ProficiencyProvenance } from '@/lib/provenance/types'
import {
  BuildProficienciesTabsPanel,
  type ProficiencyTabValue,
} from '@/pages/build/proficiencies/components/TabsPanel'

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
    dropdownToolSlots: [],
    artisanToolSlots: [],
    visibleToolCandidates: [],
    artisanChoiceByNorm: new Map(),
    languageTypes: new Map(),
    toolTypeMap: new Map(),
    weaponInfoMap: new Map(),
    onFocusChange: vi.fn(),
    onExpandDetails: vi.fn(),
    onResolveChoiceSelection: vi.fn(),
    onToggleExpertise: vi.fn(),
    availableExpertiseSlots: 0,
    usedExpertiseSlots: 0,
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
      availableExpertiseSlots: 1,
    })
    const user = userEvent.setup()

    expect(screen.getByText('Chosen')).toBeTruthy()
    expect(screen.getByText('Granted')).toBeTruthy()
    expect(screen.getByText('Available')).toBeTruthy()
    expect(screen.getByText('Unavailable')).toBeTruthy()

    await user.click(screen.getByTitle('Remove choice: Acrobatics'))
    expect(props.onResolveChoiceSelection).toHaveBeenCalledWith('skills', 'acrobatics', false)

    await user.click(screen.getByTitle('Add expertise: Arcana'))
    expect(props.onToggleExpertise).toHaveBeenCalledWith('arcana')
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
