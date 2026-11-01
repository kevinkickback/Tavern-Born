export interface ParsedSpellToken {
  name: string
  isCantrip: boolean
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
