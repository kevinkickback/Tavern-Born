import type { Feat5e } from '@/types/5etools'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FeatAdditionalSpellEntry {
  name?: string
  ability?: string
  innate?: unknown
  known?: unknown
}

export type FeatOptionStep =
  | {
      kind: 'spellcastingClass'
      label: string
      /** Each class option drawn from the feat's additionalSpells entries. */
      classOptions: Array<{ name: string; ability?: string }>
    }
  | {
      kind: 'spells'
      label: string
      count: number
      /** Raw 5etools filter string, e.g. "level=0|class=Bard" */
      chooseFilter: string
    }
  | {
      kind: 'proficiency'
      label: string
      domain: 'skills' | 'languages' | 'tools'
      count: number
      /** Non-empty = constrained pool; empty/undefined = open-ended. */
      optionPool?: string[]
    }
  | { kind: 'abilityScore'; label: string; from: string[] }
  | { kind: 'optionalFeature'; label: string; featureType: string; count: number }
  | { kind: 'expertise'; label: string }

// ── Filter parser ─────────────────────────────────────────────────────────────

/** Parse a 5etools spell-filter string into structured components. */
export function parseFeatSpellFilter(filter: string): {
  level?: number[]
  school?: string[]
  className?: string
} {
  const result: { level?: number[]; school?: string[]; className?: string } = {}
  for (const part of filter.split('|')) {
    if (part.startsWith('level=')) {
      result.level = part
        .slice(6)
        .split(';')
        .map(Number)
        .filter((n) => !Number.isNaN(n))
    } else if (part.startsWith('school=')) {
      result.school = part.slice(7).split(';')
    } else if (part.startsWith('class=')) {
      result.className = part.slice(6)
    }
  }
  return result
}

// ── Entry parsers ─────────────────────────────────────────────────────────────

/** Collect choose entries from a single additionalSpells entry. */
function collectChooseEntries(
  entry: FeatAdditionalSpellEntry,
): Array<{ count: number; chooseFilter: string }> {
  const picks: Array<{ count: number; chooseFilter: string }> = []

  // "known": { "_": [{ "choose": "...", "count": N }] }
  if (entry.known && typeof entry.known === 'object') {
    for (const val of Object.values(entry.known as Record<string, unknown>)) {
      if (!Array.isArray(val)) continue
      for (const item of val) {
        if (typeof item !== 'object' || item === null) continue
        const obj = item as Record<string, unknown>
        if (typeof obj.choose === 'string') {
          picks.push({ count: (obj.count as number | undefined) ?? 1, chooseFilter: obj.choose })
        }
      }
    }
  }

  // "innate": { "_": { "daily": { "1e": [{ "choose": "..." }] } } }
  if (entry.innate && typeof entry.innate === 'object') {
    for (const freqGroup of Object.values(entry.innate as Record<string, unknown>)) {
      if (typeof freqGroup !== 'object' || freqGroup === null) continue
      for (const slotArr of Object.values(freqGroup as Record<string, unknown>)) {
        if (!Array.isArray(slotArr)) continue
        for (const item of slotArr) {
          if (typeof item !== 'object' || item === null) continue
          const obj = item as Record<string, unknown>
          if (typeof obj.choose === 'string') {
            picks.push({ count: (obj.count as number | undefined) ?? 1, chooseFilter: obj.choose })
          }
        }
      }
    }
  }

  return picks
}

function spellStepLabel(count: number, filter: string): string {
  const parsed = parseFeatSpellFilter(filter)
  const levelText = parsed.level?.map((l) => (l === 0 ? 'cantrip' : `${l}st-level`)).join('/')
  const classText = parsed.className ? ` ${parsed.className}` : ''
  return `Choose ${count}${classText} ${levelText ?? 'spell'}${count !== 1 ? 's' : ''}`
}

// ── Main API ──────────────────────────────────────────────────────────────────

/**
 * Derive wizard steps from a feat's structured 5etools fields.
 * Returns [] for feats with no follow-up choices required.
 */
