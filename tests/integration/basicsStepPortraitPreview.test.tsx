import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { BasicsStep } from '@/components/character/wizard/steps/1-BasicsStep'
import { DEFAULT_PORTRAIT_TRANSFORM } from '@/lib/portraitConstants'

const pickerSpy = vi.hoisted(() => vi.fn())

vi.mock('@/components/character/PortraitPicker', () => ({
  PortraitPicker: (props: Record<string, unknown>) => {
    pickerSpy(props)
    return <div data-testid="portrait-picker-mock" />
  },
}))

const baseData = {
  name: 'Aelar',
  playerName: '',
  age: null,
  gender: 'Male',
  race: '',
  raceSource: '',
  subrace: '',
  subraceSource: '',
  class: '',
  classSource: '',
  background: '',
  backgroundSource: '',
  originSystem: '2014' as const,
  abilityScoreMethod: 'pointBuy',
  abilityScores: {
    str: 10,
    dex: 10,
    con: 10,
    int: 10,
    wis: 10,
    cha: 10,
  },
  portrait: '/portrait.png',
  portraitTransform: { ...DEFAULT_PORTRAIT_TRANSFORM },
  allowedSources: [],
  raceAsiChoices: [],
  raceAsiBlockIndex: 0 as const,
  variantRules: {
    optionalClassFeatures: false,
    averageHitPoints: true,
    bladesingerAnyRace: false,
    battleragerAnyRace: false,
    preferNewerPrintings: false,
  },
}

describe('BasicsStep portrait preview wiring', () => {
  beforeEach(() => {
    pickerSpy.mockClear()
  })

  afterEach(() => {
    cleanup()
  })

  test('passes placeholder card metadata and current transform to PortraitCardPreview', () => {
    render(<BasicsStep data={baseData} onChange={vi.fn()} invalidFields={new Set()} />)

    expect(screen.getByTestId('portrait-picker-mock')).toBeTruthy()
    expect(pickerSpy).toHaveBeenCalledTimes(1)

    const props = pickerSpy.mock.calls[0][0] as Record<string, unknown>

    expect(props.portrait).toBe('/portrait.png')
    expect(props.name).toBe('Aelar')
    expect(props.level).toBe(1)
    expect(props.race).toBe('Race')
    expect(props.characterClass).toBe('Class')
    expect(props.gender).toBe('Male')
    expect(props.transform).toEqual(DEFAULT_PORTRAIT_TRANSFORM)
  })

  test('uses default portrait transform when wizard data does not provide one', () => {
    const dataWithoutTransform = {
      ...baseData,
      portraitTransform: undefined,
    }

    render(
      <BasicsStep
        data={dataWithoutTransform as unknown as typeof baseData}
        onChange={vi.fn()}
        invalidFields={new Set()}
      />,
    )

    expect(pickerSpy).toHaveBeenCalledTimes(1)

    const props = pickerSpy.mock.calls[0][0] as Record<string, unknown>
    expect(props.transform).toEqual(DEFAULT_PORTRAIT_TRANSFORM)
  })
})
