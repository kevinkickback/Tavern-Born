import { mapCharacterSheet2014 } from '@/lib/pdf/characterSheetMapping2014'
import { mapCharacterSheet2024 } from '@/lib/pdf/characterSheetMapping2024'
import type { CharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import { fillCharacterSheetPdf } from '@/lib/pdf/pdfFormAdapter'
import type { CharacterSheetFieldMap, CharacterSheetTemplateId } from '@/lib/pdf/types'

export type { CharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
export { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
export type { CharacterSheetFieldMap, CharacterSheetTemplateId } from '@/lib/pdf/types'

interface CharacterSheetTemplate {
  id: CharacterSheetTemplateId
  name: string
  fileName: string
  assetPath: string
}

export const CHARACTER_SHEET_TEMPLATES: readonly CharacterSheetTemplate[] = [
  {
    id: '2014',
    name: '2014 Character Sheet',
    fileName: '2014_Character_Sheet.pdf',
    assetPath: 'pdf/2014_Character_Sheet.pdf',
  },
  {
    id: '2024',
    name: '2024 Character Sheet',
    fileName: '2024_Character_Sheet.pdf',
    assetPath: 'pdf/2024_Character_Sheet.pdf',
  },
] as const

const TEMPLATE_BY_ID: Record<CharacterSheetTemplateId, CharacterSheetTemplate> = {
  '2014': CHARACTER_SHEET_TEMPLATES[0],
  '2024': CHARACTER_SHEET_TEMPLATES[1],
}

export const DEFAULT_CHARACTER_SHEET_TEMPLATE = TEMPLATE_BY_ID['2024']

export function buildCharacterSheetFieldMap(
  viewModel: CharacterSheetViewModel,
  templateId: CharacterSheetTemplateId = DEFAULT_CHARACTER_SHEET_TEMPLATE.id,
): CharacterSheetFieldMap {
  return templateId === '2014' ? mapCharacterSheet2014(viewModel) : mapCharacterSheet2024(viewModel)
}

export function getCharacterSheetTemplate(
  templateId: CharacterSheetTemplateId,
): CharacterSheetTemplate {
  return TEMPLATE_BY_ID[templateId]
}

export function generateFilledCharacterSheetPdf(
  viewModel: CharacterSheetViewModel,
  templateBytes: ArrayBuffer | Uint8Array,
  templateId: CharacterSheetTemplateId = DEFAULT_CHARACTER_SHEET_TEMPLATE.id,
): Promise<Uint8Array> {
  return fillCharacterSheetPdf(templateBytes, buildCharacterSheetFieldMap(viewModel, templateId), {
    templateId,
    portrait: viewModel.character.portrait,
  })
}
