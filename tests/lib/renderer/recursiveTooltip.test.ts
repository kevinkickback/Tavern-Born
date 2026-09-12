import { describe, expect, test } from 'vitest'
import {
  buildRecursiveLookup,
  getRecursiveHintPosition,
  getRecursiveTooltipData,
  markRecursiveTooltipReferences,
} from '@/lib/renderer/recursiveTooltip'
import type { Item5e, Spell5e } from '@/types/5etools'

describe('buildRecursiveLookup', () => {
  test('builds source-qualified and deterministic name-only maps from explicit collections', () => {
    const phbSpell = { name: 'Light', source: 'PHB', level: 0, school: 'E' } as Spell5e
    const xphbSpell = { name: 'Light', source: 'XPHB', level: 0, school: 'E' } as Spell5e
    const baseItem = { name: 'Torch', source: 'PHB', type: 'G' } as Item5e

    const lookup = buildRecursiveLookup({
      spells: [phbSpell, xphbSpell],
      itemsBase: [baseItem],
    })

    expect(lookup.spells.get('light|phb')).toBe(phbSpell)
    expect(lookup.spells.get('light|xphb')).toBe(xphbSpell)
    expect(lookup.spells.get('light|')).toBe(phbSpell)
    expect(lookup.items.get('torch|phb')).toBe(baseItem)
    expect(lookup.items.get('torch|')).toBe(baseItem)
  })

  test('uses only the collections supplied by the caller', () => {
    const lookup = buildRecursiveLookup({ feats: [{ name: 'Alert', source: 'PHB' }] })

    expect(lookup.feats.get('alert|phb')?.name).toBe('Alert')
    expect(lookup.spells.size).toBe(0)
    expect(lookup.items.size).toBe(0)
  })

  test('indexes loaded trap, hazard, and reward preview collections', () => {
    const hazard = { name: 'Extreme Cold', source: 'DMG', entries: ['Cold details.'] }
    const reward = { name: 'Blessing of Health', source: 'DMG', entries: ['Reward details.'] }
    const lookup = buildRecursiveLookup({ trapHazards: [hazard], rewards: [reward] })

    expect(
      getRecursiveTooltipData(
        { kind: 'hazard', name: 'Extreme Cold', source: 'DMG' },
        lookup,
        'Hazard: Extreme Cold',
      ).html,
    ).toContain('Cold details.')
    expect(
      getRecursiveTooltipData(
        { kind: 'reward', name: 'Blessing of Health', source: 'DMG' },
        lookup,
        'Reward: Blessing of Health',
      ).html,
    ).toContain('Reward details.')
  })

  test('resolves colliding class features and nested subclass features by their parent scope', () => {
    const fighterFeature = {
      name: 'Extra Attack',
      source: 'PHB',
      className: 'Fighter',
      classSource: 'PHB',
      entries: ['Fighter version.'],
    }
    const paladinFeature = {
      name: 'Extra Attack',
      source: 'PHB',
      className: 'Paladin',
      classSource: 'PHB',
      entries: ['Paladin version.'],
    }
    const arcaneWard = {
      name: 'Arcane Ward',
      source: 'PHB',
      className: 'Wizard',
      classSource: 'PHB',
      subclassShortName: 'Abjuration',
      subclassSource: 'PHB',
      entries: ['Ward details.'],
    }
    const lookup = buildRecursiveLookup({
      classFeatures: [fighterFeature, paladinFeature],
      classes: [
        {
          name: 'Wizard',
          source: 'PHB',
          subclasses: [
            {
              name: 'School of Abjuration',
              shortName: 'Abjuration',
              source: 'PHB',
              levelFeatures: [{ features: [arcaneWard] }],
            },
          ],
        },
      ],
    })

    expect(
      getRecursiveTooltipData(
        {
          kind: 'classFeature',
          name: 'Extra Attack',
          source: 'PHB',
          className: 'Paladin',
          classSource: 'PHB',
        },
        lookup,
        'Class Feature: Extra Attack',
      ).html,
    ).toContain('Paladin version.')
    expect(
      getRecursiveTooltipData(
        {
          kind: 'subclassFeature',
          name: 'Arcane Ward',
          source: 'PHB',
          className: 'Wizard',
          classSource: 'PHB',
          subclassName: 'Abjuration',
          subclassSource: 'PHB',
        },
        lookup,
        'Subclass Feature: Arcane Ward',
      ).html,
    ).toContain('Ward details.')
  })

  test('makes entity references keyboard reachable without changing title-only annotations', () => {
    const marked = markRecursiveTooltipReferences(
      '<span title="Condition: Prone" data-hover-type="condition" data-hover-name="Prone" data-hover-source="PHB">Prone</span><span title="Book">PHB</span>',
    )

    expect(marked).toContain('data-recursive-title="Condition: Prone"')
    expect(marked).toContain('tabindex="0"')
    expect(marked).toContain('role="button"')
    expect(marked).toContain('aria-haspopup="dialog"')
    expect(marked).toContain('aria-expanded="false"')
    expect(marked).toContain('<span title="Book">PHB</span>')
  })

  test('staggers a child preview when neither side has room', () => {
    const container = document.createElement('div')
    const target = document.createElement('span')
    container.dataset.recursiveTooltipDepth = '0'
    container.append(target)
    document.body.append(container)

    const originalWidth = window.innerWidth
    const originalHeight = window.innerHeight
    try {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 640 })
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: 480 })
      container.getBoundingClientRect = () =>
        ({ left: 160, right: 480, top: 100, bottom: 340, width: 320, height: 240 }) as DOMRect
      target.getBoundingClientRect = () =>
        ({ left: 220, right: 280, top: 120, bottom: 140, width: 60, height: 20 }) as DOMRect

      expect(getRecursiveHintPosition(target, true)).toEqual({ x: 24, y: 24 })
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth })
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalHeight })
      container.remove()
    }
  })
})
