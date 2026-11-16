import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { del } from 'idb-keyval'
import { useState } from 'react'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { PortraitPicker } from '@/components/character/PortraitPicker'
import { PLACEHOLDER_PORTRAITS } from '@/lib/portraitConstants'
import { listSavedPortraits, PORTRAIT_LIBRARY_STORAGE_KEY } from '@/lib/portraitLibrary'

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
  const decode = vi.fn<() => Promise<void>>()
  let naturalWidth = 1

  beforeEach(() => {
    decode.mockReset().mockResolvedValue(undefined)
    naturalWidth = 1
    // The real encoding method is exercised in Chromium by portrait-library.spec.ts.
    vi.stubGlobal(
      'Uint8Array',
      class extends Uint8Array {
        toBase64() {
          return Buffer.from(this).toString('base64')
        }
      },
    )
    vi.stubGlobal(
      'Image',
      class {
        decode = decode
        naturalWidth = naturalWidth
        naturalHeight = 1
      },
    )
  })

  afterEach(async () => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
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

    expect(sliderProps).toMatchObject([
      { thumbLabel: 'Zoom', min: 50, max: 400, step: 5, value: [150] },
      { thumbLabel: 'Pan X', min: -240, max: 240, step: 5, value: [20] },
      { thumbLabel: 'Pan Y', min: -240, max: 240, step: 5, value: [-10] },
    ])
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

  test('a pending upload cannot replace a later portrait choice', async () => {
    const onPortraitChange = vi.fn()
    render(<PortraitPicker onPortraitChange={onPortraitChange} onTransformChange={vi.fn()} />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Upload' }).hasAttribute('disabled')).toBe(false),
    )

    const file = new File([new Uint8Array([137, 80, 78, 71])], 'later.png', {
      type: 'image/png',
    })
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } })
    fireEvent.click(screen.getByRole('button', { name: 'Placeholder 1' }))
    await screen.findByRole('button', { name: 'Use uploaded portrait 1' })

    expect(onPortraitChange).toHaveBeenCalledTimes(1)
    expect(onPortraitChange).toHaveBeenLastCalledWith(PLACEHOLDER_PORTRAITS[0])
  })

  test('invalid and over-limit images leave the current portrait and gallery intact', async () => {
    const onPortraitChange = vi.fn()
    const onTransformChange = vi.fn()
    const report = vi.spyOn(toast, 'error')
    render(
      <PortraitPicker
        portrait={PLACEHOLDER_PORTRAITS[0]}
        onPortraitChange={onPortraitChange}
        onTransformChange={onTransformChange}
      />,
    )
    const input = document.querySelector('input[type="file"]')!
    const file = new File(['image'], 'portrait.png', { type: 'image/png' })
    decode.mockRejectedValueOnce(new Error('Invalid image'))
    fireEvent.change(input, { target: { files: [file] } })
    await waitFor(() => expect(report).toHaveBeenCalledWith('Choose an image this app can open.'))

    naturalWidth = 16_000_001
    fireEvent.change(input, { target: { files: [file] } })
    await waitFor(() =>
      expect(report).toHaveBeenCalledWith('Choose an image no larger than 16 megapixels.'),
    )

    decode.mockClear()
    fireEvent.change(input, {
      target: {
        files: [new File([new Uint8Array(4 * 1024 * 1024)], 'large.png', { type: 'image/png' })],
      },
    })
    await waitFor(() =>
      expect(report).toHaveBeenCalledWith(
        'Choose a portrait that fits within 5 MiB after encoding.',
      ),
    )
    expect(decode).not.toHaveBeenCalled()
    expect(onPortraitChange).not.toHaveBeenCalled()
    expect(onTransformChange).not.toHaveBeenCalled()
    expect(await listSavedPortraits()).toEqual([])
  })

  test.each([
    ['png', '89504e470d0a1a0a0000000d4948445200000fa100000fa0'],
    ['jpeg', 'ffd8ffe100040000fffe000003ffff00ffffc2000b080fa00fa101011100'],
  ])('rejects a %s header above 16 megapixels before browser decode', async (type, header) => {
    const report = vi.spyOn(toast, 'error')
    const bytes = new Uint8Array(Buffer.from(header, 'hex'))
    render(<PortraitPicker onPortraitChange={vi.fn()} onTransformChange={vi.fn()} />)
    fireEvent.change(document.querySelector('input[type="file"]')!, {
      target: { files: [new File([bytes], `test.${type}`, { type: `image/${type}` })] },
    })
    await waitFor(() =>
      expect(report).toHaveBeenCalledWith('Choose an image no larger than 16 megapixels.'),
    )
    expect(decode).not.toHaveBeenCalled()
  })

  test('reports a file read failure without attempting to decode an image', async () => {
    const report = vi.spyOn(toast, 'error')
    const file = new File([new Uint8Array(24)], 'test.png', { type: 'image/png' })
    vi.spyOn(file, 'arrayBuffer').mockRejectedValueOnce(new Error('Platform read failure'))

    render(<PortraitPicker onPortraitChange={vi.fn()} onTransformChange={vi.fn()} />)
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } })

    await waitFor(() => expect(report).toHaveBeenCalledWith('The image file could not be read.'))
    expect(decode).not.toHaveBeenCalled()
  })

  test('an upload from an unmounted picker cannot change another character', async () => {
    const firstOnChange = vi.fn()
    const secondOnChange = vi.fn()
    const { rerender } = render(
      <PortraitPicker key="first" onPortraitChange={firstOnChange} onTransformChange={vi.fn()} />,
    )
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Upload' }).hasAttribute('disabled')).toBe(false),
    )

    const file = new File([new Uint8Array([137, 80, 78, 71])], 'first.png', {
      type: 'image/png',
    })
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } })
    rerender(
      <PortraitPicker key="second" onPortraitChange={secondOnChange} onTransformChange={vi.fn()} />,
    )
    await waitFor(async () => expect(await listSavedPortraits()).toHaveLength(1))

    expect(firstOnChange).not.toHaveBeenCalled()
    expect(secondOnChange).not.toHaveBeenCalled()
  })
})
