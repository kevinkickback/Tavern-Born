import {
  decodePDFRawStream,
  degrees,
  drawEllipse,
  drawRectangle,
  PDFArray,
  PDFCheckBox,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFRawStream,
  PDFRef,
  PDFTextField,
  rgb,
  StandardFonts,
} from '@cantoo/pdf-lib'
import type { CharacterSheetViewModel } from './characterSheetViewModel'
import { buildCompanionSheetData } from './companionSheet'
import { mapCompanionSheet } from './companionSheetMapping'
import { fitPdfText } from './pdfTextLayout'

/** Fill a fresh copy per creature; retain editable fields without copying source scripts/tooltips. */
export async function createCompanionSheetDocument(
  templateBytes: Uint8Array | ArrayBuffer,
  vm: CharacterSheetViewModel,
  onTextTruncated?: (label: string) => void,
) {
  const output = await PDFDocument.create()
  const companions = vm.companions.length ? vm.companions : [{ name: '' }]
  for (const [index, companion] of companions.entries()) {
    const source = await PDFDocument.load(new Uint8Array(templateBytes))
    if (source.getPageCount() !== 1) throw new Error('Expected a single companion template page.')
    matchOfficial2014PanelColors(source)
    const form = source.getForm()
    const font = await source.embedFont(StandardFonts.Helvetica)
    const supported = new Set(font.getCharacterSet())
    const clean = (text: string) =>
      Array.from(text.normalize('NFC'))
        .map((char) => (char === '\n' || supported.has(char.codePointAt(0) ?? 0) ? char : '?'))
        .join('')
    const mapping = mapCompanionSheet(buildCompanionSheetData(vm, companion))
    for (const name of Object.keys(mapping.textFields)) form.getTextField(name)
    for (const name of Object.keys(mapping.checkboxFields)) form.getCheckBox(name)
    const prefix = `Companion${index + 1}__`
    const fields = form.getFields()
    // Make terminal fields independent roots before copying. Their original full names remain
    // intact, but no copied widget can pull in a stale ancestor or share another creature's value.
    for (const field of fields) {
      const name = field.getName()
      field.disableReadOnly()
      if (field instanceof PDFTextField) {
        const value = clean(mapping.textFields[name] ?? '')
        field.disableRichFormatting()
        field.removeMaxLength()
        const multiline =
          name === 'Attacks.3' ||
          name === 'Feats & Traits' ||
          name === 'load' ||
          name === 'personality' ||
          name === 'appearance'
        if (multiline) field.enableMultiline()
        else field.disableMultiline()
        const widget = field.acroField.getWidgets()[0]
        let rect = widget.getRectangle()
        // The supplied save/skill and special-movement boxes are shorter than their glyphs.
        // Expand their transparent input area without moving the printed baseline.
        if (rect.height >= 8 && rect.height < 12) {
          rect = { ...rect, y: rect.y - 1, height: 12 }
          widget.setRectangle(rect)
        }
        const limit = multiline ? 1800 : 150
        const candidate = value.length > limit ? `${value.slice(0, limit)}...` : value
        const fitted = fitPdfText(candidate, font, rect.width, rect.height, {
          min: multiline ? 9 : 6,
          max: multiline ? 10 : rect.height < 12 ? 8 : 12,
          multiline,
        })
        if (value && (fitted.truncated || candidate !== value)) {
          const label = name.startsWith('Attacks.')
            ? 'Attack details'
            : name.startsWith('companion.')
              ? 'Companion identity'
              : name
          onTextTruncated?.(`Companion ${index + 1}: ${label}`)
        }
        field.setText(fitted.text)
        field.setFontSize(fitted.fontSize)
        field.acroField.dict.set(PDFName.of('DV'), PDFHexString.fromText(fitted.text))
        field.updateAppearances(font)
      } else if (field instanceof PDFCheckBox) {
        if (mapping.checkboxFields[name]) field.check()
        else field.uncheck()
        field.acroField.dict.delete(PDFName.of('DV'))
        field.defaultUpdateAppearances()
        for (const widget of field.acroField.getWidgets()) {
          const { width, height } = widget.getRectangle()
          const radius = Math.min(width, height) * 0.29
          const dot = drawEllipse({
            x: width / 2,
            y: height / 2,
            xScale: radius,
            yScale: radius,
            color: rgb(0, 0, 0),
            borderColor: undefined,
            borderWidth: 0,
          })
          const on = field.acroField.getOnValue()
          const outline = /^(saves\.|skill checks\.|irv\.)/u.test(name)
            ? drawRectangle({
                x: 0.5,
                y: 0.5,
                width: width - 1,
                height: height - 1,
                borderWidth: 0.65,
                borderColor: rgb(0, 0, 0),
                color: undefined,
                rotate: degrees(0),
                xSkew: degrees(0),
                ySkew: degrees(0),
              })
            : []
          const controlAppearance = (checked: boolean) =>
            source.context.register(
              source.context.formXObject([...outline, ...(checked ? dot : [])], {
                BBox: source.context.obj([0, 0, width, height]),
              }),
            )
          if (on)
            widget.dict.set(
              PDFName.of('AP'),
              source.context.obj({
                N: source.context.obj({
                  Off: controlAppearance(false),
                  [on.decodeText()]: controlAppearance(true),
                }),
              }),
            )
        }
      }
      for (const dict of [
        field.acroField.dict,
        ...field.acroField.getWidgets().map((widget) => widget.dict),
      ]) {
        for (const key of ['A', 'AA', 'TU']) dict.delete(PDFName.of(key))
      }
      field.acroField.dict.delete(PDFName.of('Parent'))
      field.acroField.dict.set(PDFName.of('T'), PDFHexString.fromText(`${prefix}${name}`))
    }
    form.acroForm.dict.set(
      PDFName.of('Fields'),
      source.context.obj(fields.map((field) => field.ref)),
    )
    form.acroForm.dict.delete(PDFName.of('CO'))
    await source.flush()
    const [page] = await output.copyPages(source, [0])
    output.addPage(page)
    const roots = new Map<string, PDFRef>()
    for (const ref of page.node.Annots()?.asArray() ?? []) {
      const widget = output.context.lookup(ref)
      if (
        !(ref instanceof PDFRef) ||
        !(widget instanceof PDFDict) ||
        widget.get(PDFName.of('Subtype'))?.toString() !== '/Widget'
      )
        continue
      widget.set(PDFName.of('P'), page.ref)
      const parent = widget.get(PDFName.of('Parent'))
      const root = parent instanceof PDFRef ? parent : ref
      roots.set(root.tag, root)
    }
    for (const root of roots.values()) output.getForm().acroForm.addField(root)
    // Keep a font resource for readers regenerating appearances after manual edits.
    const outputFont = await output.embedFont(StandardFonts.Helvetica)
    const outputForm = output.getForm().acroForm.dict
    const resources = outputForm.lookupMaybe(PDFName.of('DR'), PDFDict) ?? output.context.obj({})
    const fonts = resources.lookupMaybe(PDFName.of('Font'), PDFDict) ?? output.context.obj({})
    fonts.set(PDFName.of(font.name), outputFont.ref)
    resources.set(PDFName.of('Font'), fonts)
    outputForm.set(PDFName.of('DR'), resources)
  }
  return output
}

/** Audited fills for the matching panel/entry-box paths in the two 2014 artworks. */
function matchOfficial2014PanelColors(doc: PDFDocument) {
  const contents = doc.getPage(0).node.Contents()
  const streams = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : []
  const replacements = streams.map((ref) => {
    const stream = doc.context.lookup(ref)
    if (!(stream instanceof PDFRawStream)) throw new Error('Unsupported companion artwork stream.')
    const text = Array.from(decodePDFRawStream(stream).decode(), (byte) =>
      String.fromCharCode(byte),
    ).join('')
    const adjusted = text
      .replace(/(?<![\d.])0\.157\s+0\.103\s+0\.12\s+0\s+k\b/gu, '0.871 0.875 0.876 rg')
      .replace(/(?<![\d.])0\.111\s+0\.072\s+0\.086\s+0\s+k\b/gu, '0.905 0.908 0.909 rg')
    // These source streams contain PDF operators and ASCII text. Keep all original bytes
    // outside the audited color instructions; do not recolor labels, borders, or form fields.
    return doc.context.register(doc.context.flateStream(adjusted))
  })
  doc.getPage(0).node.set(PDFName.of('Contents'), doc.context.obj(replacements))
}
