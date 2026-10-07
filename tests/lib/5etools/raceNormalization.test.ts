import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test, vi } from 'vitest'
import { composeGameDataLayers } from '@/lib/5etools/contentLayers'
import { FiveEToolsDataLoader } from '@/lib/5etools/dataLoader'
import { parseRaces } from '@/lib/5etools/parsers/races'
import { getRaceAbilityData } from '@/lib/calculations/abilityScores'
import { normalizeRaceMovement } from '@/lib/calculations/movement'
import { mergeRaceWithSubrace } from '@/lib/calculations/raceUtils'
import type { Race5e } from '@/types/5etools'

const base: Race5e = {
  name: 'Test Race',
  source: 'PHB',
  speed: { walk: 30 },
  ability: [{ dex: 2 }],
  darkvision: 60,
  skillProficiencies: [{ perception: true }],
  resist: ['fire'],
  entries: [
    { name: 'Old', entries: ['Old rule'] },
    { name: 'Removed', entries: ['Removed rule'] },
  ],
}

function parse(data: unknown): Race5e[] {
  return parseRaces(data) as Race5e[]
}

function loader(race: unknown[], subrace: unknown[] = []): FiveEToolsDataLoader {
  return new FiveEToolsDataLoader(
    { type: 'local', path: 'test', isValid: true, availableResources: ['races.json'] },
    {
      type: 'local',
      readJson: async () => ({ race, subrace }),
    },
  )
}

