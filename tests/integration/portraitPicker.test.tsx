import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { PortraitPicker } from '@/components/character/PortraitPicker'

const sliderProps = vi.hoisted(() => [] as Array<Record<string, unknown>>)

vi.mock('@/components/ui/slider', () => ({
  Slider: (props: Record<string, unknown>) => {
    sliderProps.push(props)
    return null
  },
}))

vi.mock('@/components/ui/SplitPane', () => ({
  SplitPane: ({ left, right }: { left: React.ReactNode; right: React.ReactNode }) => (
    <>
      {left}
      {right}
    </>
  ),
}))

describe('PortraitPicker transform controls', () => {
  afterEach(() => {
    cleanup()
    sliderProps.length = 0
  })

  test('previews drag changes locally and persists only the committed value', () => {
    const onTransformChange = vi.fn()
    render(
      <PortraitPicker
        portrait="/portrait.png"
        transform={{ zoom: 150, panX: 20, panY: -10, rotation: 0 }}
        onPortraitChange={vi.fn()}
        onTransformChange={onTransformChange}
      />,
    )

    const panXSlider = sliderProps[1]
    const onValueChange = panXSlider.onValueChange as (value: number[]) => void
    const onValueCommit = panXSlider.onValueCommit as (value: number[]) => void

    act(() => onValueChange([40]))

    expect(onTransformChange).not.toHaveBeenCalled()
    expect(screen.getByAltText('Character portrait card preview').getAttribute('style')).toContain(
      'translate(calc(-50% - 14.444444%)',
    )

    act(() => onValueCommit([40]))

    expect(onTransformChange).toHaveBeenCalledOnce()
    expect(onTransformChange).toHaveBeenCalledWith({
      zoom: 150,
      panX: 40,
      panY: -10,
      rotation: 0,
    })
  })
})
