// @vitest-environment jsdom
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { PDFDocument, PDFTextField } from '@cantoo/pdf-lib'
import { beforeAll, expect, test } from 'vitest'
import { composeGameDataLayers } from '@/lib/5etools/contentLayers'
import { FiveEToolsDataLoader } from '@/lib/5etools/dataLoader'
import { DataFilter } from '@/lib/5etools/filters'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { parseClassDocument } from '@/lib/5etools/parsers/classes'
import { buildClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import { createEmptyCharacter } from '@/lib/character/createCharacter'
import { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import { getClassStaticFeatureSummaries } from '@/lib/pdf/classStaticFeatureSummaries'
import { makeSourceTag } from '@/lib/provenance/sourceLabels'
import type { Class5e, ClassFeature, GameData, SubclassFeature } from '@/types/5etools'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeGameDataFixture } from '../fixtures/gameDataFixtures'
import { generateTestCharacterSheet } from '../fixtures/pdfTemplates'

const packs = ['bundled', ...(existsSync('data/class/class-warlock.json') ? ['composed'] : [])]
const editions = [
  ['2014', 'PHB', 'The Fiend', 1],
  ['2024', 'XPHB', 'Fiend Patron', 3],
] as const
const labels = [
  "Dark One's Blessing",
  "Dark One's Own Luck",
  'Fiendish Resilience',
  'Hurl Through Hell',
]
let bundled: GameData
const dataByPack = new Map<string, GameData>()

function loadLayer(type: 'bundled' | 'local') {
  const root = type === 'bundled' ? 'resources/srd/core/data' : 'data'
  return new FiveEToolsDataLoader(
    type === 'bundled'
      ? {
          type,
          path: 'srd/core',
          packId: 'tavern-born-srd-core',
          packVersion: '1.0.1',
          isValid: true,
        }
      : { type, path: resolve(root), isValid: true },
    { type, readJson: async (file) => JSON.parse(await readFile(resolve(root, file), 'utf8')) },
  ).loadAllData()
}

beforeAll(async () => {
  bundled = await loadLayer('bundled')
  dataByPack.set('bundled', composeGameDataLayers([bundled]))
  if (packs.includes('composed'))
    dataByPack.set('composed', composeGameDataLayers([bundled, await loadLayer('local')]))
})

function actor(
  [originSystem, source, subclass]: (typeof editions)[number],
  levels: number,
  selected: string = subclass,
) {
  return characterPersistenceSchema.parse(
    JSON.parse(
      JSON.stringify(
        createEmptyCharacter({
          name: 'Fiend sheet verification',
          originSystem,
          allowedSources: [source],
          classProgression: [
            { name: 'Warlock', source, levels, subclass: selected, subclassSource: source },
          ],
        }),
      ),
    ),
  )
}

function current(data: GameData, source: string, ...suppressed: string[]) {
  const filter = { sources: [source], suppressedKeys: new Set(suppressed) }
  return {
    ...data,
    classes: DataFilter.filterClasses(data.classes, filter),
    classFeatures: DataFilter.filterClassFeatures(data.classFeatures, filter),
  }
}

function lookups(data: GameData) {
  return {
    ...buildGameDataLookups(data),
    classChoiceClasses: data.classes,
    classChoiceFeatureCatalogs: buildClassChoiceFeatureCatalogs(data),
  }
}

function summaries(
  data: GameData,
  edition: (typeof editions)[number],
  level: number,
  ...suppressed: string[]
) {
  const catalogs = buildClassChoiceFeatureCatalogs(current(data, edition[1], ...suppressed))
  return getClassStaticFeatureSummaries(actor(edition, level), catalogs, false)
}

const stackCases = packs.flatMap((pack) => editions.map((edition) => ({ pack, edition })))
const templateCases = stackCases.flatMap(({ pack, edition }) =>
  (['official', 'custom'] as const).map((layout) => ({
    pack,
    edition,
    template: `${edition[0]}-${layout}` as const,
  })),
)

function dataFor(pack: string): GameData {
  const data = dataByPack.get(pack)
  if (!data) throw new Error('Missing loaded catalog')
  return data
}

test.each(templateCases)('$template prints native Fiend and Pact Magic rules ($pack)', async ({
  pack,
  edition,
  template,
}) => {
  const data = dataFor(pack)
  const [, source] = edition
  const view = createCharacterSheetViewModel(
    actor(edition, 20),
    lookups(data),
    lookups(current(data, source)),
  )
  const pdf = await generateTestCharacterSheet(view, template, {
    text: { descriptions: 'full', overflow: 'notes' },
  })
  const text = (await PDFDocument.load(pdf))
    .getForm()
    .getFields()
    .flatMap((field) => (field instanceof PDFTextField ? [field.getText() ?? ''] : []))
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/’/g, "'")
  for (const label of [...labels, 'Eldritch Master']) expect(text).toContain(label)
  expect(text).toMatch(
    /regain all expended (?:Pact Magic )?spell slots when you finish a short or long rest/i,
  )
  if (source === 'PHB') {
    expect(text).toMatch(/magical weapons or silver weapons/i)
    expect(text).toMatch(/10d10 psychic damage/i)
  } else {
    expect(text).toContain('Magical Cunning')
    expect(text).toMatch(/other than Force/i)
    expect(text).toMatch(/8d10 Psychic damage/i)
  }
})

