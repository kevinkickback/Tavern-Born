import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import { CharacterCard } from '@/components/character/CharacterCard'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

describe('CharacterCard', () => {
  test('exposes named actions and keeps export/delete clicks from opening the character', async () => {
    const user = userEvent.setup()
    const character = makeCharacterFixture({
      id: 'card-actions',
      name: 'Accessible Hero',
      portrait: '/assets/images/characters/placeholder_char_card.jpg',
    })
    const onLoad = vi.fn()
    const onDelete = vi.fn()
    const onExport = vi.fn()
    const onDuplicate = vi.fn()
    const onExportTemplate = vi.fn()

    const { container } = render(
      <CharacterCard
        character={character}
        onLoad={onLoad}
        onDelete={onDelete}
        onExport={onExport}
        onDuplicate={onDuplicate}
        onExportTemplate={onExportTemplate}
      />,
    )

    expect(
      screen.getByRole('img', { name: 'Accessible Hero portrait' }).getAttribute('src'),
    ).toContain('placeholder_char_card.jpg')
    expect(screen.getByText('Level 1').textContent).toBe('Level 1')
    const detailIcons = container.querySelectorAll('[data-slot="character-card-detail-icon"]')
    expect(detailIcons).toHaveLength(3)
    for (const icon of detailIcons) {
      expect(icon.getAttribute('class')).toContain('text-primary')
      expect(icon.getAttribute('class')).not.toContain('dark:text-accent-foreground')
    }

    await user.hover(screen.getByRole('button', { name: 'Export Accessible Hero' }))
    expect((await screen.findByRole('tooltip')).textContent).toBe('Export character')

    await user.click(screen.getByRole('button', { name: 'Export Accessible Hero' }))
    expect(onExport).toHaveBeenCalledWith(character)
    expect(onLoad).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Duplicate Accessible Hero' }))
    expect(onDuplicate).toHaveBeenCalledWith(character)
    expect(onLoad).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Export Accessible Hero as template' }))
    expect(onExportTemplate).toHaveBeenCalledWith(character)
    expect(onLoad).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Delete Accessible Hero' }))
    expect(onDelete).toHaveBeenCalledWith('card-actions')
    expect(onLoad).not.toHaveBeenCalled()

    await user.click(screen.getByRole('heading', { name: 'Accessible Hero' }))
    expect(onLoad).toHaveBeenCalledWith('card-actions')
  })

  test('selection mode replaces actions with a named checkbox and routes card clicks to selection', async () => {
    const user = userEvent.setup()
    const character = makeCharacterFixture({ id: 'card-select', name: 'Selected Hero' })
    const onLoad = vi.fn()
    const onToggleSelect = vi.fn()

    render(
      <CharacterCard
        character={character}
        onLoad={onLoad}
        onDelete={vi.fn()}
        onExport={vi.fn()}
        onDuplicate={vi.fn()}
        onExportTemplate={vi.fn()}
        selectionMode
        isSelected
        onToggleSelect={onToggleSelect}
      />,
    )

    const checkbox = screen.getByRole('checkbox', { name: 'Select Selected Hero' })
    expect(checkbox.getAttribute('data-state')).toBe('checked')
    expect(screen.queryByRole('button', { name: 'Export Selected Hero' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete Selected Hero' })).toBeNull()

    await user.click(checkbox)
    expect(onToggleSelect).toHaveBeenCalledWith('card-select')
    expect(onLoad).not.toHaveBeenCalled()

    await user.click(screen.getByRole('heading', { name: 'Selected Hero' }))
    expect(onToggleSelect).toHaveBeenCalledTimes(2)
    expect(onLoad).not.toHaveBeenCalled()
  })
})
