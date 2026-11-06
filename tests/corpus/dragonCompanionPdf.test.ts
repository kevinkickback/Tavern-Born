// @vitest-environment jsdom
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { PDFDocument, PDFTextField } from '@cantoo/pdf-lib'
import { expect, test } from 'vitest'
import { composeGameDataLayers } from '@/lib/5etools/contentLayers'
import { FiveEToolsDataLoader } from '@/lib/5etools/dataLoader'
import { DataFilter } from '@/lib/5etools/filters'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { parseClassDocument } from '@/lib/5etools/parsers/classes'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { getSpellReferenceKey } from '@/lib/calculations/spellIdentity'
import { buildClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import { applyLevelDown, applyLevelUp } from '@/lib/character/commands/classCommands'
import type { CharacterCommandResult } from '@/lib/character/commands/commandResult'
import { createEmptyCharacter } from '@/lib/character/createCharacter'
import { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import type { Class5e, ClassFeature, GameData, Subclass5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeGameDataFixture } from '../fixtures/gameDataFixtures'
import { generateTestCharacterSheet } from '../fixtures/pdfTemplates'

const target = 'subclass-feature|dragon companion|sorcerer|xphb|draconic|xphb|18|xphb'
const gain = 'class-feature|subclass feature|sorcerer|xphb|18|xphb'
const firstGain = 'class-feature|sorcerer subclass|sorcerer|xphb|3|xphb'
const spellKey = getSpellReferenceKey('Summon Dragon', 'XPHB')
const revisedOwner = {
  name: 'Sorcerer',
  source: 'XPHB',
  subclass: 'Draconic Sorcery',
  subclassSource: 'XPHB',
}
const rules = [
  /Summon Dragon\s+without a Material component/i,
  /once without a spell slot.*finish a Long Rest/i,
  /doesn't require Concentration.*duration becomes 1 minute/i,
]

const stacks = ['bundled', ...(existsSync('data/class/class-sorcerer.json') ? ['composed'] : [])]

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

function lookups(data: GameData) {
  return {
    ...buildGameDataLookups(data),
    classChoiceClasses: data.classes,
    classChoiceFeatureCatalogs: buildClassChoiceFeatureCatalogs(data),
  }
}

function reopen(character: Character, result?: CharacterCommandResult) {
  const saved = result
    ? { ...character, ...result.characterPatch, provenance: result.provenanceUpdate }
    : character
  return characterPersistenceSchema.parse(JSON.parse(JSON.stringify(saved)))
}

test.each(
  stacks,
)('the exact earned Dragon Companion rules print in both revised layouts (%s)', async (stack) => {
  const bundled = await loadLayer('bundled')
  const data = composeGameDataLayers(
    stack === 'composed' ? [bundled, await loadLayer('local')] : [bundled],
  )
  const raw = lookups(data)
  const filtered = (...keys: string[]) => {
    const filter = { sources: ['XPHB'], suppressedKeys: new Set(keys) }
    return lookups({
      ...data,
      classes: DataFilter.filterClasses(data.classes, filter),
      classFeatures: DataFilter.filterClassFeatures(data.classFeatures, filter),
    })
  }
  const current = filtered()
  const withoutCompanion = filtered(target)
  const withoutGain = filtered(gain)
  const sheet = (actor: Character, primary = current) =>
    createCharacterSheetViewModel(actor, raw, primary)
  const calc = (actor: Character) => createCharacterCalculationContext(actor, current, raw)
  const owner = { ...revisedOwner, levels: 17 }
  const before = reopen(
    createEmptyCharacter({
      name: 'Revised Draconic verification',
      originSystem: '2024',
      allowedSources: ['XPHB'],
      classProgression: [owner],
    }),
  )

  const advance = (actor: Character) =>
    reopen(
      actor,
      applyLevelUp(
        actor,
        actor.provenance,
        [{ ...owner, levels: 18 }],
        {
          className: owner.name,
          classSource: owner.source,
          classLevel: 18,
          hitDie: 6,
          dieResult: 4,
          method: 'average',
        },
        calc(actor),
      ),
    )
  const earned = advance(before)
  const dropped = reopen(earned, applyLevelDown(earned, earned.provenance, calc(earned)))
  const view = sheet(earned)
  expect(view.classFeaturesSummary2014.match(/Dragon Companion:/g)).toHaveLength(1)
  for (const rule of rules) expect(view.classFeaturesSummary2014).toMatch(rule)
  expect(sheet(advance(dropped)).classFeaturesSummary2014).toBe(view.classFeaturesSummary2014)
  expect(earned.features).toEqual(before.features)

  for (const variant of [
    sheet(before),
    sheet(dropped),
    sheet(earned, withoutCompanion),
    sheet(earned, withoutGain),
    sheet(earned, filtered(firstGain)),
    sheet({
      ...earned,
      classProgression: [
        { ...owner, levels: 17 },
        { name: 'Fighter', source: 'XPHB', levels: 3 },
      ],
    }),
    sheet({ ...earned, classProgression: [{ ...owner, levels: 18, subclassSource: 'PHB' }] }),
  ]) {
    expect(variant.classFeaturesSummary2014).not.toContain('Dragon Companion')
  }
  for (const actor of [before, earned, dropped]) {
    for (const primary of [current, withoutCompanion, withoutGain]) {
      expect(
        sheet(actor, primary).spellRows.some((row) => row.id === spellKey && row.prepared),
      ).toBe(true)
    }
  }
  expect(
    sheet(earned, filtered('class-feature|innate sorcery|sorcerer|xphb|1|xphb'))
      .classFeaturesSummary2014,
  ).toContain('Dragon Companion')
  const manual = sheet({
    ...earned,
    features: [
      {
        id: 'manual',
        name: 'Dragon Companion',
        source: 'Manual',
        description: 'Personal field note.',
      },
    ],
  })
  expect(manual.classFeaturesSummary2014).toContain('Dragon Companion: Personal field note.')
  expect(manual.classFeaturesSummary2014).toMatch(rules[0])

  const catalog = current.classChoiceFeatureCatalogs
  const conflicted = new Map(catalog.subclassTargets.candidatesByOwner)
  const key = JSON.stringify(['sorcerer|xphb', 'draconic sorcery|xphb'])
  const byTarget = new Map(conflicted.get(key))
  const candidates = byTarget.get(target) ?? []
  expect(candidates.length).toBeGreaterThan(0)
  byTarget.set(target, [...candidates, { ...candidates[0], entries: ['Conflicting rules.'] }])
  conflicted.set(key, byTarget)
  expect(
    sheet(earned, {
      ...current,
      classChoiceFeatureCatalogs: {
        ...catalog,
        subclassTargets: { ...catalog.subclassTargets, candidatesByOwner: conflicted },
      },
    }).classFeaturesSummary2014,
  ).not.toContain('Dragon Companion')

  for (const layout of ['2024-official', '2024-custom'] as const) {
    const read = async (description: 'full' | 'names', input = view) => {
      const bytes = await generateTestCharacterSheet(input, layout, {
        text: { descriptions: description, overflow: 'notes' },
      })
      const fields = (await PDFDocument.load(bytes)).getForm().getFields()
      return fields.flatMap((field) =>
        field instanceof PDFTextField
          ? [{ name: field.getName(), value: field.getText() ?? '' }]
          : [],
      )
    }
    const text = (rows: { value: string }[]) =>
      rows
        .map((row) => row.value)
        .join(' ')
        .replace(/\s+/g, ' ')
    const full = text(await read('full'))
    expect(full.match(/Dragon Companion:/g)).toHaveLength(1)
    for (const rule of rules) expect(full).toMatch(rule)
    const names = text(await read('names'))
    expect(names.match(/Dragon Companion/g)).toHaveLength(1)
    for (const rule of rules) expect(names).not.toMatch(rule)
    const overflow = await read('full', {
      ...view,
      classFeaturesSummary2014: [
        'Long field journal. '.repeat(340),
        'Long travel journal. '.repeat(230),
        view.classFeaturesSummary2014,
      ].join('\n\n'),
    })
    const notes = text(overflow.filter((row) => /Notes\.(Left|Right)$/.test(row.name)))
    expect(notes.match(/Dragon Companion:/g)).toHaveLength(1)
    for (const rule of rules) expect(notes).toMatch(rule)
  }
}, 120_000)

test('a malformed parsed subclass short name leaves the sheet exportable', async () => {
  const path = 'class/class-sorcerer.json'
  const raw = JSON.parse(await readFile(`resources/srd/core/data/${path}`, 'utf8'))
  const parsed = parseClassDocument(
    {
      ...raw,
      subclass: raw.subclass.map((row: Subclass5e) =>
        row.name === 'Draconic Sorcery' && row.classSource === 'XPHB' && row.source === 'XPHB'
          ? { ...row, shortName: 3 }
          : row,
      ),
    },
    path,
  )
  const current = lookups(
    makeGameDataFixture({
      classes: DataFilter.filterClasses(parsed.classes as Class5e[], { sources: ['XPHB'] }),
      classFeatures: DataFilter.filterClassFeatures(parsed.classFeatures as ClassFeature[], {
        sources: ['XPHB'],
      }),
    }),
  )
  const actor = reopen(
    createEmptyCharacter({
      name: 'Malformed source verification',
      originSystem: '2024',
      allowedSources: ['XPHB'],
      classProgression: [{ ...revisedOwner, levels: 18 }],
    }),
  )
  const sheet = createCharacterSheetViewModel(actor, current, current)
  expect(sheet.classFeaturesSummary2014).not.toContain('Dragon Companion')
  expect(sheet.classFeaturesSummary2014).toContain('Innate Sorcery')
})
