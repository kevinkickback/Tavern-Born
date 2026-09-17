import type { CharacterAction } from '@/types/actions'
import type { Character } from '@/types/character'

function normalizeManualAction(action: CharacterAction): CharacterAction {
  const id = action.id.trim()
  const name = action.name.trim()
  if (!id) throw new Error('A manual action requires a stable ID.')
  if (!name) throw new Error('A manual action requires a name.')
  return {
    ...action,
    id,
    name,
    description: action.description.trim(),
    source: { ...action.source, kind: 'manual', name },
    range: action.range?.trim() || undefined,
    damage: action.damage?.map((part) => ({
      ...part,
      dice: part.dice?.trim() || undefined,
      damageType: part.damageType?.trim() || undefined,
    })),
    resourceCost: action.resourceCost
      ? { ...action.resourceCost, resourceId: action.resourceCost.resourceId.trim() }
      : undefined,
    recharge: action.recharge
      ? { ...action.recharge, note: action.recharge.note?.trim() || undefined }
      : undefined,
  }
}

export function upsertManualActionCommand(
  character: Pick<Character, 'manualActions'>,
  action: CharacterAction,
): Pick<Character, 'manualActions'> {
  const normalized = normalizeManualAction(action)
  const current = character.manualActions ?? []
  const existingIndex = current.findIndex((entry) => entry.id === normalized.id)
  return {
    manualActions:
      existingIndex < 0
        ? [...current, normalized]
        : current.map((entry, index) => (index === existingIndex ? normalized : entry)),
  }
}

export function removeManualActionCommand(
  character: Pick<Character, 'manualActions'>,
  actionId: string,
): Pick<Character, 'manualActions'> {
  return {
    manualActions: (character.manualActions ?? []).filter((action) => action.id !== actionId),
  }
}
