import { toAbilityName } from '@/lib/calculations/abilityNames'
import {
  iterateProficiencyBlocks,
  toProficiencyBlocks,
} from '@/lib/provenance/applyProficiencyBlocks'
import { normalizeKey, stripItemTag } from '@/lib/provenance/normalization'

export function normalizeSavingThrowName(name: string): string {
  const normalized = normalizeKey(name)
  return toAbilityName(normalized) ?? normalized
}

function isNarrativeTool(value: string): boolean {
  return /of your choice|choose|one type of/i.test(value)
}

export function mergeClassToolProficiencies(
  existing: readonly string[],
  proficiencies: { tools?: string[]; toolProficiencies?: unknown[] },
): string[] {
  const display = (proficiencies.tools ?? [])
    .filter((tool): tool is string => typeof tool === 'string')
    .map(stripItemTag)
    .filter((tool) => tool && !isNarrativeTool(tool))
  const blocks = toProficiencyBlocks(proficiencies.toolProficiencies)
  const names = new Map(existing.map((name) => [normalizeKey(name), name]))
  const add = (name: string) => {
    const key = normalizeKey(name)
    if (!names.has(key)) names.set(key, name)
  }
  if (blocks.length === 0) {
    for (const tool of display) add(tool)
  } else {
    const labels = new Map(display.map((name) => [normalizeKey(name), name]))
    for (const entry of iterateProficiencyBlocks(blocks, 'tools')) {
      if (entry.kind === 'fixed' || entry.kind === 'numeric')
        add(labels.get(normalizeKey(entry.key)) ?? entry.key)
    }
  }
  return [...names.values()]
}
