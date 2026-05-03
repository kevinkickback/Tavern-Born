import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { SPECIAL_SPELL_PROFILE_ID } from '@/lib/calculations/spellProfiles.constants'
import {
  type SpellListItem,
  SpellProfileManager,
} from '@/pages/spells/components/SpellProfileManager'

function withTooltipProvider(ui: ReactNode) {
  return <TooltipProvider>{ui}</TooltipProvider>
}

afterEach(() => {
  cleanup()
})

function makeItem(overrides: Partial<SpellListItem> = {}): SpellListItem {
  return {
    profileId: 'class:Wizard|PHB',
    profileLabel: 'Wizard (Lv 1)',
    name: 'Fire Bolt',
    level: 0,
    kind: 'cantrip',
    prepared: false,
    isFixed: false,
    ...overrides,
  }
}

const BASE_CLASS_PROFILE = {
  id: 'class:Wizard|PHB',
  type: 'class',
  label: 'Wizard (Lv 1)',
  className: 'Wizard',
  classSource: 'PHB',
}

const BASE_DETAIL = {
  profileId: 'class:Wizard|PHB',
  isPreparedCaster: false,
  isTruePreparedCaster: false,
  isLevelOnlyPreparedCaster: false,
  cantripLimit: null,
  knownSpellLimit: null,
}

describe('SpellProfileManager', () => {
  test('keeps special spell profiles visible when they have no items', () => {
    render(
      <SpellProfileManager
        spellProfiles={[{ id: SPECIAL_SPELL_PROFILE_ID, type: 'special', label: 'Bonus Spells' }]}
        detailsByProfileId={new Map()}
        groupedItems={new Map()}
        selectionSourceByProfileAndSpell={new Map()}
        preparedCasterItemsByProfile={new Map()}
        getSpellByName={() => undefined}
        onTogglePrepared={vi.fn()}
        onRemoveSpell={vi.fn()}
        renderSpellName={() => null}
      />,
    )

    expect(screen.getByText('Bonus Spells')).toBeTruthy()
    expect(screen.getByText('No Spells Selected')).toBeTruthy()
  })

  test('shows add spell button for bonus profile and triggers callback', () => {
    const onAddSpell = vi.fn()

    render(
      <SpellProfileManager
        spellProfiles={[{ id: SPECIAL_SPELL_PROFILE_ID, type: 'special', label: 'Bonus Spells' }]}
        detailsByProfileId={new Map()}
        groupedItems={new Map()}
        selectionSourceByProfileAndSpell={new Map()}
        preparedCasterItemsByProfile={new Map()}
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

  test('renders cantrips inside a class profile', () => {
    const items = [makeItem({ name: 'Fire Bolt', level: 0, kind: 'cantrip' })]

    render(
      <SpellProfileManager
        spellProfiles={[BASE_CLASS_PROFILE]}
        detailsByProfileId={new Map([[BASE_CLASS_PROFILE.id, BASE_DETAIL]])}
        groupedItems={new Map([[BASE_CLASS_PROFILE.id, items]])}
        selectionSourceByProfileAndSpell={new Map()}
        getSpellByName={() => undefined}
        onTogglePrepared={vi.fn()}
        onRemoveSpell={vi.fn()}
        renderSpellName={({ item }) => <span>{item.name}</span>}
      />,
    )

    expect(screen.getByText('Cantrips')).toBeTruthy()
    expect(screen.getByText('Fire Bolt')).toBeTruthy()
  })

  test('calls onRemoveSpell when remove button clicked for a non-fixed spell', () => {
    const onRemoveSpell = vi.fn()
    const item = makeItem({ name: 'Fire Bolt', level: 0, kind: 'cantrip', isFixed: false })

    render(
      <SpellProfileManager
        spellProfiles={[BASE_CLASS_PROFILE]}
        detailsByProfileId={new Map([[BASE_CLASS_PROFILE.id, BASE_DETAIL]])}
        groupedItems={new Map([[BASE_CLASS_PROFILE.id, [item]]])}
        selectionSourceByProfileAndSpell={new Map()}
        getSpellByName={() => undefined}
        onTogglePrepared={vi.fn()}
        onRemoveSpell={onRemoveSpell}
        renderSpellName={({ item: i }) => <span>{i.name}</span>}
      />,
    )

    // The accordion trigger button has data-state; the trash button does not
    const allButtons = screen.getAllByRole('button')
    const trashButton = allButtons.find((btn) => !btn.hasAttribute('data-state'))
    if (trashButton) fireEvent.click(trashButton)
    expect(onRemoveSpell).toHaveBeenCalledWith(item)
  })

  test('hides remove button and shows lock icon for fixed spells', () => {
    const onRemoveSpell = vi.fn()
    const item = makeItem({ name: 'Mage Hand', level: 0, kind: 'cantrip', isFixed: true })

    render(
      <SpellProfileManager
        spellProfiles={[BASE_CLASS_PROFILE]}
        detailsByProfileId={new Map([[BASE_CLASS_PROFILE.id, BASE_DETAIL]])}
        groupedItems={new Map([[BASE_CLASS_PROFILE.id, [item]]])}
        selectionSourceByProfileAndSpell={new Map()}
        getSpellByName={() => undefined}
        onTogglePrepared={vi.fn()}
        onRemoveSpell={onRemoveSpell}
        renderSpellName={({ item: i }) => <span>{i.name}</span>}
      />,
    )

    // Only the accordion trigger button should be present (no trash button for fixed spells)
    const allButtons = screen.getAllByRole('button')
    const nonAccordionButtons = allButtons.filter((btn) => !btn.hasAttribute('data-state'))
    expect(nonAccordionButtons).toHaveLength(0)
    expect(onRemoveSpell).not.toHaveBeenCalled()
  })

  test('shows warning badge when class has missing spell selections', () => {
    render(
      withTooltipProvider(
        <SpellProfileManager
          spellProfiles={[BASE_CLASS_PROFILE]}
          detailsByProfileId={
            new Map([
              [BASE_CLASS_PROFILE.id, { ...BASE_DETAIL, cantripLimit: 3, knownSpellLimit: 6 }],
            ])
          }
          groupedItems={new Map([[BASE_CLASS_PROFILE.id, []]])}
          selectionSourceByProfileAndSpell={new Map()}
          getSpellByName={() => undefined}
          onTogglePrepared={vi.fn()}
          onRemoveSpell={vi.fn()}
          renderSpellName={() => null}
        />,
      ),
    )

    expect(screen.getByText('Spell Selection Available')).toBeTruthy()
  })

  test('hides racial profile when empty with no unfulfilled choices', () => {
    render(
      <SpellProfileManager
        spellProfiles={[{ id: 'racial:Human|PHB', type: 'racial', label: 'Human Spells' }]}
        detailsByProfileId={new Map()}
        groupedItems={new Map()}
        selectionSourceByProfileAndSpell={new Map()}
        getSpellByName={() => undefined}
        onTogglePrepared={vi.fn()}
        onRemoveSpell={vi.fn()}
        renderSpellName={() => null}
      />,
    )

    expect(screen.queryByText('Human Spells')).toBeNull()
  })

  test('shows empty state when no profiles are present', () => {
    render(
      <SpellProfileManager
        spellProfiles={[]}
        detailsByProfileId={new Map()}
        groupedItems={new Map()}
        selectionSourceByProfileAndSpell={new Map()}
        getSpellByName={() => undefined}
        onTogglePrepared={vi.fn()}
        onRemoveSpell={vi.fn()}
        renderSpellName={() => null}
      />,
    )

    expect(screen.getByText('No spells assigned yet.')).toBeTruthy()
  })
})
