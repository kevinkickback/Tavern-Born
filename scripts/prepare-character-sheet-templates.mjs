import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  PDFArray,
  PDFButton,
  PDFCheckBox,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRef,
  PDFTextField,
  rgb,
  StandardFonts,
} from '@cantoo/pdf-lib'

const root = process.cwd()
const pdfDirectory = join(root, 'public', 'pdf')
const sourceDirectory = join(root, 'docs', 'review', 'pdf-sources')

const paths = {
  custom2014Source: join(sourceDirectory, '2014_expanded_source.pdf'),
  custom2014Output: join(pdfDirectory, '2014_MPMB_Character_Sheet.pdf'),
  custom2024Source: join(pdfDirectory, '2024_Beaoudix_Character_Sheet.pdf'),
  official2024Source: join(sourceDirectory, '2024_official_source.pdf'),
  official2024Output: join(pdfDirectory, '2024_Official_Character_Sheet.pdf'),
}

const removableKeys = [
  'A',
  'AA',
  'CO',
  'EmbeddedFiles',
  'JavaScript',
  'JS',
  'OpenAction',
  'Templates',
  'XFA',
]

const mpmbButtonKeepPatterns = [
  /^Portrait$/i,
  /^Symbol$/i,
  /^HeaderIcon$/i,
  /^Image\./i,
  /^Weight /i,
]
const ammoCheckboxPattern = /^Ammo(Left|Right)\.(Top|Base|Bullet|Icon)\./
const hiddenMappedFieldsToKeep = new Set([
  'AC Armor Weight',
  'AC Shield Weight',
  'Spell DC 1 Bonus',
  'Spell DC 2 Bonus',
  'Spell DC 2 Mod',
  'Spell save DC 2',
  'Adventuring Gear Row 51',
  'Adventuring Gear Amount 51',
  'Adventuring Gear Weight 51',
  'Weight Heavily Encumbered',
  'Extra.Magic Item Weight 1',
  'Extra.Magic Item Weight 2',
  'Extra.Magic Item Weight 3',
  'Extra.Magic Item Weight 4',
  'Extra.Magic Item Weight 5',
  'Background_FactionRank.Text',
])

function stripExecutableContent(pdfDoc) {
  for (const [, object] of pdfDoc.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFDict)) continue
    for (const key of removableKeys) object.delete(PDFName.of(key))
  }

  const catalog = pdfDoc.catalog
  catalog.delete(PDFName.of('AA'))
  catalog.delete(PDFName.of('Names'))
  catalog.delete(PDFName.of('OpenAction'))
  catalog.delete(PDFName.of('PageMode'))
}

function removeOrphanedFields(pdfDoc) {
  const pageWidgets = new Set()
  for (const page of pdfDoc.getPages()) {
    const annotations = page.node.lookup(PDFName.of('Annots'), PDFArray)
    for (const reference of annotations?.asArray() ?? []) {
      pageWidgets.add(pdfDoc.context.lookup(reference))
    }
  }

  const form = pdfDoc.getForm()
  for (const field of form.getFields()) {
    const hasPageWidget = field.acroField
      .getWidgets()
      .some((widget) => pageWidgets.has(widget.dict))
    if (hasPageWidget) continue

    form.acroForm.removeField(field.acroField)
    const fieldKids = field.acroField.normalizedEntries().Kids
    for (let index = 0, length = fieldKids.size(); index < length; index += 1) {
      const child = fieldKids.get(index)
      if (child instanceof PDFRef) pdfDoc.context.delete(child)
    }
    pdfDoc.context.delete(field.ref)
  }
}

