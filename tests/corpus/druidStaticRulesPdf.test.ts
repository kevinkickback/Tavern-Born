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
import { buildClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import {
  createCharacterSheetViewModel,
  withoutSheetDescriptions,
} from '@/lib/pdf/characterSheetViewModel'
import type { CharacterSheetTemplateId } from '@/lib/pdf/types'
import type { GameData, SubclassFeature } from '@/types/5etools'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { generateTestCharacterSheet } from '../fixtures/pdfTemplates'

const stacks: Array<['bundled' | 'local', string]> = [['bundled', 'resources/srd/core/data']]
if (existsSync('data/class/class-druid.json')) stacks.push(['local', 'data'])

async function load(type: 'bundled' | 'local', root: string) {
  return composeGameDataLayers([
    await new FiveEToolsDataLoader(
      type === 'bundled'
        ? {
            type,
            path: 'srd/core',
            packId: 'tavern-born-srd-core',
            packVersion: '1.0.0',
            isValid: true,
          }
        : { type, path: resolve(root), isValid: true },
      { type, readJson: async (file) => JSON.parse(await readFile(resolve(root, file), 'utf8')) },
    ).loadAllData(),
  ])
}

function lookups(data: GameData) {
  return {
    ...buildGameDataLookups(data),
    classChoiceClasses: data.classes,
    classChoiceFeatureCatalogs: buildClassChoiceFeatureCatalogs(data),
  }
}

function actor(source: 'PHB' | 'XPHB', levels: number) {
  return makeCharacterFixture({
    originSystem: source === 'PHB' ? '2014' : '2024',
    allowedSources: [source],
    classProgression: [
      { name: 'Druid', source, levels, subclass: 'Circle of the Land', subclassSource: source },
    ],
  })
}

const classics = ['2014-official', '2014-custom'] as const
const revised = ['2024-official', '2024-custom'] as const

const reviewedCircles = [
  ['PHB', 'PHB', 'Circle of the Moon', 'Combat Wild Shape', 'Primal Strike'],
  ['PHB', 'TCE', 'Circle of Stars', 'Starry Form', 'Cosmic Omen'],
  ['XPHB', 'XPHB', 'Circle of the Moon', 'Circle Forms', 'Improved Circle Forms'],
  ['XPHB', 'XPHB', 'Circle of the Sea', 'Wrath of the Sea', 'Aquatic Affinity'],
  ['XPHB', 'XPHB', 'Circle of the Stars', 'Starry Form', 'Cosmic Omen'],
  ...(['PHB', 'XPHB'] as const).flatMap((source) => [
    [
      source,
      'XGE',
      'Circle of Dreams',
      'Balm of the Summer Court',
      'Hearth of Moonlight and Shadow',
    ] as const,
    [source, 'XGE', 'Circle of the Shepherd', 'Spirit Totem', 'Mighty Summoner'] as const,
    [source, 'TCE', 'Circle of Spores', 'Halo of Spores', 'Fungal Infestation'] as const,
    [source, 'TCE', 'Circle of Wildfire', 'Summon Wildfire Spirit', 'Enhanced Bond'] as const,
  ]),
] as const

const normalize = (text: string) => text.replace(/[‘’]/g, "'").replace(/\s+/g, ' ')
async function print(
  model: ReturnType<typeof createCharacterSheetViewModel>,
  template: CharacterSheetTemplateId,
  descriptions: 'full' | 'names' = 'full',
) {
  const bytes = await generateTestCharacterSheet(model, template, {
    text: { descriptions, overflow: 'notes' },
  })
  const form = (await PDFDocument.load(bytes)).getForm()
  if (template === '2024-custom') {
    const font = form.getDefaultFont()
    for (const name of ['Text_57', 'Text_58']) {
      const field = form.getTextField(name)
      const width = field.acroField.getWidgets()[0].getRectangle().width
      const appearance = field.acroField.getDefaultAppearance() ?? ''
      const size = Number(/([\d.]+)\s+Tf/.exec(appearance)?.[1])
      expect(size).toBeGreaterThan(0)
      for (const line of (field.getText() ?? '').split('\n')) {
        expect(font.widthOfTextAtSize(line, size)).toBeLessThan(width)
      }
    }
  }
  const text = normalize(
    form
      .getFields()
      .flatMap((field) => (field instanceof PDFTextField ? [field.getText() ?? ''] : []))
      .join(' '),
  )
  const notes = normalize(
    form
      .getFields()
      .flatMap((field) =>
        field instanceof PDFTextField && /Notes\.(Left|Right)$/.test(field.getName())
          ? [field.getText() ?? '']
          : [],
      )
      .join(' '),
  )
  return { text, notes }
}

test.skipIf(!existsSync('data/class/class-druid.json'))(
  'reviewed Druid circle rules require an exact declaration and appear at their earned levels',
  async () => {
    const data = await load('local', 'data')
    const current = lookups(data)
    const raw = JSON.parse(await readFile('data/class/class-druid.json', 'utf8')) as {
      subclassFeature: SubclassFeature[]
    }
    for (const [source, printing, name, initial, later] of reviewedCircles) {
      const gain = source === 'PHB' ? 2 : 3
      const selected = (levels: number) => {
        const character = actor(source, levels)
        character.allowedSources = [source, printing]
        character.classProgression[0] = {
          ...character.classProgression[0],
          subclass: name,
          subclassSource: printing,
        }
        return character
      }
      const gained = selected(gain)
      const summaries = (level: number, visible = current) =>
        createCharacterSheetViewModel(
          level === gain ? gained : selected(level),
          current,
          visible,
        ).declaredClassFeatureSummaries?.map((row) => row.compactText)
      expect(summaries(gain - 1), name).not.toContain(initial)
      expect(summaries(gain), name).toContain(initial)
      expect(summaries(5), name).not.toContain(later)
      expect(summaries(6), name).toContain(later)

      if (source !== 'XPHB' || (name !== 'Circle of Dreams' && name !== 'Circle of the Sea'))
        continue
      const countRows = (featureName: string, classSource: string, count: number) => {
        const matches = (feature: SubclassFeature) =>
          feature.name === featureName &&
          feature.classSource === classSource &&
          feature.source === printing
        const originals = raw.subclassFeature.filter(matches)
        expect(originals).toHaveLength(1)
        const [original] = originals
        const parsed = parseClassDocument({
          ...raw,
          subclassFeature: raw.subclassFeature.flatMap((feature) => {
            if (matches(feature)) return Array<SubclassFeature>(count).fill(feature)
            if (count !== 0 || feature.name !== name || feature.classSource !== classSource)
              return [feature]
            // A stale inline rule cannot substitute for the missing authoritative record.
            return [
              {
                ...feature,
                entries: feature.entries?.map((entry) =>
                  typeof entry === 'object' &&
                  entry &&
                  'subclassFeature' in entry &&
                  typeof entry.subclassFeature === 'string' &&
                  entry.subclassFeature.startsWith(`${featureName}|`)
                    ? { ...entry, feature: original }
                    : entry,
                ),
              },
            ]
          }),
        })
        return lookups({
          ...data,
          classes: parsed.classes as GameData['classes'],
          classFeatures: parsed.classFeatures as GameData['classFeatures'],
        })
      }
      for (const count of [0, 2]) {
        const leaf = countRows(initial, printing === 'XGE' ? 'PHB' : source, count)
        const alternatives =
          name === 'Circle of the Sea' ? [leaf, countRows(name, source, count)] : [leaf]
        for (const visible of alternatives) {
          const summary = summaries(gain, visible)
          expect(summary, name).not.toContain(initial)
          expect(summary, name).toContain('Wild Shape')
        }
        expect(summaries(gain), name).toContain(initial)
      }
      if (name === 'Circle of Dreams') {
        const sheet = createCharacterSheetViewModel(gained, current, current)
        const { text } = await print(sheet, revised[0])
        expect(text).toContain(initial)
        expect(text).toContain('pool of fey energy')
        const names = await print(sheet, revised[0], 'names')
        expect(names.text).toContain(initial)
        expect(names.text).not.toContain('pool of fey energy')
      }
    }
  },
  90_000,
)

test.each(stacks)(
  'exact Druid rules survive all shipped PDF layouts and continue in notes (%s)',
  async (type, root) => {
    const data = await load(type, root)
    const current = lookups(data)
    const forExport = (source: 'PHB' | 'XPHB') => {
      const character = actor(source, 10)
      // Fill the main feature box to prove the actual notes path for every template.
      character.features.push({
        id: 'manual:field-notes',
        name: 'Field notes',
        source: 'Manual',
        description: 'A longer independent note remains available on the character sheet. '.repeat(
          105,
        ),
      })
      return createCharacterSheetViewModel(character, current, current)
    }
    for (const template of classics) {
      const vm = forExport('PHB')
      const { text, notes } = await print(vm, template)
      expect(notes).toContain('Natural Recovery')
      expect(text).toContain('Restores all uses on a short or long rest')
      expect(text).toContain('Max. CR: 1')
      expect(text).toContain('by elementals or fey')
      expect(text).toContain('immune to poison and disease')
      expect(text).toContain('none of the slots can be 6th level or higher')
      expect(text).toContain("can't use this feature again until you finish a long rest")
    }
    for (const template of revised) {
      const vm = forExport('XPHB')
      const { text, notes } = await print(vm, template)
      expect(notes).toContain('Field notes')
      expect(text).toContain('Base uses: 3')
      expect(text).toContain('1 use on a short rest')
      expect(text).toContain('all uses on a long rest')
      expect(text).toContain('Known Forms: 8')
      expect(text).toContain('Fly Speed: Yes')
      expect(text).toContain('immune to the Poisoned condition')
      expect(text).toContain(
        'prepared from your Circle Spells feature without expending a spell slot',
      )
      expect(text).toContain('none of them can be level 6+')
    }
  },
  45_000,
)

test.each(stacks)(
  'static rows follow exact earned gains, current catalog and names-only rules (%s)',
  async (type, root) => {
    const data = await load(type, root)
    const raw = lookups(data)
    const project = (source: 'PHB' | 'XPHB', level: number, current = raw) =>
      createCharacterSheetViewModel(actor(source, level), raw, current)
    const summaries = (source: 'PHB' | 'XPHB', level: number, current = raw) =>
      project(source, level, current)
        .declaredClassFeatureSummaries!.map((row) => row.text)
        .join('\n')
    expect(summaries('PHB', 1)).toBe('')
    expect(summaries('PHB', 2)).toContain('Base Beast Shapes: Max. CR: 1/4')
    expect(summaries('PHB', 2)).toContain('No flying or swimming speed')
    expect(summaries('PHB', 2)).toContain('Natural Recovery')
    expect(summaries('PHB', 4)).toContain('No flying speed')
    expect(summaries('PHB', 9)).not.toContain("Nature's Ward")
    expect(summaries('PHB', 10)).toContain("Nature's Ward")
    expect(summaries('PHB', 19)).toContain('Restores all uses')
    expect(summaries('PHB', 20)).not.toContain('Restores all uses')
    expect(project('PHB', 20).featuresSummary).toContain('Wild Shape (Archdruid): Unlimited uses.')
    expect(summaries('XPHB', 2)).toContain('Known Forms: 4')
    expect(summaries('XPHB', 2)).toContain('Fly Speed: No')
    expect(summaries('XPHB', 5)).not.toContain('Natural Recovery')
    expect(summaries('XPHB', 6)).toContain('Natural Recovery')
    expect(summaries('XPHB', 9)).not.toContain("Nature's Ward")
    expect(summaries('XPHB', 10)).toContain('immune to the Poisoned condition')
    expect(summaries('XPHB', 17)).toContain('Base uses: 4')
    const names = withoutSheetDescriptions(project('XPHB', 10)).featuresSummary
    expect(names).toContain("Wild Shape\n\nNature's Ward\n\nNatural Recovery")
    expect(names).not.toMatch(/immune to the Poisoned|restores|spell slots to recover/i)

    const suppress = (target: string) => {
      const filter = { suppressedKeys: new Set([target]) }
      return lookups({
        ...data,
        classes: DataFilter.filterClasses(data.classes, filter),
        classFeatures: DataFilter.filterClassFeatures(data.classFeatures, filter),
      })
    }
    const withoutRecovery = suppress('subclass-feature|natural recovery|druid|phb|land|phb|2|phb')
    const withoutShape = suppress('class-feature|wild shape|druid|xphb|2|xphb')
    const hidden = summaries('PHB', 10, withoutRecovery)
    expect(hidden).not.toContain('Natural Recovery')
    expect(hidden).toContain('immune to poison and disease')
    expect(summaries('XPHB', 10, withoutShape)).not.toContain('Wild Shape')
    const withoutWard = suppress("subclass-feature|nature's ward|druid|xphb|land|xphb|10|xphb")
    expect(summaries('XPHB', 10, withoutWard)).not.toContain('Poisoned condition')
    expect(summaries('XPHB', 10, withoutWard)).toContain('Natural Recovery')
    expect(summaries('PHB', 10)).toContain('Natural Recovery')
    expect(summaries('XPHB', 10)).toContain('Wild Shape')
    const multiclass = actor('XPHB', 1)
    const fighter = { name: 'Fighter', source: 'XPHB', levels: 9 }
    multiclass.classProgression.unshift(fighter)
    const fighterRules = createCharacterSheetViewModel(
      { ...multiclass, classProgression: [fighter] },
      raw,
      raw,
    ).declaredClassFeatureSummaries
    expect(
      createCharacterSheetViewModel(multiclass, raw, raw).declaredClassFeatureSummaries,
    ).toEqual(fighterRules)
    const moon = actor('PHB', 2)
    moon.classProgression[0].subclass = 'Circle of the Moon'
    expect(createCharacterSheetViewModel(moon, raw, raw).declaredClassFeatureSummaries).toEqual([
      expect.objectContaining({ text: expect.stringContaining('Base Beast Shapes: Max. CR: 1/4') }),
      ...(type === 'local'
        ? ['Combat Wild Shape', 'Circle Forms'].map((compactText) =>
            expect.objectContaining({ compactText }),
          )
        : []),
    ])
  },
  30_000,
)
