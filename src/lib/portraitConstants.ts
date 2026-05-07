const BASE = import.meta.env.BASE_URL

export const PLACEHOLDER_PORTRAITS = [
  `${BASE}assets/images/characters/placeholder_char_card.jpg`,
  `${BASE}assets/images/characters/placeholder_char_card2.jpg`,
  `${BASE}assets/images/characters/placeholder_char_card3.jpg`,
  `${BASE}assets/images/characters/placeholder_char_card4.jpg`,
  `${BASE}assets/images/characters/placeholder_char_card5.jpg`,
  `${BASE}assets/images/characters/placeholder_char_card6.jpg`,
  `${BASE}assets/images/characters/placeholder_char_card7.jpg`,
  `${BASE}assets/images/characters/placeholder_char_card8.jpg`,
  `${BASE}assets/images/characters/placeholder_char_card9.jpg`,
  `${BASE}assets/images/characters/placeholder_char_card10.jpg`,
  `${BASE}assets/images/characters/placeholder_char_card11.jpg`,
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
export function resolvePortraitSrc(src: string): string {
  if (src.startsWith('/assets/')) {
    return `${BASE}${src.slice(1)}`
  }
  return src
}

export const DEFAULT_PORTRAIT_TRANSFORM = {
  zoom: 150,
  panX: 25,
  panY: 25,
  rotation: 0,
}