function removeUnsupportedFields(pdfDoc) {
  let foundWarningButton = false
  const form = pdfDoc.getForm()
  for (const field of [...form.getFields()]) {
    const name = field.getName()
    const isUnsupportedButton =
      field instanceof PDFButton && !mpmbButtonKeepPatterns.some((pattern) => pattern.test(name))
    const widgets = field.acroField.getWidgets()
    const isUnusedHiddenField =
      !hiddenMappedFieldsToKeep.has(name) &&
      widgets.length > 0 &&
      widgets.every((widget) => {
        const flags = widget.dict.get(PDFName.of('F'))
        return flags instanceof PDFNumber && (flags.asNumber() & 2) !== 0
      })
    if (name === 'd20warning' && field instanceof PDFButton) foundWarningButton = true
    if (!isUnsupportedButton && !ammoCheckboxPattern.test(name) && !isUnusedHiddenField) continue
    form.removeField(field)
  }
  if (!foundWarningButton) {
    throw new Error('The expanded 2014 source no longer contains the expected d20warning field.')
  }
}

function rebuildAcroFormFromPageWidgets(pdfDoc) {
  const rootFieldRefs = new Map()
  const retainedChildrenByParent = new Map()

  for (const page of pdfDoc.getPages()) {
    const annotations = page.node.lookup(PDFName.of('Annots'), PDFArray)
    for (const annotationRef of annotations?.asArray() ?? []) {
      if (!(annotationRef instanceof PDFRef)) continue
      let fieldRef = annotationRef
      let field = pdfDoc.context.lookup(fieldRef)
      if (!(field instanceof PDFDict)) continue
      if (field.get(PDFName.of('Subtype'))?.toString() !== '/Widget') continue

      field.set(PDFName.of('P'), page.ref)
      const visited = new Set([fieldRef.tag])

      while (true) {
        const parentRef = field.get(PDFName.of('Parent'))
        if (!(parentRef instanceof PDFRef)) break
        const parent = pdfDoc.context.lookup(parentRef)
        if (!(parent instanceof PDFDict)) break

        const retainedChildren = retainedChildrenByParent.get(parentRef.tag) ?? {
          parent,
          children: new Map(),
        }
        retainedChildren.children.set(fieldRef.tag, fieldRef)
        retainedChildrenByParent.set(parentRef.tag, retainedChildren)

        if (visited.has(parentRef.tag)) {
          throw new Error(`Cycle found in the custom 2014 AcroForm at ${parentRef.tag}.`)
        }
        visited.add(parentRef.tag)
        fieldRef = parentRef
        field = parent
      }
      rootFieldRefs.set(fieldRef.tag, fieldRef)
    }
  }

  for (const { parent, children } of retainedChildrenByParent.values()) {
    parent.set(PDFName.of('Kids'), pdfDoc.context.obj([...children.values()]))
  }

  const form = pdfDoc.getForm()
  form.acroForm.dict.set(PDFName.of('Fields'), pdfDoc.context.obj([...rootFieldRefs.values()]))
}

function copyDocumentMetadata(sourceDoc, targetDoc) {
  const metadata = [
    ['getAuthor', 'setAuthor'],
    ['getCreationDate', 'setCreationDate'],
    ['getCreator', 'setCreator'],
    ['getLanguage', 'setLanguage'],
    ['getModificationDate', 'setModificationDate'],
    ['getProducer', 'setProducer'],
    ['getSubject', 'setSubject'],
    ['getTitle', 'setTitle'],
  ]
  for (const [getter, setter] of metadata) {
    const value = sourceDoc[getter]()
    if (value !== undefined) targetDoc[setter](value)
  }
}

async function buildCustom2014() {
  const sourceDoc = await PDFDocument.load(await readFile(paths.custom2014Source), {
    ignoreEncryption: false,
  })
  if (sourceDoc.getPageCount() < 6) {
    throw new Error(`The custom 2014 source must contain at least 6 pages.`)
  }

  const pdfDoc = await PDFDocument.create()
  const pages = await pdfDoc.copyPages(sourceDoc, [0, 1, 2, 3, 4, 5])
  for (const page of pages) pdfDoc.addPage(page)
  copyDocumentMetadata(sourceDoc, pdfDoc)
  rebuildAcroFormFromPageWidgets(pdfDoc)
  if (pdfDoc.getPageCount() !== 6) {
    throw new Error(
      `The custom 2014 template must contain 6 pages, found ${pdfDoc.getPageCount()}.`,
    )
  }
  removeOrphanedFields(pdfDoc)
  stripExecutableContent(pdfDoc)
  removeUnsupportedFields(pdfDoc)
  const output = await pdfDoc.save({
    addDefaultPage: false,
    rewrite: true,
    updateFieldAppearances: false,
  })
  const reopened = await PDFDocument.load(output)
  if (reopened.getPageCount() !== 6) {
    throw new Error(
      `The saved custom 2014 template must reopen with 6 pages, found ${reopened.getPageCount()}.`,
    )
  }
  await writeFile(paths.custom2014Output, output)
}

