import { PDFDict, PDFDocument, PDFName, PDFObjectCopier, PDFRef } from '@cantoo/pdf-lib'

/** Rebuild the page and field trees so omitted pages cannot reappear in another reader. */
export async function omitPdfPages(source: PDFDocument, excluded: readonly number[]) {
  if (excluded.length === 0) return source
  const output = await PDFDocument.create()
  const pages = await output.copyPages(
    source,
    source.getPageIndices().filter((index) => !excluded.includes(index)),
  )
  for (const page of pages) output.addPage(page)

  const roots = new Map<string, PDFRef>()
  const parents = new Map<string, { dict: PDFDict; children: Map<string, PDFRef> }>()
  for (const page of pages) {
    for (const annotation of page.node.Annots()?.asArray() ?? []) {
      const widget = output.context.lookup(annotation)
      if (
        !(annotation instanceof PDFRef) ||
        !(widget instanceof PDFDict) ||
        widget.get(PDFName.of('Subtype'))?.toString() !== '/Widget'
      )
        continue
      let ref: PDFRef = annotation
      let field: PDFDict = widget
      field.set(PDFName.of('P'), page.ref)
      const visited = new Set([ref.tag])
      while (true) {
        const parentRef = field.get(PDFName.of('Parent'))
        if (!(parentRef instanceof PDFRef)) break
        const parent = output.context.lookup(parentRef, PDFDict)
        if (visited.has(parentRef.tag)) throw new Error('Cycle in PDF form fields')
        visited.add(parentRef.tag)
        const entry = parents.get(parentRef.tag) ?? {
          dict: parent,
          children: new Map<string, PDFRef>(),
        }
        entry.children.set(ref.tag, ref)
        parents.set(parentRef.tag, entry)
        ref = parentRef
        field = parent
      }
      roots.set(ref.tag, ref)
    }
  }
  for (const { dict, children } of parents.values())
    dict.set(PDFName.of('Kids'), output.context.obj([...children.values()]))
  const form = output.getForm()
  form.acroForm.dict.set(PDFName.of('Fields'), output.context.obj([...roots.values()]))
  // Keep form resources for subsequent editing, as well as the saved widget appearances.
  const copier = PDFObjectCopier.for(source.context, output.context)
  for (const name of ['DR', 'DA', 'Q']) {
    const value = source.getForm().acroForm.dict.get(PDFName.of(name))
    if (value) form.acroForm.dict.set(PDFName.of(name), copier.copy(value))
  }
  const title = source.getTitle()
  const author = source.getAuthor()
  if (title) output.setTitle(title)
  if (author) output.setAuthor(author)
  return output
}
