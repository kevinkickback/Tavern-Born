import type { GameData, SourceBook } from '@/types/5etools'
import type { OriginSystem } from '@/types/character'
import { getImplicitSource } from './sourcePresets'

const CORE_SOURCE_RULESETS: Readonly<Record<string, OriginSystem>> = {
  PHB: '2014',
  DMG: '2014',
  MM: '2014',
  XPHB: '2024',
  XDMG: '2024',
  XMM: '2024',
}

const REVISED_CORE_SOURCES = new Set(['XPHB', 'XDMG', 'XMM'])

type SourceDescriptor = Pick<SourceBook, 'abbreviation' | 'minimumRuleset'>

function normalizeSource(source: string): string {
  return source.trim().toUpperCase()
}

export function getSourceCompatibility(
  source: SourceDescriptor | string,
  originSystem: OriginSystem,
): { compatible: boolean; reason?: string } {
  const abbreviation = normalizeSource(typeof source === 'string' ? source : source.abbreviation)
  const minimumRuleset = typeof source === 'string' ? undefined : source.minimumRuleset
  const coreRuleset = CORE_SOURCE_RULESETS[abbreviation]

  if (coreRuleset && coreRuleset !== originSystem) {
    return {
      compatible: false,
      reason:
        originSystem === '2024'
          ? 'Replaced by the revised core rulebook'
          : 'Requires the 2024 ruleset',
    }
  }

  if (originSystem === '2014' && minimumRuleset === '2024') {
    return { compatible: false, reason: 'Requires the 2024 ruleset' }
  }

  return { compatible: true }
}

export function normalizeAllowedSources(
  allowedSources: readonly string[],
  originSystem: OriginSystem,
  sourceCatalog: readonly SourceBook[] = [],
): string[] {
  const catalogByAbbreviation = new Map(
    sourceCatalog.map((source) => [normalizeSource(source.abbreviation), source]),
  )
  const normalized: string[] = []
  const seen = new Set<string>()

  for (const rawSource of allowedSources) {
    const abbreviation = normalizeSource(rawSource)
    if (!abbreviation || seen.has(abbreviation)) continue
    const source = catalogByAbbreviation.get(abbreviation) ?? abbreviation
    if (!getSourceCompatibility(source, originSystem).compatible) continue
    seen.add(abbreviation)
    normalized.push(abbreviation)
  }

  return normalized
}

export function getEffectiveSources(
  allowedSources: readonly string[],
  originSystem: OriginSystem,
  sourceCatalog: readonly SourceBook[] = [],
): string[] {
  const normalized = normalizeAllowedSources(allowedSources, originSystem, sourceCatalog)
  const implicit = getImplicitSource(originSystem)
  return normalized.includes(implicit) ? normalized : [...normalized, implicit]
}

function isRevisedEntity(value: unknown): value is { source: string } {
  if (!value || typeof value !== 'object') return false
  const entity = value as {
    source?: unknown
    edition?: unknown
    srd52?: unknown
    basicRules2024?: unknown
  }
  return (
    typeof entity.source === 'string' &&
    (entity.edition === 'one' || entity.srd52 === true || entity.basicRules2024 === true)
  )
}

/** Detect revised-only sourcebooks from parsed entity metadata. */
export function collectRevisedSourceAbbreviations(gameData: GameData): Set<string> {
  const revised = new Set(REVISED_CORE_SOURCES)

  for (const collection of Object.values(gameData)) {
    if (!Array.isArray(collection)) continue
    for (const entity of collection) {
      if (isRevisedEntity(entity)) revised.add(normalizeSource(entity.source))
    }
  }

  return revised
}
