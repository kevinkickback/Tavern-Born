import { asArray, asObject } from './shared'

export function parseRaces(data: unknown): unknown[] {
  const obj = asObject(data)
  const races: unknown[] = obj.race ? [...asArray(obj.race)] : Array.isArray(data) ? [...data] : []
  const subraceEntries: unknown[] = asArray(obj.subrace)

  // Group subraces by parent race. The parent is identified by raceName + raceSource.
  // Some subraces store this directly; others use _copy.raceName / _copy.raceSource.
  const subraceMap = new Map<string, unknown[]>()
  for (const sr of subraceEntries) {
    const srObj = asObject(sr)
    const copyObj = asObject(srObj._copy)
    const raceName: string | undefined =
      typeof srObj.raceName === 'string' ? srObj.raceName : (copyObj.raceName as string | undefined)
    const raceSource: string | undefined =
      (typeof srObj.raceSource === 'string' ? srObj.raceSource : undefined) ??
      (typeof copyObj.raceSource === 'string' ? copyObj.raceSource : undefined) ??
      (typeof srObj.source === 'string' ? srObj.source : undefined)
    if (!raceName) continue
    const key = `${raceName}|${raceSource ?? ''}`
    if (!subraceMap.has(key)) subraceMap.set(key, [])
    subraceMap.get(key)?.push(sr)
  }

  return races.map((race) => {
    const raceObj = asObject(race)
    const key = `${String(raceObj.name ?? '')}|${String(raceObj.source ?? '')}`
    const nested = subraceMap.get(key)
    const versionSubraces = expandVersions(raceObj)

    const allSubraces = [
      ...(nested ?? []).map((subrace) => {
        const subraceObj = asObject(subrace)
        if (typeof subraceObj.name === 'string' && subraceObj.name.trim().length > 0) {
          return subraceObj
        }
        return { ...subraceObj, name: 'Default' }
      }),
      ...versionSubraces,
    ]

    if (allSubraces.length === 0) return race
    return { ...raceObj, subraces: allSubraces }
  })
}

/**
 * Extract display name from a version name like "Elf; Drow Lineage" -> "Drow Lineage",
 * or "Dragonborn (Black)" -> "Black".
 */
function extractVersionDisplayName(fullName: string, parentName: string): string {
  const semiIdx = fullName.indexOf(';')
  if (semiIdx >= 0) return fullName.substring(semiIdx + 1).trim()
  // Handle parenthesized form: "Dragonborn (Black)" -> "Black"
  const parenMatch = fullName.match(/\(([^)]+)\)/)
  if (parenMatch) return parenMatch[1]
  // Fallback: strip parent name prefix
  if (fullName.startsWith(parentName))
    return fullName.substring(parentName.length).trim() || fullName
  return fullName
}

/**
 * Apply _mod entry operations to a copy of parent entries.
 * Supports replaceArr (replace by name) and removeArr (remove by name).
 */
function applyEntryMod(parentEntries: unknown[], mod: Record<string, unknown>): unknown[] {
  // mod.entries can be a single operation object or an array of operations
  const rawModEntries = mod.entries
  const modOps: unknown[] = Array.isArray(rawModEntries)
    ? rawModEntries
    : rawModEntries
      ? [rawModEntries]
      : []
  let result = [...parentEntries]

  for (const op of modOps) {
    const opObj = asObject(op)
    const mode = opObj.mode
    if (mode === 'replaceArr' && typeof opObj.replace === 'string') {
      const target = opObj.replace
      result = result.map((entry) => {
        const entryObj = asObject(entry)
        return entryObj.name === target ? (opObj.items ?? entry) : entry
      })
    } else if (mode === 'removeArr') {
      const names = Array.isArray(opObj.names) ? opObj.names.map(String) : []
      if (names.length > 0) {
        const nameSet = new Set(names)
        result = result.filter((entry) => !nameSet.has(String(asObject(entry).name ?? '')))
      }
    }
  }

  return result
}

