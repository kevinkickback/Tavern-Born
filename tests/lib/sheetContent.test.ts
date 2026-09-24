import { PDFDict, PDFDocument, PDFDropdown, PDFName, PDFTextField } from '@cantoo/pdf-lib'
import { describe, expect, test } from 'vitest'
import { buildClassLookup } from '@/lib/5etools/lookups'
import { createEmptyCharacter } from '@/lib/character/createCharacter'
import { buildCharacterSheetFieldMap } from '@/lib/pdf/characterSheetPdf'
import { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import { getPdfExportPreflight } from '@/lib/pdf/exportPreflight'
import { planSheetContent } from '@/lib/pdf/sheetContent'
import type { SheetExportReport } from '@/lib/pdf/types'
import { makeClassFixture } from '../fixtures/gameDataFixtures'
import { generateTestCharacterSheet } from '../fixtures/pdfTemplates'

function model() {
  return createCharacterSheetViewModel(createEmptyCharacter({ name: 'Overflow review' }), {})
}
function attacks(vm: ReturnType<typeof model>) {
  vm.weaponRows = Array.from({ length: 8 }, (_, index) => ({
    id: `weapon:${index}`,
    active: index > 3,
    name: `Attack ${index}`,
    attackBonus: '+5',
    damage: '1d6 + 2',
    damageType: 'Piercing',
    range: '30 ft.',
    notes: '',
    description: `Attack ${index} rules; once per turn.`,
  }))
}
function notes(doc: PDFDocument) {
  return doc
    .getForm()
    .getFields()
    .filter(
      (field): field is PDFTextField =>
        field instanceof PDFTextField && field.getName().includes('ASnotes.Notes.'),
    )
    .map((field) => field.getText() ?? '')
    .join('\n')
}

describe('Automatic sheet content and lossless overflow', () => {
  test.each([
    false,
    true,
  ])('excluded spell pages do not create notes unless explicitly requested: %s', async (includeNotes) => {
    const vm = model()
    vm.spellRows = [
      {
        id: 'shield|phb',
        name: 'Shield',
        level: '1',
        prepared: true,
        castingTimeAndDuration: '',
        castingTime: '',
        duration: '',
        range: '',
        components: '',
        notes: '',
        concentration: false,
        ritual: false,
        material: false,
      },
    ]
    const pages = { spells: false, ...(includeNotes ? { notes: true } : {}) }
    const content = { spells: [] }
    expect(planSheetContent(vm, '2014-official', content, pages).overflow).toEqual([])
    let report: SheetExportReport | undefined
    const doc = await PDFDocument.load(
      await generateTestCharacterSheet(vm, '2014-official', {
        pages,
        content,
        text: { overflow: 'notes' },
        onReport: (result) => {
          report = result
        },
      }),
    )
    expect(doc.getPageCount()).toBe(includeNotes ? 3 : 2)
    expect(report?.notesPageCount).toBe(includeNotes ? 1 : 0)
    expect(report?.omitted).toEqual([])
    expect(notes(doc).trim()).toBe('')
  })

  test('retains every multiclass Hit Dice pool before applying template capacity', async () => {
    const classes = ['Wizard', 'Cleric', 'Fighter', 'Barbarian'].map((name, index) =>
      makeClassFixture({ name, source: 'PHB', hd: { number: 1, faces: 6 + index * 2 } }),
    )
    const vm = createCharacterSheetViewModel(
      createEmptyCharacter({
        classProgression: classes.map((entry) => ({
          name: entry.name,
          source: entry.source,
          levels: 1,
        })),
      }),
      { classesByKey: buildClassLookup(classes) },
    )
    expect(vm.hitDiceRows.map((row) => row.die)).toEqual(['d6', 'd8', 'd10', 'd12'])
    expect(buildCharacterSheetFieldMap(vm, '2014-official').textFields.HD).toContain('d12')
    expect(planSheetContent(vm, '2014-custom').overflow).toContainEqual(
      expect.objectContaining({ id: 'capacity:hit-dice', text: '1d12; 0 used' }),
    )
    const doc = await PDFDocument.load(
      await generateTestCharacterSheet(vm, '2014-custom', {
        pages: { spells: false },
        text: { overflow: 'notes' },
      }),
    )
    expect(notes(doc)).toContain('1d12; 0 used')
  }, 30_000)

  test.each([
    '2014-official',
    '2014-custom',
    '2024-official',
    '2024-custom',
  ] as const)('%s omits rules descriptions on request while retaining names, attack values, and backstory', async (id) => {
    const character = createEmptyCharacter({ name: 'Names review' })
    character.features = [
      {
        id: 'feature',
        name: 'Special Feature',
        source: 'TEST',
        description: 'FEATURE RULES MUST BE OMITTED',
      },
    ]
    character.feats = [
      {
        id: 'feat',
        name: 'Chosen Feat',
        source: 'TEST',
        description: 'FEAT RULES MUST BE OMITTED',
      },
    ]
    character.details.backstory = 'A traveler from the coast.'
    const vm = createCharacterSheetViewModel(character, {})
    attacks(vm)
    const before = structuredClone(vm)
    const doc = await PDFDocument.load(
      await generateTestCharacterSheet(vm, id, {
        text: { descriptions: 'names', overflow: 'ellipsis' },
        pages: { notes: false },
      }),
    )
    const text = doc
      .getForm()
      .getFields()
      .map((field) =>
        field instanceof PDFTextField
          ? (field.getText() ?? '')
          : field instanceof PDFDropdown
            ? field.getSelected().join(', ')
            : '',
      )
      .join('\n')
    expect(text).toContain('Special Feature')
    expect(text).toContain('Chosen Feat')
    expect(text).toContain('A traveler from the coast.')
    expect(text).toContain('+5')
    expect(text).not.toContain('RULES MUST BE OMITTED')
    expect(text).not.toContain('once per turn')
    expect(vm).toEqual(before)
  }, 30_000)

  test.each([
    false,
    true,
  ])('defaults to ellipsis without appending overflow to notes (explicit notes: %s)', async (notesIncluded) => {
    const vm = model()
    vm.racialTraitsSummary = 'Darkvision: Detailed rules. '.repeat(250)
    const shortened: string[] = []
    let report: SheetExportReport | undefined
    const doc = await PDFDocument.load(
      await generateTestCharacterSheet(vm, '2024-official', {
        pages: notesIncluded ? { notes: true } : {},
        onTextTruncated: (field) => shortened.push(field),
        onReport: (value) => {
          report = value
        },
      }),
    )
    const trait = doc.getForm().getTextField('Text_59').getText() ?? ''
    expect(trait).toContain('Darkvision: Detailed rules.')
    expect(trait).toMatch(/(?:…|\.\.\.)$/)
    expect(trait).not.toContain('Continued')
    expect(doc.getPageCount()).toBe(notesIncluded ? 3 : 2)
    expect(notes(doc).trim()).toBe('')
    expect(report?.preserved).toEqual([])
    expect(shortened).toEqual([])
  }, 30_000)

  test('prefers equipped attacks, keeps stable manual choices after reordering, and never mutates the character', () => {
    const vm = model()
    attacks(vm)
    const before = structuredClone(vm.character)
    const automatic = planSheetContent(vm, '2014-official')
    expect(automatic.viewModel.weaponRows.map((row) => row.id)).toEqual([
      'weapon:4',
      'weapon:5',
      'weapon:6',
    ])
    const selected = planSheetContent(vm, '2014-official', { weapons: ['weapon:1'] })
    expect(selected.viewModel.weaponRows.map((row) => row.id)).toEqual(['weapon:1'])
    vm.weaponRows.reverse()
    expect(
      planSheetContent(vm, '2014-official', {
        weapons: ['weapon:1', 'deleted-id'],
      }).viewModel.weaponRows.map((row) => row.id),
    ).toEqual(['weapon:1'])
    expect(selected.overflow[0].text).toContain('Attack 7 rules; once per turn.')
    expect(vm.character).toEqual(before)
  })

  test.each([
    '2014-official',
    '2014-custom',
    '2024-official',
    '2024-custom',
  ] as const)('%s preserves omitted attacks and full prose in editable notes without truncation warnings', async (id) => {
    const vm = model()
    attacks(vm)
    const prose = `${'Long feature text. '.repeat(600)}FINAL CONDITION: only once per long rest.`
    vm.featuresSummary = prose
    vm.classFeaturesSummary2014 = prose
    let report: SheetExportReport | undefined
    const warnings: string[] = []
    const doc = await PDFDocument.load(
      await generateTestCharacterSheet(vm, id, {
        text: { overflow: 'notes' },
        onReport: (value) => {
          report = value
        },
        onTextTruncated: (name) => warnings.push(name),
      }),
    )
    expect(report?.notesPageCount).toBeGreaterThan(0)
    expect(notes(doc).replace(/\s+/g, ' ')).toContain('Attack 3 rules; once per turn.')
    expect(notes(doc).replace(/\s+/g, ' ')).toContain('FINAL CONDITION: only once per long rest.')
    expect(warnings).toEqual([])
    expect(
      getPdfExportPreflight(id, vm, null, [], {}, warnings, {}, report).issues.filter(
        (issue) => issue.category === 'truncation',
      ),
    ).toEqual([])
    const field = doc.getForm().getTextField('P5.ASnotes.Notes.Left')
    field.setText('Editable notes')
    const reopened = await PDFDocument.load(await doc.save())
    expect(reopened.getForm().getTextField('P5.ASnotes.Notes.Left').getText()).toBe(
      'Editable notes',
    )
  }, 30_000)

  test('explicitly omitting notes preserves the choice and reports actual omissions', async () => {
    const vm = model()
    attacks(vm)
    vm.featuresSummary = 'Only once per long rest. '.repeat(300)
    let report: SheetExportReport | undefined
    const warnings: string[] = []
    const doc = await PDFDocument.load(
      await generateTestCharacterSheet(vm, '2014-official', {
        text: { overflow: 'notes' },
        pages: { notes: false },
        onReport: (value) => {
          report = value
        },
        onTextTruncated: (name) => warnings.push(name),
      }),
    )
    expect(doc.getPageCount()).toBe(2)
    expect(report?.notesPageCount).toBe(0)
    const issues = getPdfExportPreflight(
      '2014-official',
      vm,
      null,
      [],
      {},
      warnings,
      { notes: false },
      report,
    ).issues
    expect(issues.some((issue) => issue.groupId === 'weapons')).toBe(true)
    expect(issues.some((issue) => issue.title.includes('was shortened'))).toBe(true)
  })

  test('inventory print choices preserve the equipped armor and ammunition context', () => {
    const vm = model()
    vm.character.equipment = [
      {
        id: 'armor',
        name: 'Scale mail',
        type: 'MA',
        source: 'PHB',
        quantity: 1,
        equipped: true,
        armorType: 'medium',
        ac: 14,
      },
    ]
    const selected = planSheetContent(vm, '2014-custom', { equipment: [] }).viewModel
    expect(selected.equipmentForSheet).toEqual([])
    expect(selected.character).toBe(vm.character)
    expect(selected.character.equipment[0].equipped).toBe(true)
  })

  test('MPMB companion copies have independent editable identities', async () => {
    const vm = model()
    vm.companions = [{ name: 'Owl' }, { name: 'Wolf' }]
    const doc = await PDFDocument.load(
      await generateTestCharacterSheet(vm, '2014-custom', { pages: { notes: false } }),
    )
    expect(doc.getPageCount()).toBe(6)
    expect(doc.getForm().getTextField('P4.AScomp.Comp.Desc.Name').getText()).toBe('Owl')
    expect(doc.getForm().getTextField('Companion2__P4.AScomp.Comp.Desc.Name').getText()).toBe(
      'Wolf',
    )
  }, 30_000)

  test('continues 2014 spells by level, preserving each spell and preparation state', async () => {
    const vm = model()
    vm.spellRows = Array.from({ length: 27 }, (_, index) => ({
      id: `spell:${index}`,
      name: `Spell ${index}`,
      level: '1',
      prepared: index === 26,
      castingTimeAndDuration: '',
      castingTime: '',
      duration: '',
      range: '',
      components: '',
      notes: '',
      concentration: false,
      ritual: false,
      material: false,
    }))
    let report: SheetExportReport | undefined
    const doc = await PDFDocument.load(
      await generateTestCharacterSheet(vm, '2014-official', {
        onReport: (value) => {
          report = value
        },
      }),
    )
    expect(doc.getPageCount()).toBe(5)
    expect(doc.getForm().getTextField('Spells 1015').getText()).toBe('Spell 26')
    expect(doc.getForm().getCheckBox('Check Box 251').isChecked()).toBe(true)
    const values = doc
      .getForm()
      .getFields()
      .filter(
        (field): field is PDFTextField =>
          field instanceof PDFTextField && /(?:^|__)Spells /.test(field.getName()),
      )
      .map((field) => field.getText())
      .filter(Boolean)
    expect(new Set(values).size).toBe(27)
    expect(
      getPdfExportPreflight('2014-official', vm, null, [], {}, [], {}, report).issues.filter(
        (issue) => issue.category === 'truncation',
      ),
    ).toEqual([])
  }, 30_000)

  test('long notes continue across independent fields without losing any numbered condition', async () => {
    const vm = model()
    vm.featuresSummary = Array.from(
      { length: 220 },
      (_, index) =>
        `Condition-${index}: This ability requires a reaction and can only be used once per long rest.`,
    ).join('\n')
    let report: SheetExportReport | undefined
    const doc = await PDFDocument.load(
      await generateTestCharacterSheet(vm, '2014-official', {
        text: { overflow: 'notes' },
        onReport: (value) => {
          report = value
        },
      }),
    )
    expect(report?.notesPageCount).toBeGreaterThan(1)
    const text = notes(doc).replace(/\s+/g, ' ')
    for (let index = 0; index < 220; index++)
      expect(text).toContain(
        `Condition-${index}: This ability requires a reaction and can only be used once per long rest.`,
      )
    const first = doc.getForm().getTextField('P5.ASnotes.Notes.Left')
    const next = doc.getForm().getTextField('NotesPage2__P5.ASnotes.Notes.Left')
    expect(first.acroField.getWidgets()[0].P()).not.toBe(next.acroField.getWidgets()[0].P())
    expect(doc.getForm().getTextField('Features and Traits').getText()).toContain(
      'Continued on page 3.',
    )
    expect(doc.getForm().getTextField('Features and Traits').getText()).toContain('Condition-0:')
    const fontName = doc
      .getForm()
      .getTextField('Features and Traits')
      .acroField.getDefaultAppearance()
      ?.match(/\/(\S+)\s+[\d.]+\s+Tf/)?.[1]
    expect(fontName).toBeTruthy()
    expect(
      doc
        .getForm()
        .acroForm.dict.lookup(PDFName.of('DR'), PDFDict)
        .lookup(PDFName.of('Font'), PDFDict)
        .has(PDFName.of(fontName!)),
    ).toBe(true)
  }, 30_000)

  test.each([
    '2024-official',
    '2024-custom',
  ] as const)('%s keeps useful text in species, feats, backstory and equipment when notes are needed', async (id) => {
    const vm = model()
    vm.racialTraitsSummary = `Darkvision: ${'You can see in darkness within the stated range. '.repeat(150)}`
    vm.featsSummary = `Alert: ${'Apply this benefit when its conditions are met. '.repeat(150)}`
    vm.historyAndPersonalitySummary = `Raised in Waterdeep. ${'A longer account of the character history. '.repeat(150)}`
    vm.equipmentSummary = Array.from({ length: 100 }, (_, index) => `Equipment item ${index}`).join(
      '\n',
    )
    const doc = await PDFDocument.load(
      await generateTestCharacterSheet(vm, id, { text: { overflow: 'notes' } }),
    )
    for (const [field, beginning] of [
      ['Text_59', 'Darkvision:'],
      ['Text_60', 'Alert:'],
      ['Text_89', 'Raised in Waterdeep.'],
      ['Text_90', 'Equipment item 0'],
    ]) {
      const value = doc.getForm().getTextField(field).getText() ?? ''
      expect(value).toContain(beginning)
      expect(value).toMatch(/Continued on page \d+\./)
      expect(value.length).toBeGreaterThan(100)
    }
  }, 30_000)
})
