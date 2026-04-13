import type { SubclassAdditionalSpells } from '@/types/5etools'
import { parseSpellToken } from './spellTokens'

export interface SubclassSpellGrant {
  spellName: string
  level: number
  isCantrip: boolean
  mode: 'prepared' | 'known' | 'expanded' | 'innate'
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
