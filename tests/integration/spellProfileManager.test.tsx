import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { SPECIAL_SPELL_PROFILE_ID } from '@/lib/calculations/spellProfiles.constants'
import { SpellProfileManager } from '@/pages/spells/components/SpellProfileManager'

afterEach(() => {
  cleanup()
})

describe('SpellProfileManager', () => {
  test('keeps special spell profiles visible when they have no items', () => {
    render(
      <SpellProfileManager
        spellProfiles={[{ id: SPECIAL_SPELL_PROFILE_ID, type: 'special', label: 'Bonus Spells' }]}
        detailsByProfileId={new Map()}
        groupedItems={new Map()}
        selectionSourceByProfileAndSpell={new Map()}
        preparedCasterSpellsByProfile={new Map()}
        getSpellByName={() => undefined}
        onTogglePrepared={vi.fn()}
        onRemoveSpell={vi.fn()}
        renderSpellName={() => null}
      />,
    )

    expect(screen.getByText('Bonus Spells')).toBeTruthy()
    expect(screen.getByText('No spells selected yet.')).toBeTruthy()
  })

  test('shows add spell button for bonus profile and triggers callback', () => {
    const onAddSpell = vi.fn()

    render(
      <SpellProfileManager
        spellProfiles={[{ id: SPECIAL_SPELL_PROFILE_ID, type: 'special', label: 'Bonus Spells' }]}
        detailsByProfileId={new Map()}
        groupedItems={new Map()}
        selectionSourceByProfileAndSpell={new Map()}
        preparedCasterSpellsByProfile={new Map()}
        getSpellByName={() => undefined}
        onTogglePrepared={vi.fn()}
        onRemoveSpell={vi.fn()}
        onAddSpell={onAddSpell}
        renderSpellName={() => null}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Add Spell' }))
    expect(onAddSpell).toHaveBeenCalledWith(SPECIAL_SPELL_PROFILE_ID)
  })
})
