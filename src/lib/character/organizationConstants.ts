import { resolveBundledAssetSrc } from '@/lib/assetUrls'

/** Sentinel value stored in `CharacterDetails.organizationSelectionKey` when the
 *  user has opted for a fully custom ally / organization instead of a parsed entry. */
export const CUSTOM_ORGANIZATION_KEY = '__custom__'

export function getOrganizationKey(name: string, source: string): string {
  return `${name}|${source}`
}

export function resolveOrganizationImageSrc(path: string, baseUrl?: string): string {
  return resolveBundledAssetSrc(path, baseUrl)
}
