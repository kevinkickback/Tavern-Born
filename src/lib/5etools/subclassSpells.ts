import { getSpellReferenceKey } from '@/lib/calculations/spellIdentity'
import { normalizeOwnerIdentity } from '@/lib/provenance/normalization'
import type { Class5e, SubclassAdditionalSpells } from '@/types/5etools'
import type { Character, CharacterClassEntry } from '@/types/character'
import { getChosenLandTerrain, isCircleOfTheLand, landTerrainSpellToken } from './circleOfTheLand'
import { getClassFeatureReferenceLevel } from './classFeatureIdentity'
import { ELDRITCH_HEX_REFERENCE, getNativeEldritchHexOwner } from './nativeWarlockPatronRules'
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
  landContext?: {
    selections?: Character['classChoiceSelections']
    spells?: ReadonlyMap<string, number>
  },
): SubclassSpellGrant[] | undefined {
  if (!entry.subclass) return []
  const land = isCircleOfTheLand(entry.name, entry.source, entry.subclass, entry.subclassSource)
  const unavailable = land ? [] : undefined
  const norm = normalizeOwnerIdentity
  if (
    !classData ||
    norm(classData.name) !== norm(entry.name) ||
    norm(classData.source) !== norm(entry.source)
  )
    return unavailable
  const boundaries = (classData.classFeatureRefs ?? []).filter(
    (ref) => ref.gainSubclassFeature === true,
  )
  const levels = boundaries.map(getClassFeatureReferenceLevel)
  if (!levels.length || levels.some((level) => level === undefined)) return unavailable
  const first = Math.min(...(levels as number[]))
  if (levels.filter((level) => level === first).length !== 1) return unavailable
  if (classLevel < first) return []
  const subclasses = (classData.subclasses ?? []).filter(
    (row) =>
      norm(row.name) === norm(entry.subclass) &&
      norm(row.source) === norm(entry.subclassSource) &&
      norm(row.className) === norm(entry.name) &&
      norm(row.classSource) === norm(entry.source),
  )
  if (subclasses.length !== 1) return unavailable
  if (!land) {
    const grants = parseSubclassSpells(subclasses[0].additionalSpells, classLevel)
    if (!getNativeEldritchHexOwner(entry)) return grants
    // Eldritch Hex has its own source proof. Expanded list access remains independent.
    const hex = getSpellReferenceKey(ELDRITCH_HEX_REFERENCE)
    return grants.filter(
      (grant) => grant.mode === 'expanded' || getSpellReferenceKey(grant.spellName) !== hex,
    )
  }
  const terrain = getChosenLandTerrain(classData, subclasses[0], landContext?.selections ?? [])
  if (!terrain) return []
  const grants = parseSubclassSpells([{ prepared: terrain.block.prepared }], classLevel)
  const seen = new Set<string>()
  return grants.flatMap((grant) => {
    const spellName = landTerrainSpellToken(
      terrain.block.name,
      grant.level,
      grant.spellName,
      terrain.feature,
    ).name
    const key = getSpellReferenceKey(spellName)
    const spells = landContext?.spells
    if (seen.has(key)) return []
    seen.add(key)
    return [{ ...grant, spellName, isCantrip: spells ? spells.get(key) === 0 : grant.isCantrip }]
  })
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
