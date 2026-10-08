import type { SourceTag } from '@/lib/provenance/types'
import type { Feat5e } from '@/types/5etools'

export interface ResolvedFixedFeatGrant {
  feat: Feat5e | undefined
  resolution: 'resolved' | 'missing'
  name: string
  source: string
  variant?: string
  variantLabel?: string
  fixedSpellcastingClass?: string
}

function equalsIgnoreCase(left: string, right: string): boolean {
  return left.trim().localeCompare(right.trim(), undefined, { sensitivity: 'accent' }) === 0
}

export function getFixedFeatOptionKey(name: string, source: string, variant?: string): string {
  return `${name.trim().toLowerCase()}|${source.trim().toLowerCase()}|${variant?.trim().toLowerCase() ?? ''}`
}

export function getFixedSpellcastingClass(feat: Feat5e, variant?: string): string | undefined {
  if (!variant) return undefined
  const normalizedVariant = variant.trim().toLowerCase()
  const entries = feat.additionalSpells as Array<{ name?: unknown }> | undefined
  return entries
    ?.map((entry) => (typeof entry.name === 'string' ? entry.name : ''))
    .find((name) => {
      const normalizedName = name.trim().toLowerCase()
      return (
        normalizedName === normalizedVariant || normalizedName === `${normalizedVariant} spells`
      )
    })
}

export function resolveFixedFeatGrant(
  feats: readonly Feat5e[],
  ledgerName: string,
  tag: SourceTag,
  rawFeats: readonly Feat5e[] = [],
): ResolvedFixedFeatGrant {
  const source = tag.grantSource?.trim() ?? ''
  const catalog = [...feats, ...rawFeats]
  const feat = source
    ? catalog.find(
        (feat) =>
          equalsIgnoreCase(feat.name, ledgerName) && equalsIgnoreCase(feat.source ?? '', source),
      )
    : undefined
  const variant = tag.grantVariant?.trim() || undefined
  return {
    feat,
    resolution: feat ? 'resolved' : 'missing',
    name: feat?.name ?? ledgerName,
    source: feat?.source ?? source,
    variant,
    variantLabel: variant ? variant.charAt(0).toUpperCase() + variant.slice(1) : undefined,
    fixedSpellcastingClass: feat ? getFixedSpellcastingClass(feat, variant) : undefined,
  }
}
