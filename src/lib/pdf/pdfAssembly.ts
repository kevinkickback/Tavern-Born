import {
  PDFDict,
  type PDFDocument,
  PDFHexString,
  PDFName,
  PDFObjectCopier,
  PDFRef,
} from '@cantoo/pdf-lib'

/** Append editable forms, isolating field names and font resources from other page modules. */
export async function appendPdfForm(output: PDFDocument, source: PDFDocument, prefix = '') {
  const form = source.getForm()
  const fields = form.getFields()
  const resourcePrefix = `Part${output.getPageCount()}_`
  const sourceResources = form.acroForm.dict.lookupMaybe(PDFName.of('DR'), PDFDict)
  const sourceFonts = sourceResources?.lookupMaybe(PDFName.of('Font'), PDFDict)
  const usedFonts = new Set<string>()
  const renameFonts = (text: string) =>
    text.replace(/\/(\S+)(\s+[\d.]+\s+Tf)/gu, (all, name: string, rest: string) => {
      if (!sourceFonts?.has(PDFName.of(name))) return all
      usedFonts.add(name)
      return `/${resourcePrefix}${name}${rest}`
    })
  for (const field of fields) {
    const name = field.getName()
    for (const key of ['FT', 'Ff', 'Q', 'DA', 'V', 'DV']) {
      const value = field.acroField.getInheritableAttribute(PDFName.of(key))
      if (value) field.acroField.dict.set(PDFName.of(key), value)
    }
    field.acroField.dict.delete(PDFName.of('Parent'))
    field.acroField.dict.set(PDFName.of('T'), PDFHexString.fromText(prefix + name))
    for (const dict of [
      field.acroField.dict,
      ...field.acroField.getWidgets().map((widget) => widget.dict),
    ]) {
      const appearance =
        dict.lookup(PDFName.of('DA')) ?? form.acroForm.dict.lookup(PDFName.of('DA'))
      if (appearance && 'decodeText' in appearance && typeof appearance.decodeText === 'function')
        dict.set(PDFName.of('DA'), PDFHexString.fromText(renameFonts(appearance.decodeText())))
    }
  }
  form.acroForm.dict.set(PDFName.of('Fields'), source.context.obj(fields.map((field) => field.ref)))
  await source.flush()
  const pages = await output.copyPages(source, source.getPageIndices())
  const roots = new Map<string, PDFRef>()
  for (const page of pages) {
    output.addPage(page)
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
  }
  const targetForm = output.getForm().acroForm
  for (const root of roots.values()) targetForm.addField(root)
  if (sourceFonts) {
    const resources =
      targetForm.dict.lookupMaybe(PDFName.of('DR'), PDFDict) ?? output.context.obj({})
    const fonts = resources.lookupMaybe(PDFName.of('Font'), PDFDict) ?? output.context.obj({})
    const copier = PDFObjectCopier.for(source.context, output.context)
    for (const [name, value] of sourceFonts.entries()) {
      if (usedFonts.has(name.decodeText()))
        fonts.set(PDFName.of(resourcePrefix + name.decodeText()), copier.copy(value))
    }
    resources.set(PDFName.of('Font'), fonts)
    targetForm.dict.set(PDFName.of('DR'), resources)
  }
}
