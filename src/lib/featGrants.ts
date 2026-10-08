import type { SourceTag } from '@/lib/provenance/types'
import type { Feat5e } from '@/types/5etools'

export interface ResolvedFixedFeatGrant {
  feat: Feat5e | undefined
  resolution: 'resolved' | 'missing' | 'ambiguous'
  name: string
  source: string
  variant?: string
  variantLabel?: string
  fixedSpellcastingClass?: string
}

function equalsIgnoreCase(left: string, right: string): boolean {
  return left.trim().localeCompare(right.trim(), undefined, { sensitivity: 'accent' }) === 0
}

/** Compatibility path for source-less saved grants; distinct printings cannot be guessed. */
function resolveLegacyFixedFeat(feats: readonly Feat5e[], name: string) {
  const matches = feats.filter((feat) => equalsIgnoreCase(feat.name, name))
  const sources = new Set(matches.map((feat) => feat.source.trim().toLowerCase()))
  return {
    feat: sources.size === 1 ? matches[0] : undefined,
    ambiguous: sources.size > 1,
  }
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
  const source = tag.sourceRef?.trim() ?? ''
  const catalog = [...feats, ...rawFeats]
  const legacy = source ? undefined : resolveLegacyFixedFeat(catalog, ledgerName)
  const feat = source
    ? catalog.find(
        (feat) =>
          equalsIgnoreCase(feat.name, ledgerName) && equalsIgnoreCase(feat.source ?? '', source),
      )
    : legacy?.feat
  const variant = tag.grantVariant?.trim() || undefined
  return {
    feat,
    resolution: feat ? 'resolved' : legacy?.ambiguous ? 'ambiguous' : 'missing',
    name: feat?.name ?? ledgerName,
    source: feat?.source ?? source,
    variant,
    variantLabel: variant ? variant.charAt(0).toUpperCase() + variant.slice(1) : undefined,
    fixedSpellcastingClass: feat ? getFixedSpellcastingClass(feat, variant) : undefined,
  }
}
