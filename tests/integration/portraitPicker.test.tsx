import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { del } from 'idb-keyval'
import { useState } from 'react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { PortraitPicker } from '@/components/character/PortraitPicker'
import { PORTRAIT_LIBRARY_STORAGE_KEY } from '@/lib/portraitLibrary'

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
  afterEach(async () => {
    cleanup()
    sliderProps.length = 0
    await del(PORTRAIT_LIBRARY_STORAGE_KEY)
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

  test('saves an upload for reuse after remount and keeps selected portraits when deleted', async () => {
    await del(PORTRAIT_LIBRARY_STORAGE_KEY)

    function PickerHarness() {
      const [portrait, setPortrait] = useState<string | null>(null)
      return (
        <PortraitPicker
          portrait={portrait}
          onPortraitChange={setPortrait}
          onTransformChange={vi.fn()}
        />
      )
    }

    render(<PickerHarness />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Upload' }).hasAttribute('disabled')).toBe(false),
    )
    const file = new File([new Uint8Array([137, 80, 78, 71])], 'portrait.png', {
      type: 'image/png',
    })
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } })
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Use uploaded portrait 1' })).toBeTruthy(),
    )
    const uploadedSrc = (screen.getByAltText('Uploaded portrait 1') as HTMLImageElement).src
    expect((screen.getByAltText('Character portrait card preview') as HTMLImageElement).src).toBe(
      uploadedSrc,
    )

    cleanup()
    render(<PickerHarness />)
    await screen.findByRole('button', { name: 'Use uploaded portrait 1' })
    fireEvent.click(screen.getByRole('button', { name: 'Use uploaded portrait 1' }))
    expect((screen.getByAltText('Character portrait card preview') as HTMLImageElement).src).toBe(
      uploadedSrc,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Delete uploaded portrait 1' }))
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Use uploaded portrait 1' })).toBeNull(),
    )
    expect((screen.getByAltText('Character portrait card preview') as HTMLImageElement).src).toBe(
      uploadedSrc,
    )

    cleanup()
    render(<PickerHarness />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Upload' }).hasAttribute('disabled')).toBe(false),
    )
    expect(screen.queryByRole('button', { name: 'Use uploaded portrait 1' })).toBeNull()
  })
})
