import { PDFDocument, PDFHexString, PDFName } from '@cantoo/pdf-lib'
import { expect, test } from 'vitest'
import { fillCharacterSheetPdf } from '@/lib/pdf/pdfFormAdapter'

test('mapped lookup keeps the first exact duplicate, including dropdown fallback and wrong-type rejection', async () => {
  const doc = await PDFDocument.create(),
    page = doc.addPage(),
    form = doc.getForm()
  const first = form.createDropdown('Duplicate')
  first.addOptions(['old'])
  first.select('old')
  first.addToPage(page)
  const later = form.createTextField('Later')
  later.setText('untouched')
  later.addToPage(page)
  later.acroField.dict.set(PDFName.of('T'), PDFHexString.fromText('Duplicate'))
  const wrong = form.createCheckBox('Wrong')
  wrong.addToPage(page)
  const laterRight = form.createTextField('LaterRight')
  laterRight.addToPage(page)
  laterRight.acroField.dict.set(PDFName.of('T'), PDFHexString.fromText('Wrong'))
  const wrongCheck = form.createTextField('WrongCheck')
  wrongCheck.addToPage(page)
  const bytes = await doc.save()
  const saved = await PDFDocument.load(
    await fillCharacterSheetPdf(
      bytes,
      { textFields: { Duplicate: 'new' }, checkboxFields: {} },
      { cleanupProfile: 'mpmb-2014' },
    ),
  )
  const duplicates = saved
    .getForm()
    .getFields()
    .filter((field) => field.getName() === 'Duplicate')
  expect(duplicates).toHaveLength(2)
  expect(saved.getForm().getDropdown('Duplicate').getSelected()).toEqual(['new'])
  expect(duplicates[0].acroField.dict.get(PDFName.of('DV'))?.toString()).toBe(
    PDFHexString.fromText('new').toString(),
  )
  expect((duplicates[1] as typeof later).getText()).toBe('untouched')
  await expect(
    fillCharacterSheetPdf(
      bytes,
      {
        textFields: { Wrong: 'value', MissingText: 'value' },
        checkboxFields: { WrongCheck: true, MissingCheck: true },
      },
      { cleanupProfile: 'standard' },
    ),
  ).rejects.toThrow(
    'PDF template is missing 4 required fields: Wrong, MissingText, WrongCheck, MissingCheck',
  )
})

test('copied spell fields are indexed after append and independent exports never share field objects', async () => {
  const doc = await PDFDocument.create()
  const pages = [doc.addPage(), doc.addPage(), doc.addPage()],
    form = doc.getForm()
  form.createTextField('Main').addToPage(pages[0])
  // The official page uses merged terminal field/widgets, rather than parented widgets.
  const spell = doc.context.register(
    doc.context.obj({
      Type: 'Annot',
      Subtype: 'Widget',
      FT: 'Tx',
      T: PDFHexString.fromText('Spell'),
      Rect: [0, 0, 100, 20],
      P: pages[2].ref,
      F: 4,
    }),
  )
  pages[2].node.addAnnot(spell)
  form.acroForm.addField(spell)
  const bytes = await doc.save()
  const exported = async (value: string) =>
    PDFDocument.load(
      await fillCharacterSheetPdf(
        bytes,
        { textFields: { Main: value, Spell: 'original' }, checkboxFields: {} },
        {
          cleanupProfile: 'standard',
          additionalSpellPages: [{ textFields: { Spell: `copied ${value}` }, checkboxFields: {} }],
          spellPageIndex: 2,
        },
      ),
    )
  const one = await exported('one'),
    two = await exported('two')
  expect(one.getForm().getTextField('Main').getText()).toBe('one')
  expect(one.getForm().getTextField('SpellPage2__Spell').getText()).toBe('copied one')
  expect(two.getForm().getTextField('Main').getText()).toBe('two')
  expect(two.getForm().getTextField('SpellPage2__Spell').getText()).toBe('copied two')
  expect(one.getPageCount()).toBe(4)
  expect(two.getPageCount()).toBe(4)
})
