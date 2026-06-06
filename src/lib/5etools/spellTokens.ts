export interface ParsedSpellToken {
  name: string
  isCantrip: boolean
}

export function parseSpellToken(raw: string): ParsedSpellToken {
  const token = raw.trim()
  // Strip source disambiguation suffix (e.g. "spell name|PHB") first
  const [nameWithSuffix] = token.split('|')
  // Strip hash modifiers: #c = cantrip, #2 = cast at level 2, etc.
  const hashIdx = (nameWithSuffix ?? '').indexOf('#')
  const baseName =
    hashIdx >= 0 ? (nameWithSuffix ?? '').slice(0, hashIdx).trim() : (nameWithSuffix ?? '').trim()
  const suffix = hashIdx >= 0 ? (nameWithSuffix ?? '').slice(hashIdx + 1).toLowerCase() : ''
  const isCantrip = suffix === 'c'

  return {
    name: baseName,
    isCantrip,
  }
}
