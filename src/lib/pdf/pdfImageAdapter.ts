import { PDFButton, type PDFDocument, type PDFField } from '@cantoo/pdf-lib'
import { findAttachedWidgetLocation, hideFieldWidgets } from '@/lib/pdf/pdfFieldInternals'
import type { SheetImageMode } from '@/lib/pdf/types'

async function loadImage(
  source: string,
  resolve: (source: string) => string,
): Promise<Blob | null> {
  if (source.startsWith('data:')) {
    const [header, base64] = source.split(',', 2)
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
    return new Blob([bytes], { type: header.slice(5, header.indexOf(';')) })
  }
  if (!/^(?:\/|\.\.?\/|assets\/)/.test(source)) return null
  const response = await fetch(resolve(source))
  return response.ok ? response.blob() : null
}

async function convertImageToPng(blob: Blob, grayscale: boolean): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(blob)
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Unable to prepare image conversion')
    if (grayscale) context.filter = 'grayscale(1)'
    context.drawImage(bitmap, 0, 0)
    return new Uint8Array(await (await canvas.convertToBlob()).arrayBuffer())
  } finally {
    bitmap.close()
  }
}

export async function applySheetImage(
  pdfDoc: PDFDocument,
  field: PDFField | undefined,
  source: string | undefined,
  resolve: (source: string) => string,
  mode: SheetImageMode = 'color',
  hidePlaceholder = false,
): Promise<void> {
  if (!(field instanceof PDFButton)) return
  let hide = hidePlaceholder || mode === 'none'

  if (source && mode !== 'none') {
    try {
      const widgets = field.acroField.getWidgets()
      const location = findAttachedWidgetLocation(pdfDoc, widgets)
      const widget = location?.widget ?? widgets[0]
      const pages = pdfDoc.getPages()
      // Some templates retain the widget's page reference without listing it as an annotation.
      const pageRef = widgets[0]?.P()?.tag
      const page = location
        ? pages[location.pageIndex]
        : (pages.find((candidate) => candidate.ref.tag === pageRef) ?? pages[0])
      const blob = widget && page && (await loadImage(source, resolve))
      if (blob) {
        const { x, y, width, height } = widget.getRectangle()
        const grayscale = mode === 'grayscale'
        const bytes = grayscale ? null : new Uint8Array(await blob.arrayBuffer())
        const image =
          bytes?.[0] === 0xff && bytes[1] === 0xd8
            ? await pdfDoc.embedJpg(bytes)
            : await pdfDoc.embedPng(
                bytes?.[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
                  ? bytes
                  : await convertImageToPng(blob, grayscale),
              )
        const size = image.scaleToFit(width, height)
        page.drawImage(image, {
          ...size,
          x: x + (width - size.width) / 2,
          y: y + (height - size.height) / 2,
        })
        hide = true
      }
    } catch {
      // Image embedding is best-effort so an invalid optional image cannot block export.
    }
  }
  if (hide) hideFieldWidgets(field)
}
