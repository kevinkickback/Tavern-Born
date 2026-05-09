import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

afterEach(() => {
  cleanup()
})

import type { ChoiceRecord, ProficiencyProvenance } from '@/lib/provenance/types'
import { BuildProficienciesTabsPanel } from '@/pages/build/proficiencies/components/TabsPanel'

vi.mock('@/lib/storage/idb-storage', () => ({
  createIdbStorage: () => ({
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  }),
}))

const emptyProficiencies: ProficiencyProvenance = {
  armor: {},
  weapons: {},
  tools: {},
  languages: { common: [] },
  skills: {},
  savingThrows: {},
}

function renderPanel(languageChoice: ChoiceRecord) {
  render(
    <BuildProficienciesTabsPanel
      skills={[]}
      savingThrows={[]}
      availableArmor={[]}
      availableWeapons={[]}
      availableLanguages={['Common', 'Elvish', 'Abyssal']}
      currentProficiencies={{ armor: [], weapons: [], tools: [], languages: ['Common'] }}
      ledger={{
        choices: [languageChoice],
        proficiencies: emptyProficiencies,
      }}
      choiceCounts={{ skills: 0, armor: 0, weapons: 0, tools: 0, languages: 2 }}
      dropdownToolSlots={[]}
      artisanToolSlots={[]}
      visibleToolCandidates={[]}
      artisanChoiceByNorm={new Map()}
      focused={null}
      onFocusChange={() => undefined}
      onExpandDetails={() => undefined}
      onResolveChoiceSelection={() => undefined}
      onToggleExpertise={() => undefined}
      availableExpertiseSlots={0}
      usedExpertiseSlots={0}
      expertiseChoiceCount={0}
      defaultTab="languages"
    />,
  )
}

describe('BuildProficienciesTabsPanel origin language messaging', () => {
  test('renders language tab without status notes', () => {
    renderPanel({
      id: 'origin:2024:languages',
      domain: 'languages',
      sourceTag: {
        sourceType: 'manual',
        sourceName: '2024 Origin Languages',
        grantType: 'placeholder',
        label: 'User Choice',
      },
      chooseCount: 2,
      optionPool: [],
      selected: [],
      status: 'pending',
    })

    expect(screen.queryByText(/2024 Origin Languages/)).toBeNull()
  })
})
