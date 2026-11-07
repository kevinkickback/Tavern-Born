// @vitest-environment jsdom
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { PDFDocument, PDFTextField } from '@cantoo/pdf-lib'
import { beforeAll, expect, test } from 'vitest'
import { getSelectedSubclassData } from '@/lib/5etools/classData'
import { composeGameDataLayers } from '@/lib/5etools/contentLayers'
import { FiveEToolsDataLoader } from '@/lib/5etools/dataLoader'
import { DataFilter } from '@/lib/5etools/filters'
import { buildGameDataLookups, getEntityLookupKey } from '@/lib/5etools/lookups'
import { parseClassDocument } from '@/lib/5etools/parsers/classes'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { buildClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import { getCharacterClassChoices } from '@/lib/character/classChoiceOptions'
import {
  applyClassChoiceSelectionWithGrantsCommand,
  reconcileClassChoiceSelectionGrants,
} from '@/lib/character/commands/classChoiceCommands'
import { setManagedClassSpellChoiceCommand } from '@/lib/character/commands/managedClassSpellCommands'
import { createEmptyCharacter } from '@/lib/character/createCharacter'
import { getManagedClassSpellSlots } from '@/lib/character/managedClassSpellSlots'
import type { ManagedClassSpellContext } from '@/lib/character/managedClassSpells'
import { createOptionalClassFeatureActivity } from '@/lib/character/optionalClassFeatureActivity'
import {
  createCharacterSheetViewModel,
  withoutSheetDescriptions,
} from '@/lib/pdf/characterSheetViewModel'
import { getClassStaticFeatureSummaries } from '@/lib/pdf/classStaticFeatureSummaries'
import { makeSourceTag } from '@/lib/provenance/sourceLabels'
import type { Class5e, ClassFeature, GameData, SubclassFeature } from '@/types/5etools'
import type { Character } from '@/types/character'
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

const bladeName = 'Pact of the Blade'
const bladeClause = {
  PHB: 'perform the ritual over the course of 1 hour',
  XPHB: 'necrotic, psychic, or radiant damage',
}

function chooseBlade(saved: Character, data: GameData, selected = true) {
  const source = saved.classProgression[0].source
  return chooseWarlockOption(
    saved,
    data,
    source === 'PHB' ? 'Pact Boon' : 'Eldritch Invocations',
    selected ? bladeName : undefined,
  )
}

function chooseWarlockOption(
  saved: Character,
  data: GameData,
  label: string,
  option?: string | readonly string[],
  spellContext?: ManagedClassSpellContext,
) {
  const [owner] = saved.classProgression
  const cls = data.classes.find((row) => row.name === owner.name && row.source === owner.source)
  if (!cls) throw new Error('Missing exact Warlock')
  const catalogs = buildClassChoiceFeatureCatalogs(data)
  const activity = createOptionalClassFeatureActivity(saved, catalogs)
  const choice = getCharacterClassChoices(
    cls,
    getSelectedSubclassData(cls, owner),
    activity,
    catalogs,
  ).find((row) => row.label === label)
  if (!choice) throw new Error(`Missing exact Warlock choice: ${label}`)
  const result = applyClassChoiceSelectionWithGrantsCommand(
    saved,
    saved.provenance,
    choice,
    (typeof option === 'string' ? [option] : (option ?? [])).map((name) => ({
      entityType: 'optionalFeature',
      name,
      source: cls.source,
    })),
    { classes: data.classes, catalogs, spellContext },
  )
  return characterPersistenceSchema.parse(
    JSON.parse(
      JSON.stringify({
        ...saved,
        ...result.characterPatch,
        provenance: result.provenanceUpdate,
      }),
    ),
  )
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
  const filtered = current(data, source)
  const view = createCharacterSheetViewModel(
    chooseBlade(actor(edition, 20), filtered),
    lookups(data),
    lookups(filtered),
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
  expect(text).toContain(bladeName)
  expect(text.toLowerCase()).toContain(bladeClause[source])
  if (template === '2014-custom')
    expect(text.toLowerCase().split(bladeClause[source])).toHaveLength(2)
  expect(
    view.declaredClassFeatureSummaries?.filter((row) => row.compactText === bladeName),
  ).toHaveLength(1)
  expect(text.toLowerCase()).not.toContain(bladeClause[source === 'PHB' ? 'XPHB' : 'PHB'])
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

function bladeSheetFixture(pack: string, edition: (typeof editions)[number]) {
  const raw = dataFor(pack)
  const [, source] = edition
  const data = current(raw, source)
  const rawLookups = lookups(raw)
  const primaryLookups = lookups(data)
  const selected = chooseBlade(actor(edition, 5), data)
  return {
    data,
    source,
    selected,
    view: (saved: Character, filtered?: GameData) =>
      createCharacterSheetViewModel(
        saved,
        rawLookups,
        filtered ? lookups(filtered) : primaryLookups,
      ),
  }
}

function expectNoBladeRule(vm: ReturnType<typeof createCharacterSheetViewModel>) {
  expect(vm.declaredClassFeatureSummaries?.some((row) => row.compactText === bladeName)).toBe(false)
  expect(vm.actions.some((row) => row.name === bladeName)).toBe(false)
}

const classicInvocations = [
  ['Agonizing Blast', 'add your Charisma modifier'],
  ["Devil's Sight", 'to a distance of 120 feet'],
  ['Eldritch Spear', 'range is 300 feet'],
  ['Repelling Blast', 'up to 10 feet away from you'],
] as const

test('classic Invocation bodies print from exact choices after a strict reopen', () => {
  const data = current(dataFor('bundled'), 'PHB')
  const lookup = lookups(data)
  const saved = actor(editions[0], 7)
  const slot = getManagedClassSpellSlots(saved.classProgression[0]).find(
    (row) => row[1] === 'class-cantrip',
  )
  if (!slot) throw new Error('Missing earned Warlock cantrip slot')
  const calc = (character: Character) =>
    createCharacterCalculationContext(character, lookup, lookup).classChoices.spellContext
  const learned = setManagedClassSpellChoiceCommand(
    saved,
    saved.provenance,
    {
      slot,
      target: { name: 'Eldritch Blast', source: 'PHB' },
      expected: null,
      expectedEmptyRevision: saved.managedClassSpellRevision ?? 0,
      policy: 'default',
    },
    calc(saved),
  )
  const withCantrip = characterPersistenceSchema.parse({
    ...saved,
    ...learned.characterPatch,
    provenance: learned.provenanceUpdate,
  })
  const chosen = chooseWarlockOption(
    withCantrip,
    data,
    'Eldritch Invocations',
    classicInvocations.map(([name]) => name),
    calc(withCantrip),
  )
  const restored = characterPersistenceSchema.parse({
    ...chosen,
    features: [
      {
        id: 'manual-devils-sight',
        name: "Devil's Sight",
        source: 'PHB',
        description: 'An independent manual note.',
      },
    ],
  })
  const vm = createCharacterSheetViewModel(restored, lookup, lookup)
  const compact = withoutSheetDescriptions(vm)
  for (const [name, clause] of classicInvocations) {
    expect(vm.classFeaturesSummary2014).toContain(clause)
    expect(compact.classFeaturesSummary2014).toContain(name)
    expect(compact.classFeaturesSummary2014).not.toContain(clause)
    expect(vm.actions.some((row) => row.name === name)).toBe(false)
  }
  expect(vm.classFeaturesSummary2014).toContain('An independent manual note.')
})

test('classic sheet keeps source-conflicted Invocation text out of managed rows', () => {
  const raw = dataFor('bundled')
  const data = current(raw, 'PHB')
  const name = "Devil's Sight"
  const chosen = chooseWarlockOption(actor(editions[0], 2), data, 'Eldritch Invocations', name)
  const leaf = data.optionalfeatures.find(
    (row): row is Record<string, unknown> =>
      !!row &&
      typeof row === 'object' &&
      'name' in row &&
      row.name === name &&
      'source' in row &&
      row.source === 'PHB',
  )
  if (!leaf) throw new Error('Missing exact classic rule')
  const saved = characterPersistenceSchema.parse({
    ...chosen,
    features: chosen.features.map((row) =>
      row.name === name ? { ...row, description: 'A stale managed description.' } : row,
    ),
  })
  const absent = data.optionalfeatures.filter((row) => row !== leaf)
  const altered = { ...leaf, entries: ['An unverified replacement rule.'] }
  const summary = (optionalfeatures: GameData['optionalfeatures']) =>
    createCharacterSheetViewModel(saved, lookups(raw), lookups({ ...data, optionalfeatures }))
      .classFeaturesSummary2014
  for (const options of [absent, [...absent, altered], [...data.optionalfeatures, altered]]) {
    const text = summary(options)
    expect(text).not.toContain('to a distance of 120 feet')
    expect(text).not.toContain('A stale managed description.')
    expect(text).not.toContain('An unverified replacement rule.')
  }
  expect(summary(data.optionalfeatures)).toContain('to a distance of 120 feet')
})

test('classic passive Invocations cannot borrow action prose through another saved row', () => {
  const raw = dataFor('bundled')
  const data = current(raw, 'PHB')
  const name = "Devil's Sight"
  const saved = chooseBlade(
    chooseWarlockOption(actor(editions[0], 3), data, 'Eldritch Invocations', name),
    data,
  )
  const invocations = saved.classChoiceSelections?.find(
    (row) => row.label === 'Eldritch Invocations',
  )
  const selected = invocations?.selected[0]
  if (!invocations || !selected) throw new Error('Missing the native Invocation row')

  const normalizedOwner = characterPersistenceSchema.parse({
    ...saved,
    classChoiceSelections: saved.classChoiceSelections?.map((row) =>
      row === invocations ? { ...row, subclassSource: ' ' } : row,
    ),
  })
  const wrongPool = characterPersistenceSchema.parse({
    ...saved,
    classChoiceSelections: saved.classChoiceSelections?.map((row) =>
      row.label === 'Pact Boon' ? { ...row, selected: [{ ...selected, slotLevel: 3 }] } : row,
    ),
  })
  const duplicate = characterPersistenceSchema.parse({
    ...saved,
    classChoiceSelections: [
      ...(saved.classChoiceSelections ?? []),
      { ...invocations, subclassSource: 'XPHB' },
    ],
  })
  const rawLookups = lookups(raw)
  const staleRaw = {
    ...rawLookups,
    optionalFeaturesByKey: {
      ...rawLookups.optionalFeaturesByKey,
      [getEntityLookupKey(name, 'PHB')]: {
        name,
        source: 'PHB',
        entries: ['As a bonus action, you launch a beam.'],
      },
    },
  }
  const primary = lookups(data)
  for (const character of [saved, normalizedOwner, wrongPool, duplicate]) {
    const vm = createCharacterSheetViewModel(character, staleRaw, primary)
    expect(vm.actions.some((row) => row.name === name)).toBe(false)
    expect(vm.classFeaturesSummary2014.includes('to a distance of 120 feet')).toBe(
      character !== duplicate,
    )
  }
  const feature = saved.features.find((row) => row.name === name)
  if (!feature) throw new Error('Missing exact managed feature')
  const manual = {
    id: `feature:${feature.id}`,
    name,
    kind: 'bonus-action' as const,
    active: true,
    source: { kind: 'manual' as const, name },
    description: 'An independently entered action.',
  }
  const withManual = createCharacterSheetViewModel(
    characterPersistenceSchema.parse({ ...normalizedOwner, manualActions: [manual] }),
    staleRaw,
    primary,
  )
  expect(withManual.actions.filter((row) => row.name === name)).toEqual([manual])
})

test('classic Thirsting Blade requires the exact Pact after a strict reopen', () => {
  const { data, selected, view } = bladeSheetFixture('bundled', editions[0])
  const invocation = 'Thirsting Blade'
  const eligible = chooseWarlockOption(selected, data, 'Eldritch Invocations', invocation)
  const summary = (saved: Character) =>
    view(saved).declaredClassFeatureSummaries?.find((row) => row.compactText === invocation)
  expect(summary(eligible)?.text).toContain('twice, instead of once')
  const unproved = reconcileClassChoiceSelectionGrants(
    eligible,
    eligible.provenance,
    eligible.classChoiceSelections ?? [],
  )
  expect(unproved.features.some(({ name }) => name === invocation)).toBe(false)

  const cleared = chooseBlade(eligible, data, false)
  const manual = {
    id: 'manual-pact-note',
    name: 'Display note: Pact of the Blade is unavailable',
    source: 'XPHB',
    description: '',
  }
  const imported = characterPersistenceSchema.parse({
    ...cleared,
    features: [...cleared.features, manual],
  })
  expect(
    imported.classChoiceSelections?.some((row) =>
      row.selected.some(({ name }) => name === invocation),
    ),
  ).toBe(true)
  expect(summary(imported)).toBeUndefined()
  const restored = chooseBlade(imported, data)
  expect(summary(restored)?.text).toContain('twice, instead of once')
  expect(restored.features).toContainEqual(manual)
})

test.each(stackCases)('$edition withdraws and restores the selected Blade rule ($pack)', ({
  pack,
  edition,
}) => {
  const { data, source, selected, view } = bladeSheetFixture(pack, edition)
  const cleared = chooseBlade(selected, data, false)
  expectNoBladeRule(view(cleared))
  const currentView = view(chooseBlade(cleared, data))
  expect(
    currentView.declaredClassFeatureSummaries?.some((row) => row.compactText === bladeName),
  ).toBe(true)
  expect(currentView.actions.some((row) => row.name === bladeName)).toBe(true)
  expect(currentView.featuresSummary.toLowerCase()).toContain(bladeClause[source])
  const compact = withoutSheetDescriptions(currentView)
  expect(compact.featuresSummary).toContain(bladeName)
  expect(compact.featuresSummary.toLowerCase()).not.toContain(bladeClause[source])
})

test.each(stackCases)('$edition requires the exact current Blade source ($pack)', ({
  pack,
  edition,
}) => {
  const { data, source, selected, view } = bladeSheetFixture(pack, edition)
  const leaf = (row: unknown): row is { name: string; source: string } =>
    !!row &&
    typeof row === 'object' &&
    'name' in row &&
    row.name === bladeName &&
    'source' in row &&
    row.source === source
  const without = { ...data, optionalfeatures: data.optionalfeatures.filter((row) => !leaf(row)) }
  const altered = {
    ...data,
    optionalfeatures: data.optionalfeatures.map((row) =>
      leaf(row) ? { ...row, entries: ['You can use your action to apply unverified rules.'] } : row,
    ),
  }
  expectNoBladeRule(view(selected, without))
  expectNoBladeRule(view(selected, altered))
})

test.each(stackCases)('$edition preserves normalized and manual Blade actions ($pack)', ({
  pack,
  edition,
}) => {
  const { source, selected, view } = bladeSheetFixture(pack, edition)
  const native = view(selected).actions.find((row) => row.name === bladeName)
  if (!native) throw new Error('Missing selected Pact action')
  const imported = characterPersistenceSchema.parse({
    ...selected,
    classChoiceSelections: selected.classChoiceSelections?.map((selection) => ({
      ...selection,
      selected: selection.selected.map((option) => ({
        ...option,
        name: option.name.toUpperCase(),
        source: option.source?.toLowerCase(),
      })),
    })),
  })
  expect(view(imported).actions.find((row) => row.id === native.id)).toEqual(native)
  const manual = {
    ...native,
    source: { kind: 'manual' as const, name: bladeName },
    description: 'Independent manual action.',
  }
  const withManual = view(
    characterPersistenceSchema.parse({ ...selected, manualActions: [manual] }),
  )
  expect(withManual.actions.find((row) => row.id === native.id)).toEqual(manual)
  expect(withManual.featuresSummary.toLowerCase()).toContain(bladeClause[source])
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

async function rawRevisedFiendFixture() {
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
  return { rows, hurl, blessing, intro, testLayer }
}

const revisedNames = (layer: GameData, base = bundled) =>
  summaries(composeGameDataLayers([base, layer]), editions[1], 20).map((row) => row.compactText)

test('raw duplicate Fiend features cannot supply native rules', async () => {
  const { rows, hurl, testLayer } = await rawRevisedFiendFixture()
  expect(revisedNames(testLayer([...rows, { ...hurl }]))).not.toContain(labels[3])
})

test('raw copied Fiend features cannot supply native rules', async () => {
  const { rows, hurl, testLayer } = await rawRevisedFiendFixture()
  const { entries: _, ...withoutBody } = hurl
  const template = { ...hurl, name: 'Unreferenced Hurl Template' }
  expect(
    revisedNames(
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
})

test('raw unattested inline Blessing cannot supply native rules', async () => {
  const { rows, intro, blessing, testLayer } = await rawRevisedFiendFixture()
  const fakeIntro = {
    ...intro,
    entries: intro.entries?.map((value) => {
      const ref = value as { subclassFeature?: string }
      return ref.subclassFeature?.startsWith(labels[0]) ? { ...ref, feature: blessing } : value
    }),
  }
  expect(
    revisedNames(
      testLayer(
        rows.filter((row) => row !== blessing).map((row) => (row === intro ? fakeIntro : row)),
      ),
    ),
  ).not.toContain(labels[0])
})

test('an unattached Fiend feature falls back through its exact current owner', async () => {
  const { rows, hurl, testLayer } = await rawRevisedFiendFixture()
  const withoutHurl = testLayer(rows.filter((row) => row !== hurl))
  expect(revisedNames(withoutHurl)).toContain(labels[3])
})

test('an unattached Fiend feature cannot fall back through a foreign owner', async () => {
  const { rows, hurl, testLayer } = await rawRevisedFiendFixture()
  const withoutHurl = testLayer(rows.filter((row) => row !== hurl))
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
  expect(revisedNames(withoutHurl, foreignOwner)).not.toContain(labels[3])
})

test.each([
  { source: undefined, label: 'omitted' },
  { source: '', label: 'blank' },
])('a $label Fiend feature printing uses its exact owner for rule and saved-label matching', async ({
  source,
}) => {
  const { rows, hurl, blessing, testLayer } = await rawRevisedFiendFixture()
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
})

test('the unmodified raw layer supplies the native Fiend rules', async () => {
  const { rows, testLayer } = await rawRevisedFiendFixture()
  expect(revisedNames(testLayer(rows))).toEqual(expect.arrayContaining(labels))
})
