import { mapCharacterSheet2014 } from '@/lib/pdf/characterSheetMapping2014'
import { mapCharacterSheet2014Official } from '@/lib/pdf/characterSheetMapping2014Official'
import { mapCharacterSheet2024 } from '@/lib/pdf/characterSheetMapping2024'
import {
  getCharacterSheetTemplate,
  getDefaultCharacterSheetTemplateId,
} from '@/lib/pdf/characterSheetTemplates'
import type { CharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import { fillCharacterSheetPdf } from '@/lib/pdf/pdfFormAdapter'
import type { CharacterSheetFieldMap, CharacterSheetTemplateId } from '@/lib/pdf/types'

export {
  CHARACTER_SHEET_TEMPLATES,
  getCharacterSheetTemplate,
} from '@/lib/pdf/characterSheetTemplates'
export type { CharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
export { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
export type { CharacterSheetFieldMap, CharacterSheetTemplateId } from '@/lib/pdf/types'

export function buildCharacterSheetFieldMap(
  viewModel: CharacterSheetViewModel,
  templateId: CharacterSheetTemplateId = getDefaultCharacterSheetTemplateId(),
): CharacterSheetFieldMap {
  const template = getCharacterSheetTemplate(templateId)
  if (template.mappingId === '2014-custom') return mapCharacterSheet2014(viewModel)
  if (template.mappingId === '2014-official') return mapCharacterSheet2014Official(viewModel)
  return mapCharacterSheet2024(viewModel)
}

export function generateFilledCharacterSheetPdf(
  viewModel: CharacterSheetViewModel,
  templateBytes: ArrayBuffer | Uint8Array,
  templateId: CharacterSheetTemplateId = getDefaultCharacterSheetTemplateId(),
): Promise<Uint8Array> {
  const template = getCharacterSheetTemplate(templateId)
  return fillCharacterSheetPdf(templateBytes, buildCharacterSheetFieldMap(viewModel, templateId), {
    templateId: template.id,
    cleanupProfile: template.cleanupProfile,
    portraitFieldName: template.portraitFieldName,
    organizationImageFieldName: template.organizationImageFieldName,
    portrait: viewModel.character.portrait,
    organizationImage: viewModel.organizationImage,
  })
}
