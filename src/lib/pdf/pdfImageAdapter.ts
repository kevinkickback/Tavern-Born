import { type PDFDocument, PDFName, PDFNumber } from '@cantoo/pdf-lib'
import {
  type AcroWidget,
  asFieldWithInternals,
  type FieldWithInternals,
  getPageRefTag,
} from '@/lib/pdf/pdfFieldInternals'
import { resolvePortraitSrc } from '@/lib/portraitConstants'

export async function embedPortraitImage(pdfDoc: PDFDocument, portrait: string): Promise<void> {
  const form = pdfDoc.getForm()
  let button: FieldWithInternals
  try {
    const internals = asFieldWithInternals(form.getButton('Portrait'))
    if (!internals) return
    button = internals
  } catch {
    return
  }

  const widgets = button.acroField.getWidgets() as AcroWidget[]
  if (widgets.length === 0) return
  let rect: { x: number; y: number; width: number; height: number }
  try {
    rect = widgets[0].getRectangle()
  } catch {
    return
  }

  try {
    let bytes: Uint8Array
    let isPng: boolean
    if (portrait.startsWith('data:')) {
      const commaIndex = portrait.indexOf(',')
      const base64 = commaIndex >= 0 ? portrait.slice(commaIndex + 1) : portrait
      bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
      isPng = portrait.includes('image/png')
    } else if (
      portrait.startsWith('/') ||
      portrait.startsWith('./') ||
      portrait.startsWith('../')
    ) {
      const response = await fetch(resolvePortraitSrc(portrait))
      if (!response.ok) throw new Error('Failed to fetch portrait')
      const contentType = response.headers.get('content-type') ?? ''
      isPng = contentType.includes('png') || portrait.toLowerCase().endsWith('.png')
      bytes = new Uint8Array(await response.arrayBuffer())
    } else {
      return
    }

    const image = isPng ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes)
    const pages = pdfDoc.getPages()
    if (pages.length > 0) {
      const pageRefTag = widgets[0].P?.()?.tag
      const targetPage = pageRefTag
        ? (pages.find((page) => getPageRefTag(page) === pageRefTag) ?? pages[0])
        : pages[0]
      const dimensions = image.scaleToFit(rect.width, rect.height)
      targetPage.drawImage(image, {
        x: rect.x + (rect.width - dimensions.width) / 2,
        y: rect.y + (rect.height - dimensions.height) / 2,
        width: dimensions.width,
        height: dimensions.height,
      })
    }
    hideFieldWidgets(button)
  } catch {
    // Portrait embedding is best-effort.
  }
}

function hideFieldWidgets(field: FieldWithInternals) {
  for (const widget of field.acroField.getWidgets() as AcroWidget[]) {
    widget.setRectangle({ x: 0, y: 0, width: 0, height: 0 })
    widget.dict.delete(PDFName.of('AP'))
    widget.dict.delete(PDFName.of('A'))
    widget.dict.delete(PDFName.of('AA'))
    widget.dict.set(PDFName.of('F'), PDFNumber.of(34))
  }
}
