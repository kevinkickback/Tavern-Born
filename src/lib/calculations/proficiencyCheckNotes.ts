import { isReservedProficiencyCheckNoteId } from '@/lib/provenance/conditionalProficiencyIdentity'
import type { CharacterEffect } from '@/types/effects'
import { type EffectResolutionContext, isCharacterEffectActive } from './effects'

export interface ProficiencyCheckNoteRow {
  effectId: string
  text: string
}

/** Callers supply current source declarations, never retained feature text or manual snapshots. */
export function getProficiencyCheckNoteRows(
  declarations: readonly CharacterEffect[],
  context: EffectResolutionContext = {},
): ProficiencyCheckNoteRow[] {
  const rows = new Map<string, ProficiencyCheckNoteRow>()
  for (const effect of declarations) {
    if (
      effect.target.kind !== 'proficiency-check-note' ||
      effect.operation.kind !== 'conditional-note' ||
      !['class', 'subclass'].includes(effect.source.kind) ||
      !effect.source.entityId ||
      !isReservedProficiencyCheckNoteId(effect.id) ||
      !isCharacterEffectActive(effect, context)
    )
      continue
    rows.set(effect.id, {
      effectId: effect.id,
      text: `${effect.label}${effect.source.source ? ` (${effect.source.source})` : ''}: ${effect.operation.note}`,
    })
  }
  return [...rows.values()]
}
