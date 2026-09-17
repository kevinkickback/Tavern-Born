import { describe, expect, test } from 'vitest'
import { getBundledFileUrl, resolveBundledAssetSrc } from '@/lib/assetUrls'
import { resolveOrganizationImageSrc } from '@/lib/character/organizationConstants'
import { getClassIconUrl } from '@/lib/classIcons'
import { resolvePortraitSrc } from '@/lib/portraitConstants'

describe('bundled file URLs', () => {
  test('uses relative URLs in packaged Electron builds', () => {
    expect(getBundledFileUrl('/assets/images/ui/logo.png', './')).toBe(
      './assets/images/ui/logo.png',
    )
    expect(getBundledFileUrl('pdf/2024_Character_Sheet.pdf', './')).toBe(
      './pdf/2024_Character_Sheet.pdf',
    )
    expect(getClassIconUrl(' Wizard ', './')).toBe('./assets/images/ui/icons/wizard.svg')
    expect(resolvePortraitSrc('/assets/images/characters/portrait.jpg', './')).toBe(
      './assets/images/characters/portrait.jpg',
    )
    expect(resolveOrganizationImageSrc('/assets/images/factions/harpers-5e.webp', './')).toBe(
      './assets/images/factions/harpers-5e.webp',
    )
  })

  test('retains root URLs for the development server', () => {
    expect(getBundledFileUrl('assets/images/ui/icons/cleric.svg', '/')).toBe(
      '/assets/images/ui/icons/cleric.svg',
    )
  })

  test('supports hosted base paths and preserves non-bundled images', () => {
    expect(getBundledFileUrl('assets/images/ui/logo.png', '/tavern-born/')).toBe(
      '/tavern-born/assets/images/ui/logo.png',
    )
    expect(resolveBundledAssetSrc('data:image/png;base64,image', './')).toBe(
      'data:image/png;base64,image',
    )
    expect(resolveBundledAssetSrc('https://example.com/portrait.png', './')).toBe(
      'https://example.com/portrait.png',
    )
  })

  test('returns no icon for unsupported classes', () => {
    expect(getClassIconUrl('Mystic', './')).toBeNull()
  })
})
