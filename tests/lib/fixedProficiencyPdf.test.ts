import { PDFDocument } from '@cantoo/pdf-lib'
import { expect, test } from 'vitest'
import {
  createCharacterSheetViewModel,
  withoutSheetDescriptions,
} from '@/lib/pdf/characterSheetViewModel'
import { makeFixedCharacterFixture } from '../fixtures/fixedProficiencyFixtures'
import { generateTestCharacterSheet } from '../fixtures/pdfTemplates'

test.each(
  (
    [
      ['Rogue', 'PHB', '2014-custom', 'nature', 'Nat', 4],
      ['Rogue', 'XPHB', '2024-official', 'survival', 'Text_41', 4],
      ['Fighter', 'PHB', '2014-custom', 'persuasion', 'Pers', 6],
      ['Fighter', 'XPHB', '2024-official', 'persuasion', 'Text_46', 6],
    ] as const
  ).flatMap(([name, source, template, skill, field, expected]) =>
    [true, false].map((descriptions) => ({
      name,
      source,
      template,
      skill,
      field,
      expected,
      descriptions,
    })),
  ),
)('actual $name/$source fixed Expertise reaches $template numeric fields with descriptions $descriptions', async ({
  name,
  source,
  template,
  skill,
  field,
  expected,
  descriptions,
}) => {
  const f = makeFixedCharacterFixture(name, source)
  const input = {
    ...f.data.lookups!,
    classChoiceClasses: f.data.classes,
    classChoiceFeatureCatalogs: f.catalogs,
  }
  const vm = createCharacterSheetViewModel(f.character, input)
  expect(vm.skillByName.get(skill)?.modifier).toBe(expected)
  const view = descriptions ? vm : withoutSheetDescriptions(vm)
  const form = (await PDFDocument.load(await generateTestCharacterSheet(view, template))).getForm()
  expect(form.getTextField(field).getText()).toBe(`+${expected}`)
  const lost = createCharacterSheetViewModel(f.character, {
    ...input,
    classChoiceFeatureCatalogs: { ...f.catalogs, classes: [] },
  })
  expect(lost.skillByName.get(skill)?.modifier).toBe(0)
})
test.each(
  (['2014-custom', '2024-official'] as const).flatMap((template) =>
    [true, false].map((descriptions) => ({ template, descriptions })),
  ),
)('actual automatic tool Expertise is visible in $template with descriptions $descriptions', async ({
  template,
  descriptions,
}) => {
  const f = makeFixedCharacterFixture('Artificer', 'TCE')
  f.character.proficiencies.tools = ['Dice Set']
  const input = {
    ...f.data.lookups!,
    classChoiceClasses: f.data.classes,
    classChoiceFeatureCatalogs: f.catalogs,
  }
  const vm = createCharacterSheetViewModel(f.character, input)
  expect(vm.toolExpertiseSummary).toContain('Double your proficiency bonus')
  const view = descriptions ? vm : withoutSheetDescriptions(vm)
  const form = (await PDFDocument.load(await generateTestCharacterSheet(view, template))).getForm()
  expect(
    form.getTextField(template === '2014-custom' ? 'Extra.Notes' : 'Text_56').getText(),
  ).toContain(template === '2014-custom' ? 'Tool Expertise: Dice Set' : 'Dice Set (Expertise)')
})
