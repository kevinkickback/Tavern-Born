import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
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
  TextAlignment,
} from '@cantoo/pdf-lib'

const root = process.cwd()
const { values } = parseArgs({
  options: {
    'mpmb-source': { type: 'string' },
    'wotc-2024-source': { type: 'string' },
    help: { type: 'boolean' },
  },
})

if (values.help || (!values['mpmb-source'] && !values['wotc-2024-source'])) {
  console.log(`Import replacement template artwork from the repository root:
  node scripts/prepare-character-sheet-templates.mjs --mpmb-source <original.pdf>
  node scripts/prepare-character-sheet-templates.mjs --wotc-2024-source <artwork.pdf>
Both source options may be supplied together. See scripts/pdf-sources/README.md.
To rebuild existing assets, use prepare-2014-pdf-modules.mjs and prepare-2024-pdf-modules.mjs.`)
  process.exit(values.help ? 0 : 1)
}

const paths = {
  custom2014Source: values['mpmb-source'],
  custom2014Output: join(root, 'scripts', 'pdf-sources', '2014_MPMB_Character_Sheet.pdf'),
  custom2024Source: join(root, 'scripts', 'pdf-sources', '2024_Beaoudix_Character_Sheet.pdf'),
  official2024Source: values['wotc-2024-source'],
  official2024Output: join(root, 'scripts', 'pdf-sources', '2024_Official_Character_Sheet.pdf'),
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

// The Beaoudix form and the official artwork use different checkbox layouts.
// Keep the AcroForm widgets centered on the official sheet's printed controls.
function alignOfficial2024Widget(name, rect) {
  const textId = Number(/^Text_(\d+)$/.exec(name)?.[1])
  if (textId >= 92 && textId <= 211) {
    const row = (textId - 92) % 30
    rect.y = 581.8 - row * 19.44
    rect.height = 18
    // WotC splits the replica's combined casting-time column into time and range.
    if (textId >= 152 && textId <= 181) {
      rect.x = 154.5
      rect.width = 30.5
    }
  }
  if (textId === 55) {
    rect.y = 61.5
    rect.height = 45
  }
  if (textId === 56) {
    rect.y = 16.3
    rect.height = 33
  }
  if (
    textId === 1 ||
    textId === 6 ||
    (textId >= 8 && textId <= 13) ||
    (textId >= 25 && textId <= 30)
  ) {
    // These inherited multiline widgets are only ~11-14 pt high. At readable
    // font sizes their baseline lands on the clip edge; extra height lifts the
    // baseline and leaves room for the full glyph without moving the field.
    rect.height += 5
  } else if (textId === 15 || (textId >= 20 && textId <= 24)) {
    rect.y += 1 // Center ability modifiers within their printed circles.
  }
  if (textId === 8) rect.y -= 1.5 // Place the larger AC value lower in its shield.
  if (textId >= 16 && textId <= 19) rect.y += 1.5
  if (/^Text_[2345]$/.test(name)) rect.y += 2
  if (name === 'Text_7') {
    rect.x -= 3
    rect.width = 30
  }
  if (name === 'Text_18') {
    rect.x -= 8
    rect.width = 45 // The printed Size panel is wider than Beaoudix's widget.
  }
  const match = /^Checkbox_(\d+)$/.exec(name)
  if (match) {
    const id = Number(match[1])
    if (id >= 2 && id <= 7)
      rect.y += 2.6 // Death saves
    else if (id === 8)
      rect.y += 1 // Strength was already vertically centered.
    else if ([10, 24, 29, 30].includes(id))
      rect.y -= 0.5 // Checked saving throws are high in the printed circles.
    else if (id >= 11 && id <= 18)
      rect.y -= 0.5 // Dexterity and Wisdom skill dots need to sit lower.
    else if (id >= 25 && id <= 28)
      rect.y -= 1.5 // Charisma skill dots need a larger downward correction.
    else if (id >= 8 && id <= 31)
      rect.y += 1 // Saves and skills
    else if (id === 32) {
      rect.x -= 1 // Center Heroic Inspiration on the star.
      rect.y -= 1.5
    } else if (id >= 33 && id <= 36) {
      const centers = [62.9, 97.2, 141.6, 178.8] // Armor training
      rect.x = centers[id - 33] - rect.width / 2
      rect.y -= 5
      if (id === 36) rect.y += 0.75 // Shield proficiency sits slightly high.
    } else if (id >= 37 && id <= 58) {
      rect.x += id <= 46 ? 1.5 : id <= 54 ? 0.5 : 0 // Expended spell slots
      rect.y += 3
    } else if (id >= 59 && id <= 148) {
      const row = Math.floor((id - 59) / 3)
      // The source form drifts almost linearly against the official diamonds:
      // about 2 pt low at the top and 3.4 pt high at the bottom.
      rect.y += 2 - row * 0.185
    } else if (id >= 149 && id <= 151) rect.y -= 2.8 // Attunement
  } else if (/^Text_21[5-9]$/.test(name)) {
    rect.y -= 4.7 // Extend the bottom clipping edge without moving the baseline.
    rect.height += 2
  }
  return rect
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
    const appearance = alignOfficial2024Widget(sourceField.getName(), {
      x: rect.x * scaleX,
      y: rect.y * scaleY,
      width: rect.width * scaleX,
      height: rect.height * scaleY,
      borderWidth: 0,
    })

    if (sourceField instanceof PDFTextField) {
      const targetField = targetForm.createTextField(sourceField.getName())
      if (sourceField.isMultiline()) targetField.enableMultiline()
      if (sourceField.getName() === 'Text_9') targetField.setAlignment(TextAlignment.Center)
      const maxLength = sourceField.getMaxLength()
      if (maxLength != null) targetField.setMaxLength(maxLength)
      targetField.addToPage(targetPage, {
        ...appearance,
        font: helvetica,
        textColor: rgb(0, 0, 0),
      })
      // Every field overlays existing artwork, including the printed rules and grid.
      for (const targetWidget of targetField.acroField.getWidgets()) {
        const characteristics = targetWidget.dict.get(PDFName.of('MK'))
        if (characteristics instanceof PDFDict) characteristics.delete(PDFName.of('BG'))
      }
      targetField.setFontSize(Math.max(5, Math.min(10, appearance.height * 0.55)))
      targetField.defaultUpdateAppearances(helvetica)
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

  for (let row = 0; row < 30; row += 1) {
    const range = targetForm.createTextField(`SpellRange_${row + 1}`)
    range.enableMultiline()
    range.addToPage(targetPages[1], {
      x: 188.5,
      y: 581.8 - row * 19.44,
      width: 41,
      height: 18,
      borderWidth: 0,
      backgroundColor: undefined,
      font: helvetica,
    })
    for (const widget of range.acroField.getWidgets())
      widget.getAppearanceCharacteristics()?.dict.delete(PDFName.of('BG'))
    range.setFontSize(8)
    range.defaultUpdateAppearances(helvetica)
  }

  await writeFile(
    paths.official2024Output,
    await targetDoc.save({ addDefaultPage: false, updateFieldAppearances: false }),
  )
}

if (values['mpmb-source']) {
  await buildCustom2014()
  await import('./prepare-2014-pdf-modules.mjs')
}
if (values['wotc-2024-source']) {
  await buildOfficial2024()
  await import('./prepare-2024-pdf-modules.mjs')
}
