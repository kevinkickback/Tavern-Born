import { type EffectResolutionContext, isCharacterEffectActive } from '@/lib/calculations/effects'
import type { CharacterReadinessResult } from '@/lib/readiness/characterReadiness'
import type { CharacterEffect } from '@/types/effects'
import { CHARACTER_SHEET_CAPACITIES } from './characterSheetCapacities'
import type { CharacterSheetViewModel } from './characterSheetViewModel'
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
  if (templateId === '2014') {
    const capacity = CHARACTER_SHEET_CAPACITIES['2014']
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
  return (
    effect.target.kind === 'carrying-capacity' ||
    (templateId === '2024' &&
      (effect.target.kind === 'resource-maximum' || effect.target.kind === 'sense'))
  )
}

export function getPdfExportPreflight(
  templateId: CharacterSheetTemplateId,
  viewModel: CharacterSheetViewModel,
  readiness: CharacterReadinessResult | null | undefined,
  effects: readonly CharacterEffect[],
  effectContext: EffectResolutionContext = {},
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
  return {
    issues,
    blockingCount: issues.filter((issue) => issue.severity === 'blocking').length,
    warningCount: issues.filter((issue) => issue.severity === 'warning').length,
  }
}
