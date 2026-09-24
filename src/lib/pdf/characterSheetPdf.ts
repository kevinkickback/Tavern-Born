import { PDFDocument } from '@cantoo/pdf-lib'
import {
  formatActionEntry,
  getAmmunitionRows,
  mapCharacterSheet2014,
} from '@/lib/pdf/characterSheetMapping2014'
import {
  mapCharacterSheet2014Official,
  mapOfficial2014SpellPage,
  paginateOfficial2014SpellPages,
} from '@/lib/pdf/characterSheetMapping2014Official'
import { mapCharacterSheet2024 } from '@/lib/pdf/characterSheetMapping2024'
import {
  getCharacterSheetTemplate,
  getDefaultCharacterSheetTemplateId,
} from '@/lib/pdf/characterSheetTemplates'
import {
  type CharacterSheetViewModel,
  withoutSheetDescriptions,
} from '@/lib/pdf/characterSheetViewModel'
import { fillCharacterSheetDocument } from '@/lib/pdf/pdfFormAdapter'
import type {
  CharacterSheetFieldMap,
  CharacterSheetPageOptions,
  CharacterSheetTemplateId,
  SheetContentChoices,
  SheetExportReport,
  SheetOverflowSection,
  SheetTextOptions,
} from '@/lib/pdf/types'
import { DEFAULT_SHEET_TEXT_OPTIONS } from '@/lib/pdf/types'
import {
  type CharacterSheetSupplementBytes,
  getCharacterSheetAssetPlan,
} from './characterSheetAssets'
import { buildCompanionSheetData } from './companionSheet'
import { createCompanionSheetDocument } from './companionSheetPdf'
import { getOfficial2014SectionText } from './official2014Text'
import { get2024FieldLabel } from './official2024Text'
import { appendPdfForm } from './pdfAssembly'
import { compactSheetText, planSheetContent } from './sheetContent'
import { addNotesReferences, appendSheetNotes } from './sheetNotes'

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
  return mapCharacterSheet2024(viewModel, template.variant)
}

