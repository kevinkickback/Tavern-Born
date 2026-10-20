import { PDFDocument, PDFTextField } from '@cantoo/pdf-lib'
import { expect, test } from 'vitest'
import { deriveConditionalProficiencyNotes } from '@/lib/character/conditionalProficiencyNotes'
import { getCharacterSheetTemplate } from '@/lib/pdf/characterSheetTemplates'
import {
  createCharacterSheetViewModel,
  withoutSheetDescriptions,
} from '@/lib/pdf/characterSheetViewModel'
import { getPdfExportPreflight } from '@/lib/pdf/exportPreflight'
import { asFieldWithInternals } from '@/lib/pdf/pdfFieldInternals'
import type { SheetExportReport } from '@/lib/pdf/types'
import type { CharacterEffect } from '@/types/effects'
import { makeConditionalCharacterFixture } from '../fixtures/conditionalProficiencyFixtures'
import {
  makeNaturalExplorerFixture,
  selectNaturalExplorer,
} from '../fixtures/naturalExplorerFixtures'
import { generateTestCharacterSheet } from '../fixtures/pdfTemplates'

function twoNotes() {
  const f = makeConditionalCharacterFixture()
  const character = f.select(['Fire Rune'])
  character.classProgression.push({
    name: 'Sorcerer',
    source: 'PHB',
    levels: 1,
    subclass: 'Draconic Bloodline',
    subclassSource: 'PHB',
  })
  const vm = createCharacterSheetViewModel(character, f.input)
  const effects = deriveConditionalProficiencyNotes(character, f.catalogs)
  expect(vm.proficiencyCheckNotes).toHaveLength(2)
  return { ...f, character, vm, effects }
}
const unsupported = (
  vm: ReturnType<typeof createCharacterSheetViewModel>,
  effects: CharacterEffect[],
  report?: SheetExportReport,
) =>
  getPdfExportPreflight('2024-official', vm, null, effects, {}, [], {}, report)
    .issues.filter((row) => row.category === 'unsupported')
    .map((row) => row.id)

test.each(
  (['2014-custom', '2014-official', '2024-custom', '2024-official'] as const).flatMap((template) =>
    (['full', 'names'] as const).map((descriptions) => ({ template, descriptions })),
  ),
)('actual $template retains exact complete qualified notes once in $descriptions export', async ({
  template,
  descriptions,
}) => {
  const f = twoNotes()
  const terrain = makeConditionalCharacterFixture('Ranger', 'PHB', 10)
  f.character.classProgression.push({ name: 'Ranger', source: 'PHB', levels: 10 })
  let character = terrain.selectTerrain(1, 'Forest', f.character)
  character = terrain.selectTerrain(6, 'Coast', character)
  character = terrain.selectTerrain(10, 'Arctic', character)
  f.vm = createCharacterSheetViewModel(character, f.input)
  f.effects = deriveConditionalProficiencyNotes(character, f.catalogs)
  expect(f.vm.proficiencyCheckNotes).toHaveLength(3)
  let report: SheetExportReport | undefined
  const bytes = await generateTestCharacterSheet(f.vm, template, {
    text: { descriptions, overflow: 'notes' },
    pages: { notes: true },
    onReport: (value) => {
      report = value
    },
  })
  const pdf = await PDFDocument.load(bytes)
  const text = pdf
    .getForm()
    .getFields()
    .flatMap((field) => (field instanceof PDFTextField ? [field.getText() ?? ''] : []))
    .join('\n')
  expect(report!.representedProficiencyCheckNotes).toEqual(f.vm.proficiencyCheckNotes)
  for (const row of f.vm.proficiencyCheckNotes!) {
    expect(text.replace(/\s+/gu, ' ').split(row.text.replace(/\s+/gu, ' '))).toHaveLength(2)
    expect(f.vm.classFeaturesSummary2014).toContain(row.text)
    expect(withoutSheetDescriptions(f.vm).featuresSummary).toContain(row.text)
  }
  expect(
    getPdfExportPreflight(
      template,
      f.vm,
      null,
      f.effects,
      {},
      [],
      { notes: true },
      report,
    ).issues.filter((row) => row.category === 'unsupported'),
  ).toEqual([])
})

