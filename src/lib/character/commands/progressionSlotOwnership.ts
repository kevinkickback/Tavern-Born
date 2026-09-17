export interface ProgressionSlotSelection {
  key: string
  slotLevel: number
}

/** Keeps retained choices in their original progression slots and assigns open slots to new choices. */
export function assignProgressionSlotLevels(
  existing: readonly ProgressionSlotSelection[],
  selectedKeys: readonly string[],
  availableSlotLevels: readonly number[],
  fallbackLevel: number,
): number[] {
  const remainingSlotLevels = [...availableSlotLevels]
  const existingLevelsByKey = new Map<string, number[]>()
  for (const selection of existing) {
    const levels = existingLevelsByKey.get(selection.key) ?? []
    levels.push(selection.slotLevel)
    existingLevelsByKey.set(selection.key, levels)
  }

  const takeAvailableSlot = (level: number): number | undefined => {
    const index = remainingSlotLevels.indexOf(level)
    if (index < 0) return undefined
    return remainingSlotLevels.splice(index, 1)[0]
  }

  const assigned = selectedKeys.map((key) => {
    const existingLevels = existingLevelsByKey.get(key) ?? []
    while (existingLevels.length > 0) {
      const level = existingLevels.shift()
      if (level == null) continue
      const retained = takeAvailableSlot(level)
      if (retained != null) return retained
    }
    return undefined
  })

  return assigned.map((level) => level ?? remainingSlotLevels.shift() ?? fallbackLevel)
}
