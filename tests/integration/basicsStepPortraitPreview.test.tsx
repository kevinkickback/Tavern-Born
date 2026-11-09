import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { INITIAL_CHARACTER_DATA } from '@/components/character/wizard/constants'
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
  ...INITIAL_CHARACTER_DATA,
  name: 'Aelar',
  gender: 'Male',
  portrait: '/portrait.png',
  portraitTransform: { ...DEFAULT_PORTRAIT_TRANSFORM, zoom: 175 },
}

describe('BasicsStep portrait preview wiring', () => {
  beforeEach(() => {
    pickerSpy.mockClear()
  })

  afterEach(() => {
    cleanup()
  })

  test('passes placeholder card metadata and current transform to PortraitCardPreview', () => {
    render(<BasicsStep data={baseData} onChange={vi.fn()} />)

    expect(screen.getByTestId('portrait-picker-mock')).toBeTruthy()
    expect(pickerSpy).toHaveBeenCalledTimes(1)

    const props = pickerSpy.mock.calls[0][0] as Record<string, unknown>

    expect(props.portrait).toBe('/portrait.png')
    expect(props.name).toBe('Aelar')
    expect(props.level).toBe(1)
    expect(props.race).toBe('Race')
    expect(props.characterClass).toBe('Class')
    expect(props.gender).toBe('Male')
    expect(props.transform).toEqual(baseData.portraitTransform)
  })
})
