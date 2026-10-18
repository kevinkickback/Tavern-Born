import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { normalizeSubclassRules } from '@/lib/5etools/classChoiceNormalization'
import {
  decodeSubclassFeatureReference,
  getSubclassFeatureIdentity,
} from '@/lib/5etools/classFeatureIdentity'
import {
  decodeFeatureOptionReference,
  getFeatureOptionKey,
} from '@/lib/5etools/featureOptionIdentity'
import {
  DRAGON_ANCESTOR_REF,
  getFeatureTableDefinition,
  resolveFeatureTableDefinition,
} from '@/lib/5etools/featureTableOptions'
import { parseClasses } from '@/lib/5etools/parsers/classes'
import { applyClassChoiceSelectionCommand } from '@/lib/character/commands/classChoiceCommands'
import type { Class5e, ClassFeature } from '@/types/5etools'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../../fixtures/characterFixtures'
import {
  dragonEntries,
  dragonSetupDocument,
  subclassSetupRef,
} from '../../fixtures/requiredSetupFixtures'

const expected = [
  ['Black', 'Acid'],
  ['Blue', 'Lightning'],
  ['Brass', 'Fire'],
  ['Bronze', 'Lightning'],
  ['Copper', 'Acid'],
  ['Gold', 'Fire'],
  ['Green', 'Poison'],
  ['Red', 'Fire'],
  ['Silver', 'Cold'],
  ['White', 'Cold'],
]
const bundled = JSON.parse(
  readFileSync('resources/srd/core/data/class/class-sorcerer.json', 'utf8'),
)
const sourceFeature = bundled.subclassFeature.find(
  (feature: ClassFeature) => feature.name === 'Dragon Ancestor' && feature.source === 'PHB',
) as ClassFeature
const rules = (feature: ClassFeature | undefined) =>
  normalizeSubclassRules(
    { name: 'Sorcerer', source: 'PHB' },
    { name: 'Draconic Bloodline', source: 'PHB' },
    [{ ...decodeSubclassFeatureReference(DRAGON_ANCESTOR_REF), feature }],
  )

