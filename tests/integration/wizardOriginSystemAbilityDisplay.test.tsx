import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { INITIAL_CHARACTER_DATA } from '@/components/character/wizard/constants'
import { AbilityScoresStep } from '@/components/character/wizard/steps/6-AbilityScoresStep'
import { ReviewStep } from '@/components/character/wizard/steps/7-ReviewStep'
import type { CharacterWizardData } from '@/components/character/wizard/types'
import { validateStep } from '@/components/character/wizard/validation'
import { WizardVariantOptions } from '@/components/character/wizard/WizardVariantOptions'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Race5e } from '@/types/5etools'

function resetGameDataStore() {
  useGameDataStore.setState({
    gameData: null,
    dataSourceConfig: null,
    isLoading: false,
    isBackgroundRefreshing: false,
    loadProgress: null,
    error: null,
    cacheStatus: 'unknown',
    hasHydrated: false,
  })
}

describe('wizard 2024 origin-system ability display', () => {
  beforeEach(() => {
    resetGameDataStore()

    const race: Race5e = {
      name: 'Elf',
      source: 'PHB',
      ability: [{ dexterity: 2 }],
    }

    useGameDataStore.setState({
      gameData: {
        races: [race],
        classes: [],
        backgrounds: [],
        spells: [],
        feats: [],
        items: [],
        itemsBase: [],
        itemProperties: [],
        itemTypes: [],
        classFeatures: [],
        actions: [],
        conditions: [],
        deities: [],
        skills: [],
        senses: [],
        languages: [],
        optionalfeatures: [],
        variantrules: [],
        trapHazards: [],
        rewards: [],
        cultsBoons: [],
        organizations: [],
        sources: [],
      },
      hasHydrated: true,
      isLoading: false,
    })
  })

  afterEach(() => {
    cleanup()
  })

  test('Character Options unlocks Custom scores and keeps the Heavy waiver independent', async () => {
    const user = userEvent.setup()
    const initial: CharacterWizardData = {
      ...INITIAL_CHARACTER_DATA,
      abilityScoreMethod: 'custom',
      abilityScores: { ...INITIAL_CHARACTER_DATA.abilityScores, strength: 24 },
    }
    function WizardOptionsAndScores() {
      const [data, setData] = useState(initial)
      const onChange = (changes: Partial<typeof data>) =>
        setData((previous) => ({ ...previous, ...changes }))
      return (
        <>
          <WizardVariantOptions data={data} onChange={onChange} />
          <AbilityScoresStep
            data={data}
            onChange={onChange}
            raceResolution={{
              parentRace: undefined,
              subraceData: undefined,
              mergedRace: undefined,
              subraceIsNested: false,
            }}
          />
          <output>
            {validateStep('review', data, undefined).valid ? 'Ready' : 'Invalid scores'}
          </output>
        </>
      )
    }
    render(<WizardOptionsAndScores />)
    const strength = screen.getByRole('spinbutton', { name: 'strength base score' })
    const scoreCap = screen.getByRole('switch', { name: 'Allow Ability Scores Above 20' })
    const heavy = screen.getByRole('switch', { name: 'Ignore Heavy Weapon Requirements' })
    expect(strength.getAttribute('max')).toBe('20')
    expect(screen.getByText('Invalid scores')).toBeTruthy()
    await user.click(heavy)
    expect(strength.getAttribute('max')).toBe('20')
    await user.click(scoreCap)
    expect(strength.getAttribute('max')).toBe('30')
    expect(screen.getByText('Ready')).toBeTruthy()
    await user.click(scoreCap)
    expect((strength as HTMLInputElement).value).toBe('24')
    expect(heavy.getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText('Invalid scores')).toBeTruthy()
  })

  test('ability scores step hides racial bonus UI and totals for 2024 rules', () => {
    render(
      <AbilityScoresStep
        data={{
          ...INITIAL_CHARACTER_DATA,
          originSystem: '2024',
          race: 'Elf',
          raceSource: 'PHB',
          abilityScores: {
            strength: 10,
            dexterity: 10,
            constitution: 10,
            intelligence: 10,
            wisdom: 10,
            charisma: 10,
          },
        }}
        onChange={() => undefined}
        raceResolution={{
          parentRace: { name: 'Elf', source: 'PHB', ability: [{ dexterity: 2 }] },
          subraceData: undefined,
          mergedRace: undefined,
          subraceIsNested: false,
        }}
      />,
    )

    expect(screen.queryByTestId('race-ability-choices')).toBeNull()
    expect(screen.queryByText('10+2')).toBeNull()
  })

  test('ability scores step rejects duplicate racial choices across bonus blocks', () => {
    const race = {
      name: 'Test Race',
      source: 'TEST',
      ability: [
        { choose: { count: 1, amount: 2, from: ['str', 'dex'] } },
        { choose: { count: 1, amount: 1, from: ['str', 'dex'] } },
      ],
    } as Race5e

    render(
      <AbilityScoresStep
        data={{
          ...INITIAL_CHARACTER_DATA,
          originSystem: '2014',
          race: race.name,
          raceSource: race.source,
          abilityScoreMethod: 'custom',
          abilityScores: {
            strength: 10,
            dexterity: 10,
            constitution: 10,
            intelligence: 10,
            wisdom: 10,
            charisma: 10,
          },
          raceAsiChoices: [['str'], ['str']],
        }}
        onChange={() => undefined}
        raceResolution={{
          parentRace: race,
          subraceData: undefined,
          mergedRace: undefined,
          subraceIsNested: false,
        }}
      />,
    )

    expect(screen.queryByRole('combobox', { name: /Racial ability bonus/ })).toBeNull()
    expect(screen.queryByText(/Choose 1 ability from/)).toBeNull()
    expect(screen.getByText('Bonus +2')).toBeTruthy()
    expect(screen.queryByText('Bonus +3')).toBeNull()
  })

  test('review step does not include racial ASI totals for 2024 rules', () => {
    render(
      <ReviewStep
        data={{
          ...INITIAL_CHARACTER_DATA,
          name: 'Aelar',
          originSystem: '2024',
          race: 'Elf',
          raceSource: 'PHB',
          subrace: 'Wood Elf',
          class: 'Wizard',
          background: 'Sage',
          abilityScores: {
            strength: 10,
            dexterity: 10,
            constitution: 10,
            intelligence: 10,
            wisdom: 10,
            charisma: 10,
          },
        }}
        raceResolution={{
          parentRace: { name: 'Elf', source: 'PHB', ability: [{ dexterity: 2 }] },
          subraceData: undefined,
          mergedRace: undefined,
          subraceIsNested: false,
        }}
        sources={[]}
      />,
    )

    expect(screen.queryByText('10+2')).toBeNull()
    expect(screen.getByText('Elf (Wood Elf) · PHB')).toBeTruthy()
    expect(screen.getByText('Elf')).toBeTruthy()
  })
})
