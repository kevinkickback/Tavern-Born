export interface ParsedSpellToken {
  name: string
  isCantrip: boolean
}

export function readMaterialFreeSpellUses(entries: readonly unknown[]) {
  if (
    entries.length !== 2 ||
    typeof entries[0] !== 'string' ||
    entries[1] !==
      "Whenever you start casting the spell, you can modify it so that it doesn't require {@status Concentration|XPHB}. If you do so, the spell's duration becomes 1 minute for that casting."
  )
    return undefined
  const match =
    /^You can cast \{@spell ([^{}|]+)\|XPHB\} without a Material component\. You can also cast it (once|twice|three times) without a spell slot, and you regain the ability to cast it in this way when you finish a \{@variantrule Long Rest\|XPHB\}\.$/.exec(
      entries[0],
    )
  if (!match) return undefined
  return {
    name: match[1],
    reference: `${match[1]}|XPHB`,
    casts: ['once', 'twice', 'three times'].indexOf(match[2]) + 1,
  }
}

export function parseSpellToken(raw: string): ParsedSpellToken {
  const token = raw.trim()
  // Decode the name and optional printing before removing casting modifiers.
  const [nameWithSuffix, sourceWithSuffix] = token.split('|')
  // Strip hash modifiers: #c = cantrip, #2 = cast at level 2, etc.
  const hashIdx = (nameWithSuffix ?? '').indexOf('#')
  const baseName =
    hashIdx >= 0 ? (nameWithSuffix ?? '').slice(0, hashIdx).trim() : (nameWithSuffix ?? '').trim()
  const sourceHashIdx = sourceWithSuffix?.indexOf('#') ?? -1
  const source = (sourceWithSuffix ?? '').split('#')[0].trim() || 'PHB'
  const suffix =
    hashIdx >= 0
      ? (nameWithSuffix ?? '').slice(hashIdx + 1).toLowerCase()
      : sourceHashIdx >= 0
        ? (sourceWithSuffix ?? '').slice(sourceHashIdx + 1).toLowerCase()
        : ''
  const isCantrip = suffix === 'c'

  return {
    name: baseName ? `${baseName}|${source}` : '',
    isCantrip,
  }
}
