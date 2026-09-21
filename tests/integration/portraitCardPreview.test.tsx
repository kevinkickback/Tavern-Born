import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { PortraitCardPreview } from '@/components/character/PortraitCardPreview'

describe('PortraitCardPreview', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  test('shows fallback name and gender branch when level is not provided', () => {
    render(<PortraitCardPreview gender="Non-binary" />)

    expect(screen.getByText('Unnamed Character')).toBeTruthy()
    expect(screen.getByText('Non-binary')).toBeTruthy()
    expect(screen.queryByText(/Level/i)).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  test('shows level details, disabled action buttons, and last modified text', () => {
    render(
      <PortraitCardPreview
        name="Aelar"
        level={3}
        race="Elf"
        characterClass="Wizard"
        lastModified="2026-04-06T12:00:00.000Z"
      />,
    )

    expect(screen.getByText('Aelar')).toBeTruthy()
    expect(screen.getByText('Level 3')).toBeTruthy()
    expect(screen.getByText('Elf')).toBeTruthy()
    expect(screen.getByText('Wizard')).toBeTruthy()
    expect(screen.getByText(/Last modified:/)).toBeTruthy()

    expect(screen.queryByRole('button')).toBeNull()
    expect(document.querySelectorAll('[data-slot="button"]')).toHaveLength(3)
  })

  test('enlarges the complete card canvas with the available preview width', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 540,
      height: 360,
      top: 0,
      right: 540,
      bottom: 360,
      left: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })

    render(<PortraitCardPreview name="Aelar" level={3} />)

    const canvas = document.querySelector('[data-slot="portrait-card-preview-canvas"]')
    expect(canvas?.getAttribute('style')).toContain('transform: scale(1.5)')
    expect(canvas?.getAttribute('style')).toContain('width: 360px')
    expect(canvas?.getAttribute('style')).toContain('height: 240px')
  })

  test('limits the card by available height when the preview must contain its controls', () => {
    const onWidthChange = vi.fn()
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 900,
      height: 300,
      top: 0,
      right: 900,
      bottom: 300,
      left: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })

    render(
      <PortraitCardPreview name="Aelar" level={3} fit="contain" onWidthChange={onWidthChange} />,
    )

    const preview = document.querySelector('[data-slot="portrait-card-preview"]')
    const canvas = document.querySelector('[data-slot="portrait-card-preview-canvas"]')
    expect(preview?.getAttribute('style')).toContain('width: 450px')
    expect(canvas?.getAttribute('style')).toContain('transform: scale(1.25)')
    expect(onWidthChange).toHaveBeenCalledWith(450)
  })

  test('applies portrait transform values to image style', () => {
    render(
      <PortraitCardPreview
        image="/portrait.png"
        transform={{ zoom: 150, panX: 20, panY: -10, rotation: 12 }}
      />,
    )

    const image = screen.getByAltText('Character portrait card preview')
    const style = image.getAttribute('style') ?? ''

    expect(style).toContain('translate(calc(-50% - 20%), calc(-50% - 4.166667%))')
    expect(style).toContain('scale(1.5)')
    expect(style).toContain('rotate(12deg)')
  })
})
