import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { resolveCopiedRecords } from '@/lib/5etools/copyResolution'
import { buildCreatureChoiceSummary } from '@/lib/5etools/creatureStatBlock'
import type { Creature5e } from '@/types/5etools'

describe('5etools copy resolution', () => {
  test.each([
    'item',
    'monster',
    'race',
    'subrace',
  ] as const)('compares array additions structurally for %s copies', (kind) => {
    const retained = { name: 'Shared', entries: [{ type: 'entries', entries: ['One', 'Two'] }] }
    const reordered = { entries: [{ entries: ['One', 'Two'], type: 'entries' }], name: 'Shared' }
    const differentOrder = {
      name: 'Shared',
      entries: [{ type: 'entries', entries: ['Two', 'One'] }],
    }
    const records = [
      { name: 'Base', source: 'TEST', entries: [retained, null, '1'] },
      {
        name: 'Copy',
        source: 'TEST',
        _copy: {
          name: 'Base',
          source: 'TEST',
          _mod: {
            entries: {
              mode: 'appendIfNotExistsArr',
              items: [reordered, differentOrder, null, 1, { name: 'Shared' }],
            },
          },
        },
      },
    ]
    const before = structuredClone(records)
    const result = resolveCopiedRecords(records, kind)
    expect(result.diagnostics).toEqual([])
    expect(result.records[1].entries).toEqual([
      retained,
      null,
      '1',
      differentOrder,
      1,
      { name: 'Shared' },
    ])
    expect(records).toEqual(before)
  })

  test('ignores polluted non-reserved properties throughout copied working data', () => {
    const pollution = {
      spellcasting: [{ spells: { 1: { spells: ['old spell'] } } }],
      spells: { 1: { spells: ['old spell'] } },
      daily: { 1: ['old spell'] },
      senses: ['darkvision 120 ft.'],
      size: ['T'],
      cr: { xp: 100 },
      xp: 100,
      skill: { arcana: '+99' },
    }
    const before = structuredClone(pollution)
    const descriptors = Object.getOwnPropertyDescriptors(Object.prototype)
    try {
      for (const [field, value] of Object.entries(pollution))
        Object.defineProperty(Object.prototype, field, {
          configurable: true,
          value,
          writable: true,
        })
      const base = { name: 'Base', source: 'TEST', int: 10 }
      const inheritedCasting = {
        name: 'Inherited Casting',
        source: 'TEST',
        _copy: {
          name: base.name,
          source: base.source,
          _mod: { _: { mode: 'addSpells', spells: { 1: { spells: ['new spell'] } } } },
        },
      }
      const withoutCasting = resolveCopiedRecords([base, inheritedCasting], 'monster')
      expect(withoutCasting.records[1]).toBe(inheritedCasting)
      expect(withoutCasting.diagnostics[0].reason).toContain('spellcasting is missing')
      const ownCasting = { ...base, spellcasting: [{}], cr: { cr: '2' } }
      const records = [
        ownCasting,
        {
          name: 'Copy',
          source: 'TEST',
          _copy: {
            name: base.name,
            source: base.source,
            _mod: {
              _: [
                { mode: 'removeSpells', spells: { 1: ['old spell'] } },
                { mode: 'addSpells', daily: { 1: ['new spell'] } },
                { mode: 'addSenses', senses: [{ type: 'darkvision', range: 60 }] },
                { mode: 'addSkills', skills: { arcana: 1 } },
                { mode: 'maxSize', max: 'M' },
                { mode: 'scalarMultXp', scalar: 2 },
              ],
            },
          },
        },
      ]
      const recordsBefore = structuredClone(records)
      const result = resolveCopiedRecords(records, 'monster')
      expect(result.diagnostics).toEqual([])
      expect(result.records[1]).toMatchObject({
        senses: ['darkvision 60 ft.'],
        size: ['M'],
        skill: { arcana: '+2' },
        spellcasting: [{ daily: { 1: ['new spell'] } }],
      })
      const copiedCr = Object.getOwnPropertyDescriptor(result.records[1], 'cr')?.value
      expect(Object.getOwnPropertyDescriptor(copiedCr, 'xp')).toBeUndefined()
      expect(pollution).toEqual(before)
      expect(records).toEqual(recordsBefore)
    } finally {
      for (const field of Object.keys(pollution)) {
        const descriptor = Object.getOwnPropertyDescriptor(descriptors, field)?.value
        if (descriptor) Object.defineProperty(Object.prototype, field, descriptor)
        else Reflect.deleteProperty(Object.prototype, field)
      }
    }
    expect(Object.getOwnPropertyDescriptors(Object.prototype)).toEqual(descriptors)
  })

  test('does not treat an inherited copy directive as a copied record', () => {
    const descriptor = Object.getOwnPropertyDescriptor(Object.prototype, '_copy')
    const record = { name: 'Uncopied', source: 'TEST' }
    try {
      Object.defineProperty(Object.prototype, '_copy', {
        configurable: true,
        value: { name: 'Missing', source: 'TEST' },
      })
      expect(resolveCopiedRecords([record], 'item')).toEqual({ records: [record], diagnostics: [] })
    } finally {
      if (descriptor) Object.defineProperty(Object.prototype, '_copy', descriptor)
      else Reflect.deleteProperty(Object.prototype, '_copy')
    }
  })

  test.each([
    '__proto__',
    'constructor',
    'prototype',
  ])('rejects reserved %s segments across modification paths and payloads', (reserved) => {
    const marker = '__copySecurityMarker'
    const prototypeBefore = Object.getOwnPropertyDescriptors(Object.prototype)
    const unsafeObject = JSON.parse(`{"${reserved}":{"${marker}":"unsafe"}}`)
    const modifications = [
      { _: { mode: 'setProp', prop: `${reserved}.${marker}`, value: 'unsafe' } },
      { [`stats.${reserved}.${marker}`]: 'remove' },
      { [`stats.${reserved}`]: { mode: 'appendArr', items: 'unsafe' } },
      { [reserved]: { mode: 'setProp', prop: marker, value: 'unsafe' } },
      { stats: { mode: 'scalarAddProp', prop: reserved, scalar: 1 } },
      { stats: { mode: 'prefixSuffixStringProp', prop: reserved, prefix: 'unsafe' } },
      { entries: { mode: 'replaceTxt', props: [reserved], replace: 'old', with: 'new' } },
      { _: { mode: 'setProp', prop: 'stats', value: unsafeObject } },
      { spellcasting: { mode: 'addSpells', spells: { 1: unsafeObject } } },
      { spellcasting: { mode: 'replaceSpells', daily: unsafeObject } },
      { spellcasting: { mode: 'removeSpells', spells: unsafeObject } },
    ]
    for (const kind of ['item', 'monster'] as const) {
      for (const _mod of modifications) {
        const copy = { name: 'Copy', source: 'TEST', _copy: { name: 'Base', source: 'TEST', _mod } }
        const records = [
          {
            name: 'Base',
            source: 'TEST',
            stats: {},
            entries: ['old'],
            spellcasting: [{ spells: {} }],
          },
          copy,
        ]
        const before = structuredClone(records)
        const result = resolveCopiedRecords(records, kind)
        expect(result.diagnostics).toEqual([
          { entity: 'Copy|TEST', reason: expect.stringContaining('unsafe copy property') },
        ])
        expect(result.records[1]).toBe(copy)
        expect(records).toEqual(before)
        expect(Object.getOwnPropertyDescriptors(Object.prototype)).toEqual(prototypeBefore)
        expect(Object.getOwnPropertyDescriptor({}, marker)).toBeUndefined()
        expect(Reflect.get({}, marker)).toBeUndefined()
      }
    }
  })

  test('validates all operations before a malicious write followed by a failure', () => {
    const prototypeBefore = Object.getOwnPropertyDescriptors(Object.prototype)
    const copy = {
      name: 'Copy',
      source: 'TEST',
      _copy: {
        name: 'Base',
        source: 'TEST',
        _mod: {
          _: [
            { mode: 'setProp', prop: '__proto__.__copySecurityMarker', value: 'unsafe' },
            { mode: 'unsupported' },
          ],
        },
      },
    }
    const result = resolveCopiedRecords([{ name: 'Base', source: 'TEST' }, copy], 'item')
    expect(result.records[1]).toBe(copy)
    expect(result.diagnostics[0].reason).toContain('unsafe copy property')
    expect(Object.getOwnPropertyDescriptors(Object.prototype)).toEqual(prototypeBefore)
  })

  test.each([
    '__proto__',
    'constructor',
    'prototype',
  ])('rejects unsafe %s parent keys and variable-expanded property selectors', (reserved) => {
    const prototypeBefore = Object.getOwnPropertyDescriptors(Object.prototype)
    const parent = JSON.parse(
      `{"name":"Base","source":"TEST","${reserved}":{"__copySecurityMarker":"unsafe"}}`,
    )
    const copy = { name: 'Copy', source: 'TEST', _copy: { name: 'Base', source: 'TEST' } }
    const inherited = resolveCopiedRecords([parent, copy], 'item')
    expect(inherited.records[1]).toBe(copy)
    expect(inherited.diagnostics[0].reason).toContain('unsafe copy property')
    const variableCopy = {
      name: reserved,
      source: 'TEST',
      _copy: {
        name: 'Base',
        source: 'TEST',
        _mod: {
          _: { mode: 'setProp', prop: '<$name$>.__copySecurityMarker', value: 'unsafe' },
        },
      },
    }
    const expanded = resolveCopiedRecords(
      [{ name: 'Base', source: 'TEST' }, variableCopy],
      'monster',
    )
    expect(expanded.records[1]).toBe(variableCopy)
    expect(expanded.diagnostics[0].reason).toContain('unsafe copy property')
    expect(Object.getOwnPropertyDescriptors(Object.prototype)).toEqual(prototypeBefore)
  })

  test.each([
    '__proto__',
    'constructor',
    'prototype',
  ])('rejects unsafe %s template roots, modifications, and copied templates', (reserved) => {
    const prototypeBefore = Object.getOwnPropertyDescriptors(Object.prototype)
    const unsafeRoot = JSON.parse(`{"${reserved}":{"__copySecurityMarker":"unsafe"}}`)
    const applyCases = [
      { _root: unsafeRoot },
      {
        _mod: { _: { mode: 'setProp', prop: `${reserved}.__copySecurityMarker`, value: 'unsafe' } },
      },
    ]
    for (const apply of applyCases) {
      const records = [
        { name: 'Base', source: 'TEST' },
        {
          name: 'Copy',
          source: 'TEST',
          _copy: {
            name: 'Base',
            source: 'TEST',
            _templates: [{ name: 'Template', source: 'TEST' }],
          },
        },
      ]
      const result = resolveCopiedRecords(records, 'monster', [
        { name: 'Template', source: 'TEST', apply },
      ])
      expect(result.records[1]).toBe(records[1])
      expect(result.diagnostics[0].reason).toContain('unsafe copy property')
    }
    const result = resolveCopiedRecords(
      [
        { name: 'Base Template', source: 'TEST', apply: {} },
        {
          name: 'Copy Template',
          source: 'TEST',
          _copy: {
            name: 'Base Template',
            source: 'TEST',
            _mod: {
              'apply._root': {
                mode: 'setProp',
                prop: `${reserved}.__copySecurityMarker`,
                value: 'unsafe',
              },
            },
          },
        },
      ],
      'monster',
    )
    expect(result.diagnostics[0].reason).toContain('unsafe copy property')
    expect(Object.getOwnPropertyDescriptors(Object.prototype)).toEqual(prototypeBefore)
  })

  test('reads and writes only own properties, including inherited built-in names', () => {
    const result = resolveCopiedRecords(
      [
        { name: 'Base', source: 'TEST' },
        {
          name: 'Copy',
          source: 'TEST',
          _copy: {
            name: 'Base',
            source: 'TEST',
            _mod: {
              toString: { mode: 'appendArr', items: 'own entry' },
              _: { mode: 'setProp', prop: 'valueOf.nested', value: 'own value' },
              'hasOwnProperty.nested': 'remove',
            },
          },
        },
      ],
      'item',
    )
    expect(result.diagnostics).toEqual([])
    expect(result.records[1]).toMatchObject({
      toString: ['own entry'],
      valueOf: { nested: 'own value' },
    })
    expect(Object.getOwnPropertyDescriptor(Object.prototype.valueOf, 'nested')).toBeUndefined()
  })

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
        { name: 'Malformed', source: 'X', _copy: { source: 'X' } },
      ],
      'monster',
    )
    expect(result.diagnostics).toHaveLength(4)
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        entity: 'Malformed|X',
        reason: expect.stringContaining('invalid parent reference'),
      }),
    )
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