test.each(stackCases)('$edition verifies current rule eligibility ($pack)', ({ pack, edition }) => {
  const data = dataFor(pack)
  const [, source, , blessingLevel] = edition
  const boundaries = [
    [labels[0], blessingLevel],
    [labels[1], 6],
    [labels[2], 10],
    [labels[3], 14],
    ['Eldritch Master', 20],
  ] as const
  for (const [label, gain] of boundaries) {
    if (gain > 1)
      expect(summaries(data, edition, gain - 1).map((row) => row.compactText)).not.toContain(label)
    expect(summaries(data, edition, gain).map((row) => row.compactText)).toContain(label)
  }
  const differentPatron = getClassStaticFeatureSummaries(
    actor(edition, 20, 'Another Patron'),
    buildClassChoiceFeatureCatalogs(current(data, source)),
    false,
  ).map((row) => row.compactText)
  expect(differentPatron).toContain('Eldritch Master')
  expect(differentPatron).not.toContain(labels[0])

  const id = `subclass-feature|hurl through hell|warlock|${source.toLowerCase()}|fiend|${source.toLowerCase()}|14|${source.toLowerCase()}`
  expect(summaries(data, edition, 20, id).map((row) => row.compactText)).not.toContain(labels[3])
  expect(summaries(data, edition, 20).map((row) => row.compactText)).toContain(labels[3])
})

test('raw Fiend copies, duplicates and unattested inline Blessing do not supply native rules', async () => {
  const raw = JSON.parse(await readFile('resources/srd/core/data/class/class-warlock.json', 'utf8'))
  const exact = (row: SubclassFeature, name: string) =>
    row.name === name &&
    row.classSource === 'XPHB' &&
    row.subclassSource === 'XPHB' &&
    row.subclassShortName === 'Fiend'
  const rows = raw.subclassFeature as SubclassFeature[]
  const hurl = rows.find((row) => exact(row, labels[3]))
  const blessing = rows.find((row) => exact(row, labels[0]))
  const intro = rows.find((row) => exact(row, 'Fiend Patron'))
  if (!hurl || !blessing || !intro) throw new Error('Missing exact fixture rules')
  const testLayer = (subclassFeature: unknown[]) => {
    const parsed = parseClassDocument({ ...raw, subclassFeature })
    return makeGameDataFixture({
      classes: parsed.classes as Class5e[],
      classFeatures: parsed.classFeatures as ClassFeature[],
      classCastingSources: parsed.classCastingSources,
    })
  }
  const names = (layer: GameData) =>
    summaries(composeGameDataLayers([bundled, layer]), editions[1], 20).map(
      (row) => row.compactText,
    )
  expect(names(testLayer([...rows, { ...hurl }]))).not.toContain(labels[3])
  const { entries: _, ...withoutBody } = hurl
  const template = { ...hurl, name: 'Unreferenced Hurl Template' }
  expect(
    names(
      testLayer([
        ...rows.map((row) =>
          row === hurl
            ? {
                ...withoutBody,
                _copy: {
                  name: template.name,
                  className: template.className,
                  classSource: 'XPHB',
                  subclassShortName: 'Fiend',
                  subclassSource: 'XPHB',
                  level: 14,
                  source: 'XPHB',
                },
              }
            : row,
        ),
        template,
      ]),
    ),
  ).not.toContain(labels[3])
  const fakeIntro = {
    ...intro,
    entries: intro.entries?.map((value) => {
      const ref = value as { subclassFeature?: string }
      return ref.subclassFeature?.startsWith(labels[0]) ? { ...ref, feature: blessing } : value
    }),
  }
  expect(
    names(
      testLayer(
        rows.filter((row) => row !== blessing).map((row) => (row === intro ? fakeIntro : row)),
      ),
    ),
  ).not.toContain(labels[0])
  const withoutHurl = testLayer(rows.filter((row) => row !== hurl))
  expect(names(withoutHurl)).toContain(labels[3])
  const foreignOwner = {
    ...bundled,
    classes: bundled.classes.map((cls) =>
      cls.name === 'Warlock' && cls.source === 'XPHB'
        ? {
            ...cls,
            subclasses: cls.subclasses?.map((subclass) =>
              subclass.name === 'Fiend Patron' ? { ...subclass, name: 'Foreign Patron' } : subclass,
            ),
          }
        : cls,
    ),
  }
  expect(
    summaries(composeGameDataLayers([foreignOwner, withoutHurl]), editions[1], 20).map(
      (row) => row.compactText,
    ),
  ).not.toContain(labels[3])
  for (const source of [undefined, '']) {
    const data = composeGameDataLayers([
      bundled,
      testLayer(rows.map((row) => (row === hurl || row === blessing ? { ...row, source } : row))),
    ])
    const saved = actor(editions[1], 20)
    const label = {
      id: 'existing-fiend-label',
      name: hurl.name,
      source: 'XPHB',
      level: 14,
      description: '',
    }
    saved.features.push(label)
    saved.provenance.features[hurl.name.toLowerCase()] = [
      { ...makeSourceTag('subclass', 'Fiend Patron', 'fixed', 'XPHB'), grantSource: 'XPHB' },
    ]
    const rules = getClassStaticFeatureSummaries(
      saved,
      buildClassChoiceFeatureCatalogs(current(data, 'XPHB')),
      false,
    )
    expect(rules.map((row) => row.compactText)).toContain(labels[0])
    expect(rules.find((row) => row.compactText === labels[3])?.replaces).toBe(label)
  }
  expect(names(testLayer(rows))).toEqual(expect.arrayContaining(labels))
})
