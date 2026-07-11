import {
  iterateProficiencyBlocks,
  normalizeGenericToolChoice,
  normalizeKey,
  resolveRaceGrantFilterOptions,
  toProficiencyBlocks,
} from '@/lib/provenance'

export function sanitizeProficiencyLabel(value: unknown): string | null {
  if (typeof value !== 'string') return null
  let out = value.trim()
  if (!out) return null

  out = out.replace(/\{@[a-zA-Z]+\s+([^}|]+)(?:\|[^}]*)?\}/g, '$1')
  // Fallback for malformed tags like "{@Item Dart Phb|Darks}".
  out = out.replace(/^\{@[a-zA-Z]+\s+/, '').replace(/\}$/, '')
  // Handle plain refs such as "dagger|phb|daggers" by keeping display/base name.
  if (out.includes('|')) {
    const parts = out
      .split('|')
      .map((p) => p.trim())
      .filter(Boolean)
    out = parts[2] ?? parts[0] ?? out
  }
  out = out.replace(/^one type of\s+/i, '')
  out = out.replace(/\s+of your choice$/i, '')
  out = out.replace(/^\+\d+\s+/, '')
  out = out.replace(/\s+/g, ' ').trim()

  out = toGenericChoiceLabel(out)
  if (!out) return null
  return out
}

export function toGenericChoiceLabel(value: string): string {
  return normalizeGenericToolChoice(value) ?? value
}

export function canonicalizeToolName(value: string): string {
  const key = normalizeKey(value)
  if (key === "theives' tools" || key === 'theives tools') return "thieves' tools"
  return value
}

export function isConcreteToolName(value: string): boolean {
  const key = normalizeKey(value)
  if (key.includes('choose')) return false
  if (key.includes('any')) return false
  if (key.includes('your choice')) return false
  if (key.includes('one type')) return false
  if (key === 'tool') return false
  return true
}

export function isConcreteWeaponName(value: string): boolean {
  const key = normalizeKey(value)
  if (key.includes('that have')) return false
  if (key.includes('property')) return false
  if (key.includes('choose')) return false
  if (key.includes('your choice')) return false
  if (key.includes('one type')) return false
  if (key.includes('any')) return false
  return true
}

export function addUniqueNormalized(map: Map<string, string>, value: unknown): void {
  const clean = sanitizeProficiencyLabel(value)
  if (!clean) return
  const norm = normalizeKey(clean)
  if (!map.has(norm)) map.set(norm, clean)
}

export function addUniqueWeapon(map: Map<string, string>, value: unknown): void {
  const clean = sanitizeProficiencyLabel(value)
  if (!clean || !isConcreteWeaponName(clean)) return
  const norm = normalizeKey(clean)
  if (!map.has(norm)) map.set(norm, clean)
}

export function addUniqueTool(map: Map<string, string>, value: unknown): void {
  const clean = sanitizeProficiencyLabel(value)
  if (!clean) return
  const normalizedGeneric = normalizeGenericToolChoice(clean)
  const canonical = normalizedGeneric ?? canonicalizeToolName(clean)
  if (!normalizedGeneric && !isConcreteToolName(canonical)) return
  const norm = normalizeKey(canonical)
  if (!map.has(norm)) map.set(norm, canonical)
}

export function collectFromProfBlocks(
  blocks: Record<string, unknown>[] | undefined,
  map: Map<string, string>,
): void {
  for (const entry of iterateProficiencyBlocks(toProficiencyBlocks(blocks), 'tools')) {
    if (entry.kind === 'fixed' || entry.kind === 'numeric') {
      addUniqueTool(map, entry.key)
      continue
    }
    if (entry.kind === 'generic-tool') {
      addUniqueTool(map, entry.genericKey)
      continue
    }
    if (entry.kind === 'choose') {
      for (const choice of entry.from) addUniqueTool(map, choice)
    }
  }
}

export function collectWeaponOrArmorFromProfBlocks(
  blocks: Record<string, unknown>[] | undefined,
  map: Map<string, string>,
  domain: 'armor' | 'weapons',
  context: Parameters<typeof resolveRaceGrantFilterOptions>[2],
): void {
  for (const entry of iterateProficiencyBlocks(toProficiencyBlocks(blocks), domain)) {
    if (entry.kind === 'fixed' || entry.kind === 'numeric') {
      if (domain === 'weapons') addUniqueWeapon(map, entry.key)
      else addUniqueNormalized(map, entry.key)
      continue
    }

    if (entry.kind === 'choose') {
      for (const item of entry.from) {
        if (domain === 'weapons') addUniqueWeapon(map, item)
        else addUniqueNormalized(map, item)
      }

      if (typeof entry.fromFilter === 'string') {
        for (const item of resolveRaceGrantFilterOptions(domain, entry.fromFilter, context)) {
          if (domain === 'weapons') addUniqueWeapon(map, item)
          else addUniqueNormalized(map, item)
        }
      }
    }
  }
}
