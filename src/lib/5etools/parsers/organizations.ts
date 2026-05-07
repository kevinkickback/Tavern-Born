import type { Organization5e } from '@/types/5etools'
import { asArray, asObject, type ParsedObject } from './shared'

// Emergency fallback image URLs for known Sword Coast factions.
// Prefer parser-provided images when available; use these when source data omits
// a reliable image reference or points to non-ideal assets.
const ORGANIZATION_IMAGE_FALLBACKS: Record<string, string> = {
  harpers: '/assets/images/factions/harpers-5e.png',
  'order of the gauntlet': '/assets/images/factions/order-of-the-gauntlet.png',
  'emerald enclave': '/assets/images/factions/emerald-enclave-banner.png',
  'lords alliance': '/assets/images/factions/lords-alliance-5e.png',
  zhentarim: '/assets/images/factions/zhentarim-5e-symbol.png',
}

function walkUnknown(value: unknown, visitor: (node: unknown) => void) {
  visitor(value)

  if (Array.isArray(value)) {
    for (const item of value) {
      walkUnknown(item, visitor)
    }
    return
  }

  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value as ParsedObject)) {
      walkUnknown(child, visitor)
    }
  }
}

function extractFirstText(value: unknown): string | null {
  let firstText: string | null = null

  walkUnknown(value, (node) => {
    if (firstText) return
    if (typeof node === 'string' && node.trim().length > 0) {
      firstText = node.trim()
    }
  })

  return firstText
}

function extractFirstImagePath(value: unknown): string | undefined {
  let imagePath: string | undefined

  walkUnknown(value, (node) => {
    if (imagePath) return
    const obj = asObject(node)
    if (obj.type !== 'image') return
    const href = asObject(obj.href)
    if (typeof href.path === 'string' && href.path.trim().length > 0) {
      imagePath = href.path.trim()
    }
  })

  return imagePath
}

function getOrganizationImageFallback(name: string): string | undefined {
  const normalized = name
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
  return ORGANIZATION_IMAGE_FALLBACKS[normalized]
}

function findNamedEntriesSection(value: unknown, sectionName: string): ParsedObject | null {
  let section: ParsedObject | null = null

  walkUnknown(value, (node) => {
    if (section) return
    const obj = asObject(node)
    if (obj.name !== sectionName) return
    if (!Array.isArray(obj.entries)) return
    section = obj
  })

  return section
}

/**
 * Parse organizations/factions from fluff background text.
 *
 * Current source: `fluff-backgrounds.json` -> `backgroundFluff[]` ->
 * `Faction Agent` -> `Factions of the Sword Coast` section.
 */
export function parseOrganizations(data: unknown): Organization5e[] {
  const obj = asObject(data)
  const fluffBackgrounds = asArray(obj.backgroundFluff)
  if (fluffBackgrounds.length === 0) return []

  const organizationsByKey = new Map<string, Organization5e>()

  for (const fluff of fluffBackgrounds) {
    const fluffObj = asObject(fluff)
    const source = typeof fluffObj.source === 'string' ? fluffObj.source : ''
    const section = findNamedEntriesSection(fluffObj.entries, 'Factions of the Sword Coast')
    if (!section) continue

    for (const orgEntry of asArray(section.entries)) {
      const orgObj = asObject(orgEntry)
      const name = typeof orgObj.name === 'string' ? orgObj.name.trim() : ''
      if (!name) continue

      const description = extractFirstText(orgObj.entries)
      if (!description) continue

      const imagePath = extractFirstImagePath(orgObj) ?? getOrganizationImageFallback(name)
      const orgSource =
        typeof orgObj.source === 'string' && orgObj.source.trim().length > 0
          ? orgObj.source.trim()
          : source
      if (!orgSource) continue

      const key = `${name}|${orgSource}`
      if (organizationsByKey.has(key)) continue

      organizationsByKey.set(key, {
        name,
        source: orgSource,
        description,
        ...(imagePath ? { imagePath } : {}),
      })
    }
  }

  return [...organizationsByKey.values()].sort((a, b) => a.name.localeCompare(b.name))
}