test.each([
  'full',
  'names',
] as const)('actual forced short field requires included complete continuation for %s notes', async (descriptions) => {
  const f = twoNotes()
  // A real, tiny widget forces the production fitting/continuation path for this exact mapped field.
  const { generateFilledCharacterSheetPdf } = await import('@/lib/pdf/characterSheetPdf')
  const { readFileSync } = await import('node:fs')
  const base = await PDFDocument.load(
    new Uint8Array(readFileSync(`public/${getCharacterSheetTemplate('2024-official').assetPath}`)),
  )
  for (const name of ['Text_57', 'Text_58']) {
    const widget = asFieldWithInternals(
      base.getForm().getTextField(name),
    )!.acroField.getWidgets()[0]
    widget.setRectangle({ ...widget.getRectangle(), width: 90, height: 28 })
  }
  for (const includeNotes of [false, true]) {
    let report: SheetExportReport | undefined
    const vm = descriptions === 'names' ? withoutSheetDescriptions(f.vm) : f.vm
    await generateFilledCharacterSheetPdf(vm, await base.save(), '2024-official', {
      text: { descriptions, overflow: 'notes' },
      pages: { notes: includeNotes, spells: false, companion: false },
      loadNotes: async () => new Uint8Array(readFileSync('public/pdf/2014/mpmb-notes.pdf')),
      onReport: (value) => {
        report = value
      },
    })
    expect(report!.representedProficiencyCheckNotes).toEqual(
      includeNotes ? vm.proficiencyCheckNotes : [],
    )
    expect(unsupported(vm, f.effects, report)).toHaveLength(includeNotes ? 0 : 2)
    expect(includeNotes ? report!.preserved.length : report!.omitted.length).toBeGreaterThan(0)
  }
})

test('preflight authenticates each exact current ID/text and never exempts an unrelated conditional effect', () => {
  const f = twoNotes()
  const rows = f.vm.proficiencyCheckNotes!
  expect(unsupported(f.vm, f.effects)).toHaveLength(2)
  const report: SheetExportReport = {
    notesPageCount: 0,
    preserved: [],
    omitted: [],
    representedProficiencyCheckNotes: [rows[0]],
  }
  expect(unsupported(f.vm, f.effects, report)).toEqual([`unsupported:${rows[1].effectId}`])
  expect(
    unsupported(f.vm, f.effects, {
      ...report,
      representedProficiencyCheckNotes: rows.map((row) => ({
        ...row,
        text: row.text.replace('While wearing or carrying', 'While wearing'),
      })),
    }),
  ).toEqual([`unsupported:${rows[0].effectId}`])
  const unrelated: CharacterEffect = {
    id: 'other:condition',
    label: 'Other conditional rule',
    source: { kind: 'class', name: 'Other' },
    target: { kind: 'initiative' },
    operation: { kind: 'conditional-note', note: 'Only at night.' },
  }
  expect(
    unsupported(f.vm, [...f.effects, unrelated], {
      ...report,
      representedProficiencyCheckNotes: rows,
    }),
  ).toEqual(['unsupported:other:condition'])
})

test('terrain text changes with a stable ID invalidate old export evidence and keep full conditions in names mode', () => {
  const f = makeNaturalExplorerFixture()
  const first = selectNaturalExplorer(f)
  const second = selectNaturalExplorer(f, 6, 'Coast', first)
  const input = {
    ...f.data.lookups!,
    classChoiceClasses: f.data.classes,
    classChoiceFeatureCatalogs: f.catalogs,
  }
  const old = createCharacterSheetViewModel(first, input)
  const vm = createCharacterSheetViewModel(second, input)
  expect(vm.proficiencyCheckNotes![0].effectId).toBe(old.proficiencyCheckNotes![0].effectId)
  expect(vm.proficiencyCheckNotes![0].text).toContain('Forest, Coast')
  expect(withoutSheetDescriptions(vm).classFeaturesSummary2014).toContain(
    vm.proficiencyCheckNotes![0].text,
  )
  expect(
    unsupported(vm, deriveConditionalProficiencyNotes(second, f.catalogs), {
      notesPageCount: 1,
      preserved: [],
      omitted: [],
      representedProficiencyCheckNotes: old.proficiencyCheckNotes,
    }),
  ).toHaveLength(1)
})
