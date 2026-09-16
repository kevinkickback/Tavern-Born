import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import {
  resolveInitialSpellSelectionIds,
  SpellSelectionModal,
} from '@/components/modals/SpellSelectionModal'
import type { Spell5e } from '@/types/5etools'

function makeSpell(name: string, source: string, overrides: Partial<Spell5e> = {}): Spell5e {
  return {
    name,
    source,
    level: 0,
    school: 'A',
    time: [{ number: 1, unit: 'action' }],
    range: { type: 'point', distance: { type: 'feet', amount: 30 } },
    components: { v: true, s: true },
    duration: [{ type: 'instant' }],
    entries: [],
    ...overrides,
  }
}

describe('SpellSelectionModal identity', () => {
  test('hides a canonical catalog spell when the stored known name is lowercase', async () => {
    render(
      <SpellSelectionModal
        open={true}
        onOpenChange={vi.fn()}
        spells={[makeSpell('Mage Hand', 'PHB'), makeSpell('Fire Bolt', 'PHB')]}
        characterSpellNames={new Set(['mage hand'])}
        onConfirm={vi.fn()}
      />,
    )

    await waitFor(() =>
      expect(document.querySelector('[data-selection-list-size="1"]')).toBeTruthy(),
    )
    expect(screen.queryByText('Mage Hand')).toBeNull()
  })

  test('uses an explicit source when resolving duplicate catalog names', () => {
    const spells = [makeSpell('Mage Hand', 'PHB'), makeSpell('Mage Hand', 'XPHB')]
    expect(resolveInitialSpellSelectionIds(spells, ['mage hand|XPHB'])).toEqual(['mage hand|xphb'])
  })

  test('shows spells granted through the selected subclass list', async () => {
    const spell = makeSpell('Charm Person', 'PHB', {
      level: 1,
      classes: {
        fromSubclass: [
          {
            class: { name: 'Rogue', source: 'PHB' },
            subclass: { name: 'Arcane Trickster', source: 'PHB' },
          },
        ],
      },
    })

    render(
      <SpellSelectionModal
        open={true}
        onOpenChange={vi.fn()}
        spells={[spell]}
        allowedLevels={new Set(['1'])}
        className="Rogue"
        classSource="PHB"
        subclassName="Arcane Trickster"
        subclassSource="PHB"
        onConfirm={vi.fn()}
      />,
    )

    await waitFor(() =>
      expect(document.querySelector('[data-selection-list-size="1"]')).toBeTruthy(),
    )
  })
})