describe('source-backed feature table options', () => {
  test('production bundled parser derives all ten actual tagged source rows and one required choice', () => {
    const classes = parseClasses(bundled) as Class5e[]
    const subclass = classes
      .find((row) => row.source === 'PHB')!
      .subclasses!.find((row) => row.source === 'PHB' && row.shortName === 'Draconic')!
    const choice = subclass.normalizedRules!.choices.find((row) => row.kind === 'feature-option')!
    expect(choice).toMatchObject({
      label: 'Dragon Ancestor',
      level: 1,
      minimumSelections: 1,
      maximumSelections: 1,
    })
    expect(choice.options.map((option) => option.name)).toEqual(expected.map(([name]) => name))
    expect(
      getFeatureTableDefinition(sourceFeature)!.rows.map((row) => [row.name, row.damageType]),
    ).toEqual(expected)
    expect(subclass.normalizedRules!.choiceDiagnostics).toEqual([])
  })

  test.runIf(existsSync('data/class/class-sorcerer.json'))(
    'configured production parser retains copied PHB target at enclosing XPHB gain3',
    () => {
      const classes = parseClasses(
        JSON.parse(readFileSync('data/class/class-sorcerer.json', 'utf8')),
      ) as Class5e[]
      for (const [source, level] of [
        ['PHB', 1],
        ['XPHB', 3],
      ] as const) {
        const subclass = classes
          .find((row) => row.source === source)!
          .subclasses!.find((row) => row.source === 'PHB' && row.shortName === 'Draconic')!
        const choice = subclass.normalizedRules!.choices.find(
          (row) => row.kind === 'feature-option',
        )!
        expect(choice.level).toBe(level)
        expect(choice.owner.source).toBe(source)
        expect(choice.options).toHaveLength(10)
        expect(decodeFeatureOptionReference(choice.options[7])).toMatchObject({
          parentRef: 'dragon ancestor|sorcerer|phb|draconic|phb|1|phb',
          table: 'draconic ancestry',
          row: 'red',
        })
        expect(choice.selectionCountByLevel[level - 1]).toBe(1)
        expect(choice.selectionCountByLevel.slice(0, level - 1).every((count) => count === 0)).toBe(
          true,
        )
      }
    },
  )

  test.each([
    'name',
    'className',
    'classSource',
    'subclassShortName',
    'subclassSource',
    'level',
    'source',
  ] as const)('a conflicting resolved parent %s cannot supply an ancestry table', (field) => {
    const feature = structuredClone(sourceFeature)
    Object.assign(feature, { [field]: field === 'level' ? 2 : 'Other' })
    expect(rules(feature).choices).toEqual([])
    expect(rules(feature).choiceDiagnostics).toMatchObject([{ code: 'unverified-required-choice' }])
  })

  test.each([
    'empty',
    'sparse',
    'duplicate row',
    'duplicate table',
    'bad cell',
    'conflicting filter',
  ] as const)('rejects the complete %s table rather than silently dropping malformed source rows', (kind) => {
    const feature = structuredClone(sourceFeature)
    const table = feature.entries!.find(
      (row) => typeof row === 'object' && row && (row as { type?: string }).type === 'table',
    ) as { rows: unknown[][] }
    if (kind === 'empty') table.rows = []
    if (kind === 'sparse') delete table.rows[0]
    if (kind === 'duplicate row') table.rows.push([' black ', 'Acid'])
    if (kind === 'duplicate table') feature.entries!.push(structuredClone(table))
    if (kind === 'bad cell') table.rows[0][1] = 'Fire or Cold'
    if (kind === 'conflicting filter')
      table.rows[0][1] = '{@filter Fire|spells|damage type=acid|class=sorcerer}'
    expect(getFeatureTableDefinition(feature)).toBeUndefined()
    expect(rules(feature).choices).toEqual([])
    expect(rules(feature).choiceDiagnostics).toMatchObject([{ code: 'unverified-required-choice' }])
  })

  test('ordinary tables and another requested parent do not create a guessed choice', () => {
    const feature = { ...sourceFeature, name: 'Presentation' }
    const reference = subclassSetupRef('Presentation|Sorcerer||Draconic||1', feature.entries!)
    const normalized = normalizeSubclassRules(
      { name: 'Sorcerer', source: 'PHB' },
      { name: 'Draconic Bloodline', source: 'PHB' },
      [reference],
    )
    expect(normalized.choices).toEqual([])
    expect(normalized.choiceDiagnostics).toEqual([])
  })

  test('the same producer or equivalent body agrees; conflicting/absent candidates stay unavailable', () => {
    expect(resolveFeatureTableDefinition([sourceFeature, sourceFeature])).toBeTruthy()
    expect(
      resolveFeatureTableDefinition([sourceFeature, structuredClone(sourceFeature)]),
    ).toBeTruthy()
    const other = structuredClone(sourceFeature)
    other.entries!.push('Conflicting source rule.')
    expect(resolveFeatureTableDefinition([sourceFeature, other])).toBeUndefined()
    expect(resolveFeatureTableDefinition([sourceFeature, undefined])).toBeUndefined()
    expect(resolveFeatureTableDefinition([])).toBeUndefined()
  })

  test('row reorder preserves canonical identity and literal JSON keeps delimiters distinct', () => {
    const original = getFeatureTableDefinition(sourceFeature)!
    const changed = structuredClone(sourceFeature)
    const table = changed.entries!.find(
      (row) => typeof row === 'object' && row && (row as { type?: string }).type === 'table',
    ) as { rows: unknown[][] }
    table.rows.reverse()
    const next = getFeatureTableDefinition(changed)!
    expect(next.rows.map(getFeatureOptionKey).sort()).toEqual(
      original.rows.map(getFeatureOptionKey).sort(),
    )
    const row = original.rows[7]
    const target = decodeFeatureOptionReference(row)!
    expect(getFeatureOptionKey({ ...row, name: ' RED ', source: ' phb ' })).toBe(
      getFeatureOptionKey(row),
    )
    expect(decodeFeatureOptionReference({ ...row, source: 'XPHB' })).toBeUndefined()
    expect(decodeFeatureOptionReference({ ...row, name: 'Red|Fire' })).toBeUndefined()
    expect(target.parentIdentity).toBe(
      getSubclassFeatureIdentity(decodeSubclassFeatureReference(DRAGON_ANCESTOR_REF)),
    )
  })

  test('new-category admission is additive, catalog-independent and preserves the exact saved tuple', () => {
    const choice = rules(sourceFeature).choices[0]
    const character = makeCharacterFixture({
      classProgression: [
        {
          name: 'Sorcerer',
          source: 'PHB',
          subclass: 'Draconic Bloodline',
          subclassSource: 'PHB',
          levels: 1,
        },
      ],
    })
    const option = choice.options.find((row) => row.name === 'Red')!
    const patch = applyClassChoiceSelectionCommand(character, choice, [option])
    const saved = { ...character, ...patch }
    expect(characterPersistenceSchema.parse(saved).classChoiceSelections).toEqual(
      patch.classChoiceSelections,
    )
    expect(saved.schemaVersion).toBe(11)
    const missingRef = structuredClone(saved)
    delete missingRef.classChoiceSelections![0].selected[0].ref
    expect(characterPersistenceSchema.safeParse(missingRef).success).toBe(false)
    const conflict = structuredClone(saved)
    conflict.classChoiceSelections![0].selected[0].source = 'XPHB'
    expect(characterPersistenceSchema.safeParse(conflict).success).toBe(false)
    const wrongKind = structuredClone(saved)
    wrongKind.classChoiceSelections![0].kind = 'subclass-feature'
    expect(characterPersistenceSchema.safeParse(wrongKind).success).toBe(false)
  })

  test('controlled plain damage cells and explicit row/cell wrappers follow upstream table shapes', () => {
    const feature = subclassSetupRef(DRAGON_ANCESTOR_REF, structuredClone(dragonEntries)).feature!
    expect(getFeatureTableDefinition(feature)!.rows.map((row) => row.damageType)).toEqual([
      'Acid',
      'Fire',
    ])
    const table = feature.entries![1] as { rows: unknown[] }
    table.rows[0] = {
      type: 'row',
      row: [
        { type: 'cell', entry: 'Black' },
        { type: 'cell', entry: 'Acid' },
      ],
    }
    expect(getFeatureTableDefinition(feature)!.rows[0].name).toBe('Black')
  })

  test('controlled copied source retains enclosing gain without changing source gates', () => {
    const parsed = parseClasses(dragonSetupDocument(true))[0] as Class5e
    expect(parsed.subclasses![0].normalizedRules!.choices[0]).toMatchObject({
      kind: 'feature-option',
      level: 3,
    })
  })
})
