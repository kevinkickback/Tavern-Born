import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { resolveCopiedRecords } from '@/lib/5etools/copyResolution'
import { buildCreatureChoiceSummary } from '@/lib/5etools/creatureStatBlock'
import type { Creature5e } from '@/types/5etools'

describe('5etools copy resolution', () => {
  test('inherits item metadata through chains and applies item array edits', () => {
    const result = resolveCopiedRecords(
      [
        {
          name: 'Base',
          source: 'A',
          type: 'W',
          wondrous: true,
          reqAttune: true,
          property: ['L'],
          entries: ['first'],
        },
        {
          name: 'Middle',
          source: 'B',
          _copy: {
            name: 'Base',
            source: 'A',
            _mod: { entries: { mode: 'appendArr', items: 'second' } },
          },
        },
        { name: 'Final', source: 'C', _copy: { name: 'Middle', source: 'B' } },
      ],
      'item',
    )
    expect(result.diagnostics).toEqual([])
    expect(result.records[2]).toMatchObject({
      wondrous: true,
      reqAttune: true,
      property: ['L'],
      entries: ['first', 'second'],
    })
  })

  test('inherits creature stats and applies action changes', () => {
    const result = resolveCopiedRecords(
      [
        {
          name: 'Kenku',
          source: 'MM',
          cr: '1/4',
          ac: [13],
          action: [{ name: 'Dagger', entries: ['The kenku attacks.'] }],
        },
        {
          name: 'Chukka',
          source: 'BGDIA',
          _copy: {
            name: 'Kenku',
            source: 'MM',
            _mod: {
              action: {
                mode: 'replaceArr',
                replace: 'Dagger',
                items: { name: 'Sword', entries: ['Chukka attacks.'] },
              },
            },
          },
        },
      ],
      'monster',
    )
    expect(result.diagnostics).toEqual([])
    expect(result.records[1]).toMatchObject({ cr: '1/4', ac: [13], action: [{ name: 'Sword' }] })
  })

  test('resolves copied templates before applying them to creatures', () => {
    const templates = [
      { name: 'Base Template', source: 'TEST', apply: { _root: { type: 'base' } } },
      {
        name: 'Derived Template',
        source: 'TEST',
        _copy: {
          name: 'Base Template',
          source: 'TEST',
          _mod: { 'apply._root': { mode: 'setProp', prop: 'type', value: 'derived' } },
        },
      },
    ]
    const result = resolveCopiedRecords(
      [
        { name: 'Base Creature', source: 'TEST', cr: '1' },
        {
          name: 'Templated Creature',
          source: 'TEST',
          _copy: {
            name: 'Base Creature',
            source: 'TEST',
            _templates: [{ name: 'Derived Template', source: 'TEST' }],
          },
        },
      ],
      'monster',
      templates,
    )

    expect(result.diagnostics).toEqual([])
    expect(result.records[1]).toMatchObject({ type: 'derived' })
  })

  test('applies copy modifications before template modifications on the same field', () => {
    const result = resolveCopiedRecords(
      [
        { name: 'Base', source: 'TEST', action: [{ name: 'First' }] },
        {
          name: 'Variant',
          source: 'TEST',
          _copy: {
            name: 'Base',
            source: 'TEST',
            _mod: {
              action: { mode: 'replaceArr', replace: 'First', items: { name: 'Second' } },
            },
            _templates: [{ name: 'Action Template', source: 'TEST' }],
          },
        },
      ],
      'monster',
      [
        {
          name: 'Action Template',
          source: 'TEST',
          apply: {
            _mod: {
              action: { mode: 'replaceArr', replace: 'Second', items: { name: 'Final' } },
            },
          },
        },
      ],
    )

    expect(result.diagnostics).toEqual([])
    expect(result.records[1]).toMatchObject({ action: [{ name: 'Final' }] })
  })

  test('adds spells to the named spellcasting block', () => {
    const result = resolveCopiedRecords(
      [
        {
          name: 'Mage',
          source: 'TEST',
          spellcasting: [
            { name: 'Innate Spellcasting', will: ['light'] },
            { name: 'Spellcasting', spells: { 1: { spells: ['shield'] } } },
          ],
        },
        {
          name: 'Archmage',
          source: 'TEST',
          _copy: {
            name: 'Mage',
            source: 'TEST',
            _mod: {
              spellcasting: {
                mode: 'addSpells',
                name: 'Spellcasting',
                spells: { 1: { spells: ['magic missile'] } },
              },
            },
          },
        },
      ],
      'monster',
    )

    expect(result.diagnostics).toEqual([])
    expect(result.records[1]).toMatchObject({
      spellcasting: [
        { name: 'Innate Spellcasting', will: ['light'] },
        { name: 'Spellcasting', spells: { 1: { spells: ['shield', 'magic missile'] } } },
      ],
    })
  })

  test('reports missing parents and cycles without inventing stats', () => {
    const result = resolveCopiedRecords(
      [
        { name: 'A', source: 'X', _copy: { name: 'B', source: 'X' } },
        { name: 'B', source: 'X', _copy: { name: 'A', source: 'X' } },
        { name: 'Missing', source: 'X', _copy: { name: 'Absent', source: 'X' } },
      ],
      'monster',
    )
    expect(result.diagnostics).toHaveLength(3)
    expect(result.records.every((record) => '_copy' in record)).toBe(true)
  })
})

const dataRoot = join(process.cwd(), 'data')
test.skipIf(!existsSync(join(dataRoot, 'bestiary', 'index.json')))(
  'external 5etools copy corpus',
  () => {
    const read = (file: string) => JSON.parse(readFileSync(join(dataRoot, file), 'utf8'))
    const items = [...read('items.json').item, ...read('items-base.json').baseitem]
    const resolvedItems = resolveCopiedRecords(items, 'item')
    const index = read('bestiary/index.json') as Record<string, string>
    const creatures = [...new Set(Object.values(index))].flatMap(
      (file) => read(`bestiary/${file}`).monster ?? [],
    )
    const templates = read('bestiary/template.json').monsterTemplate
    const resolvedCreatures = resolveCopiedRecords(creatures, 'monster', templates)
    expect(resolvedItems.diagnostics).toEqual([])
    expect(resolvedCreatures.diagnostics).toEqual([])
    const vessel = resolvedItems.records.find(
      (item) => item.name === 'Ascendant Dragon Vessel' && item.source === 'FTD',
    )
    expect(vessel).toMatchObject({ wondrous: true, reqAttune: true })
    const chukka = resolvedCreatures.records.find(
      (creature) => creature.name === 'Chukka' && creature.source === 'BGDIA',
    )
    const summary = buildCreatureChoiceSummary(chukka as Creature5e)
    expect(summary.challengeValue).toBe(0.25)
    expect(summary.armorClass).toBeTruthy()
    expect(summary.hitPoints).toBeTruthy()
    expect(summary.actions.length).toBeGreaterThan(0)
    expect(
      JSON.stringify(
        resolvedCreatures.records.filter(
          (creature) =>
            creatures.find((raw) => raw.name === creature.name && raw.source === creature.source)
              ?._copy,
        ),
      ),
    ).not.toContain('<$')
  },
)
