import { normalizeOwnerIdentity } from '@/lib/provenance/normalization'
import type { Class5e, SubclassAdditionalSpells } from '@/types/5etools'
import type { CharacterClassEntry } from '@/types/character'
import { getClassFeatureReferenceLevel } from './classFeatureIdentity'
import { parseSpellToken } from './spellTokens'

export interface SubclassSpellGrant {
  spellName: string
  level: number
  isCantrip: boolean
  mode: 'prepared' | 'known' | 'expanded' | 'innate'
}

/** Current selected provider at a historical class gain; undefined means authority is unavailable. */
export function getEarnedSubclassSpellGrants(
  classData: Class5e | undefined,
  entry: CharacterClassEntry,
  classLevel = entry.levels,
): SubclassSpellGrant[] | undefined {
  if (!entry.subclass) return []
  const norm = normalizeOwnerIdentity
  if (
    !classData ||
    norm(classData.name) !== norm(entry.name) ||
    norm(classData.source) !== norm(entry.source)
  )
    return undefined
  const boundaries = (classData.classFeatureRefs ?? []).filter(
    (ref) => ref.gainSubclassFeature === true,
  )
  const levels = boundaries.map(getClassFeatureReferenceLevel)
  if (!levels.length || levels.some((level) => level === undefined)) return undefined
  const first = Math.min(...(levels as number[]))
  if (levels.filter((level) => level === first).length !== 1) return undefined
  if (classLevel < first) return []
  const subclasses = (classData.subclasses ?? []).filter(
    (row) =>
      norm(row.name) === norm(entry.subclass) &&
      norm(row.source) === norm(entry.subclassSource) &&
      norm(row.className) === norm(entry.name) &&
      norm(row.classSource) === norm(entry.source),
  )
  return subclasses.length === 1
    ? parseSubclassSpells(subclasses[0].additionalSpells, classLevel)
    : undefined
}

function pushSpellList(
  grants: SubclassSpellGrant[],
  mode: SubclassSpellGrant['mode'],
  levelText: string,
  spells: unknown,
  maxClassLevel: number,
): void {
  const level = Number.parseInt(levelText, 10)
  if (!Number.isFinite(level) || level < 1 || level > maxClassLevel) return
  if (!Array.isArray(spells)) return

  for (const raw of spells) {
    if (typeof raw !== 'string') continue
    const parsed = parseSpellToken(raw)
    if (!parsed.name) continue
    grants.push({
      spellName: parsed.name,
      level,
      isCantrip: parsed.isCantrip,
      mode,
    })
  }
}

export function parseSubclassSpells(
  additionalSpells: SubclassAdditionalSpells[] | undefined,
  classLevel: number,
): SubclassSpellGrant[] {
  if (!additionalSpells || additionalSpells.length === 0 || classLevel < 1) return []

  const grants: SubclassSpellGrant[] = []

  for (const block of additionalSpells) {
    for (const [levelText, spells] of Object.entries(block.prepared ?? {})) {
      pushSpellList(grants, 'prepared', levelText, spells, classLevel)
    }

    for (const [levelText, spells] of Object.entries(block.known ?? {})) {
      pushSpellList(grants, 'known', levelText, spells, classLevel)
    }

    for (const [levelText, spells] of Object.entries(block.expanded ?? {})) {
      pushSpellList(grants, 'expanded', levelText, spells, classLevel)
    }

    for (const [levelText, usageConfig] of Object.entries(block.innate ?? {})) {
      const level = Number.parseInt(levelText, 10)
      if (!Number.isFinite(level) || level < 1 || level > classLevel) continue
      if (!usageConfig || typeof usageConfig !== 'object') continue

      const daily = (usageConfig as Record<string, unknown>).daily
      if (!daily || typeof daily !== 'object') continue

      for (const spells of Object.values(daily as Record<string, unknown>)) {
        if (!Array.isArray(spells)) continue
        for (const raw of spells) {
          if (typeof raw !== 'string') continue
          const parsed = parseSpellToken(raw)
          if (!parsed.name) continue
          grants.push({
            spellName: parsed.name,
            level,
            isCantrip: parsed.isCantrip,
            mode: 'innate',
          })
        }
      }
    }
  }

  return grants
}
