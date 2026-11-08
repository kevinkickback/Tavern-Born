import type { BackgroundAbilityData } from './abilityScores'

export function isFixedBackgroundAbilityBlock(block?: BackgroundAbilityData['blocks'][number]) {
  return (
    !!block &&
    block.from.length === block.weights.length &&
    new Set(block.from).size === block.from.length &&
    block.weights.every((weight) => weight === block.weights[0])
  )
}

export function updateRaceAsiChoices(
  raceAsiChoices: string[][],
  blockIdx: number,
  slotIdx: number,
  value: string,
): string[][] {
  const nextChoices = raceAsiChoices.map((arr) => [...arr])
  while (nextChoices.length <= blockIdx) nextChoices.push([])

  const blockSelections = [...(nextChoices[blockIdx] ?? [])]

  // Swap intra-block conflict: give displaced slot the current slot's old value
  const intraConflict = blockSelections.findIndex((s, i) => i !== slotIdx && s === value)
  if (intraConflict >= 0) {
    blockSelections[intraConflict] = blockSelections[slotIdx] ?? ''
  }

  // Clear cross-block conflict: same ability cannot appear in any other block
  for (let bi = 0; bi < nextChoices.length; bi++) {
    if (bi === blockIdx) continue
    const other = nextChoices[bi] ?? []
    for (let si = 0; si < other.length; si++) {
      if (other[si] === value) other[si] = ''
    }
    nextChoices[bi] = other
  }

  blockSelections[slotIdx] = value
  nextChoices[blockIdx] = blockSelections

  return nextChoices
}
