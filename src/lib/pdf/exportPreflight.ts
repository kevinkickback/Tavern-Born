import { type EffectResolutionContext, isCharacterEffectActive } from '@/lib/calculations/effects'
import type { CharacterReadinessResult } from '@/lib/readiness/characterReadiness'
import type { CharacterEffect } from '@/types/effects'
import { CHARACTER_SHEET_CAPACITIES } from './characterSheetCapacities'
import { getAmmunitionRows, MPMB_CARD_DESCRIPTION_LIMIT } from './characterSheetMapping2014'
import { OFFICIAL_2014_SPELL_FIELDS_BY_LEVEL } from './characterSheetMapping2014Official'
import { mapCharacterSheet2024 } from './characterSheetMapping2024'
import { getCharacterSheetTemplate } from './characterSheetTemplates'
import type { CharacterSheetViewModel } from './characterSheetViewModel'
import {
  getOfficial2014SectionText,
  limitOfficial2014SectionText,
  OFFICIAL_2014_SECTION_LIMITS,
} from './official2014Text'
import { OFFICIAL_2024_PROSE_WARNING_LIMITS } from './official2024Text'
import type { CharacterSheetTemplateId } from './types'

type ExportPreflightCategory = 'readiness' | 'dependency' | 'unsupported' | 'truncation'

interface ExportPreflightIssue {
  id: string
  category: ExportPreflightCategory
  severity: 'blocking' | 'warning'
  title: string
  detail: string
}

export interface ExportPreflightResult {
  issues: ExportPreflightIssue[]
  blockingCount: number
  warningCount: number
}

function capacityIssue(
  id: string,
  label: string,
  count: number,
  capacity: number,
): ExportPreflightIssue | null {
  if (count <= capacity) return null
  return {
    id: `capacity:${id}`,
    category: 'truncation',
    severity: 'warning',
    title: `${label} exceed this template`,
    detail: `${count} entries are available; the fixed PDF has room for ${capacity}. The first ${capacity} entries in the documented order will be exported.`,
  }
}

function getCapacityIssues(
  templateId: CharacterSheetTemplateId,
  viewModel: CharacterSheetViewModel,
): ExportPreflightIssue[] {
  const issues: Array<ExportPreflightIssue | null> = []
  const template = getCharacterSheetTemplate(templateId)
  if (template.mappingId === '2014-custom') {
    const capacity = CHARACTER_SHEET_CAPACITIES['2014-custom']
    issues.push(
      capacityIssue('weapons', 'Weapon attacks', viewModel.weaponRows.length, capacity.weapons),
      capacityIssue(
        'equipment',
        'Inventory rows',
        viewModel.character.equipment.length,
        capacity.equipment,
      ),
      capacityIssue('magic-items', 'Magic items', viewModel.magicItems.length, capacity.magicItems),
      capacityIssue('feats', 'Feat cards', viewModel.feats.length, capacity.feats),
      capacityIssue(
        'ammunition',
        'Ammunition types',
        getAmmunitionRows(viewModel).length,
        capacity.ammunitionDisplays,
      ),
      capacityIssue(
        'companions',
        'Active companions',
        viewModel.companions.length,
        capacity.companionPages,
      ),
      capacityIssue('hit-dice', 'Hit-die rows', viewModel.hitDiceRows.length, capacity.hitDice),
      capacityIssue(
        'class-resources',
        'Class resources',
        viewModel.classResourceRows.length,
        capacity.classResources,
      ),
      capacityIssue(
        'spellcasting-profiles',
        'Spellcasting summaries',
        viewModel.spellcastingDetails.length,
        capacity.spellcastingProfiles,
      ),
      capacityIssue(
        'actions',
        'Actions',
        viewModel.actions.filter((action) => action.active && action.kind === 'action').length,
        capacity.actions,
      ),
      capacityIssue(
        'bonus-actions',
        'Bonus actions',
        viewModel.actions.filter((action) => action.active && action.kind === 'bonus-action')
          .length,
        capacity.bonusActions,
      ),
      capacityIssue(
        'reactions',
        'Reactions',
        viewModel.actions.filter((action) => action.active && action.kind === 'reaction').length,
        capacity.reactions,
      ),
    )
    for (const [kind, entries] of [
      ['Feat', viewModel.feats.slice(0, capacity.feats)],
      ['Magic item', viewModel.magicItems.slice(0, capacity.magicItems)],
    ] as const) {
      for (const [index, entry] of entries.entries()) {
        if ((entry.description?.length ?? 0) <= MPMB_CARD_DESCRIPTION_LIMIT) continue
        issues.push({
          id: `text-limit:mpmb-${kind.toLowerCase().replace(' ', '-')}-${index}`,
          category: 'truncation',
          severity: 'warning',
          title: `${kind} description exceeds its card`,
          detail: `${entry.name} has more text than its printed card can show. The export keeps the first ${MPMB_CARD_DESCRIPTION_LIMIT} characters.`,
        })
      }
    }
  } else if (template.mappingId === '2014-official') {
    const capacity = CHARACTER_SHEET_CAPACITIES['2014-official']
    const sections = getOfficial2014SectionText(viewModel)
    issues.push(
      capacityIssue('weapons', 'Weapon attacks', viewModel.weaponRows.length, capacity.weapons),
    )
    OFFICIAL_2014_SPELL_FIELDS_BY_LEVEL.forEach((fields, level) => {
      issues.push(
        capacityIssue(
          `spells-level-${level}`,
          level === 0 ? 'Cantrips' : `Level ${level} spells`,
          viewModel.spellRows.filter((row) => (row.level === 'C' ? 0 : Number(row.level)) === level)
            .length,
          fields.length,
        ),
      )
    })
    for (const [fieldName, characterLimit] of Object.entries(OFFICIAL_2014_SECTION_LIMITS)) {
      const sectionName = fieldName as keyof typeof OFFICIAL_2014_SECTION_LIMITS
      const sourceText = sections[sectionName]
      if (sourceText === limitOfficial2014SectionText(sectionName, sourceText)) continue
      issues.push({
        id: `text-limit:${fieldName}`,
        category: 'truncation',
        severity: 'warning',
        title: `${fieldName === 'Feat+Traits' ? 'Additional Features & Traits' : fieldName} text exceeds the page`,
        detail: `${sourceText.length} characters are available; this PDF section holds at most ${characterLimit}. The export keeps the beginning of the text.`,
      })
    }
  } else {
    const capacity = CHARACTER_SHEET_CAPACITIES['2024']
    issues.push(
      capacityIssue('weapons', 'Weapon attacks', viewModel.weaponRows.length, capacity.weapons),
      capacityIssue('spells', 'Spell rows', viewModel.spellRows.length, capacity.spells),
      capacityIssue(
        'attunements',
        'Attuned items',
        viewModel.magicItems.filter((item) => item.attuned).length,
        capacity.attunements,
      ),
    )
    if (templateId === '2024-official') {
      const fields = mapCharacterSheet2024(viewModel).textFields
      for (const [name, limit] of Object.entries(OFFICIAL_2024_PROSE_WARNING_LIMITS)) {
        const value = fields[name] ?? ''
        const lineCount = value.split('\n').length
        if (
          value.length <= limit.maxChars &&
          !('maxLines' in limit && lineCount > limit.maxLines)
        ) {
          continue
        }
        issues.push({
          id: `text-limit:${name}`,
          category: 'truncation',
          severity: 'warning',
          title: `${limit.label} may be shortened on this sheet`,
          detail:
            'The official 2024 PDF has a fixed text box. The export keeps the beginning and adds an ellipsis when the full text does not fit.',
        })
      }
    }
  }
  if (
    template.edition === '2014' &&
    (viewModel.character.details.faction || viewModel.character.details.organizationSelectionKey) &&
    !viewModel.organizationImage
  ) {
    issues.push({
      id: 'organization-image',
      category: 'dependency',
      severity: 'warning',
      title: 'Organization emblem is missing',
      detail:
        'A faction name alone does not select artwork. Choose an organization with an image or upload a custom emblem in Characteristics to include it in the PDF.',
    })
  }
  return issues.filter((issue): issue is ExportPreflightIssue => issue !== null)
}

