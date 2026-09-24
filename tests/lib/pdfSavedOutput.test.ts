import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { type PDFDict, PDFDocument, PDFName, PDFRawStream } from '@cantoo/pdf-lib'
import { describe, expect, test } from 'vitest'
import {
  asFieldWithInternals,
  type FormWithInternals,
  findAttachedWidgetLocation,
} from '@/lib/pdf/pdfFieldInternals'
import { fillCharacterSheetPdf } from '@/lib/pdf/pdfFormAdapter'

const AFFECTED_TEXT_FIELDS = {
  'AC Armor Bonus': '16',
  'AC Armor Description': 'Mithral Plate',
  'Resistance Damage Type 1': 'Fire resistance',
  'Language 1': 'Common',
  'Language 2': 'Elvish',
  'Tool 1': "Thieves' Tools",
  'Tool 2': 'Herbalism Kit',
}

const AFFECTED_CHECKBOX_FIELDS = {
  'Proficiency Armor Light': true,
  'Proficiency Armor Medium': true,
  'Proficiency Armor Heavy': true,
  'Proficiency Shields': true,
}

describe('2014 saved PDF compatibility', () => {
  test('rejects a template that is missing a required mapped field', async () => {
    const template = await PDFDocument.create()
    template.addPage()

    await expect(
      fillCharacterSheetPdf(
        await template.save(),
        { textFields: { RequiredField: 'value' }, checkboxFields: {} },
        { cleanupProfile: 'standard' },
      ),
    ).rejects.toThrow('PDF template is missing 1 required field: RequiredField')
  })

  test('persists affected values and portable appearances in the saved file', async () => {
    const templateBytes = new Uint8Array(
      readFileSync(join(process.cwd(), 'scripts', 'pdf-sources', '2014_MPMB_Character_Sheet.pdf')),
    )
    const template = await PDFDocument.load(templateBytes)
    expect(template.getPageCount()).toBe(6)
    expect(template.getForm().getFieldMaybe('d20warning')).toBeUndefined()
    expect(template.getForm().getFieldMaybe('AmmoLeft.Top.1')).toBeUndefined()
    const portrait = asFieldWithInternals(template.getForm().getButton('Portrait'))
    const portraitWidgets = portrait?.acroField.getWidgets() ?? []
    expect(portraitWidgets).toHaveLength(1)
    expect(findAttachedWidgetLocation(template, portraitWidgets)?.pageIndex).toBe(3)

    const outputBytes = await fillCharacterSheetPdf(
      templateBytes,
      {
        textFields: AFFECTED_TEXT_FIELDS,
        checkboxFields: AFFECTED_CHECKBOX_FIELDS,
      },
      { templateId: '2014' },
    )
    const output = await PDFDocument.load(outputBytes)
    expect(output.getPageCount()).toBe(6)
    const form = output.getForm()

    expect(form.getTextField('AC Armor Bonus').getText()).toBe('16')
    expect(form.getDropdown('AC Armor Description').getSelected()).toEqual(['Mithral Plate'])
    expect(form.getDropdown('Resistance Damage Type 1').getSelected()).toEqual(['Fire resistance'])
    expect(form.getTextField('Language 1').getText()).toBe('Common')
    expect(form.getTextField('Language 2').getText()).toBe('Elvish')
    expect(form.getTextField('Tool 1').getText()).toBe("Thieves' Tools")
    expect(form.getTextField('Tool 2').getText()).toBe('Herbalism Kit')

    for (const fieldName of Object.keys(AFFECTED_CHECKBOX_FIELDS)) {
      const checkbox = form.getCheckBox(fieldName)
      expect(checkbox.isChecked()).toBe(true)

      const internals = asFieldWithInternals(checkbox)
      expect(internals).not.toBeNull()
      const widget = internals?.acroField.getWidgets()[0]
      expect(internals?.acroField.dict.has(PDFName.of('A'))).toBe(false)
      expect(internals?.acroField.dict.has(PDFName.of('AA'))).toBe(false)
      expect(widget?.dict.has(PDFName.of('A'))).toBe(false)
      expect(widget?.dict.has(PDFName.of('AA'))).toBe(false)
      const appearance = widget?.dict.get(PDFName.of('AP')) as PDFDict
      const normalAppearance = appearance.get(PDFName.of('N')) as PDFDict
      const checkedAppearanceRef = normalAppearance.get(PDFName.of('True'))
      const checkedAppearance = output.context.lookup(checkedAppearanceRef) as PDFRawStream

      expect(checkedAppearance).toBeInstanceOf(PDFRawStream)
      expect(checkedAppearance.dict.has(PDFName.of('Resources'))).toBe(false)
    }

    for (const [fieldName, expectedValue] of Object.entries(AFFECTED_TEXT_FIELDS)) {
      const internals = asFieldWithInternals(form.getField(fieldName))
      const defaultValue = internals?.acroField.dict.get(PDFName.of('DV')) as {
        decodeText: () => string
      }
      const widget = internals?.acroField.getWidgets()[0]
      const appearance = widget?.dict.get(PDFName.of('AP')) as PDFDict
      const normalAppearanceRef = appearance.get(PDFName.of('N'))

      expect(defaultValue.decodeText()).toBe(expectedValue)
      expect(output.context.lookup(normalAppearanceRef)).toBeInstanceOf(PDFRawStream)
      expect(internals?.acroField.dict.has(PDFName.of('A'))).toBe(false)
      expect(internals?.acroField.dict.has(PDFName.of('AA'))).toBe(false)
      expect(widget?.dict.has(PDFName.of('A'))).toBe(false)
      expect(widget?.dict.has(PDFName.of('AA'))).toBe(false)
    }

    expect((form as unknown as FormWithInternals).acroForm.dict.has(PDFName.of('CO'))).toBe(false)
  }, 90_000)
})