describe('race copy and version normalization', () => {
  test.each([
    undefined,
    null,
    '',
    '   ',
    7,
  ])('reports a required diagnostic for subraces with absent parent names: %j', async (raceName) => {
    const child = { name: 'Unattached', source: 'PHB', raceName }
    const input = { race: [base], subrace: [child] }
    const before = structuredClone(input)
    expect(() => parse(input)).toThrow(/missing parent race identity/)
    const onResourceFailure = vi.fn()
    await expect(loader([base], [child]).loadAllData({ onResourceFailure })).rejects.toThrow(
      /missing parent race identity/,
    )
    expect(onResourceFailure).toHaveBeenCalledWith('Copied entity: Unattached|PHB', {
      required: true,
    })
    const incomplete = await loader([base], [child]).loadAllData({
      deferCopyResolutionErrors: true,
    })
    expect(() => composeGameDataLayers([incomplete])).toThrow(/missing parent race identity/)
    expect(input).toEqual(before)
  })

  test.each([
    'race',
    'subrace',
  ])('does not double reordered ability bonuses in %s versions', (kind) => {
    const parent = { ...base, ability: [{ dex: 2, con: 1 }] }
    const version = {
      name: 'Test Race; Variant',
      _mod: { ability: { mode: 'appendIfNotExistsArr', items: { con: 1, dex: 2 } } },
    }
    const input =
      kind === 'race'
        ? { race: [{ ...parent, _versions: [version] }] }
        : {
            race: [parent],
            subrace: [
              {
                name: 'Family',
                source: 'HB',
                raceName: base.name,
                raceSource: base.source,
                _versions: [version],
              },
            ],
          }
    const before = structuredClone(input)
    const race = parse(input)[0]
    const resolved = race.subraces?.find((entry) => entry._isVersion)
    expect(resolved?.ability).toEqual([{ dex: 2, con: 1 }])
    expect(getRaceAbilityData(race, resolved).fixed).toEqual([
      { ability: 'dexterity', value: 2, source: 'subrace' },
      { ability: 'constitution', value: 1, source: 'subrace' },
    ])
    expect(input).toEqual(before)
  })

  test.each(['race', 'subrace'])('does not duplicate reordered traits in %s versions', (kind) => {
    const trait = { name: 'Shared Trait', entries: [{ type: 'entries', entries: ['Once'] }] }
    const version = {
      name: 'Test Race; Variant',
      _mod: {
        entries: {
          mode: 'appendIfNotExistsArr',
          items: { entries: [{ entries: ['Once'], type: 'entries' }], name: 'Shared Trait' },
        },
      },
    }
    const input =
      kind === 'race'
        ? { race: [{ ...base, entries: [trait], _versions: [version] }] }
        : {
            race: [{ ...base, entries: [trait] }],
            subrace: [
              {
                name: 'Family',
                source: 'HB',
                raceName: base.name,
                raceSource: base.source,
                _versions: [version],
              },
            ],
          }
    const before = structuredClone(input)
    const resolved = parse(input)[0].subraces?.find((entry) => entry._isVersion)
    expect(resolved?.entries).toEqual([trait])
    expect(input).toEqual(before)
  })

  test('attaches subraces to their exact printing, with case-insensitive identity', () => {
    const races = parse({
      race: [base, { ...base, source: 'XPHB' }],
      subrace: [{ name: 'Legacy', source: 'HB', raceName: 'test race', raceSource: 'phb' }],
    })
    expect(races[0].subraces?.map((subrace) => subrace.name)).toEqual(['Legacy'])
    expect(races[1].subraces).toBeUndefined()
    expect(() =>
      parse({
        race: [base],
        subrace: [
          { name: 'Wrong Printing', source: 'HB', raceName: base.name, raceSource: 'XPHB' },
        ],
      }),
    ).toThrow(/missing parent race/)
  })
  test('applies ordered version array operations, including a multi-entry replacement and append-at-end', () => {
    const payload = {
      race: [
        {
          ...base,
          _versions: [
            {
              name: 'Test Race; Changed',
              source: 'HB',
              _mod: {
                entries: [
                  { mode: 'prependArr', items: 'First' },
                  {
                    mode: 'replaceArr',
                    replace: 'Old',
                    items: [{ name: 'New One' }, { name: 'New Two' }],
                  },
                  { mode: 'insertArr', index: 2, items: 'Middle' },
                  { mode: 'removeArr', names: ['Removed'] },
                  { mode: 'appendArr', items: 'Last' },
                  { mode: 'insertArr', index: -1, items: 'Very Last' },
                ],
                'rules.notes': { mode: 'appendArr', items: 'Nested rule' },
                _: [
                  { mode: 'setProp', prop: 'speed.walk', value: 40 },
                  { mode: 'prefixSuffixStringProp', prop: 'name', suffix: ' Variant' },
                ],
              },
            },
          ],
        },
      ],
    }
    const before = structuredClone(payload)
    const version = parse(payload)[0].subraces?.[0]
    expect(version).toMatchObject({
      name: 'Changed Variant',
      source: 'HB',
      speed: { walk: 40 },
      ability: [{ dex: 2 }],
      rules: { notes: ['Nested rule'] },
    })
    expect(version?.entries).toEqual([
      'First',
      { name: 'New One' },
      'Middle',
      { name: 'New Two' },
      'Last',
      'Very Last',
    ])
    expect(version?._copy).toBeUndefined()
    expect(version?._mod).toBeUndefined()
    expect(payload).toEqual(before)
  })

  test('substitutes templates and applies implementation overrides before modifications', () => {
    const payload = {
      race: [
        {
          ...base,
          _versions: [
            {
              _abstract: {
                name: 'Test Race ({{variant-name}})',
                source: 'HB',
                _mod: {
                  entries: { mode: 'appendArr', items: 'Rule for {{variant-name}}' },
                },
              },
              _implementations: [
                { _variables: { 'variant-name': 'First' }, entries: ['Own rule'] },
                {
                  _variables: { 'variant-name': 'Second' },
                  _copy: {
                    _preserve: { '*': true },
                    _mod: { entries: { mode: 'appendArr', items: 'Replacement operation' } },
                  },
                },
              ],
            },
          ],
        },
      ],
    }
    const before = structuredClone(payload)
    const versions = parse(payload)[0].subraces
    expect(versions?.[0].entries).toEqual(['Own rule', 'Rule for First'])
    expect(versions?.[1].entries).toEqual([...(base.entries ?? []), 'Replacement operation'])
    expect(versions?.map((version) => version.name)).toEqual(['First', 'Second'])
    expect(payload).toEqual(before)
  })

  test('versions are complete records so selection neither doubles abilities nor restores removed traits', () => {
    const parent = parse({
      race: [
        {
          ...base,
          _versions: [
            {
              name: 'Test Race; Changed',
              darkvision: null,
              skillProficiencies: null,
              resist: null,
              _mod: { _: { mode: 'setProp', prop: 'speed.walk', value: 35 } },
            },
          ],
        },
      ],
    })[0]
    const version = parent.subraces?.[0] as Race5e
    const selected = mergeRaceWithSubrace(parent, version)
    expect(selected).toMatchObject({ speed: { walk: 35 }, ability: [{ dex: 2 }], source: 'PHB' })
    for (const field of [
      'darkvision',
      'skillProficiencies',
      'resist',
      '_versions',
      '_copy',
      'subraces',
    ])
      expect(selected).not.toHaveProperty(field)
    expect(selected.entries).toEqual(base.entries)
    expect(getRaceAbilityData(parent, version).fixed).toEqual([
      { ability: 'dexterity', value: 2, source: 'subrace' },
    ])
  })

  test('an explicitly removed speed stays absent even when movement is derived from raw selection inputs', () => {
    const parent = parse({
      race: [{ ...base, _versions: [{ name: 'Test Race; Stationary', speed: null }] }],
    })[0]
    expect(normalizeRaceMovement(parent, parent.subraces?.[0]).speeds).toEqual({})
  })

  test('modifications traverse list positions and nested entry arrays without dropping edits', () => {
    const payload = {
      race: [
        {
          ...base,
          entries: [
            { name: 'Old', entries: ['Old rule'], metrics: [1, 2] },
            { name: 'Removed', entries: ['Removed rule'] },
          ],
          _versions: [
            {
              name: 'Test Race; Nested',
              _mod: {
                'entries.0.entries': { mode: 'appendArr', items: 'Nested addition' },
                'entries.1.entries': 'remove',
                'entries.0.metrics': { mode: 'scalarMultProp', prop: '*', scalar: 2 },
                _: { mode: 'setProp', prop: 'entries.0.name', value: 'Changed name' },
              },
            },
          ],
        },
      ],
    }
    const before = structuredClone(payload)
    expect(parse(payload)[0].subraces?.[0].entries).toEqual([
      { name: 'Changed name', entries: ['Old rule', 'Nested addition'], metrics: [2, 4] },
      { name: 'Removed' },
    ])
    expect(payload).toEqual(before)
  })

  test('rejects a subrace with an unavailable parent after final normalization', () => {
    expect(() =>
      parse({
        subrace: [{ name: 'Orphan', source: 'HB', raceName: 'Missing', raceSource: 'PHB' }],
      }),
    ).toThrow(/missing parent race/)
  })

  test('resolves chains and expands versions from the copied race, preserving source-qualified identity', () => {
    const payload = {
      race: [
        { ...base, source: 'OTHER', speed: 99 },
        base,
        {
          name: 'First Copy',
          source: 'HB',
          _copy: {
            name: base.name,
            source: 'PHB',
            _mod: { entries: { mode: 'appendArr', items: 'First copy rule' } },
          },
        },
        {
          name: 'Second Copy',
          source: 'HB',
          _copy: { name: 'First Copy', source: 'HB' },
          _versions: [
            {
              name: 'Second Copy; Lineage',
              _mod: { entries: { mode: 'appendArr', items: 'Lineage rule' } },
            },
          ],
        },
      ],
    }
    const before = structuredClone(payload)
    const child = parse(payload)[3]
    expect(child).toMatchObject({ source: 'HB', speed: { walk: 30 }, ability: [{ dex: 2 }] })
    expect(child.entries).toEqual([...(base.entries ?? []), 'First copy rule'])
    expect(child.subraces?.[0].entries).toEqual([
      ...(base.entries ?? []),
      'First copy rule',
      'Lineage rule',
    ])
    expect(child._copy).toBeUndefined()
    expect(child._versions).toBeUndefined()
    expect(payload).toEqual(before)
  })

  test('resolves copied subraces using their full parent-qualified identity', () => {
    const payload = {
      race: [base, { name: 'Other Race', source: 'PHB' }],
      subrace: [
        {
          name: 'Variant',
          source: 'PHB',
          raceName: 'Test Race',
          raceSource: 'PHB',
          feats: [{ any: 1 }],
          entries: ['Correct parent'],
        },
        {
          name: 'Variant',
          source: 'PHB',
          raceName: 'Other Race',
          raceSource: 'PHB',
          feats: [{ any: 9 }],
          entries: ['Wrong parent'],
        },
        {
          name: 'Copied',
          source: 'HB',
          _copy: {
            name: 'Variant',
            source: 'PHB',
            raceName: 'Test Race',
            raceSource: 'PHB',
            _mod: { entries: { mode: 'appendArr', items: 'Copied rule' } },
          },
        },
      ],
    }
    const copied = parse(payload)[0].subraces?.[1]
    expect(copied).toMatchObject({
      name: 'Copied',
      source: 'HB',
      feats: [{ any: 1 }],
      entries: ['Correct parent', 'Copied rule'],
    })
    expect(copied?._copy).toBeUndefined()
  })

  test.each([
    { _copy: { name: 'Missing', source: 'PHB' } },
    { _copy: { name: base.name, source: 'PHB' } },
    { _versions: [{ name: 'Changed', _mod: { entries: { mode: 'unsupported' } } }] },
    {
      _versions: [
        {
          name: 'Changed',
          _mod: { entries: { mode: 'replaceArr', replace: 'Missing', items: 'Replacement' } },
        },
      ],
    },
    { _versions: [{ _abstract: { name: '{{missing}}' }, _implementations: [{}] }] },
    { _versions: [{ _abstract: { name: 'Changed' }, _implementations: [{ _copy: null }] }] },
  ])('rejects invalid parents, cycles, and version directives without mutating input: %j', (change) => {
    const payload = { race: [{ ...base, ...change }] }
    const before = structuredClone(payload)
    expect(() => parse(payload)).toThrow(/Unable to resolve/)
    expect(payload).toEqual(before)
  })

  test('reports unsupported versions as required loader failures', async () => {
    const onResourceFailure = vi.fn()
    const source = loader([
      { ...base, _versions: [{ name: 'Changed', _mod: { entries: { mode: 'unsupported' } } }] },
    ])
    await expect(source.loadAllData({ onResourceFailure })).rejects.toThrow(/unsupported _mod mode/)
    expect(onResourceFailure).toHaveBeenCalledWith('Copied entity: Test Race|PHB/_versions[0]', {
      required: true,
    })
  })

  test('resolves deferred parents and unattached subraces after loading both layers', async () => {
    const original = {
      race: [base],
      subrace: [
        {
          name: 'Variant',
          source: 'PHB',
          raceName: base.name,
          raceSource: base.source,
          feats: [{ any: 1 }],
        },
      ],
    }
    const additional = {
      race: [
        {
          name: 'Copied Race',
          source: 'HB',
          _copy: { name: base.name, source: base.source },
          _versions: [
            {
              name: 'Copied Race; Lineage',
              source: 'LINEAGE',
              _mod: { entries: { mode: 'appendArr', items: 'Lineage rule' } },
            },
          ],
        },
      ],
      subrace: [
        {
          name: 'Copied Subrace',
          source: 'HB',
          _copy: { name: 'Variant', source: 'PHB', raceName: base.name, raceSource: base.source },
        },
      ],
    }
    const layers = await Promise.all([
      loader(original.race, original.subrace).loadAllData({ deferCopyResolutionErrors: true }),
      loader(additional.race, additional.subrace).loadAllData({ deferCopyResolutionErrors: true }),
    ])
    const composed = composeGameDataLayers(layers)
    expect(composed.races[1].subraces?.[0].entries).toEqual([
      ...(base.entries ?? []),
      'Lineage rule',
    ])
    expect(composed.sources).toContainEqual(expect.objectContaining({ abbreviation: 'LINEAGE' }))
    expect(composed.races[0].subraces?.[1]).toMatchObject({
      name: 'Copied Subrace',
      feats: [{ any: 1 }],
    })
    expect(() => composeGameDataLayers([layers[1]])).toThrow(/missing parent/)
  })

  test('rebuilds already-resolved copies and versions from the winning raw parent, including repeated composition', async () => {
    const original = await loader([
      base,
      {
        name: 'Copied Race',
        source: 'HB',
        _copy: { name: base.name, source: base.source },
        _versions: [{ name: 'Copied Race; Lineage' }],
      },
    ]).loadAllData()
    const update = await loader([{ ...base, speed: 45 }]).loadAllData()
    const nextUpdate = await loader([{ ...base, speed: 50 }]).loadAllData()
    const composed = composeGameDataLayers([original, update])
    expect(composed.races[1]).toMatchObject({ speed: 45, subraces: [{ speed: 45 }] })
    expect(composeGameDataLayers([composed, nextUpdate]).races[1]).toMatchObject({
      speed: 50,
      subraces: [{ speed: 50 }],
    })
    expect(original.races[1].speed).toEqual({ walk: 30 })
  })
})

