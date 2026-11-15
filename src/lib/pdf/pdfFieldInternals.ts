import { type PDFDocument, PDFName, PDFNumber, type PDFObject } from '@cantoo/pdf-lib'

/**
 * Typed accessors for pdf-lib internal structures that are not exposed by the
 * public API. All casts are isolated here so each call-site stays clean.
 *
 * Runtime shape checks are used where the cost is negligible and the guard
 * prevents crashes on unexpected template revisions.
 */

export type AcroWidget = {
  getRectangle: () => { x: number; y: number; width: number; height: number }
  setRectangle: (value: { x: number; y: number; width: number; height: number }) => void
  dict: AcroDict
}

type AcroDict = {
  has: (name: PDFName) => boolean
  delete: (name: PDFName) => void
  get: (name: PDFName) => unknown
  set: (name: PDFName, value: PDFObject) => void
}

export type FieldWithInternals = {
  acroField: {
    getWidgets: () => AcroWidget[]
    dict: AcroDict
  }
  getName: () => string
}

export type FormWithInternals = {
  acroForm: {
    dict: AcroDict
  }
}

/**
 * Cast any pdf-lib field to FieldWithInternals.  Returns null and logs a
 * warning if the expected `acroField` property is absent.
 */
export function asFieldWithInternals(field: unknown): FieldWithInternals | null {
  if (field == null) return null
  const f = field as Partial<FieldWithInternals>
  if (!f.acroField || typeof f.acroField !== 'object') {
    console.warn('[pdf-lib] field missing expected acroField internals', field)
    return null
  }
  return field as FieldWithInternals
}

export function hideFieldWidgets(field: FieldWithInternals) {
  for (const widget of field.acroField.getWidgets()) {
    widget.setRectangle({ x: 0, y: 0, width: 0, height: 0 })
    for (const key of ['AP', 'A', 'AA', 'MK']) widget.dict.delete(PDFName.of(key))
    widget.dict.set(PDFName.of('F'), PDFNumber.of(34))
  }
}

export function findAttachedWidgetLocation(
  pdfDoc: PDFDocument,
  widgets: AcroWidget[],
): { widget: AcroWidget; pageIndex: number } | null {
  const pages = pdfDoc.getPages()
  for (const widget of widgets) {
    for (const [pageIndex, page] of pages.entries()) {
      const annotations = page.node.Annots()?.asArray() ?? []
      if (
        annotations.some(
          (reference) => (pdfDoc.context.lookup(reference) as unknown) === widget.dict,
        )
      ) {
        return { widget, pageIndex }
      }
    }
  }
  return null
}
