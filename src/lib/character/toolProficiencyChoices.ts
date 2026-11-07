import { normalizeGenericToolChoice, normalizeKey } from '@/lib/provenance/normalization'
import type { ChoiceRecord } from '@/lib/provenance/types'

export type ToolGenericKind = 'musical instrument' | "artisan's tools" | 'gaming set' | 'tool'
export type ToolProficiencyPools = Readonly<Record<ToolGenericKind, readonly string[]>>

export function getGenericToolKind(name: string) {
  return normalizeGenericToolChoice(name) as ToolGenericKind | null
}

export function getToolChoiceBranches(choice: ChoiceRecord) {
  if (choice.optionPool.length) return choice.optionPool
  return /:tools:any:\d+$/.test(choice.id) ? ['tool'] : []
}

function getToolChoiceOptions(choice: ChoiceRecord, pools: ToolProficiencyPools) {
  return getToolChoiceBranches(choice).map((option) => {
    const kind = getGenericToolKind(option)
    return kind
      ? pools[kind]
      : pools.tool.filter((name) => normalizeKey(name) === normalizeKey(option))
  })
}

export function canChooseConcreteTool(
  choice: ChoiceRecord,
  name: string,
  pools: ToolProficiencyPools,
  retainedPools = pools,
) {
  const key = normalizeKey(name)
  if (
    choice.domain !== 'tools' ||
    !key ||
    choice.selected.length >= choice.chooseCount ||
    choice.selected.some(getGenericToolKind)
  )
    return false
  const options = getToolChoiceOptions(choice, pools).map(
    (branch) => new Set(branch.map(normalizeKey)),
  )
  const selected = choice.selected.map(normalizeKey)
  if (selected.includes(key)) return false
  if (options.length < 2) return options[0]?.has(key) ?? false
  const retained = getToolChoiceOptions(choice, retainedPools).map(
    (branch) => new Set(branch.map(normalizeKey)),
  )

  // An explicit choose-from grants one pick from each named branch or category.
  const assigned = new Map<number, string>()
  function assign(tool: string, visited: Set<number>): boolean {
    return (tool === key ? options : retained).some((branch, index) => {
      if (visited.has(index) || !branch.has(tool)) return false
      visited.add(index)
      const previous = assigned.get(index)
      if (previous && !assign(previous, visited)) return false
      assigned.set(index, tool)
      return true
    })
  }
  return [...selected, key].every((tool) => assign(tool, new Set()))
}
