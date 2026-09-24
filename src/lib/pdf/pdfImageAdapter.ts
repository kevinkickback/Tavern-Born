import { type PDFDocument, PDFName, PDFNumber } from '@cantoo/pdf-lib'
import { resolveOrganizationImageSrc } from '@/lib/character/organizationConstants'
import {
  type AcroWidget,
  asFieldWithInternals,
  type FieldWithInternals,
  findAttachedWidgetLocation,
  getPageRefTag,
} from '@/lib/pdf/pdfFieldInternals'
import { resolvePortraitSrc } from '@/lib/portraitConstants'

export async function embedPortraitImage(
  pdfDoc: PDFDocument,
  portrait: string,
  fieldName = 'Portrait',
): Promise<void> {
  await embedButtonImage(pdfDoc, fieldName, portrait, resolvePortraitSrc)
}

export async function embedOrganizationImage(
  pdfDoc: PDFDocument,
  organizationImage: string,
  fieldName = 'Symbol',
): Promise<void> {
  await embedButtonImage(pdfDoc, fieldName, organizationImage, resolveOrganizationImageSrc)
}

function getPdfImageType(bytes: Uint8Array): 'png' | 'jpg' | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return 'png'
  }
  return bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8 ? 'jpg' : null
}

async function convertImageToPng(bytes: Uint8Array, contentType: string): Promise<Uint8Array> {
  const imageBitmap = await createImageBitmap(new Blob([bytes], { type: contentType }))
  try {
    const canvas = new OffscreenCanvas(imageBitmap.width, imageBitmap.height)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Unable to prepare image conversion')
    context.drawImage(imageBitmap, 0, 0)
    const pngBlob = await canvas.convertToBlob({ type: 'image/png' })
    return new Uint8Array(await pngBlob.arrayBuffer())
  } finally {
    imageBitmap.close()
  }
}

async function embedButtonImage(
  pdfDoc: PDFDocument,
  fieldName: string,
  imageSource: string,
  resolveSource: (source: string) => string,
): Promise<void> {
  const form = pdfDoc.getForm()
  let button: FieldWithInternals
  try {
    const internals = asFieldWithInternals(form.getButton(fieldName))
    if (!internals) return
    button = internals
  } catch {
    return
  }

  const widgets = button.acroField.getWidgets() as AcroWidget[]
  if (widgets.length === 0) return
  const attachedWidget = findAttachedWidgetLocation(pdfDoc, widgets)
  const widget = attachedWidget?.widget ?? widgets[0]
  let rect: { x: number; y: number; width: number; height: number }
  try {
    rect = widget.getRectangle()
  } catch {
    return
  }

  try {
    let bytes: Uint8Array
    let contentType = ''
    if (imageSource.startsWith('data:')) {
      const commaIndex = imageSource.indexOf(',')
      const base64 = commaIndex >= 0 ? imageSource.slice(commaIndex + 1) : imageSource
      bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
      contentType = imageSource.slice(5, imageSource.indexOf(';'))
    } else if (
      imageSource.startsWith('/') ||
      imageSource.startsWith('./') ||
      imageSource.startsWith('../') ||
      imageSource.startsWith('assets/')
    ) {
      const response = await fetch(resolveSource(imageSource))
      if (!response.ok) throw new Error(`Failed to fetch ${fieldName.toLowerCase()} image`)
      contentType = response.headers.get('content-type') ?? ''
      bytes = new Uint8Array(await response.arrayBuffer())
    } else {
      return
    }

    let imageType = getPdfImageType(bytes)
    if (!imageType) {
      bytes = await convertImageToPng(bytes, contentType)
      imageType = 'png'
    }
    const image = imageType === 'png' ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes)
    const pages = pdfDoc.getPages()
    if (pages.length > 0) {
      const pageRefTag = widget.P?.()?.tag
      const targetPage =
        attachedWidget !== null
          ? pages[attachedWidget.pageIndex]
          : pageRefTag
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
    // Image embedding is best-effort so an invalid optional image cannot block PDF export.
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
