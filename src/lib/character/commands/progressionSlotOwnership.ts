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
  minimumLevelByKey?: ReadonlyMap<string, number>,
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

  return assigned.map((level, index) => {
    if (level !== undefined) return level
    if (!minimumLevelByKey) return remainingSlotLevels.shift() ?? fallbackLevel
    const minimum = minimumLevelByKey.get(selectedKeys[index])
    const position = remainingSlotLevels.findIndex(
      (slot) => minimum !== undefined && slot >= minimum,
    )
    if (position < 0)
      throw new RangeError('Choose an option whose prerequisites were met at this gain.')
    return remainingSlotLevels.splice(position, 1)[0]
  })
}
