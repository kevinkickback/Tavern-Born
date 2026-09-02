import type { SourceTag } from '@/lib/provenance/types'
import type { Feat5e } from '@/types/5etools'

export interface ResolvedFixedFeatGrant {
  feat: Feat5e | undefined
  name: string
  source: string
  variant?: string
  variantLabel?: string
  fixedSpellcastingClass?: string
}

function equalsIgnoreCase(left: string, right: string): boolean {
  return left.localeCompare(right, undefined, { sensitivity: 'accent' }) === 0
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
): ResolvedFixedFeatGrant {
  const source = tag.sourceRef ?? ''
  const exact = feats.find(
    (feat) =>
      equalsIgnoreCase(feat.name, ledgerName) && equalsIgnoreCase(feat.source ?? '', source),
  )
  const feat = exact ?? feats.find((candidate) => equalsIgnoreCase(candidate.name, ledgerName))
  const variant = tag.grantVariant?.trim() || undefined
  return {
    feat,
    name: feat?.name ?? ledgerName,
    source: feat?.source ?? source,
    variant,
    variantLabel: variant ? variant.charAt(0).toUpperCase() + variant.slice(1) : undefined,
    fixedSpellcastingClass: feat ? getFixedSpellcastingClass(feat, variant) : undefined,
  }
}