export async function generateFilledCharacterSheetPdf(
  viewModel: CharacterSheetViewModel,
  templateBytes: ArrayBuffer | Uint8Array,
  templateId: CharacterSheetTemplateId = getDefaultCharacterSheetTemplateId(),
  options: {
    onTextTruncated?: (fieldName: string) => void
    pages?: CharacterSheetPageOptions
    supplements?: CharacterSheetSupplementBytes
    content?: SheetContentChoices
    text?: SheetTextOptions
    loadNotes?: () => Promise<Uint8Array>
    onReport?: (report: SheetExportReport) => void
  } = {},
): Promise<Uint8Array> {
  const template = getCharacterSheetTemplate(templateId)
  const continueInNotes =
    (options.text?.overflow ?? DEFAULT_SHEET_TEXT_OPTIONS.overflow) === 'notes'
  const selection = planSheetContent(
    options.text?.descriptions === 'names' ? withoutSheetDescriptions(viewModel) : viewModel,
    templateId,
    options.content,
    options.pages,
  )
  const original = viewModel
  viewModel = selection.viewModel
  const fullMap = buildCharacterSheetFieldMap(viewModel, templateId)
  if (template.id === '2014-official')
    Object.assign(fullMap.textFields, getOfficial2014SectionText(viewModel))
  if (template.id === '2014-custom') {
    viewModel.feats.forEach((feat, index) => {
      fullMap.textFields[`Feat Description ${index + 1}`] = feat.description
    })
    viewModel.magicItems.forEach((item, index) => {
      fullMap.textFields[`Extra.Magic Item Description ${index + 1}`] = item.description ?? ''
    })
    for (const [kind, label] of [
      ['action', 'Action'],
      ['bonus-action', 'Bonus Action'],
      ['reaction', 'Reaction'],
    ] as const) {
      viewModel.actions
        .filter((action) => action.kind === kind)
        .forEach((action, index) => {
          fullMap.textFields[`${label} ${index + 1}`] = formatActionEntry(action, true)
        })
    }
    // Let real geometry decide the split; remove the mapper's historical character estimates.
    fullMap.textFields['Racial Traits'] = [
      viewModel.racialTraitsSummary,
      viewModel.additionalMovementSummary === '—'
        ? ''
        : `Additional movement: ${viewModel.additionalMovementSummary}`,
    ]
      .filter(Boolean)
      .join('\n')
    // The main field receives the complete racial text; the adapter moves any
    // text that does not fit into overflow. Notes are assembled from overflow.
    fullMap.textFields['P5.ASnotes.Notes.Left'] = ''
    const ammunition = getAmmunitionRows(original).slice(2)
    if (ammunition.length)
      selection.overflow.push({
        id: 'capacity:ammunition',
        title: 'Additional ammunition',
        text: ammunition.map((row) => `${row.name}: ${row.amount}`).join('\n'),
      })
    const organization = original.organizationDetailsSummary
      .split(/\n+/)
      .filter(Boolean)
      .slice(2)
      .join('\n')
    if (organization)
      selection.overflow.push({
        id: 'organization',
        title: 'Organization details',
        text: organization,
      })
  }
  for (const [name, value] of Object.entries(fullMap.textFields))
    fullMap.textFields[name] = compactSheetText(value)
  const plan = getCharacterSheetAssetPlan(original, templateId, options.pages)
  const overflow: SheetOverflowSection[] = selection.overflow
  const shortened: string[] = []
  const noteReferences: string[] = []
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
  for (const part of plan.filter((part) => part.id !== 'notes')) {
    const source = part.id === 'main' ? templateBytes : options.supplements?.[part.id]
    if (!source) throw new Error(`The ${part.id} page template is required for this export.`)
    if (part.id === 'companion' && template.id !== '2014-custom') {
      await appendPdfForm(
        output,
        await createCompanionSheetDocument(
          source,
          viewModel,
          (label) => shortened.push(label),
          (title, text, field) => {
            overflow.push({ id: `text-limit:${field}`, title, text })
            noteReferences.push(field)
          },
        ),
      )
      continue
    }
    if (part.id === 'companion' && template.id === '2014-custom') {
      const companions = viewModel.companions.length ? viewModel.companions : [{ name: '' }]
      for (const [index, companion] of companions.entries()) {
        const fields = selectMap(
          mapCharacterSheet2014({ ...viewModel, companions: [companion] }),
          (name) => kind(name) === 'companion',
        )
        const prefix = index === 0 ? '' : `Companion${index + 1}__`
        const doc = await fillCharacterSheetDocument(source, fields, {
          templateId: '2014-custom',
          cleanupProfile: 'mpmb-2014',
          onTextTruncated: (name) => {
            shortened.push(prefix + name)
            overflow.push({
              id: `text-limit:${prefix}${name}`,
              title: `${companion.name || `Companion ${index + 1}`}: ${name.replace('P4.AScomp.Comp.Use.', '').replace('P4.AScomp.', '')}`,
              text: fields.textFields[name],
            })
            noteReferences.push(prefix + name)
          },
        })
        if ((companion.creature?.action?.length ?? 0) > 3)
          overflow.push({
            id: `companion-attacks:${index}`,
            title: `${companion.name}: attacks`,
            text: buildCompanionSheetData(viewModel, companion).attacks,
          })
        await appendPdfForm(output, doc, prefix)
      }
      continue
    }
    let fields = selectMap(fullMap, (name) => kind(name) === part.id)
    let additionalSpellPages: CharacterSheetFieldMap[] | undefined
    if (part.id === 'spells') {
      const spellMaps = paginateOfficial2014SpellPages(viewModel).map((page) =>
        mapOfficial2014SpellPage(viewModel, page),
      )
      fields = spellMaps[0]
      additionalSpellPages = spellMaps.slice(1)
    }
    const mpmb = template.id === '2014-custom' && part.id !== 'spells'
    const prefix = part.id === 'spells' && template.id === '2014-custom' ? 'WotC__' : ''
    const doc = await fillCharacterSheetDocument(source, fields, {
      templateId: mpmb ? '2014-custom' : part.id === 'spells' ? '2014-official' : template.id,
      cleanupProfile: mpmb ? 'mpmb-2014' : 'standard',
      portrait: part.id === 'main' ? viewModel.character.portrait : undefined,
      portraitFieldName: template.portraitFieldName,
      organizationImage: part.id === 'main' ? viewModel.organizationImage : undefined,
      organizationImageFieldName: template.organizationImageFieldName,
      additionalSpellPages,
      spellPageIndex: 0,
      onTextTruncated: (name) => {
        const extra = /^SpellPage(\d+)__(.*)$/.exec(name)
        const value = extra
          ? additionalSpellPages?.[Number(extra[1]) - 2]?.textFields[extra[2]]
          : fields.textFields[name]
        shortened.push(name)
        if (value) {
          const title =
            template.edition === '2024'
              ? get2024FieldLabel(name, template.variant === 'official')
              : name
                  .replace(/^SpellPage\d+__/, '')
                  .replace('Feat+Traits', 'Additional features and traits')
          overflow.push({ id: `text-limit:${prefix}${name}`, title, text: value })
          noteReferences.push(prefix + name)
        }
      },
    })
    await appendPdfForm(output, doc, prefix)
  }
  const uniqueOverflow = [
    ...new Map(
      overflow.filter((section) => section.text.trim()).map((section) => [section.id, section]),
    ).values(),
  ]
  const includeNotes =
    options.pages?.notes !== false &&
    (plan.some((part) => part.id === 'notes') || (continueInNotes && uniqueOverflow.length > 0))
  const notesContent = continueInNotes ? uniqueOverflow : []
  let notesPageCount = 0
  if (includeNotes) {
    const source = options.supplements?.notes ?? (await options.loadNotes?.())
    if (!source)
      throw new Error('The notes page template is required to preserve additional content.')
    const notes = await appendSheetNotes(output, source, notesContent)
    notesPageCount = notes.count
    if (notesContent.length) addNotesReferences(output, noteReferences, notes.sectionPages)
  }
  if (!includeNotes && continueInNotes) {
    for (const name of new Set(shortened)) options.onTextTruncated?.(name)
  }
  options.onReport?.({
    notesPageCount,
    preserved: includeNotes ? notesContent : [],
    omitted: includeNotes && notesContent.length ? [] : uniqueOverflow,
  })
  output.setTitle(viewModel.character.name)
  return output.save({ updateFieldAppearances: false })
}
