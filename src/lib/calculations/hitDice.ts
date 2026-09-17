import type { CharacterClassEntry, HitDiceUsed } from '@/types/character'

export function getHitDiePoolId(entry: Pick<CharacterClassEntry, 'name' | 'source'>): string {
  return `${entry.name.trim().toLowerCase()}|${entry.source.trim().toLowerCase()}`
}

export function getHitDiceUsedTotal(hitDiceUsed: HitDiceUsed | undefined): number {
  return Object.values(hitDiceUsed ?? {}).reduce(
    (total, used) => total + Math.max(0, Math.trunc(used)),
    0,
  )
}

export function reconcileHitDiceUsed(
  hitDiceUsed: HitDiceUsed | undefined,
  progression: readonly CharacterClassEntry[],
): HitDiceUsed {
  return Object.fromEntries(
    progression.flatMap((entry) => {
      const id = getHitDiePoolId(entry)
      const used = Math.min(entry.levels, Math.max(0, Math.trunc(hitDiceUsed?.[id] ?? 0)))
      return used > 0 ? [[id, used]] : []
    }),
  )
}
