import {
  closePath,
  defaultTextFieldAppearanceProvider,
  drawEllipse,
  fill,
  lineTo,
  moveTo,
  PDFCheckBox,
  PDFDict,
  PDFDocument,
  PDFDropdown,
  PDFHexString,
  PDFName,
  PDFNumber,
  type PDFObject,
  PDFTextField,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  setFillingRgbColor,
  setTextMatrix,
} from '@cantoo/pdf-lib'
import { getOfficial2014FontBounds, OFFICIAL_2014_SECTION_LIMITS } from '@/lib/pdf/official2014Text'
import { fitOfficial2024Text } from '@/lib/pdf/official2024Text'
import {
  type AcroWidget,
  asFieldWithInternals,
  type FieldWithInternals,
  type FormWithInternals,
} from '@/lib/pdf/pdfFieldInternals'
import { embedOrganizationImage, embedPortraitImage } from '@/lib/pdf/pdfImageAdapter'
import type {
  CharacterSheetCleanupProfile,
  CharacterSheetFieldMap,
  CharacterSheetTemplateId,
} from '@/lib/pdf/types'

const MPMB_BUTTON_KEEP_PATTERNS = [
  /^Portrait$/i,
  /^Symbol$/i,
  /^HeaderIcon$/i,
  /^Image\./i,
  /^Weight /i,
]
const AMMO_CHECKBOX_PATTERN = /^Ammo(Left|Right)\.(Top|Base|Bullet|Icon)\./
const CALCULATED_FIELDS = ['AC', 'Proficiency Bonus', 'HP Max'] as const
const MPMB_RULED_TEXT_FIELDS = new Set([
  'Class Features',
  'Personality Trait',
  'Ideal',
  'Bond',
  'Flaw',
  'Background Feature Description',
  'Racial Traits',
  'Extra.Notes',
  'Background_Organisation.Left',
  'Background_Organisation.Right',
  'Background_Appearance',
  'Background_Enemies',
  'Background_History',
  'P4.AScomp.Comp.Use.Features',
  'P4.AScomp.Comp.Use.Traits',
  'P4.AScomp.Cnote.Left',
  'P5.ASnotes.Notes.Left',
  'P5.ASnotes.Notes.Right',
])

export async function fillCharacterSheetPdf(
  templateBytes: ArrayBuffer | Uint8Array,
  fields: CharacterSheetFieldMap,
  options: {
    cleanupProfile?: CharacterSheetCleanupProfile
    templateId?: CharacterSheetTemplateId
    portraitFieldName?: string
    organizationImageFieldName?: string
    portrait?: string
    organizationImage?: string
  },
): Promise<Uint8Array> {
  const input = templateBytes instanceof Uint8Array ? templateBytes : new Uint8Array(templateBytes)
  const pdfDoc = await PDFDocument.load(input, { ignoreEncryption: false })
  const form = pdfDoc.getForm()
  const cleanupProfile =
    options.cleanupProfile ?? (options.templateId === '2014' ? 'mpmb-2014' : 'standard')
  const missingFields: string[] = []

  for (const [fieldName, value] of Object.entries(fields.textFields)) {
    let handled = false
    try {
      form.getTextField(fieldName).setText(value)
      handled = true
    } catch {
      // Some templates expose select fields as dropdowns.
    }
    if (!handled) {
      try {
        const dropdown = form.getDropdown(fieldName)
        const choices = dropdown.getOptions()
        if (value && !choices.includes(value)) dropdown.addOptions([value])
        if (value) dropdown.select(value)
        else dropdown.clear()
        handled = true
      } catch {
        // Report missing and wrong-type fields together after validating the complete map.
      }
    }
    if (!handled) missingFields.push(fieldName)
  }

  for (const [fieldName, checked] of Object.entries(fields.checkboxFields)) {
    try {
      const checkbox = form.getCheckBox(fieldName)
      if (checked) checkbox.check()
      else checkbox.uncheck()
    } catch {
      missingFields.push(fieldName)
    }
  }

  if (missingFields.length > 0) {
    throw new Error(
      `PDF template is missing ${missingFields.length} required field${missingFields.length === 1 ? '' : 's'}: ${missingFields.join(', ')}`,
    )
  }

  if (cleanupProfile === 'mpmb-2014') {
    setMappedTextDefaults(form, fields.textFields)
    clearAttackModDropdowns(form)
    stripFormActions(form, fields)
    makeCalculatedFieldsEditable(form)
    updateDirtyFieldAppearances(form)
    alignMpmbRuledText(form)
    hideUnwantedFields(form)
  } else {
    if (options.templateId === '2014-official') setOfficial2014SectionLimits(form)
    if (options.templateId === '2024-official') fitOfficial2024TextAppearances(form)
    updateDirtyFieldAppearances(form)
    if (options.templateId === '2014-official') normalizeOfficial2014TextAppearances(form)
  }
  replaceCheckboxOffAppearances(pdfDoc, form, options.templateId === '2024-official')
  if (options.portrait && options.portraitFieldName) {
    await embedPortraitImage(pdfDoc, options.portrait, options.portraitFieldName)
  }
  if (options.organizationImage && options.organizationImageFieldName) {
    await embedOrganizationImage(
      pdfDoc,
      options.organizationImage,
      options.organizationImageFieldName,
    )
  }
  return pdfDoc.save({ updateFieldAppearances: false })
}

