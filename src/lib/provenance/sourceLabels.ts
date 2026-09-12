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
function resolveLabel(sourceType: SourceType, sourceName: string): string {
  if (sourceType === 'manual') return 'User Choice'
  return sourceName
}
