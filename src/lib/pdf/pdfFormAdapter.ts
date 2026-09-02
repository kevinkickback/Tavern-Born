import { PDFDocument, PDFName, PDFNumber } from '@cantoo/pdf-lib'
import {
  type AcroWidget,
  asFieldWithInternals,
  type FieldWithInternals,
} from '@/lib/pdf/pdfFieldInternals'
import { embedPortraitImage } from '@/lib/pdf/pdfImageAdapter'
import type { CharacterSheetFieldMap, CharacterSheetTemplateId } from '@/lib/pdf/types'

const MPMB_BUTTON_KEEP_PATTERNS = [
  /^Portrait$/i,
  /^Symbol$/i,
  /^HeaderIcon$/i,
  /^Image\./i,
  /^Weight /i,
]
const AMMO_CHECKBOX_PATTERN = /^Ammo(Left|Right)\.(Top|Base|Bullet|Icon)\./
const CALCULATED_FIELDS = ['AC', 'Proficiency Bonus', 'HP Max'] as const

export async function fillCharacterSheetPdf(
  templateBytes: ArrayBuffer | Uint8Array,
  fields: CharacterSheetFieldMap,
  options: { templateId: CharacterSheetTemplateId; portrait?: string },
): Promise<Uint8Array> {
  const input = templateBytes instanceof Uint8Array ? templateBytes : new Uint8Array(templateBytes)
  const pdfDoc = await PDFDocument.load(input, { ignoreEncryption: false })
  const form = pdfDoc.getForm()

  for (const [fieldName, value] of Object.entries(fields.textFields)) {
    try {
      form.getTextField(fieldName).setText(value)
      continue
    } catch {
      // Some templates expose select fields as dropdowns.
    }
    try {
      const dropdown = form.getDropdown(fieldName)
      const choices = dropdown.getOptions()
      if (value && !choices.includes(value)) dropdown.addOptions([value])
      if (value) dropdown.select(value)
    } catch {
      // Missing fields are allowed across template revisions.
    }
  }

  for (const [fieldName, checked] of Object.entries(fields.checkboxFields)) {
    try {
      const checkbox = form.getCheckBox(fieldName)
      if (checked) checkbox.check()
      else checkbox.uncheck()
    } catch {
      // Missing fields are allowed across template revisions.
    }
  }

  if (options.templateId === '2014') {
    hideUnwantedFields(form)
    clearAttackModDropdowns(form)
    stripCalculationActions(form)
    makeCalculatedFieldsEditable(form)
  }
  form.updateFieldAppearances()
  if (options.templateId === '2014') {
    stripCheckboxOffAppearances(form)
    if (options.portrait) await embedPortraitImage(pdfDoc, options.portrait)
  }
  return pdfDoc.save({ updateFieldAppearances: false })
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

function stripCalculationActions(form: ReturnType<PDFDocument['getForm']>) {
  const actionsKey = PDFName.of('AA')
  for (const field of form.getFields()) {
    const internals = asFieldWithInternals(field)
    if (internals?.acroField.dict.has(actionsKey)) internals.acroField.dict.delete(actionsKey)
  }
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

function stripCheckboxOffAppearances(form: ReturnType<PDFDocument['getForm']>) {
  for (const field of form.getFields()) {
    const internals = asFieldWithInternals(field)
    if (!internals) continue
    try {
      form.getCheckBox(internals.getName())
    } catch {
      continue
    }
    for (const widget of internals.acroField.getWidgets() as AcroWidget[]) {
      const appearance = widget.dict.get(PDFName.of('AP')) as
        | {
            get: (
              name: unknown,
            ) => { has: (name: unknown) => boolean; delete: (name: unknown) => void } | undefined
          }
        | undefined
      const normalAppearance = appearance?.get(PDFName.of('N'))
      if (normalAppearance?.has(PDFName.of('Off'))) normalAppearance.delete(PDFName.of('Off'))
    }
  }
}
