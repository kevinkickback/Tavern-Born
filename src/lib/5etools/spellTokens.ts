export interface ParsedSpellToken {
  name: string
  isCantrip: boolean
}

export function parseSpellToken(raw: string): ParsedSpellToken {
  const token = raw.trim()
  const isCantrip = token.toLowerCase().endsWith('#c')
  const withoutCantripSuffix = isCantrip ? token.slice(0, -2).trim() : token
  const [name] = withoutCantripSuffix.split('|')

  return {
    name: (name ?? '').trim(),
    isCantrip,
  }
}
