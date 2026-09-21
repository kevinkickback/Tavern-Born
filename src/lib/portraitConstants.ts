import type { PortraitTransform } from '@/types/character'
import { getBundledFileUrl, resolveBundledAssetSrc } from './assetUrls'

export const CHARACTER_CARD_LOGICAL_WIDTH = 360
export const CHARACTER_CARD_LOGICAL_HEIGHT = 240
const PORTRAIT_ART_OFFSET_X = -92

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

/** Resolves a portrait path to a URL safe for dev and packaged Electron runtimes. */
export function resolvePortraitSrc(src: string, baseUrl?: string): string {
  return resolveBundledAssetSrc(src, baseUrl)
}

export const DEFAULT_PORTRAIT_TRANSFORM: PortraitTransform = {
  zoom: 150,
  panX: 25,
  panY: 25,
  rotation: 0,
}

function cardRelativePercent(logicalPixels: number, logicalSize: number): number {
  return Number(((logicalPixels / logicalSize) * 100).toFixed(6))
}

function cssOffset(percent: number): string {
  return percent < 0 ? `- ${Math.abs(percent)}%` : `+ ${percent}%`
}

/**
 * Converts persisted 360 x 240 card coordinates into a responsive CSS transform.
 * The standard 360px character card keeps its existing crop while every other
 * card size preserves the same relative portrait framing.
 */
export function getPortraitCssTransform(transform?: PortraitTransform): string {
  const zoom = (transform?.zoom ?? 100) / 100
  const panX = transform?.panX ?? 0
  const panY = transform?.panY ?? 0
  const rotation = transform?.rotation ?? 0
  const xPercent = cardRelativePercent(panX + PORTRAIT_ART_OFFSET_X, CHARACTER_CARD_LOGICAL_WIDTH)
  const yPercent = cardRelativePercent(panY, CHARACTER_CARD_LOGICAL_HEIGHT)

  return `translate(calc(-50% ${cssOffset(xPercent)}), calc(-50% ${cssOffset(yPercent)})) scale(${zoom}) rotate(${rotation}deg)`
}
