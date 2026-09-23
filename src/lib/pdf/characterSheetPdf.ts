import { PDFDocument } from '@cantoo/pdf-lib'
import { mapCharacterSheet2014 } from '@/lib/pdf/characterSheetMapping2014'
import {
  getOfficial2014SpellPages,
  mapCharacterSheet2014Official,
  mapOfficial2014SpellPage,
} from '@/lib/pdf/characterSheetMapping2014Official'
import { mapCharacterSheet2024 } from '@/lib/pdf/characterSheetMapping2024'
import {
  getCharacterSheetTemplate,
  getDefaultCharacterSheetTemplateId,
} from '@/lib/pdf/characterSheetTemplates'
import type { CharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import { fillCharacterSheetDocument } from '@/lib/pdf/pdfFormAdapter'
import type {
  CharacterSheetFieldMap,
  CharacterSheetPageOptions,
  CharacterSheetTemplateId,
} from '@/lib/pdf/types'
import {
  type CharacterSheetSupplementBytes,
  getCharacterSheetAssetPlan,
} from './characterSheetAssets'
import { createCompanionSheetDocument } from './companionSheetPdf'
import { appendPdfForm } from './pdfAssembly'

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

export async function generateFilledCharacterSheetPdf(
  viewModel: CharacterSheetViewModel,
  templateBytes: ArrayBuffer | Uint8Array,
  templateId: CharacterSheetTemplateId = getDefaultCharacterSheetTemplateId(),
  options: {
    onTextTruncated?: (fieldName: string) => void
    pages?: CharacterSheetPageOptions
    supplements?: CharacterSheetSupplementBytes
  } = {},
): Promise<Uint8Array> {
  const template = getCharacterSheetTemplate(templateId)
  const fullMap = buildCharacterSheetFieldMap(viewModel, templateId)
  if (template.edition !== '2014') {
    return (
      await fillCharacterSheetDocument(templateBytes, fullMap, {
        templateId: template.id,
        onTextTruncated: options.onTextTruncated,
      })
    ).save({ updateFieldAppearances: false })
  }
  const officialSpellMap = mapOfficial2014SpellPage(viewModel)
  const spellNames = new Set([
    ...Object.keys(officialSpellMap.textFields),
    ...Object.keys(officialSpellMap.checkboxFields),
  ])
  const kind = (name: string) =>
    name.startsWith('P4.AScomp.')
      ? 'companion'
      : name.startsWith('P5.ASnotes.')
        ? 'notes'
        : template.id === '2014-official' && spellNames.has(name)
          ? 'spells'
          : 'main'
  const selectMap = (
    map: CharacterSheetFieldMap,
    select: (name: string) => boolean,
  ): CharacterSheetFieldMap => ({
    textFields: Object.fromEntries(Object.entries(map.textFields).filter(([name]) => select(name))),
    checkboxFields: Object.fromEntries(
      Object.entries(map.checkboxFields).filter(([name]) => select(name)),
    ),
  })
  const output = await PDFDocument.create()
  for (const part of getCharacterSheetAssetPlan(viewModel, templateId, options.pages)) {
    const source = part.id === 'main' ? templateBytes : options.supplements?.[part.id]
    if (!source) throw new Error(`The ${part.id} page template is required for this export.`)
    if (part.id === 'companion' && template.id === '2014-official') {
      await appendPdfForm(
        output,
        await createCompanionSheetDocument(source, viewModel, options.onTextTruncated),
      )
      continue
    }
    let fields = selectMap(fullMap, (name) => kind(name) === part.id)
    let additionalSpellPages: CharacterSheetFieldMap[] | undefined
    if (part.id === 'spells') {
      const spellMaps = getOfficial2014SpellPages(viewModel).map((page) =>
        mapOfficial2014SpellPage(viewModel, page),
      )
      fields = spellMaps[0]
      additionalSpellPages = spellMaps.slice(1)
    } else if (part.id === 'notes') {
      fields.textFields['P5.ASnotes.Notes.Left'] ??= ''
      fields.textFields['P5.ASnotes.Notes.Right'] = ''
    }
    const mpmb = part.id === 'notes' || (template.id === '2014-custom' && part.id !== 'spells')
    const doc = await fillCharacterSheetDocument(source, fields, {
      templateId: mpmb ? '2014-custom' : '2014-official',
      cleanupProfile: mpmb ? 'mpmb-2014' : 'standard',
      portrait: part.id === 'main' ? viewModel.character.portrait : undefined,
      portraitFieldName: template.portraitFieldName,
      organizationImage: part.id === 'main' ? viewModel.organizationImage : undefined,
      organizationImageFieldName: template.organizationImageFieldName,
      additionalSpellPages,
      spellPageIndex: 0,
      onTextTruncated: options.onTextTruncated,
    })
    await appendPdfForm(
      output,
      doc,
      part.id === 'spells' && template.id === '2014-custom' ? 'WotC__' : '',
    )
  }
  output.setTitle(viewModel.character.name)
  return output.save({ updateFieldAppearances: false })
}
