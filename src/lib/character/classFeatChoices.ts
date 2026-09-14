import { getOptFeatureTotal } from '@/lib/5etools/classData'
import { normalizeKey } from '@/lib/provenance/normalization'
import type { ClassFeatChoice } from '@/types/character'

export interface ClassFeatChoiceOwner {
  className: string
  classSource?: string
  progressionName: string
  categories: string[]
}

export function getClassFeatChoiceId(owner: ClassFeatChoiceOwner): string {
  return [
    normalizeKey(owner.className),
    normalizeKey(owner.classSource ?? ''),
    normalizeKey(owner.progressionName),
    [...owner.categories].sort().map(normalizeKey).join(','),
  ].join('|')
}

export function findClassFeatChoice(
  choices: readonly ClassFeatChoice[] | undefined,
  owner: ClassFeatChoiceOwner,
): ClassFeatChoice | undefined {
  const id = getClassFeatChoiceId(owner)
  return choices?.find((choice) => choice.id === id)
}

export function getClassFeatSlotLevels(
  progression: number[] | Record<string, number>,
  maximumLevel: number,
): number[] {
  const slotLevels: number[] = []
  let previousTotal = 0
  for (let level = 1; level <= maximumLevel; level += 1) {
    const total = getOptFeatureTotal(progression, level)
    for (let count = previousTotal; count < total; count += 1) slotLevels.push(level)
    previousTotal = total
  }
  return slotLevels
}
