import { PDFDocument, PDFHexString, PDFName, type PDFString, StandardFonts } from '@cantoo/pdf-lib'
import { expect, test } from 'vitest'
import { appendPdfForm } from '@/lib/pdf/pdfAssembly'

test('copies default appearance instructions as bytes while preserving Unicode field names', async () => {
  const source = await PDFDocument.create()
  const font = await source.embedFont(StandardFonts.Helvetica)
  const field = source.getForm().createTextField('Créature')
  field.setText('Companion')
  field.addToPage(source.addPage(), { font })
  const commands = field.acroField.getDefaultAppearance()!
  // Repair earlier modules too: their widget commands were incorrectly UTF-16 text.
  field.acroField.getWidgets()[0].dict.set(PDFName.of('DA'), PDFHexString.fromText(commands))
  const output = await PDFDocument.create()
  await appendPdfForm(output, source, 'Companion__')
  const reopened = await PDFDocument.load(await output.save({ updateFieldAppearances: false }))
  const copied = reopened.getForm().getTextField('Companion__Créature')
  expect(copied.getText()).toBe('Companion')
  for (const dict of [copied.acroField.dict, ...copied.acroField.getWidgets().map((w) => w.dict)]) {
    const da = dict.lookup(PDFName.of('DA')) as PDFString | PDFHexString
    const bytes = da.asBytes()
    expect([...bytes]).not.toContain(0)
    expect([...bytes]).not.toContain(0xfe)
    expect(String.fromCharCode(...bytes)).toMatch(/\/\S+ [\d.]+ Tf/)
  }
})