/** Keep MPMB multiline text on the template's roughly 11 pt printed rules. */
function alignMpmbRuledText(form: ReturnType<PDFDocument['getForm']>) {
  const font = form.getDefaultFont()
  for (const name of MPMB_RULED_TEXT_FIELDS) {
    const field = form.getFieldMaybe(name)
    if (!(field instanceof PDFTextField) || !field.getText()) continue
    field.updateAppearances(font, (textField, widget, appearanceFont) => {
      const operators = defaultTextFieldAppearanceProvider(textField, widget, appearanceFont)
      if (!Array.isArray(operators)) return operators
      const positions = operators
        .map((operator, index) => ({ operator, index }))
        .filter(({ operator }) => operator.toString().endsWith(' Tm'))
        .map(({ operator, index }) => {
          const parts = operator.toString().split(' ')
          return { index, x: Number(parts[4]), y: Number(parts[5]) }
        })
      if (positions.length < 2) return operators
      const naturalGap = positions[0].y - positions[1].y
      const maxGap = (positions[0].y - 2) / (positions.length - 1)
      const lineGap = Math.max(naturalGap, Math.min(11, maxGap))
      return operators.map((operator, index) => {
        const line = positions.findIndex((position) => position.index === index)
        if (line < 0) return operator
        return setTextMatrix(1, 0, 0, 1, positions[line].x, positions[0].y - line * lineGap)
      })
    })
  }
}

function updateDirtyFieldAppearances(form: ReturnType<PDFDocument['getForm']>) {
  const font = form.getDefaultFont()
  for (const field of form.getFields()) {
    if (!form.fieldIsDirty(field.ref)) continue
    if (field instanceof PDFCheckBox) field.defaultUpdateAppearances()
    else if (field instanceof PDFTextField || field instanceof PDFDropdown) {
      field.defaultUpdateAppearances(font)
    }
  }
}

function setOfficial2014SectionLimits(form: ReturnType<PDFDocument['getForm']>) {
  for (const [fieldName, maxLength] of Object.entries(OFFICIAL_2014_SECTION_LIMITS)) {
    form.getTextField(fieldName).setMaxLength(maxLength)
  }
}

function normalizeOfficial2014TextAppearances(form: ReturnType<PDFDocument['getForm']>) {
  const font = form.getDefaultFont()
  for (const field of form.getFields()) {
    if (!(field instanceof PDFTextField) || !field.getText()) continue
    const widget = asFieldWithInternals(field)?.acroField.getWidgets()[0]
    if (!widget) continue
    const { width, height } = widget.getRectangle()
    const bounds = getOfficial2014FontBounds(field.getName(), width, height)
    if (!bounds) continue

    const defaultAppearance = field.acroField.dict.get(PDFName.of('DA')) as
      | { decodeText?: () => string }
      | undefined
    const autoSize = Number(defaultAppearance?.decodeText?.().match(/([\d.]+)\s+Tf/)?.[1])
    if (!Number.isFinite(autoSize)) continue
    const fontSize = Math.min(bounds.max, Math.max(bounds.min, autoSize))
    if (fontSize === autoSize) continue
    field.setFontSize(fontSize)
    field.defaultUpdateAppearances(font)
  }
}