function isUnsupportedPdfEffect(
  templateId: CharacterSheetTemplateId,
  effect: CharacterEffect,
): boolean {
  if (effect.operation.kind === 'conditional-note') {
    return true
  }
  const template = getCharacterSheetTemplate(templateId)
  return (
    effect.target.kind === 'carrying-capacity' ||
    (template.mappingId !== '2014-custom' &&
      (effect.target.kind === 'resource-maximum' || effect.target.kind === 'sense'))
  )
}

export function getPdfExportPreflight(
  templateId: CharacterSheetTemplateId,
  viewModel: CharacterSheetViewModel,
  readiness: CharacterReadinessResult | null | undefined,
  effects: readonly CharacterEffect[],
  effectContext: EffectResolutionContext = {},
  truncatedFields: readonly string[] = [],
): ExportPreflightResult {
  const readinessIssues: ExportPreflightIssue[] = (readiness?.issues ?? []).map((issue) => ({
    id: `readiness:${issue.id}`,
    category: issue.section === 'sources' ? 'dependency' : 'readiness',
    severity: issue.severity === 'blocking' ? 'blocking' : 'warning',
    title: issue.title,
    detail: issue.explanation,
  }))
  const unsupportedEffects = effects.filter(
    (effect) =>
      isCharacterEffectActive(effect, effectContext) && isUnsupportedPdfEffect(templateId, effect),
  )
  const unsupportedIssues: ExportPreflightIssue[] = unsupportedEffects.map((effect) => ({
    id: `unsupported:${effect.id}`,
    category: 'unsupported',
    severity: 'warning',
    title: effect.label,
    detail:
      'This mechanic remains available in Tavern-Born, but the fixed PDF has no reliable field for it.',
  }))
  const issues = [
    ...readinessIssues,
    ...unsupportedIssues,
    ...getCapacityIssues(templateId, viewModel),
  ]
  const pactSlots = Object.entries(viewModel.spellSlots.mergedPactWithUsage).filter(
    ([, slot]) => slot && slot.max > 0,
  )
  if (pactSlots.length) {
    issues.push({
      id: 'unsupported:pact-slots',
      category: 'unsupported',
      severity: 'warning',
      title: 'Track Pact Magic slots separately',
      detail: `The slot grid represents regular Spellcasting only; it cannot distinguish the Pact Magic recovery pool. Pact Magic: ${pactSlots.map(([level, slot]) => `level ${level}: ${slot?.max} total, ${slot?.used} expended`).join('; ')}.`,
    })
  }
  for (const field of new Set(truncatedFields)) {
    const id = `text-limit:${field}`
    if (issues.some((issue) => issue.id === id)) continue
    const label =
      OFFICIAL_2024_PROSE_WARNING_LIMITS[field as keyof typeof OFFICIAL_2024_PROSE_WARNING_LIMITS]
        ?.label ?? field
    issues.push({
      id,
      category: 'truncation',
      severity: 'warning',
      title: `${label} was shortened on this sheet`,
      detail:
        'The generated PDF could not fit the full text at a readable size. It keeps the beginning and marks omitted text with an ellipsis.',
    })
  }
  return {
    issues,
    blockingCount: issues.filter((issue) => issue.severity === 'blocking').length,
    warningCount: issues.filter((issue) => issue.severity === 'warning').length,
  }
}
