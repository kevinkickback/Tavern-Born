import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  resolveInitialSpellSelectionIds,
  SpellSelectionModal,
} from '@/components/modals/SpellSelectionModal'
import { SourcesAccordion } from '@/components/provenance/SourcesAccordion'
import { addSpellGrant, getSpellRows, makeSourceTag } from '@/lib/provenance'
import type { Spell5e } from '@/types/5etools'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.hasAttribute('data-selection-scroll-container') ? 600 : 160
  })
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(800)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

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

  test('an unavailable qualified target never highlights another printing', () => {
    expect(
      resolveInitialSpellSelectionIds([makeSpell('Mage Hand', 'PHB')], ['Mage Hand|XPHB']),
    ).toEqual(['mage hand|xphb'])
  })

  test('unchanged Confirm retains an unavailable qualified target', async () => {
    const onConfirm = vi.fn()
    render(
      <SpellSelectionModal
        open={true}
        onOpenChange={vi.fn()}
        spells={[makeSpell('Mage Hand', 'PHB')]}
        initialSelectedNames={['Mage Hand|XPHB']}
        onConfirm={onConfirm}
      />,
    )
    await waitFor(() =>
      expect(document.querySelector('[data-selection-list-size="1"]')).toBeTruthy(),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(onConfirm).toHaveBeenCalledWith(['Mage Hand|XPHB'])
  })

  test('an exact target pool excludes a competing printing and unrelated spells', async () => {
    render(
      <SpellSelectionModal
        open={true}
        onOpenChange={vi.fn()}
        spells={[
          makeSpell('Mage Hand', 'PHB'),
          makeSpell('Mage Hand', 'XPHB'),
          makeSpell('Light', 'XPHB'),
        ]}
        allowedSpellReferences={new Set(['mage hand|xphb'])}
        className="Wizard"
        classListOverrides={new Set(['Mage Hand|XPHB'])}
        onConfirm={vi.fn()}
      />,
    )
    await waitFor(() =>
      expect(document.querySelector('[data-selection-list-size="1"]')).toBeTruthy(),
    )
    expect(screen.queryByText('PHB')).toBeNull()
    expect(screen.queryByText('Light')).toBeNull()
    expect(screen.getByText('Mage Hand')).toBeTruthy()
    expect(screen.getByText('XPHB')).toBeTruthy()
    fireEvent.click(screen.getByRole('switch', { name: 'Ignore class restrictions' }))
    expect(document.querySelector('[data-selection-list-size="1"]')).toBeTruthy()
    expect(screen.queryByText('PHB')).toBeNull()
    expect(screen.queryByText('Light')).toBeNull()
  })

  test('an explicitly selected printing replaces an unavailable initial printing of the same spell', async () => {
    const onConfirm = vi.fn()
    render(
      <SpellSelectionModal
        open
        onOpenChange={vi.fn()}
        spells={[makeSpell('Mage Hand', 'PHB')]}
        initialSelectedNames={['Mage Hand|XPHB']}
        onConfirm={onConfirm}
      />,
    )
    await waitFor(() => expect(screen.getByText('Mage Hand')).toBeTruthy())
    fireEvent.click(screen.getByText('Mage Hand'))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(onConfirm).toHaveBeenCalledWith(['Mage Hand|PHB'])
  })

  test('persists the selected source-qualified printing', async () => {
    const onConfirm = vi.fn()
    render(
      <SpellSelectionModal
        open={true}
        onOpenChange={vi.fn()}
        spells={[makeSpell('Mage Hand', 'PHB'), makeSpell('Mage Hand', 'XPHB')]}
        initialSelectedNames={['Mage Hand|XPHB']}
        onConfirm={onConfirm}
      />,
    )

    await waitFor(() =>
      expect(document.querySelector('[data-selection-list-size="2"]')).toBeTruthy(),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(onConfirm).toHaveBeenCalledWith(['Mage Hand|XPHB'])
  })

  test('the Sources UI displays the target printing separately from its granting owner', () => {
    const character = makeCharacterFixture()
    let ledger = addSpellGrant(
      character.provenance,
      'Light|XPHB',
      makeSourceTag('race', character.race, 'fixed', character.raceSource),
    )
    ledger = addSpellGrant(ledger, 'Light|PHB', makeSourceTag('manual', 'User Choice', 'choice'))
    render(
      <SourcesAccordion
        sectionId="target-identity"
        rows={getSpellRows(ledger)}
        defaultCollapsed={false}
      />,
    )
    expect(screen.getByText('Light (XPHB)')).toBeTruthy()
    expect(screen.getByText('Light (PHB)')).toBeTruthy()
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
        initialFilters={{ level: new Set(['1']) }}
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