/** Recursively substitute {{variable}} placeholders in strings within an object tree. */
function substituteVariables(value: unknown, variables: Record<string, string>): unknown {
  if (typeof value === 'string') {
    return value.replace(/\{\{(\w+)}}/g, (_, key: string) => variables[key] ?? _)
  }
  if (Array.isArray(value)) {
    return value.map((item) => substituteVariables(item, variables))
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = substituteVariables(v, variables)
    }
    return out
  }
  return value
}

/**
 * Expand _versions on a race object into subrace-like entries.
 * Handles both simple versions (direct name/source/_mod) and
 * template versions (_abstract + _implementations with variable substitution).
 */
function expandVersions(raceObj: Record<string, unknown>): unknown[] {
  const versions = Array.isArray(raceObj._versions) ? raceObj._versions : []
  if (versions.length === 0) return []

  const parentName = String(raceObj.name ?? '')
  const parentEntries = Array.isArray(raceObj.entries) ? raceObj.entries : []
  const results: unknown[] = []

  for (const version of versions) {
    const vObj = asObject(version)

    if (vObj._abstract && Array.isArray(vObj._implementations)) {
      // Template version: expand each implementation
      const abstractObj = asObject(vObj._abstract)
      for (const impl of vObj._implementations as unknown[]) {
        const implObj = asObject(impl)
        const variables: Record<string, string> = {}
        const varsObj = asObject(implObj._variables)
        for (const [k, v] of Object.entries(varsObj)) {
          if (typeof v === 'string') variables[k] = v
        }

        // Substitute variables into the abstract to get a resolved version
        const resolved = substituteVariables(abstractObj, variables) as Record<string, unknown>
        const fullName = String(resolved.name ?? '')
        const displayName = extractVersionDisplayName(fullName, parentName)
        const resolvedMod = asObject(resolved._mod)
        const resolvedEntries =
          Object.keys(resolvedMod).length > 0
            ? applyEntryMod(parentEntries, resolvedMod)
            : parentEntries

        // Merge: abstract (with substitutions) -> implementation overrides -> computed fields
        const { _variables: _, ...implProps } = implObj as Record<string, unknown>
        results.push({
          ...resolved,
          ...implProps,
          name: displayName,
          _isVersion: true,
          entries: resolvedEntries,
        })
      }
    } else if (typeof vObj.name === 'string') {
      // Simple version
      const fullName = vObj.name as string
      const displayName = extractVersionDisplayName(fullName, parentName)
      const mod = asObject(vObj._mod)
      const resolvedEntries =
        Object.keys(mod).length > 0 ? applyEntryMod(parentEntries, mod) : parentEntries

      results.push({
        ...vObj,
        name: displayName,
        _isVersion: true,
        entries: resolvedEntries,
      })
    }
  }

  return results
}

function getFirstStringFromEntries(entries: unknown[]): string | null {
  for (const entry of entries) {
    if (typeof entry === 'string' && entry.trim().length > 0) {
      return entry
    }
    const entryObj = asObject(entry)
    const nestedEntries = asArray(entryObj.entries)
    if (nestedEntries.length > 0) {
      const nested = getFirstStringFromEntries(nestedEntries)
      if (nested) return nested
    }
  }

  return null
}

export function parseRaceFluffSummaries(
  data: unknown,
): Array<{ name: string; source: string; summary: string }> {
  const obj = asObject(data)
  const raceFluff = asArray(obj.raceFluff)

  return raceFluff
    .map((entry) => {
      const fluff = asObject(entry)
      const name = typeof fluff.name === 'string' ? fluff.name : ''
      const source = typeof fluff.source === 'string' ? fluff.source : ''
      const summary = getFirstStringFromEntries(asArray(fluff.entries))

      if (!name || !source || !summary) return null
      return { name, source, summary }
    })
    .filter(
      (
        value,
      ): value is {
        name: string
        source: string
        summary: string
      } => value !== null,
    )
}
