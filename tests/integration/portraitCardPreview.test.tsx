import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'
import { PortraitCardPreview } from '@/components/character/PortraitCardPreview'

describe('PortraitCardPreview', () => {
  afterEach(() => {
    cleanup()
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

    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(2)
    expect(buttons[0]).toHaveProperty('disabled', true)
    expect(buttons[1]).toHaveProperty('disabled', true)
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

    expect(style).toContain('translate(calc(-50% + -72px), calc(-50% + -10px))')
    expect(style).toContain('scale(1.5)')
    expect(style).toContain('rotate(12deg)')
  })
})
