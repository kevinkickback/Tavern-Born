import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { getSubclassFeatureIdentity } from '@/lib/5etools/classFeatureIdentity'
import { CopyResolutionError, resolveCopiedRecords } from '@/lib/5etools/copyResolution'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { parseClassDocument, parseClasses, parseClassFeatures } from '@/lib/5etools/parsers/classes'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import {
  buildClassChoiceFeatureCatalogs,
  collectSubclassFeatures,
  getCharacterClassChoices,
  resolveClassChoiceOptions,
} from '@/lib/character/classChoiceOptions'
import { applyClassChoiceSelectionWithGrantsCommand } from '@/lib/character/commands/classChoiceCommands'
import { createEmptyCharacter } from '@/lib/character/createCharacter'
import { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import { validateClassChoices } from '@/lib/readiness/classReadiness'
import type { Class5e, ClassFeature } from '@/types/5etools'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeGameDataFixture } from '../../fixtures/gameDataFixtures'

const identityFields = [
  'name',
  'className',
  'classSource',
  'subclassShortName',
  'subclassSource',
  'level',
  'source',
] as const
const parent = {
  name: 'Training',
  className: 'Cleric',
  classSource: 'PHB',
  subclassShortName: 'Legacy',
  subclassSource: 'PHB',
  level: 1,
  source: 'PHB',
  entries: ['Parent rules'],
  page: 42,
  srd: true,
}
const target = (f: Record<string, unknown>) =>
  Object.fromEntries(identityFields.map((k) => [k, f[k]]))
const copy = () => ({
  ...target(parent),
  name: 'Training',
  source: 'PHB',
  classSource: 'XPHB',
  level: 3,
  _copy: { ...target(parent), _preserve: { page: true } },
})
const resolve = (rows: Array<{ name: string; source: string; [key: string]: unknown }>) =>
  resolveCopiedRecords(rows, 'subclassFeature')

function document() {
  const option = { ...parent, name: 'Option', entries: ['As an action, you inspire an ally.'] }
  const base = {
    ...parent,
    entries: [
      {
        type: 'options',
        count: 1,
        entries: [{ type: 'refSubclassFeature', subclassFeature: 'Option|Cleric||Legacy||1' }],
      },
    ],
  }
  return {
    class: [{ name: 'Cleric', source: 'XPHB', classFeatures: [] }],
    subclass: [
      {
        name: 'Legacy',
        shortName: 'Legacy',
        source: 'PHB',
        className: 'Cleric',
        classSource: 'XPHB',
        subclassFeatures: ['Training|Cleric|XPHB|Legacy||3'],
      },
    ],
    subclassFeature: [base, copy(), option],
    classFeature: [
      {
        name: 'Wrapper',
        source: 'XPHB',
        className: 'Cleric',
        classSource: 'XPHB',
        level: 3,
        entries: [
          { type: 'refSubclassFeature', subclassFeature: 'Training|Cleric|XPHB|Legacy||3' },
        ],
      },
    ],
  }
}

