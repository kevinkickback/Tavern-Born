import { getBundledFileUrl, resolveBundledAssetSrc } from './assetUrls'

export const PLACEHOLDER_PORTRAITS = [
  getBundledFileUrl('assets/images/characters/placeholder_char_card.jpg'),
  getBundledFileUrl('assets/images/characters/placeholder_char_card2.jpg'),
  getBundledFileUrl('assets/images/characters/placeholder_char_card3.jpg'),
  getBundledFileUrl('assets/images/characters/placeholder_char_card4.jpg'),
  getBundledFileUrl('assets/images/characters/placeholder_char_card5.jpg'),
  getBundledFileUrl('assets/images/characters/placeholder_char_card6.jpg'),
  getBundledFileUrl('assets/images/characters/placeholder_char_card7.jpg'),
  getBundledFileUrl('assets/images/characters/placeholder_char_card8.jpg'),
  getBundledFileUrl('assets/images/characters/placeholder_char_card9.jpg'),
  getBundledFileUrl('assets/images/characters/placeholder_char_card10.jpg'),
  getBundledFileUrl('assets/images/characters/placeholder_char_card11.jpg'),
]

/**
 * Resolves a portrait path to a URL safe for use as an img `src`.
 *
 * Legacy characters may have paths stored as `/assets/...` (absolute). With
 * `base: './'` in vite.config.ts, production Electron builds load via
 * `file://` and `/assets/...` resolves to the filesystem root rather than
 * the app bundle. This function converts those absolute paths to
 * BASE_URL-relative equivalents so they resolve correctly in all contexts.
 */
export function resolvePortraitSrc(src: string, baseUrl?: string): string {
  return resolveBundledAssetSrc(src, baseUrl)
}

export const DEFAULT_PORTRAIT_TRANSFORM = {
  zoom: 150,
  panX: 25,
  panY: 25,
  rotation: 0,
}