const corpusPath = join(process.cwd(), 'data/races.json')
describe.runIf(existsSync(corpusPath))('external race corpus', () => {
  test('materializes real copies, copied subraces, appended rules, and null removals without modifying the corpus', () => {
    const raw = JSON.parse(readFileSync(corpusPath, 'utf8'))
    const before = structuredClone(raw)
    const races = parse(raw)
    expect(races.find((race) => race.name === 'Boggart' && race.source === 'LFL')).toMatchObject({
      speed: 30,
      darkvision: 60,
    })
    const gifted = races
      .find((race) => race.name === 'Aetherborn' && race.source === 'PSK')
      ?.subraces?.find((version) => version.name === 'Gifted Aetherborn')
    expect(gifted?.entries).toContainEqual(expect.objectContaining({ name: 'Drain Life' }))
    const skillLineage = races
      .find((race) => race.name === 'Custom Lineage' && race.source === 'TCE')
      ?.subraces?.find((version) => version.name === 'Skill Proficiency')
    expect(skillLineage).not.toHaveProperty('darkvision')
    const human = races.find((race) => race.name === 'Human' && race.source === 'PHB')
    expect(human?.subraces?.find((subrace) => subrace.name === 'Amonkhet')).toHaveProperty('feats')
    for (const race of races) {
      expect(race).not.toHaveProperty('_copy')
      expect(race).not.toHaveProperty('_versions')
      for (const subrace of race.subraces ?? []) expect(subrace).not.toHaveProperty('_copy')
    }
    expect(raw).toEqual(before)
  })
})