describe('subclass-feature copy materialization', () => {
  test('inherits bodies with local overrides/null removal/preservation and immutable repeat use', () => {
    const rows = [parent, { ...copy(), srd: null, note: 'local' }]
    const before = structuredClone(rows),
      result = resolve(rows)
    expect(result.diagnostics).toEqual([])
    expect(result.records[1]).toMatchObject({
      entries: ['Parent rules'],
      classSource: 'XPHB',
      level: 3,
      page: 42,
      note: 'local',
    })
    expect(result.records[1]).not.toHaveProperty('srd')
    expect(result.records[1]).not.toHaveProperty('_copy')
    expect(resolve(rows)).toEqual(result)
    expect(rows).toEqual(before)
    expect(resolve([parent, { ...copy(), _copy: target(parent) }]).records[1]).not.toHaveProperty(
      'page',
    )
  })
  test.each([
    ['name', 'Other'],
    ['className', 'Wizard'],
    ['classSource', 'XPHB'],
    ['subclassShortName', 'Other'],
    ['subclassSource', 'XPHB'],
    ['level', 2],
    ['source', 'XPHB'],
  ])('never substitutes a unique conflicting %s and restores the exact target', (field, value) => {
    const conflicting = { ...parent, [field]: value }
    const bad = resolve([conflicting, copy()])
    expect(bad.diagnostics.length).toBeGreaterThan(0)
    expect(bad.records[1]).toHaveProperty('_copy')
    const restored = resolve([conflicting, parent, copy()])
    expect(restored.diagnostics).toEqual([])
    expect(restored.records[2]).toMatchObject({ entries: ['Parent rules'] })
  })
  test.each([0, -1, 1.5, '1', undefined])('rejects malformed copied gain %j', (level) => {
    const bad = { ...copy(), level }
    expect(resolve([parent, bad]).diagnostics).not.toEqual([])
  })
  test.each([
    { className: '' },
    { classSource: 7 },
    { subclassShortName: '' },
    { subclassSource: 7 },
    { level: '1' },
    { level: 0 },
    { source: 7 },
  ])('rejects malformed parent fields: %j', (change) => {
    expect(
      resolve([parent, { ...copy(), _copy: { ...target(parent), ...change } }]).diagnostics,
    ).not.toEqual([])
  })
  test('retains established case, whitespace and PHB defaults without selected-owner fallback', () => {
    const p = { ...parent, classSource: undefined, subclassSource: undefined }
    const c = {
      ...copy(),
      _copy: { ...target(parent), name: ' TRAINING ', source: ' phb ', className: ' cleric ' },
    }
    expect(resolve([p, c]).diagnostics).toEqual([])
    expect(resolve([p, c]).records[1]).toMatchObject({
      classSource: 'XPHB',
      entries: ['Parent rules'],
    })
    expect(resolve([{ ...parent, source: 4 } as never, copy()]).diagnostics).not.toEqual([])
    expect(
      resolve([parent, { ...copy(), _copy: { ...target(parent), source: '' } }]).diagnostics,
    ).not.toEqual([])
  })
  test('uses structural fields for literal pipes instead of splitting a UID key', () => {
    const a = { ...parent, name: 'A|B', className: 'C', entries: ['correct'] }
    const b = { ...parent, name: 'A', className: 'B|C', entries: ['wrong'] }
    const c = { ...copy(), _copy: target(a) }
    expect(resolve([a, b, c]).records[2]).toMatchObject({ entries: ['correct'] })
  })
  test('rejects duplicate exact parents and preserves distinct duplicate copied own rows', () => {
    expect(resolve([parent, { ...parent }, copy()]).diagnostics).not.toEqual([])
    const a = copy(),
      b = { ...copy(), note: 'second' },
      rows = [parent, a, b]
    const r = resolve(rows)
    expect(r.diagnostics).toHaveLength(2)
    expect(r.records[1]).toBe(a)
    expect(r.records[2]).toBe(b)
  })
  test('resolves chains and rejects cycles without partial mutation', () => {
    const c = copy(),
      last = { ...copy(), name: 'Last', level: 5, _copy: target(c) }
    expect(resolve([last, c, parent]).records[0]).toMatchObject({
      entries: ['Parent rules'],
      level: 5,
    })
    const a = { ...copy(), name: 'A', _copy: { ...target(copy()), name: 'B' } },
      b = { ...copy(), name: 'B', _copy: { ...target(copy()), name: 'A' } }
    const rows = [a, b],
      before = structuredClone(rows),
      result = resolve(rows)
    expect(result.diagnostics.length).toBeGreaterThan(0)
    expect(result.records).toEqual(before)
    expect(rows).toEqual(before)
  })
  test.each([
    { _templates: [] },
    { _templates: [{ name: 'Ignored', source: 'PHB' }] },
    { _mod: { '*': { mode: 'appendArr', items: ['Wrong scope'] } } },
  ])('rejects unsupported feature transformations: %j', (directive) => {
    expect(
      resolve([parent, { ...copy(), _copy: { ...target(parent), ...directive } }]).diagnostics,
    ).not.toEqual([])
  })
  test('reuses explicit safe shared operations and rejects unsafe paths atomically', () => {
    const c = {
      ...copy(),
      _copy: { ...target(parent), _mod: { entries: { mode: 'appendArr', items: ['Added'] } } },
    }
    expect(resolve([parent, c]).records[1]).toMatchObject({ entries: ['Parent rules', 'Added'] })
    const unsafe = JSON.parse(
      '{"_mod":{"__proto__.copyFeatureMarker":{"mode":"setProp","value":true}}}',
    )
    expect(
      resolve([parent, { ...copy(), _copy: { ...target(parent), ...unsafe } }]).diagnostics,
    ).not.toEqual([])
    expect(Object.prototype).not.toHaveProperty('copyFeatureMarker')
  })
  test('prepares both parser projections before enrichment and fails direct callers on bad copies', () => {
    const raw = document(),
      before = structuredClone(raw),
      combined = parseClassDocument(raw)
    expect(combined).toEqual({ classes: parseClasses(raw), classFeatures: parseClassFeatures(raw) })
    const c = (combined.classes as Class5e[])[0],
      s = c.subclasses?.[0]
    expect(s?.subclassFeatureRefs?.[0].feature).toMatchObject({ classSource: 'XPHB', level: 3 })
    expect(collectSubclassFeatures(s).find((f) => f.name === 'Option')).toMatchObject({
      classSource: 'PHB',
      level: 1,
    })
    expect(JSON.stringify(combined.classFeatures)).toContain('inspire an ally')
    expect(raw).toEqual(before)
    const broken = { ...raw, subclassFeature: [copy()] }
    for (const parse of [parseClasses, parseClassFeatures, parseClassDocument])
      expect(() => parse(broken)).toThrow(CopyResolutionError)
  })
  test('controlled count-bearing copy follows readiness, exact command ownership, reopen and clear', () => {
    const parsed = parseClassDocument(document()),
      classes = parsed.classes as Class5e[],
      c = classes[0],
      s = c.subclasses?.[0]
    const data = makeGameDataFixture({
        classes,
        classFeatures: parsed.classFeatures as ClassFeature[],
      }),
      lookups = buildGameDataLookups(data)
    const catalogs = {
      ...buildClassChoiceFeatureCatalogs(data),
      creatures: [],
      feats: [],
      items: [],
      itemsBase: [],
      itemMasteries: [],
      optionalFeatures: [],
      itemPropertyByAbbr: {},
      itemTypeByAbbr: {},
      weaponProficiencies: [],
    }
    const choice = getCharacterClassChoices(c, s, false).find((x) => x.label === 'Training')!
    expect(choice).toMatchObject({ level: 3, owner: { source: 'XPHB' } })
    let character = createEmptyCharacter({
      name: 'Copy control',
      originSystem: '2024',
      allowedSources: ['PHB', 'XPHB'],
      classProgression: [
        { name: 'Cleric', source: 'XPHB', levels: 3, subclass: 'Legacy', subclassSource: 'PHB' },
      ],
      features: [{ id: 'other-owner', name: 'Kept', source: 'custom', description: 'Kept' }],
    })
    const issues = () =>
      validateClassChoices(
        character,
        createCharacterCalculationContext(character, lookups),
        catalogs,
      )
    expect(issues().some((i) => i.title === 'Finish Training')).toBe(true)
    const selected = resolveClassChoiceOptions(choice, catalogs, [], 3)[0]
    expect(selected).toMatchObject({
      availability: 'eligible',
      reference: { name: 'Option', source: 'PHB', ref: 'option|cleric|phb|legacy|phb|1|phb' },
    })
    const apply = (options: (typeof selected.reference)[]) => {
      const r = applyClassChoiceSelectionWithGrantsCommand(
        character,
        character.provenance,
        choice,
        options,
      )
      character = characterPersistenceSchema.parse({
        ...character,
        ...r.characterPatch,
        provenance: r.provenanceUpdate,
      })
    }
    apply([selected.reference])
    expect(issues().some((i) => i.title === 'Finish Training')).toBe(false)
    character = characterPersistenceSchema.parse(JSON.parse(JSON.stringify(character)))
    expect(character.classChoiceSelections?.[0]).toMatchObject({
      classSource: 'XPHB',
      selected: [{ ref: 'option|cleric|phb|legacy|phb|1|phb', source: 'PHB' }],
    })
    expect(
      createCharacterSheetViewModel(character, {
        ...lookups,
        classChoiceFeatureCatalogs: catalogs,
      }).actions.some((a) => a.name === 'Option'),
    ).toBe(true)
    apply([])
    expect(character.features).toContainEqual({
      id: 'other-owner',
      name: 'Kept',
      source: 'custom',
      description: 'Kept',
    })
    expect(issues().some((i) => i.title === 'Finish Training')).toBe(true)
  })
  test.skipIf(!existsSync(join(process.cwd(), 'data/class/index.json')))(
    'materializes all configured raw copies and actual Nature nested declarations',
    () => {
      const index = JSON.parse(readFileSync('data/class/index.json', 'utf8'))
      let copies = 0
      for (const file of new Set<string>(Object.values(index))) {
        const raw = JSON.parse(readFileSync(join('data/class', file), 'utf8')),
          rows = raw.subclassFeature ?? [],
          before = structuredClone(raw),
          r = resolve(rows)
        expect(r.diagnostics).toEqual([])
        for (const [i, f] of rows.entries())
          if (f._copy) {
            copies++
            expect(r.records[i]).not.toHaveProperty('_copy')
            expect(r.records[i].entries).toBeDefined()
            expect(getSubclassFeatureIdentity(r.records[i])).toBe(getSubclassFeatureIdentity(f))
          }
        if (file === 'class-cleric.json') {
          const c = (parseClasses(raw) as Class5e[]).find((c) => c.source === 'XPHB')!,
            s = c.subclasses?.find((s) => s.name === 'Nature Domain' && s.source === 'PHB')
          expect(
            collectSubclassFeatures(s).find((f) => f.name === 'Acolyte of Nature'),
          ).toMatchObject({ classSource: 'PHB', level: 1 })
          expect(JSON.stringify(s?.entries)).toContain('Nature Domain Spells')
        }
        expect(raw).toEqual(before)
      }
      expect(copies).toBeGreaterThan(0)
    },
  )
})