function getWidgetPageIndex(pdfDoc, widget) {
  const pageTag = widget.P?.()?.tag
  if (!pageTag) return -1
  return pdfDoc.getPages().findIndex((page) => page.ref.tag === pageTag)
}

async function buildOfficial2024() {
  const sourceDoc = await PDFDocument.load(await readFile(paths.custom2024Source))
  const targetDoc = await PDFDocument.load(await readFile(paths.official2024Source))
  const sourcePages = sourceDoc.getPages()
  const targetPages = targetDoc.getPages()
  if (sourcePages.length !== targetPages.length) {
    throw new Error('The 2024 source and official templates must have the same page count.')
  }

  const sourceForm = sourceDoc.getForm()
  const targetForm = targetDoc.getForm()
  const helvetica = await targetDoc.embedFont(StandardFonts.Helvetica)

  for (const sourceField of sourceForm.getFields()) {
    const widgets = sourceField.acroField.getWidgets()
    if (widgets.length !== 1) {
      throw new Error(`${sourceField.getName()} must have exactly one widget.`)
    }
    const widget = widgets[0]
    const pageIndex = getWidgetPageIndex(sourceDoc, widget)
    if (pageIndex < 0) throw new Error(`Unable to locate ${sourceField.getName()} on a page.`)

    const sourcePage = sourcePages[pageIndex]
    const targetPage = targetPages[pageIndex]
    const sourceSize = sourcePage.getSize()
    const targetSize = targetPage.getSize()
    const rect = widget.getRectangle()
    const scaleX = targetSize.width / sourceSize.width
    const scaleY = targetSize.height / sourceSize.height
    const appearance = {
      x: rect.x * scaleX,
      y: rect.y * scaleY,
      width: rect.width * scaleX,
      height: rect.height * scaleY,
      borderWidth: 0,
    }

    if (sourceField instanceof PDFTextField) {
      const targetField = targetForm.createTextField(sourceField.getName())
      if (sourceField.isMultiline()) targetField.enableMultiline()
      const maxLength = sourceField.getMaxLength()
      if (maxLength != null) targetField.setMaxLength(maxLength)
      targetField.addToPage(targetPage, {
        ...appearance,
        font: helvetica,
        textColor: rgb(0, 0, 0),
      })
      targetField.setFontSize(Math.max(5, Math.min(10, appearance.height * 0.55)))
    } else if (sourceField instanceof PDFCheckBox) {
      const targetField = targetForm.createCheckBox(sourceField.getName())
      targetField.addToPage(targetPage, appearance)
      targetField.uncheck()
      for (const targetWidget of targetField.acroField.getWidgets()) {
        const appearanceDictionary = targetWidget.dict.get(PDFName.of('AP'))
        const normalAppearance = appearanceDictionary?.get(PDFName.of('N'))
        if (normalAppearance) {
          const { width, height } = targetWidget.getRectangle()
          const emptyAppearance = targetDoc.context.formXObject([], {
            BBox: targetDoc.context.obj([0, 0, width, height]),
            Matrix: targetDoc.context.obj([1, 0, 0, 1, 0, 0]),
          })
          normalAppearance.set(PDFName.of('Off'), targetDoc.context.register(emptyAppearance))
        }
      }
    } else {
      throw new Error(`Unsupported 2024 field type for ${sourceField.getName()}.`)
    }
  }

  await writeFile(
    paths.official2024Output,
    await targetDoc.save({ addDefaultPage: false, updateFieldAppearances: false }),
  )
}

await buildCustom2014()
await buildOfficial2024()
