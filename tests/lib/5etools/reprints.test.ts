import { describe, expect, test } from 'vitest'
import { composeGameDataLayers } from '@/lib/5etools/contentLayers'
import {
  buildSuppressedKeys,
  collectReprintableEntities,
  getSubclassReprintKey,
  hasAvailableReprintPair,
} from '@/lib/5etools/reprints'
import { makeGameDataFixture } from '../../fixtures/gameDataFixtures'

describe('5etools/reprints', () => {
  test('suppresses entity when direct reprint source is allowed', () => {
    const suppressed = buildSuppressedKeys(
      [
        {
          name: 'Legacy Race',
          source: 'PHB',
          reprintedAs: ['Legacy Race|XPHB'],
        },
        { name: 'Legacy Race', source: 'XPHB' },
      ],
      new Set(['PHB', 'XPHB']),
    )

    expect(suppressed.has('Legacy Race|PHB')).toBe(true)
  })

  test('does not suppress when reprint source is not allowed', () => {
    const suppressed = buildSuppressedKeys(
      [
        {
          name: 'Legacy Race',
          source: 'PHB',
          reprintedAs: ['Legacy Race|XPHB'],
        },
        { name: 'Legacy Race', source: 'XPHB' },
      ],
      new Set(['PHB']),
    )

    expect(suppressed.has('Legacy Race|PHB')).toBe(false)
  })

  test('suppresses transitive reprint chain', () => {
    const suppressed = buildSuppressedKeys(
      [
        {
          name: 'Feature',
          source: 'OLD',
          reprintedAs: ['Feature|MID'],
        },
        {
          name: 'Feature',
          source: 'MID',
          reprintedAs: ['Feature|NEW'],
        },
        { name: 'Feature', source: 'NEW' },
      ],
      new Set(['NEW']),
    )

    expect(suppressed.has('Feature|OLD')).toBe(true)
    expect(suppressed.has('Feature|MID')).toBe(true)
  })

  test('parses subclass-style reprint keys', () => {
    const data = makeGameDataFixture({
      classes: [
        {
          name: 'Artificer',
          source: 'XPHB',
          subclasses: [
            {
              name: 'Old Alchemist',
              shortName: 'Alchemist',
              source: 'EFA',
              className: 'Artificer',
              classSource: 'XPHB',
              reprintedAs: ['Alchemist|Artificer|XPHB|TCE'],
            },
            {
              name: 'New Alchemist',
              shortName: 'Alchemist',
              source: 'TCE',
              className: 'Artificer',
              classSource: 'XPHB',
            },
          ],
        },
      ],
    })
    const entities = collectReprintableEntities(data),
      oldKey = getSubclassReprintKey(data.classes[0].subclasses![0])!
    expect(buildSuppressedKeys(entities, new Set(['EFA', 'XPHB'])).has(oldKey)).toBe(false)
    expect(buildSuppressedKeys(entities, new Set(['EFA', 'TCE'])).has(oldKey)).toBe(true)
    expect(buildSuppressedKeys(entities, new Set(['EFA', 'TCE'])).has('Old Alchemist|EFA')).toBe(
      false,
    )
    expect(hasAvailableReprintPair(data, ['EFA', 'XPHB'])).toBe(false)
    expect(hasAvailableReprintPair(data, ['EFA', 'TCE'])).toBe(true)
  })

  test('missing or competing current targets do not suppress an old declaration', () => {
    const old = { name: 'Old', source: 'OLD', reprintedAs: ['New|NEW'] }
    expect(buildSuppressedKeys([old], new Set(['NEW']))).toEqual(new Set())
    expect(
      buildSuppressedKeys(
        [
          old,
          { name: 'New', source: 'NEW', reprintedAs: [] },
          { name: 'New', source: 'NEW', reprintedAs: ['Other|OTHER'] },
        ],
        new Set(['NEW']),
      ),
    ).toEqual(new Set())
  })

  test('cycles alone suppress nothing; real exits are order-independent and source casing is normalized', () => {
    const a = { name: 'A', source: 'OLD', reprintedAs: ['B|MID'] },
      b = { name: 'B', source: 'MID', reprintedAs: ['A|OLD'] },
      c = { name: 'C', source: 'NEW' }
    expect(buildSuppressedKeys([a, b], new Set(['OLD', 'MID']))).toEqual(new Set())
    const exit = { ...b, reprintedAs: [...b.reprintedAs, 'C|NEW'] }
    for (const rows of [
      [a, exit, c],
      [c, exit, a],
    ])
      expect(buildSuppressedKeys(rows, new Set([' new ']))).toEqual(new Set(['A|OLD', 'B|MID']))
  })

  test('reports an available preference only when both printings are usable', () => {
    const legacyRace = {
      name: 'Legacy Race',
      source: 'PHB',
      reprintedAs: ['Updated Race|XGE'],
    }
    const withoutTarget = makeGameDataFixture({ races: [legacyRace] })
    const withTarget = makeGameDataFixture({
      races: [legacyRace, { name: 'Updated Race', source: 'XGE' }],
    })

    expect(hasAvailableReprintPair(withoutTarget, ['PHB', 'XGE'])).toBe(false)
    expect(hasAvailableReprintPair(withTarget, ['PHB'])).toBe(false)
    expect(hasAvailableReprintPair(withTarget, ['PHB', 'XGE'])).toBe(true)
  })

  test('same-name subclass origins under different class printings remain separate from feature keys', () => {
    const old = {
      name: 'Knowledge Domain',
      shortName: 'Knowledge',
      source: 'PHB',
      className: 'Cleric',
      classSource: 'PHB',
      reprintedAs: ['Knowledge|Cleric|XPHB|FRHoF'],
    }
    const retained = { ...old, classSource: 'XPHB', reprintedAs: [] }
    const target = {
      name: 'Revised Knowledge Domain',
      shortName: 'Knowledge',
      source: 'FRHoF',
      className: 'Cleric',
      classSource: 'XPHB',
    }
    const data = makeGameDataFixture({
      classes: [
        { name: 'Cleric', source: 'PHB', subclasses: [old] },
        { name: 'Cleric', source: 'XPHB', subclasses: [retained, target] },
      ],
    })
    const suppressed = buildSuppressedKeys(
      collectReprintableEntities(data),
      new Set(['PHB', 'XPHB', 'FRHoF']),
    )
    expect(suppressed.has(getSubclassReprintKey(old)!)).toBe(true)
    expect(suppressed.has(getSubclassReprintKey(retained)!)).toBe(false)
    expect(suppressed.has('Knowledge Domain|PHB')).toBe(false)
  })

  test.each([
    0, 1, 2, 3,
  ])('a subclass target field %i conflict cannot borrow an otherwise unique loaded target', (field) => {
    const parts = ['Knowledge', 'Cleric', 'XPHB', 'FRHoF']
    parts[field] = 'Other'
    const old = {
      name: 'Knowledge Domain',
      shortName: 'Knowledge',
      source: 'PHB',
      className: 'Cleric',
      classSource: 'XPHB',
      reprintedAs: [parts.join('|')],
    }
    const target = {
      name: 'Revised Knowledge Domain',
      shortName: 'Knowledge',
      source: 'FRHoF',
      className: 'Cleric',
      classSource: 'XPHB',
    }
    const data = makeGameDataFixture({
      classes: [{ name: 'Cleric', source: 'XPHB', subclasses: [old, target] }],
    })
    expect(
      buildSuppressedKeys(collectReprintableEntities(data), new Set(['PHB', 'XPHB', 'FRHoF'])).has(
        getSubclassReprintKey(old)!,
      ),
    ).toBe(false)
  })

  test('competing current subclass targets cannot become unique through name translation', () => {
    const old = {
      name: 'Knowledge Domain',
      shortName: 'Knowledge',
      source: 'PHB',
      className: 'Cleric',
      classSource: 'XPHB',
      reprintedAs: ['Knowledge|Cleric|XPHB|FRHoF'],
    }
    const target = {
      name: 'Revised Knowledge Domain',
      shortName: 'Knowledge',
      source: 'FRHoF',
      className: 'Cleric',
      classSource: 'XPHB',
    }
    const data = makeGameDataFixture({
      classes: [
        {
          name: 'Cleric',
          source: 'XPHB',
          subclasses: [old, target, { ...target, name: 'Competing owner' }],
        },
      ],
    })
    expect(
      buildSuppressedKeys(collectReprintableEntities(data), new Set(['PHB', 'XPHB', 'FRHoF'])).has(
        getSubclassReprintKey(old)!,
      ),
    ).toBe(false)
    expect(hasAvailableReprintPair(data, ['PHB', 'XPHB', 'FRHoF'])).toBe(false)
  })

  test.each([
    'name',
    'printing',
    'duplicate',
  ] as const)('a target under a conflicting or duplicate enclosing parent rejects reprint authority: %s', (mode) => {
    const old = {
      name: 'Knowledge Domain',
      shortName: 'Knowledge',
      source: 'PHB',
      className: 'Cleric',
      classSource: 'XPHB',
      reprintedAs: ['Knowledge|Cleric|XPHB|FRHoF'],
    }
    const target = {
      name: 'Revised Knowledge',
      shortName: 'Knowledge',
      source: 'FRHoF',
      className: 'Cleric',
      classSource: 'XPHB',
    }
    const classes =
      mode === 'duplicate'
        ? [
            { name: 'Cleric', source: 'XPHB', subclasses: [old, target] },
            { name: 'Cleric', source: 'XPHB', subclasses: [] },
          ]
        : [
            { name: 'Cleric', source: 'XPHB', subclasses: [old] },
            {
              name: mode === 'name' ? 'Wizard' : 'Cleric',
              source: mode === 'printing' ? 'PHB' : 'XPHB',
              subclasses: [target],
            },
          ]
    const data = makeGameDataFixture({ classes })
    expect(
      buildSuppressedKeys(collectReprintableEntities(data), new Set(['PHB', 'XPHB', 'FRHoF'])).has(
        getSubclassReprintKey(old)!,
      ),
    ).toBe(false)
    expect(hasAvailableReprintPair(data, ['PHB', 'XPHB', 'FRHoF'])).toBe(false)
  })

  test.each([
    'equal',
    'different',
    'same-object',
  ] as const)('raw class-feature target ambiguity survives direct input and composition: %s', (mode) => {
    const old = {
      name: 'Signal',
      className: 'Bard',
      classSource: 'PHB',
      source: 'PHB',
      level: 1,
      entries: ['Old signal.'],
      reprintedAs: ['Signal|Bard||1|TCE'],
    }
    const target = { ...old, source: 'TCE', entries: ['New signal.'], reprintedAs: [] }
    const duplicate =
      mode === 'same-object'
        ? target
        : { ...target, entries: mode === 'different' ? ['Different rules.'] : target.entries }
    const base = makeGameDataFixture({ classFeatures: [old] })
    const conflict = makeGameDataFixture({ classFeatures: [target, duplicate] })
    const direct = makeGameDataFixture({ classFeatures: [old, target, duplicate] })
    const composed = composeGameDataLayers([base, conflict])
    for (const data of [direct, composed]) {
      expect(
        buildSuppressedKeys(collectReprintableEntities(data), new Set(['PHB', 'TCE'])),
      ).toEqual(new Set())
      expect(hasAvailableReprintPair(data, ['PHB', 'TCE'])).toBe(false)
    }
    const restored = composeGameDataLayers([
      composed,
      makeGameDataFixture({ classFeatures: [target] }),
    ])
    expect(
      buildSuppressedKeys(collectReprintableEntities(restored), new Set(['PHB', 'TCE'])),
    ).toEqual(new Set(['class-feature|signal|bard|phb|1|phb']))
    expect(hasAvailableReprintPair(restored, ['PHB', 'TCE'])).toBe(true)
  })
  test.each([
    'equal',
    'different',
    'same-object',
    'origin',
  ] as const)('raw class reprint uncertainty survives direct input and a winning identity Map: %s', (mode) => {
    const old = { name: 'Wizard', source: 'PHB', reprintedAs: ['Wizard|XPHB'] }
    const target = { name: 'Wizard', source: 'XPHB' }
    const provider = mode === 'origin' ? old : target
    const duplicate =
      mode === 'same-object'
        ? provider
        : { ...provider, ...(mode === 'different' ? { page: 99 } : {}) }
    const base = makeGameDataFixture({ classes: mode === 'origin' ? [target] : [old] })
    const conflict = makeGameDataFixture({ classes: [provider, duplicate] })
    const direct = makeGameDataFixture({ classes: [...base.classes, ...conflict.classes] })
    const composed = composeGameDataLayers([base, conflict])
    for (const data of [direct, composed]) {
      expect(
        buildSuppressedKeys(collectReprintableEntities(data), new Set(['PHB', 'XPHB'])),
      ).toEqual(new Set())
      expect(hasAvailableReprintPair(data, ['PHB', 'XPHB'])).toBe(false)
    }
    const restored = composeGameDataLayers([composed, makeGameDataFixture({ classes: [provider] })])
    expect(
      buildSuppressedKeys(collectReprintableEntities(restored), new Set(['PHB', 'XPHB'])),
    ).toEqual(new Set(['Wizard|PHB']))
  })

  test('an unavailable subclass short name is not guessed from its display name', () => {
    const old = {
      name: 'Knowledge Domain',
      shortName: 'Knowledge',
      source: 'PHB',
      className: 'Cleric',
      classSource: 'XPHB',
      reprintedAs: ['Knowledge|Cleric|XPHB|FRHoF'],
    }
    const target = { name: 'Knowledge', source: 'FRHoF', className: 'Cleric', classSource: 'XPHB' }
    const data = makeGameDataFixture({
      classes: [{ name: 'Cleric', source: 'XPHB', subclasses: [old, target as never] }],
    })
    expect(
      buildSuppressedKeys(collectReprintableEntities(data), new Set(['PHB', 'XPHB', 'FRHoF'])),
    ).toEqual(new Set())
    expect(hasAvailableReprintPair(data, ['PHB', 'XPHB', 'FRHoF'])).toBe(false)
  })
})
