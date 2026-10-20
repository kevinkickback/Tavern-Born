import { PDFDocument } from '@cantoo/pdf-lib'
import { expect, test } from 'vitest'
import { getProficiencyOption } from '@/lib/5etools/classProficiencyIdentity'
import { applyClassChoiceSelectionWithGrantsCommand } from '@/lib/character/commands/classChoiceCommands'
import {
  createCharacterSheetViewModel,
  withoutSheetDescriptions,
} from '@/lib/pdf/characterSheetViewModel'
import { makeKnowledgeFixture } from '../fixtures/knowledgeProficiencyFixtures'
import { generateTestCharacterSheet } from '../fixtures/pdfTemplates'

test.each(
  (
    [
      ['PHB', 'PHB', '2014-custom', 'Arc'],
      ['XPHB', 'FRHoF', '2024-official', 'Text_32'],
    ] as const
  ).flatMap(([parent, source, template, field]) =>
    [true, false].map((descriptions) => ({ parent, source, template, field, descriptions })),
  ),
)('$parent/$source paired grants reach actual $template PDF fields with descriptions $descriptions', async ({
  parent,
  source,
  template,
  field,
  descriptions,
}) => {
  const f = makeKnowledgeFixture(parent, source)
  const authority = { classes: f.data.classes, catalogs: f.catalogs }
  const paired = applyClassChoiceSelectionWithGrantsCommand(
    f.character,
    f.character.provenance,
    f.choices[0],
    [getProficiencyOption('expertise', 'Arcana')],
    authority,
  )
  const partial = { ...f.character, ...paired.characterPatch, provenance: paired.provenanceUpdate }
  const sibling = applyClassChoiceSelectionWithGrantsCommand(
    partial,
    partial.provenance,
    f.choices[1],
    source === 'PHB'
      ? [getProficiencyOption('languages', 'Elvish'), getProficiencyOption('languages', 'Dwarvish')]
      : [getProficiencyOption('tools', f.data.items[0].name)],
    authority,
  )
  const saved = { ...partial, ...sibling.characterPatch, provenance: sibling.provenanceUpdate }
  const before = JSON.stringify(saved)
  const input = {
    ...f.data.lookups!,
    classChoiceClasses: f.data.classes,
    classChoiceFeatureCatalogs: f.catalogs,
  }
  const baseline = createCharacterSheetViewModel(f.character, input).skillByName.get('arcana')!
  const vm = createCharacterSheetViewModel(saved, input)
  expect(vm.skillByName.get('arcana')!.modifier).toBe(baseline.modifier + 4)
  if (source === 'PHB') expect(vm.proficienciesSummary).toContain('Languages: elvish, dwarvish')
  else expect(vm.toolProficiencies).toEqual([f.data.items[0].name.toLowerCase()])
  const view = descriptions ? vm : withoutSheetDescriptions(vm)
  const form = (await PDFDocument.load(await generateTestCharacterSheet(view, template))).getForm()
  const modifier = view.skillByName.get('arcana')!.modifier
  expect(form.getTextField(field).getText()).toBe(modifier >= 0 ? `+${modifier}` : String(modifier))
  const missing = createCharacterSheetViewModel(saved, {
    ...input,
    classChoiceFeatureCatalogs: { ...f.catalogs, classes: [] },
  })
  expect(missing.skillByName.get('arcana')!.modifier).toBe(baseline.modifier)
  expect(missing.toolProficiencies).toEqual([])
  expect(JSON.stringify(saved)).toBe(before)
})
