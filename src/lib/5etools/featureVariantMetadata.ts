/** Existing normalization's descriptive prose adapter; live authority requires separate exact source proof. */
export function getFeatureVariantMetadata(
  feature: { isClassFeatureVariant?: unknown; entries?: unknown } | undefined,
) {
  if (feature?.isClassFeatureVariant !== true) return undefined
  let text: string
  try {
    text = JSON.stringify(feature.entries ?? '', (key, value) =>
      key === 'feature' ? undefined : value,
    )
  } catch {
    return {}
  }
  text = text
    .replace(/\{@[^\s}]+\s+([^|}]+)(?:\|[^}]*)?}/g, '$1')
    .replace(/[{}"\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const replacesFeatureName = /replaces (?:the )?([^.,;]+?) feature\b/i.exec(text)?.[1]?.trim()
  return { ...(replacesFeatureName ? { replacesFeatureName } : {}) }
}
