import { resolveBundledAssetSrc } from '@/lib/assetUrls'

/** Sentinel value stored in `CharacterDetails.organizationSelectionKey` when the
 *  user has opted for a fully custom ally / organization instead of a parsed entry. */
export const CUSTOM_ORGANIZATION_KEY = '__custom__'

const LEGACY_ORGANIZATION_IMAGE_PATHS: Record<string, string> = {
  '/assets/images/factions/harpers-5e.png': '/assets/images/factions/harpers-5e.webp',
  '/assets/images/factions/order-of-the-gauntlet.png':
    '/assets/images/factions/order-of-the-gauntlet.webp',
  '/assets/images/factions/emerald-enclave-banner.png':
    '/assets/images/factions/emerald-enclave-banner.webp',
  '/assets/images/factions/lords-alliance-5e.png': '/assets/images/factions/lords-alliance-5e.webp',
  '/assets/images/factions/zhentarim-5e-symbol.png':
    '/assets/images/factions/zhentarim-5e-symbol.webp',
}

export function getOrganizationKey(name: string, source: string): string {
  return `${name}|${source}`
}

export function resolveOrganizationImageSrc(path: string, baseUrl?: string): string {
  const currentPath = path.startsWith('/assets/factions/')
    ? path.replace('/assets/factions/', '/assets/images/factions/')
    : path
  return resolveBundledAssetSrc(
    LEGACY_ORGANIZATION_IMAGE_PATHS[currentPath] ?? currentPath,
    baseUrl,
  )
}