export function deriveFeatOptionSteps(feat: Feat5e): FeatOptionStep[] {
  const steps: FeatOptionStep[] = []

  // additionalSpells ────────────────────────────────────────────────────────
  const additionalSpells = feat.additionalSpells as FeatAdditionalSpellEntry[] | undefined
  if (Array.isArray(additionalSpells) && additionalSpells.length > 0) {
    const namedEntries = additionalSpells.filter(
      (e): e is FeatAdditionalSpellEntry & { name: string } => typeof e.name === 'string',
    )
    if (namedEntries.length > 1) {
      // Multiple class choices → class picker first; spell steps are derived dynamically.
      steps.push({
        kind: 'spellcastingClass',
        label: 'Choose a spellcasting class',
        classOptions: namedEntries.map((e) => ({ name: e.name, ability: e.ability })),
      })
    } else {
      // Single entry (Fey Touched, Shadow Touched) → derive spell picks directly.
      const entry = additionalSpells[0]
      for (const { count, chooseFilter } of collectChooseEntries(entry)) {
        steps.push({
          kind: 'spells',
          label: spellStepLabel(count, chooseFilter),
          count,
          chooseFilter,
        })
      }
    }
  }

  // ability[].choose ────────────────────────────────────────────────────────
  for (const block of (feat.ability as Array<Record<string, unknown>> | undefined) ?? []) {
    if (typeof block.choose === 'object' && block.choose !== null) {
      const choose = block.choose as { from?: string[]; amount?: number }
      if (Array.isArray(choose.from) && choose.from.length > 0) {
        steps.push({
          kind: 'abilityScore',
          label: 'Choose an ability score to increase',
          from: choose.from,
        })
      }
    }
  }

  // skillProficiencies[].choose ─────────────────────────────────────────────
  for (const block of (feat.skillProficiencies as Array<Record<string, unknown>> | undefined) ??
    []) {
    if (typeof block.choose === 'object' && block.choose !== null) {
      const choose = block.choose as { from?: string[]; count?: number }
      const pool = (Array.isArray(choose.from) ? choose.from : []).filter((s) => s !== 'anySkill')
      steps.push({
        kind: 'proficiency',
        label: `Choose ${choose.count ?? 1} skill`,
        domain: 'skills',
        count: choose.count ?? 1,
        optionPool: pool.length > 0 ? pool : undefined,
      })
    }
  }

  // skillToolLanguageProficiencies ──────────────────────────────────────────
  const stlp = feat.skillToolLanguageProficiencies as Array<Record<string, unknown>> | undefined
  if (Array.isArray(stlp)) {
    for (const block of stlp) {
      const chooseArr = Array.isArray(block.choose) ? block.choose : []
      for (const choose of chooseArr) {
        if (typeof choose !== 'object' || choose === null) continue
        const c = choose as { from?: string[]; count?: number }
        // "from" contains "anySkill"/"anyTool" sentinel values; treat as open-ended
        steps.push({
          kind: 'proficiency',
          label: `Choose ${c.count ?? 1} skill or tool`,
          domain: 'skills',
          count: c.count ?? 1,
        })
      }
    }
  }

  // languageProficiencies ───────────────────────────────────────────────────
  for (const block of (feat.languageProficiencies as Array<Record<string, unknown>> | undefined) ??
    []) {
    const anyCount = typeof block.any === 'number' ? block.any : 0
    if (anyCount > 0) {
      steps.push({
        kind: 'proficiency',
        label: `Choose ${anyCount} language${anyCount !== 1 ? 's' : ''}`,
        domain: 'languages',
        count: anyCount,
      })
    }
  }

  // optionalfeatureProgression ──────────────────────────────────────────────
  for (const prog of (feat.optionalfeatureProgression as
    | Array<Record<string, unknown>>
    | undefined) ?? []) {
    const featureTypes = Array.isArray(prog.featureType) ? (prog.featureType as string[]) : []
    if (featureTypes.length > 0) {
      steps.push({
        kind: 'optionalFeature',
        label: `Choose a ${String(prog.name)}`,
        featureType: featureTypes[0],
        count: 1,
      })
    }
  }

  // expertise ───────────────────────────────────────────────────────────────
  if (Array.isArray(feat.expertise) && feat.expertise.length > 0) {
    steps.push({ kind: 'expertise', label: 'Choose a skill to gain Expertise in' })
  }

  return steps
}

/** True if the feat requires follow-up selections after being chosen. */
export function hasFeatOptions(feat: Feat5e): boolean {
  return deriveFeatOptionSteps(feat).length > 0
}

/**
 * Derive spell choice steps for a specific class entry once the
 * spellcasting class has been selected (Magic Initiate-style feats).
 */
export function deriveSpellStepsForClass(
  feat: Feat5e,
  className: string,
): Array<{ count: number; chooseFilter: string; label: string }> {
  const additionalSpells = feat.additionalSpells as FeatAdditionalSpellEntry[] | undefined
  if (!Array.isArray(additionalSpells)) return []
  const entry = additionalSpells.find((e) => e.name === className)
  if (!entry) return []
  return collectChooseEntries(entry).map(({ count, chooseFilter }) => ({
    count,
    chooseFilter,
    label: spellStepLabel(count, chooseFilter),
  }))
}
