import {
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFString,
  PDFTextField,
} from '@cantoo/pdf-lib'
import { appendPdfForm } from './pdfAssembly'
import { fillCharacterSheetDocument } from './pdfFormAdapter'
import { fitPdfText } from './pdfTextLayout'
import type { SheetOverflowSection } from './types'

const COLUMNS = ['P5.ASnotes.Notes.Left', 'P5.ASnotes.Notes.Right'] as const

/** Paginate by actual form geometry at a readable size, retaining every character. */
export async function appendSheetNotes(
  output: PDFDocument,
  bytes: Uint8Array | ArrayBuffer,
  sections: SheetOverflowSection[],
) {
  const source = await PDFDocument.load(bytes)
  const form = source.getForm()
  const font = form.getDefaultFont()
  const columns = COLUMNS.map((name) => {
    const widget = form.getTextField(name).acroField.getWidgets()[0]
    const rect = widget.getRectangle()
    const border = widget.getBorderStyle()?.getWidth() ?? 0
    const padding = 2 * (border + 1)
    // Reserve the original artwork's 11 pt ruled pitch, rather than packing extra lines
    // between rules. The adapter aligns these already-fitted lines to the printed rows.
    const lines = Math.floor((rect.height - padding - 3) / 11)
    return { name, ...rect, height: lines * font.heightAtSize(9) * 1.2 + padding, border }
  })
  let length = 0
  const starts = sections.map((section) => {
    const start = length
    length += section.title.length + 1 + section.text.length + 2
    return { id: section.id, start }
  })
  let remaining = sections.map((section) => `${section.title}\n${section.text}`).join('\n\n')
  let offset = 0
  const sectionPages = new Map<string, number>()
  const firstPage = output.getPageCount() + 1
  let count = 0
  do {
    const textFields: Record<string, string> = {}
    for (const column of columns) {
      const fits = (text: string) =>
        !fitPdfText(
          text,
          font,
          column.width,
          column.height,
          { min: 9, max: 9, multiline: true },
          column.border,
        ).truncated
      let low = 0
      // No column can hold thousands of words at 9 pt. Bound layout work for long books.
      let high = Math.min(remaining.length, 6000)
      while (low < high) {
        const middle = Math.ceil((low + high) / 2)
        if (fits(remaining.slice(0, middle))) low = middle
        else high = middle - 1
      }
      if (remaining && low === 0) throw new Error('The notes template has no readable text area.')
      let cut = low
      if (cut < remaining.length) {
        const boundary = Math.max(remaining.lastIndexOf('\n', cut), remaining.lastIndexOf(' ', cut))
        if (boundary > cut / 2) cut = boundary
      }
      textFields[column.name] = remaining.slice(0, cut).trim()
      const next = remaining.slice(cut).trimStart()
      const consumed = remaining.length - next.length
      for (const section of starts)
        if (section.start >= offset && section.start < offset + consumed)
          sectionPages.set(section.id, firstPage + count)
      offset += consumed
      remaining = next
    }
    const doc = await fillCharacterSheetDocument(
      bytes,
      { textFields, checkboxFields: {} },
      {
        templateId: '2014-custom',
        cleanupProfile: 'mpmb-2014',
        onTextTruncated: () => {
          throw new Error('Notes pagination exceeded its measured bounds.')
        },
      },
    )
    await appendPdfForm(output, doc, count === 0 ? '' : `NotesPage${count + 1}__`)
    count++
  } while (remaining)
  return { count, sectionPages }
}

/** Keep useful text in the main section and reserve just one line for a continuation reference. */
export function addNotesReferences(
  output: PDFDocument,
  fields: string[],
  pages: Map<string, number>,
) {
  const form = output.getForm()
  const font = form.getDefaultFont()
  // Keep rewritten fields editable when a reader regenerates their appearances.
  const resources =
    form.acroForm.dict.lookupMaybe(PDFName.of('DR'), PDFDict) ?? output.context.obj({})
  const fonts = resources.lookupMaybe(PDFName.of('Font'), PDFDict) ?? output.context.obj({})
  fonts.set(PDFName.of(font.name), font.ref)
  resources.set(PDFName.of('Font'), fonts)
  form.acroForm.dict.set(PDFName.of('DR'), resources)
  for (const name of new Set(fields)) {
    const page = pages.get(`text-limit:${name}`)
    if (!page) continue
    const field = form.getFieldMaybe(name)
    if (!(field instanceof PDFTextField)) continue
    const widget = field.acroField.getWidgets()[0]
    const rect = widget?.getRectangle()
    if (!rect) continue
    const owner = output.getPages().find((candidate) => candidate.ref === widget.P())
    const scale = owner && owner.getWidth() > 1000 ? owner.getWidth() / 603 : 1
    if (!field.isMultiline() || rect.width / scale < 85) continue
    const size =
      Number(field.acroField.getDefaultAppearance()?.match(/([\d.]+)\s+Tf/)?.[1]) || 8 * scale
    const lineHeight = font.heightAtSize(size) * 1.2
    const border = widget.getBorderStyle()?.getWidth() ?? 0
    if (rect.height - 2 * (border + 1) < lineHeight * 3) continue
    const reference = `Continued on page ${page}.`
    if (font.widthOfTextAtSize(reference, size) >= rect.width - 2 * (border + 1)) continue
    const fitted = fitPdfText(
      field.getText() ?? '',
      font,
      rect.width,
      rect.height - lineHeight,
      {
        min: size,
        max: size,
        multiline: true,
      },
      border,
    )
    const text = `${fitted.text}\n${reference}`
    field.removeMaxLength()
    field.setText(text)
    field.setFontSize(fitted.fontSize)
    field.acroField.dict.set(PDFName.of('DV'), PDFHexString.fromText(text))
    for (const item of field.acroField.getWidgets())
      item.dict.set(PDFName.of('DA'), PDFString.of(field.acroField.getDefaultAppearance() ?? ''))
    field.updateAppearances(font)
  }
}
