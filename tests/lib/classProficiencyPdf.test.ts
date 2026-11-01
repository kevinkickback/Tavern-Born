import { decodePDFRawStream, PDFDocument, PDFRawStream } from '@cantoo/pdf-lib'
import { expect, test } from 'vitest'
import { getProficiencyOption } from '@/lib/5etools/classProficiencyIdentity'
import {
  applyProficiency,
  expertiseOption,
  makeClassProficiencyFixture,
} from '../fixtures/classProficiencyFixtures'
import {
  createCurrentCharacterSheetViewModel,
  generateTestCharacterSheet,
} from '../fixtures/pdfTemplates'

test.each([
  ['Bard', 'PHB', 3, '2014-custom', 'Arc'],
  ['Wizard', 'XPHB', 2, '2024-official', 'Text_32'],
] as const)('%s %s level %s source-owned Expertise reaches the %s PDF field %s', async (name, source, level, id, field) => {
  const f = makeClassProficiencyFixture(name, source, level)
  const saved = applyProficiency(f, f.choices[0], [expertiseOption('Arcana')])
  const input = {
    ...f.data.lookups!,
    classChoiceClasses: f.data.classes,
    classChoiceFeatureCatalogs: f.catalogs,
  }
  const vm = createCurrentCharacterSheetViewModel(saved, input)
  const base = createCurrentCharacterSheetViewModel(f.character, input).skillByName.get('arcana')!
  expect(vm.skillByName.get('arcana')!.modifier).toBe(base.modifier + 2)
  const form = (await PDFDocument.load(await generateTestCharacterSheet(vm, id))).getForm()
  const modifier = vm.skillByName.get('arcana')!.modifier
  expect(form.getTextField(field).getText()).toBe(modifier >= 0 ? `+${modifier}` : String(modifier))
  const missing = createCurrentCharacterSheetViewModel(saved, {
    ...input,
    classChoiceFeatureCatalogs: {
      ...f.catalogs,
      classFeatures: [],
      classFeatureCandidates: new Map(),
    },
  })
  expect(missing.skillByName.get('arcana')!.modifier).toBe(base.modifier)
})

test.each([
  '2014-official',
  '2014-custom',
  '2024-official',
  '2024-custom',
] as const)('%s actual binary preserves explicit PHB Rogue tool expertise', async (id) => {
  const f = makeClassProficiencyFixture()
  const saved = applyProficiency(f, f.choices[0], [
    expertiseOption('Stealth'),
    getProficiencyOption('expertise', "thieves' tools", 'tool'),
  ])
  const before = JSON.stringify(saved)
  const input = {
    ...f.data.lookups!,
    classChoiceClasses: f.data.classes,
    classChoiceFeatureCatalogs: f.catalogs,
  }
  const vm = createCurrentCharacterSheetViewModel(saved, input)
  expect(vm.toolProficiencies).toEqual(["thieves' tools (Expertise)"])
  const bytes = await generateTestCharacterSheet(vm, id)
  const form = (await PDFDocument.load(bytes)).getForm()
  if (id === '2014-custom') {
    expect(form.getTextField('Tool 1').getText()).toBe("thieves' tools")
    const notes = form.getTextField('Extra.Notes')
    expect(notes.getText()).toBe(
      "Tool Expertise: thieves' tools. Double your proficiency bonus for ability checks using this proficient tool.",
    )
    const widget = notes.acroField.getWidgets()[0]
    const appearance = notes.doc.context.lookup(widget.getAppearances()?.normal)
    expect(appearance).toBeInstanceOf(PDFRawStream)
    const operators = new TextDecoder().decode(
      decodePDFRawStream(appearance as PDFRawStream).decode(),
    )
    expect(operators).toContain(' Tj')
    expect(
      [...operators.matchAll(/1 0 0 1 [\d.-]+ ([\d.-]+) Tm/g)].every(
        (match) => Number(match[1]) >= 0,
      ),
    ).toBe(true)
  } else {
    const field = id === '2014-official' ? 'ProficienciesLang' : 'Text_56'
    expect(form.getTextField(field).getText()?.toLowerCase()).toContain(
      "thieves' tools (expertise)",
    )
  }
  const unavailable = createCurrentCharacterSheetViewModel(saved, {
    ...input,
    classChoiceFeatureCatalogs: {
      ...f.catalogs,
      classFeatures: [],
      classFeatureCandidates: new Map(),
    },
  })
  expect(unavailable.toolProficiencies).toEqual(["thieves' tools"])
  expect(unavailable.toolExpertiseSummary).toBe('')
  expect(JSON.stringify(saved)).toBe(before)
})

test('custom 2014 keeps defensive continuation after tool expertise in the default export', async () => {
  const f = makeClassProficiencyFixture()
  const saved = applyProficiency(f, f.choices[0], [
    expertiseOption('Stealth'),
    getProficiencyOption('expertise', "thieves' tools", 'tool'),
  ])
  const vm = createCurrentCharacterSheetViewModel(saved, {
    ...f.data.lookups!,
    classChoiceClasses: f.data.classes,
    classChoiceFeatureCatalogs: f.catalogs,
  })
  vm.defensiveTraits = Array.from({ length: 9 }, (_, i) => `Defensive trait ${i + 1}`)
  const normal = (
    await PDFDocument.load(await generateTestCharacterSheet(vm, '2014-custom'))
  ).getForm()
  expect(normal.getTextField('Extra.Notes').getText()).toBe(
    [vm.toolExpertiseSummary, ...vm.defensiveTraits.slice(6)].join('\n'),
  )
})

test('custom 2014 preserves crowded defensive text through normal notes overflow', async () => {
  const f = makeClassProficiencyFixture()
  const saved = applyProficiency(f, f.choices[0], [
    expertiseOption('Stealth'),
    getProficiencyOption('expertise', "thieves' tools", 'tool'),
  ])
  const vm = createCurrentCharacterSheetViewModel(saved, {
    ...f.data.lookups!,
    classChoiceClasses: f.data.classes,
    classChoiceFeatureCatalogs: f.catalogs,
  })
  vm.defensiveTraits = Array.from({ length: 9 }, (_, i) => `Defensive trait ${i + 1}`)
  vm.defensiveTraits = [
    ...vm.defensiveTraits.slice(0, 6),
    ...Array.from(
      { length: 100 },
      (_, i) =>
        `Defensive continuation ${i + 1}: preserve the original explanation in the exported character sheet.`,
    ),
  ]
  const crowded = (
    await PDFDocument.load(
      await generateTestCharacterSheet(vm, '2014-custom', { text: { overflow: 'notes' } }),
    )
  ).getForm()
  expect(crowded.getTextField('Extra.Notes').getText()?.replace(/\s+/g, ' ')).toContain(
    vm.toolExpertiseSummary,
  )
  const text = crowded
    .getFields()
    .filter((field) => 'getText' in field)
    .map((field) => (field as { getText(): string | undefined }).getText() ?? '')
    .join('\n')
  expect(text.replace(/\s+/g, ' ')).toContain(vm.defensiveTraits[105])
})
