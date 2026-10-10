import { describe, expect, test } from 'vitest'
import { buildSpellLookup } from '@/lib/5etools/lookups'
import type { FeatOptionStep } from '@/lib/5etools/parsers/featOptions'
import { assignSavedFeatSpells } from '@/lib/character/featSpellChoices'
import { makeSpellFixture } from '../fixtures/gameDataFixtures'

const spark = makeSpellFixture({
  name: 'Spark',
  source: 'TEST',
  level: 0,
  school: 'E',
  entries: [],
  classes: { fromClassList: [{ name: 'Wizard', source: 'PHB' }] },
})
const ray = { ...spark, name: 'Ray', level: 1, school: 'A' }
const step = (chooseFilter: string, count = 1): FeatOptionStep => ({
  kind: 'spells',
  label: 'Choose',
  count,
  chooseFilter,
})
const lookup = buildSpellLookup([spark, ray])

describe('assignSavedFeatSpells', () => {
  test('assigns exact metadata once and preserves saved literals despite array order', () => {
    expect(
      assignSavedFeatSpells(
        [step('level=0'), step('level=1')],
        ['{@spell Ray|TEST|Saved ray}', ' spark | test '],
        lookup,
      ),
    ).toEqual({
      selections: { 0: [' spark | test '], 1: ['{@spell Ray|TEST|Saved ray}'] },
      unassigned: [],
    })
  })

  test('moves a flexible selection to another slot when a constrained selection needs its slot', () => {
    expect(
      assignSavedFeatSpells(
        [step('level=0;1'), step('level=0')],
        ['Spark|TEST', 'Ray|TEST'],
        lookup,
      ),
    ).toEqual({
      selections: { 0: ['Ray|TEST'], 1: ['Spark|TEST'] },
      unassigned: [],
    })
  })

  test('keeps identical eligible steps stable and respects their separate capacities', () => {
    expect(
      assignSavedFeatSpells(
        [step('level=0;1'), step('level=0;1')],
        ['Spark|TEST', 'Ray|TEST'],
        lookup,
      ),
    ).toEqual({
      selections: { 0: ['Spark|TEST'], 1: ['Ray|TEST'] },
      unassigned: [],
    })
  })

  test('reassigns through multiple occupied steps to preserve a complete valid set', () => {
    const wave = { ...spark, name: 'Wave', level: 2 }
    expect(
      assignSavedFeatSpells(
        [step('level=0;1'), step('level=0;2'), step('level=0')],
        ['Spark|TEST', 'Ray|TEST', 'Wave|TEST'],
        buildSpellLookup([spark, ray, wave]),
      ),
    ).toEqual({
      selections: { 0: ['Ray|TEST'], 1: ['Wave|TEST'], 2: ['Spark|TEST'] },
      unassigned: [],
    })
  })

  test('deduplicates normalized exact references without rewriting the first literal', () => {
    expect(
      assignSavedFeatSpells(
        [step('level=0'), step('level=1')],
        [' spark | test ', 'Spark|TEST', 'Ray|TEST', 'Ray|test'],
        lookup,
      ),
    ).toEqual({
      selections: { 0: [' spark | test '], 1: ['Ray|TEST'] },
      unassigned: [],
    })
  })

  test('does not borrow a competing printing to infer a missing reference step', () => {
    expect(
      assignSavedFeatSpells(
        [step('level=0'), step('level=1')],
        ['Spark|OTHER', 'Ray|TEST'],
        lookup,
      ),
    ).toEqual({
      selections: { 1: ['Ray|TEST'] },
      unassigned: ['Spark|OTHER'],
    })
  })

  test('uses class and school membership as well as level', () => {
    const bard = {
      ...spark,
      name: 'Song',
      classes: { fromClassList: [{ name: 'Bard', source: 'PHB' }] },
    }
    expect(
      assignSavedFeatSpells(
        [step('class=Bard|level=0'), step('class=Wizard|school=E|level=0')],
        ['Spark|TEST', 'Song|TEST', 'Ray|TEST'],
        buildSpellLookup([spark, ray, bard]),
      ),
    ).toEqual({
      selections: { 0: ['Song|TEST'], 1: ['Spark|TEST'] },
      unassigned: ['Ray|TEST'],
    })
  })

  test('exposes excess and unmatched selections instead of losing them or exceeding quotas', () => {
    expect(
      assignSavedFeatSpells(
        [step('level=0'), step('level=0')],
        ['Spark|TEST', 'Ray|TEST', 'Gone|TEST'],
        lookup,
      ),
    ).toEqual({
      selections: { 0: ['Spark|TEST'] },
      unassigned: ['Ray|TEST', 'Gone|TEST'],
    })
  })

  test('retains an unavailable or refreshed selection when there is only one possible step', () => {
    expect(assignSavedFeatSpells([step('level=0', 2)], ['Ray|TEST', 'Gone|TEST'], lookup)).toEqual({
      selections: { 0: ['Ray|TEST', 'Gone|TEST'] },
      unassigned: [],
    })
  })

  test('does not let recovery exceed even a single step quota', () => {
    expect(assignSavedFeatSpells([step('level=0')], ['Gone|TEST', 'Spark|TEST'], lookup)).toEqual({
      selections: { 0: ['Spark|TEST'] },
      unassigned: ['Gone|TEST'],
    })
  })

  test('keeps references recoverable when no spell steps remain', () => {
    expect(assignSavedFeatSpells([], ['Spark|TEST'], lookup)).toEqual({
      selections: {},
      unassigned: ['Spark|TEST'],
    })
  })
})
