import type { RaceAdditionalSpells } from '@/types/5etools'

export interface RaceSpellGrant {
  spellName: string
  level: number
  isCantrip: boolean
  castingAbility?: string
  dailyUses?: number
  source: 'innate' | 'known'
}

function parseSpellToken(raw: string): { name: string; isCantrip: boolean } {
  const token = raw.trim()
  const isCantrip = token.toLowerCase().endsWith('#c')
  return {
    name: isCantrip ? token.slice(0, -2).trim() : token,
    isCantrip,
  }
}

export function parseRaceSpells(
  additionalSpells: RaceAdditionalSpells[] | undefined,
): RaceSpellGrant[] {
  if (!additionalSpells || additionalSpells.length === 0) return []

  const grants: RaceSpellGrant[] = []

  for (const block of additionalSpells) {
    const ability = typeof block.ability === 'string' ? block.ability : undefined

    for (const [levelText, spellList] of Object.entries(block.known ?? {})) {
      const level = Number.parseInt(levelText, 10)
      if (!Number.isFinite(level) || !Array.isArray(spellList)) continue

      for (const rawSpell of spellList) {
        if (typeof rawSpell !== 'string') continue
        const parsed = parseSpellToken(rawSpell)
        grants.push({
          spellName: parsed.name,
          level,
          isCantrip: parsed.isCantrip,
          castingAbility: ability,
          source: 'known',
        })
      }
    }

    for (const [levelText, usageMap] of Object.entries(block.innate ?? {})) {
      const level = Number.parseInt(levelText, 10)
      if (!Number.isFinite(level) || !usageMap || typeof usageMap !== 'object') continue

      const daily = (usageMap as Record<string, unknown>).daily
      if (!daily || typeof daily !== 'object') continue

      for (const [usesText, spells] of Object.entries(daily as Record<string, unknown>)) {
        const dailyUses = Number.parseInt(usesText, 10)
        if (!Number.isFinite(dailyUses) || !Array.isArray(spells)) continue

        for (const rawSpell of spells) {
          if (typeof rawSpell !== 'string') continue
          const parsed = parseSpellToken(rawSpell)
          grants.push({
            spellName: parsed.name,
            level,
            isCantrip: parsed.isCantrip,
            castingAbility: ability,
            dailyUses,
            source: 'innate',
          })
        }
      }
    }
  }

  return grants
}
