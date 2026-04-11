import type { GrantType, SourceTag, SourceType } from './types'

/** Build a SourceTag from raw metadata. */
export function makeSourceTag(
  sourceType: SourceType,
  sourceName: string,
  grantType: GrantType,
  sourceRef?: string,
): SourceTag {
  return {
    sourceType,
    sourceName,
    sourceRef,
    grantType,
    label: resolveLabel(sourceType, sourceName),
  }
}

/**
 * Resolve the user-visible label for a source tag.
 * Manual edits and user-driven picks always display as 'User Choice'.
 */
export function resolveLabel(sourceType: SourceType, sourceName: string): string {
  if (sourceType === 'manual') return 'User Choice'
  return sourceName
}

/**
 * Format a source tag for display in a UI row.
 *
 * Examples:
 *  - "Insight (Background)" — fixed background grant
 *  - "Insight (Background, User Choice)" — user pick from background option pool
 *  - "User Choice" — manual toggle
 */
export function formatSourceAttribution(tag: SourceTag): string {
  if (tag.sourceType === 'manual') return 'User Choice'
  if (tag.grantType === 'choice') return `${tag.label} (User Choice)`
  return tag.label
}