function fitOfficial2024TextAppearances(form: ReturnType<PDFDocument['getForm']>) {
  const font = form.getDefaultFont()
  for (const field of form.getFields()) {
    if (!(field instanceof PDFTextField)) continue
    const value = field.getText()
    if (!value) continue
    const widget = asFieldWithInternals(field)?.acroField.getWidgets()[0]
    if (!widget) continue
    const { width, height } = widget.getRectangle()
    const fitted = fitOfficial2024Text(field.getName(), value, font, width, height)
    if (!fitted) continue
    if (fitted.text !== value) field.setText(fitted.text)
    field.setFontSize(fitted.fontSize)
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

function isPushButtonField(form: ReturnType<PDFDocument['getForm']>, fieldName: string) {
  try {
    form.getButton(fieldName)
    return true
  } catch {
    return false
  }
}

function hideUnwantedFields(form: ReturnType<PDFDocument['getForm']>) {
  for (const field of form.getFields()) {
    const name = field.getName()
    const isInteractiveButton =
      isPushButtonField(form, name) &&
      !MPMB_BUTTON_KEEP_PATTERNS.some((pattern) => pattern.test(name))
    if (!isInteractiveButton && !AMMO_CHECKBOX_PATTERN.test(name)) continue
    const internals = asFieldWithInternals(field)
    if (!internals) continue
    try {
      hideFieldWidgets(internals)
    } catch {
      // Ignore template-specific widget failures.
    }
  }
}

function clearAttackModDropdowns(form: ReturnType<PDFDocument['getForm']>) {
  for (let index = 1; index <= 5; index += 1) {
    try {
      form.getDropdown(`Attack.${index}.Mod`).clear()
    } catch {
      // Field may not exist in all template revisions.
    }
  }
}

function setMappedTextDefaults(
  form: ReturnType<PDFDocument['getForm']>,
  textFields: Record<string, string>,
) {
  const defaultValueKey = PDFName.of('DV')
  for (const [fieldName, value] of Object.entries(textFields)) {
    const internals = asFieldWithInternals(form.getFieldMaybe(fieldName))
    if (!internals) continue
    internals.acroField.dict.set(defaultValueKey, PDFHexString.fromText(value))
  }
}

function stripFormActions(
  form: ReturnType<PDFDocument['getForm']>,
  fields: CharacterSheetFieldMap,
) {
  const actionKey = PDFName.of('A')
  const actionsKey = PDFName.of('AA')
  const mappedFieldNames = new Set([
    ...Object.keys(fields.textFields),
    ...Object.keys(fields.checkboxFields),
  ])
  for (const field of form.getFields()) {
    const internals = asFieldWithInternals(field)
    if (!internals) continue
    const isMappedField = mappedFieldNames.has(field.getName())
    if (isMappedField) internals.acroField.dict.delete(actionKey)
    internals.acroField.dict.delete(actionsKey)
    for (const widget of internals.acroField.getWidgets() as AcroWidget[]) {
      if (isMappedField) widget.dict.delete(actionKey)
      widget.dict.delete(actionsKey)
    }
  }
  ;(form as unknown as FormWithInternals).acroForm.dict.delete(PDFName.of('CO'))
}

function makeCalculatedFieldsEditable(form: ReturnType<PDFDocument['getForm']>) {
  const flagsKey = PDFName.of('Ff')
  for (const fieldName of CALCULATED_FIELDS) {
    try {
      const field = asFieldWithInternals(form.getTextField(fieldName))
      if (!field) continue
      const flags = field.acroField.dict.get(flagsKey) as { numberValue?: number } | undefined
      if (typeof flags?.numberValue === 'number') {
        field.acroField.dict.set(flagsKey, PDFNumber.of(flags.numberValue & ~1))
      }
    } catch {
      // Field may not exist for some template variations.
    }
  }
}

function replaceCheckboxOffAppearances(
  pdfDoc: PDFDocument,
  form: ReturnType<PDFDocument['getForm']>,
  transparentChecked = false,
) {
  for (const field of form.getFields()) {
    const internals = asFieldWithInternals(field)
    if (!internals) continue
    let checkbox: PDFCheckBox
    try {
      checkbox = form.getCheckBox(internals.getName())
    } catch {
      continue
    }
    for (const widget of internals.acroField.getWidgets() as AcroWidget[]) {
      const appearanceEntry = widget.dict.get(PDFName.of('AP')) as PDFObject | undefined
      const appearance = pdfDoc.context.lookup(appearanceEntry)
      if (!(appearance instanceof PDFDict)) continue
      const normalAppearance = pdfDoc.context.lookup(appearance.get(PDFName.of('N')))
      if (!(normalAppearance instanceof PDFDict) || !normalAppearance.has(PDFName.of('Off'))) {
        continue
      }
      const { width, height } = widget.getRectangle()
      const context = pdfDoc.context
      const emptyAppearance = context.formXObject([], {
        BBox: context.obj([0, 0, width, height]),
        Matrix: context.obj([1, 0, 0, 1, 0, 0]),
      })
      normalAppearance.delete(PDFName.of('Off'))
      const offAppearanceRef = context.register(emptyAppearance)
      normalAppearance.set(PDFName.of('Off'), offAppearanceRef)
      if (transparentChecked) {
        const onValue = checkbox.acroField.getOnValue()
        if (!onValue) continue
        // The official template prints its own circles/diamonds. The default
        // checked appearance paints white over them. Fill the printed center
        // with ink instead of drawing an offset, font-dependent check mark.
        const fieldId = Number(/^Checkbox_(\d+)$/.exec(field.getName())?.[1])
        const centerX = width / 2
        const centerY = height / 2
        const radius = Math.min(width, height) * (fieldId >= 8 && fieldId <= 32 ? 0.29 : 0.34)
        const mark =
          fieldId >= 8 && fieldId <= 32
            ? drawEllipse({
                x: centerX,
                y: centerY,
                xScale: radius,
                yScale: radius,
                color: rgb(0, 0, 0),
                borderColor: undefined,
                borderWidth: 0,
              })
            : [
                pushGraphicsState(),
                setFillingRgbColor(0, 0, 0),
                moveTo(centerX, centerY + radius),
                lineTo(centerX + radius, centerY),
                lineTo(centerX, centerY - radius),
                lineTo(centerX - radius, centerY),
                closePath(),
                fill(),
                popGraphicsState(),
              ]
        const checkAppearance = context.formXObject(mark, {
          BBox: context.obj([0, 0, width, height]),
          Matrix: context.obj([1, 0, 0, 1, 0, 0]),
        })
        normalAppearance.set(onValue, context.register(checkAppearance))
      }
    }
  }
}
