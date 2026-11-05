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
import { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import type { CharacterSheetTemplateId } from '@/lib/pdf/types'
import { emptyProvenance } from '@/lib/provenance/ledger'
import type { GameData } from '@/types/5etools'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { generateTestCharacterSheet } from '../fixtures/pdfTemplates'

const stacks: Array<['bundled' | 'local', string]> = [['bundled', 'resources/srd/core/data']]
if (existsSync('data/class/class-wizard.json')) stacks.push(['local', 'data'])

const printings = [
  { source: 'PHB', origin: '2014', reuse: /once per day/i },
  { source: 'XPHB', origin: '2024', reuse: /again until you finish a long rest/i },
] as const
const recoveryRules = [
  /finish a short rest/i,
  /expended spell slots to recover/i,
  /combined level.*half your wizard level \(round(?:ed)? up\)/i,
  /none of the slots can be (?:6th level|level 6) or higher/i,
]

function lookups(data: GameData) {
  return {
    ...buildGameDataLookups(data),
    classChoiceClasses: data.classes,
    classChoiceFeatureCatalogs: buildClassChoiceFeatureCatalogs(data),
  }
}

async function readText(
  vm: ReturnType<typeof createCharacterSheetViewModel>,
  template: CharacterSheetTemplateId,
  descriptions: 'full' | 'names',
) {
  const bytes = await generateTestCharacterSheet(vm, template, {
    text: { descriptions, overflow: 'notes' },
  })
  const form = (await PDFDocument.load(bytes)).getForm()
  const textFields = form.getFields().filter((field) => field instanceof PDFTextField)
  const text = (fields: PDFTextField[]) =>
    fields
      .map((field) => field.getText() ?? '')
      .join(' ')
      .replace(/\s+/g, ' ')
  return {
    form,
    all: text(textFields),
    features: text(
      textFields.filter((field) =>
        ['Features and Traits', 'Class Features', 'Text_57', 'Text_58'].includes(field.getName()),
      ),
    ),
    notes: text(textFields.filter((field) => /Notes\.(Left|Right)$/.test(field.getName()))),
  }
}

test.each(stacks)(
  'earned Arcane Recovery prints in the four shipped forms and follows exact source availability (%s)',
  async (type, root) => {
    const data = composeGameDataLayers([
      await new FiveEToolsDataLoader(
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
      ).loadAllData(),
    ])
    const current = lookups(data)
    for (const { source, origin, reuse } of printings) {
      const wizard = { name: 'Wizard', source, levels: 1 }
      const imported = characterPersistenceSchema.parse(
        JSON.parse(await readFile(`tests/fixtures/full-coverage-character-${origin}.tbc`, 'utf8')),
      )
      const savedLabel = imported.features.find((feature) => feature.name === 'Arcane Recovery')!
      const character = characterPersistenceSchema.parse(
        makeCharacterFixture({
          originSystem: origin,
          allowedSources: [source],
          classProgression: [wizard],
          classResources: { 'wizard-arcane-recovery': 0 },
          provenance: {
            ...emptyProvenance(),
            features: { 'arcane recovery': imported.provenance!.features['arcane recovery'] },
          },
          // Fill both 2024 feature columns so the earned rule also needs the Notes fallback.
          features: [
            savedLabel,
            ...['Field notes', 'Travel notes'].map((name) => ({
              id: `manual:${name}`,
              name,
              source: 'Manual',
              description: 'These independent notes are available on the character sheet. '.repeat(
                175,
              ),
            })),
          ],
        }),
      )
      const project = (actor = character, primary = current) =>
        createCharacterSheetViewModel(actor, current, primary)
      const vm = project()
      expect(vm.declaredClassFeatureSummaries).toEqual([
        {
          text: expect.stringMatching(reuse),
          compactText: 'Arcane Recovery',
          replaces: savedLabel,
        },
      ])
      expect(project(imported).featuresSummary.match(/Arcane Recovery/g)).toHaveLength(1)
      expect(vm.character.features).toContainEqual(savedLabel)
      const manual = project({
        ...character,
        features: [
          ...character.features,
          {
            id: 'manual:arcane-recovery',
            name: 'Arcane Recovery',
            source: 'Manual',
            description: 'An independent personal note.',
          },
        ],
      })
      expect(manual.featuresSummary).toContain('Arcane Recovery: An independent personal note.')

      for (const template of [`${origin}-official`, `${origin}-custom`] as const) {
        const full = await readText(vm, template, 'full')
        expect(full.all).toContain('Arcane Recovery')
        expect(full.all).toMatch(reuse)
        expect(full.notes).toContain('These independent notes')
        expect(full.notes).toMatch(reuse)
        for (const rule of recoveryRules) expect(full.all).toMatch(rule)
        expect(full.all).not.toMatch(source === 'PHB' ? printings[1].reuse : printings[0].reuse)

        const names = await readText(vm, template, 'names')
        expect(names.features.match(/Arcane Recovery/g)).toHaveLength(1)
        for (const rule of [...recoveryRules, reuse]) expect(names.all).not.toMatch(rule)
        if (template === '2014-custom') {
          expect(full.form.getTextField('Limited Feature Used 1').getText()).toBe('1')
          expect(names.form.getTextField('Limited Feature Max Usages 1').getText()).toBe('1')
        }
      }

      const printing = source.toLowerCase()
      const filter = {
        suppressedKeys: new Set([`class-feature|arcane recovery|wizard|${printing}|1|${printing}`]),
      }
      const absent = project(
        character,
        lookups({
          ...data,
          classes: DataFilter.filterClasses(data.classes, filter),
          classFeatures: DataFilter.filterClassFeatures(data.classFeatures, filter),
        }),
      )
      expect(absent.declaredClassFeatureSummaries).toEqual([])
      expect(absent.featuresSummary.match(/Arcane Recovery/g)).toHaveLength(1)
      expect(absent.featuresSummary).not.toMatch(reuse)
      expect(absent.classResourceRows).toEqual(vm.classResourceRows)
      expect(absent.character.spells).toEqual(vm.character.spells)
      expect(project().declaredClassFeatureSummaries).toEqual(vm.declaredClassFeatureSummaries)

      const fighter = { name: 'Fighter', source, levels: 7 }
      expect(
        project({ ...character, classProgression: [fighter] }).declaredClassFeatureSummaries,
      ).toEqual([])
      expect(
        project({
          ...character,
          classProgression: [{ ...wizard, levels: 5 }, fighter],
        }).declaredClassFeatureSummaries,
      ).toEqual(vm.declaredClassFeatureSummaries)
      expect(
        project({ ...character, classProgression: [wizard, wizard] }).declaredClassFeatureSummaries,
      ).toEqual([])
    }
  },
  60_000,
)
