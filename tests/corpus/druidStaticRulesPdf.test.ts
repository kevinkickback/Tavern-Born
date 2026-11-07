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
import { buildClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import {
  createCharacterSheetViewModel,
  withoutSheetDescriptions,
} from '@/lib/pdf/characterSheetViewModel'
import type { CharacterSheetTemplateId } from '@/lib/pdf/types'
import type { GameData } from '@/types/5etools'
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
const normalize = (text: string) => text.replace(/[‘’]/g, "'").replace(/\s+/g, ' ')
async function print(
  model: ReturnType<typeof createCharacterSheetViewModel>,
  template: CharacterSheetTemplateId,
) {
  const bytes = await generateTestCharacterSheet(model, template, {
    text: { descriptions: 'full', overflow: 'notes' },
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
    multiclass.classProgression.unshift({ name: 'Fighter', source: 'XPHB', levels: 9 })
    expect(
      createCharacterSheetViewModel(multiclass, raw, raw).declaredClassFeatureSummaries,
    ).toEqual([])
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
