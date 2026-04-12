import { extractProficiencyBlockNames } from '@/lib/5etools/parsers'
import {
  ABILITY_ABBREVIATIONS,
  ABILITY_NAMES,
  getRaceAbilityData,
} from '@/lib/calculations/abilityScores'
import type { Race5e } from '@/types/5etools'

type RaceTraitEntry = {
  type?: string
  name?: string
  entries?: unknown[]
}

/** Merge a parent race with a selected subrace, handling ability overwrites and unioning arrays. */
export function mergeRaceWithSubrace(parent: Race5e, subrace: Race5e): Race5e {
  const replacesAbility =
    (subrace as Race5e & { overwrite?: { ability?: boolean } }).overwrite?.ability === true
  return {
    ...parent,
    ...subrace,
    ability: replacesAbility
      ? (subrace.ability ?? [])
      : [...(parent.ability ?? []), ...(subrace.ability ?? [])],
    entries: [...(parent.entries ?? []), ...(subrace.entries ?? [])],
    size: subrace.size ?? parent.size,
    speed: subrace.speed ?? parent.speed,
    darkvision: subrace.darkvision ?? parent.darkvision,
    languageProficiencies: subrace.languageProficiencies ?? parent.languageProficiencies,
    skillProficiencies: subrace.skillProficiencies ?? parent.skillProficiencies,
    traitTags: [
      ...new Set([
        ...((parent.traitTags as string[]) ?? []),
        ...((subrace.traitTags as string[]) ?? []),
      ]),
    ],
    resist: [...new Set([...(parent.resist ?? []), ...(subrace.resist ?? [])])],
    immune: [...new Set([...(parent.immune ?? []), ...(subrace.immune ?? [])])],
    conditionImmune: [
      ...new Set([...(parent.conditionImmune ?? []), ...(subrace.conditionImmune ?? [])]),
    ],
  } as Race5e
}

/** Filter subraces to those with a name. */
export function getAvailableSubraces(race?: Race5e): Race5e[] {
  return ((race?.subraces ?? []) as Race5e[]).filter((sr) => !!sr.name)
}

/** Title-case each word in a string (splits on whitespace). */
export function toTitleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}

/** Capitalize the first letter of a string, leaving the rest as-is. Returns String(s) for non-string inputs. */
export function formatCapitalized(s: unknown): string {
  if (typeof s !== 'string') return String(s)
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Format speed as "X ft." display string. Returns "—" when unavailable. */
export function getSpeedDisplay(race: Race5e | undefined): string {
  if (!race?.speed) return '—'
  if (typeof race.speed === 'number') return `${race.speed} ft.`
  if (typeof race.speed === 'object') {
    const walk = race.speed.walk ?? 30
    const parts = [`${walk} ft.`]

    const movementModes: Array<{ label: string; value: number | boolean | undefined }> = [
      { label: 'fly', value: race.speed.fly },
      { label: 'swim', value: race.speed.swim },
      { label: 'climb', value: race.speed.climb },
      { label: 'burrow', value: race.speed.burrow },
    ]

    for (const mode of movementModes) {
      if (mode.value === true) {
        parts.push(`${mode.label} ${walk} ft.`)
        continue
      }
      if (typeof mode.value === 'number' && mode.value > 0) {
        parts.push(`${mode.label} ${mode.value} ft.`)
      }
    }

    return parts.join(', ')
  }
  return '—'
}

/** Format darkvision as "X ft." display string. Returns "—" when unavailable. */
export function getDarkvisionDisplay(race: Race5e | undefined): string {
  if (!race?.darkvision || race.darkvision === 0) return '—'
  return `${race.darkvision} ft.`
}

/**
 * Format language proficiencies as a comma-separated display string.
 * Uses `extractProficiencyBlockNames` from the 5etools parsers.
 */
export function getLanguageDisplay(race: Race5e | undefined): string {
  if (!race?.languageProficiencies) {
    if (typeof race?.lineage === 'string') return 'Common, + 1 of your choice'
    return ''
  }
  return extractProficiencyBlockNames(race.languageProficiencies)
    .map((s) => formatCapitalized(s))
    .join(', ')
}

/** Format skill proficiencies as a display array including "Choose N from …" blocks. */
export function getSkillProfDisplay(race: Race5e | undefined): string[] {
  if (!race?.skillProficiencies) return []
  const skills: string[] = []
  for (const prof of race.skillProficiencies) {
    for (const [key, value] of Object.entries(prof)) {
      if (key !== 'choose' && value === true) {
        skills.push(formatCapitalized(key))
      }
    }
    if (prof.choose) {
      const { from, count } = prof.choose
      skills.push(`Choose ${count} from ${from.map(formatCapitalized).join(', ')}`)
    }
  }
  return skills
}

/**
 * Format ability score increases as display strings.
 * When `raceAsiChoices` is provided, shows selected choices and remaining count.
 * Handles lineage races with flexible ASI options.
 */
export function getAsiDisplay(
  race: Race5e | undefined,
  raceAsiBlockIndex: 0 | 1 = 0,
  raceAsiChoices?: string[][],
): string[] {
  if (!race) return []
  if (race.lineage === true || typeof race.lineage === 'string') {
    return ['Choose: +1/+2 (any 2 abilities)', 'Choose: +1 (any 3 abilities)']
  }
  const { fixed, choices } = getRaceAbilityData(race, undefined, raceAsiBlockIndex)
  const lines: string[] = []
  for (const fb of fixed) {
    lines.push(`${ABILITY_ABBREVIATIONS[fb.ability]} +${fb.value}`)
  }
  for (const [blockIdx, block] of choices.entries()) {
    const selections = raceAsiChoices ? (raceAsiChoices[blockIdx] ?? []).filter(Boolean) : []
    if (selections.length > 0) {
      for (const ab of selections) {
        const abbr =
          ABILITY_ABBREVIATIONS[ab as keyof typeof ABILITY_ABBREVIATIONS] ??
          ab.toUpperCase().slice(0, 3)
        lines.push(`${abbr} +${block.amount}`)
      }
      const remaining = block.count - selections.length
      if (remaining > 0) lines.push(`Choose ${remaining} more +${block.amount}`)
    } else {
      const isAnyAbility = block.from.length === ABILITY_NAMES.length
      if (isAnyAbility) {
        lines.push(`Choose ${block.count}: +${block.amount} (any ability)`)
      } else {
        const fromStr = block.from
          .map((a) => ABILITY_ABBREVIATIONS[a] ?? a.toUpperCase().slice(0, 3))
          .join('/')
        lines.push(`Choose ${block.count} × +${block.amount} from ${fromStr}`)
      }
    }
  }
  return lines
}

/**
 * Deduplicate, title-case, and join damage/condition trait values for display.
 * Returns "—" when the array is empty or undefined.
 */
export function getDamageTraitDisplay(values?: unknown[]): string {
  if (!values || values.length === 0) return '—'
  const strings = values.filter((v): v is string => typeof v === 'string')
  if (strings.length === 0) return '—'
  return Array.from(new Set(strings.map((v) => v.trim().toLowerCase())))
    .filter(Boolean)
    .map(toTitleCase)
    .join(', ')
}

/**
 * Extract displayable racial traits from a race's entries.
 * Filters out informational sections (Age, Alignment, etc.) and synthesizes
 * Darkvision and Tool Proficiency traits when present as tags.
 */
export function getRaceTraits(race: Race5e | undefined): { name: string; entries: unknown[] }[] {
  if (!race) return []
  const skip = new Set(['Age', 'Alignment', 'Size', 'Speed', 'Languages', 'Names'])

  const traits = ((race.entries as unknown[]) ?? [])
    .filter((e) => {
      const entry = e as RaceTraitEntry
      return (
        typeof e === 'object' &&
        entry.type === 'entries' &&
        typeof entry.name === 'string' &&
        !skip.has(entry.name) &&
        !entry.name.includes('Names')
      )
    })
    .map((e) => {
      const entry = e as RaceTraitEntry
      return { name: entry.name ?? '', entries: entry.entries ?? [] }
    })

  if (race.darkvision && !traits.some((t) => t.name === 'Darkvision')) {
    traits.push({
      name: 'Darkvision',
      entries: [
        `You have superior vision in dark and dim conditions. You can see in dim light within ${race.darkvision} feet of you as if it were bright light, and in darkness as if it were dim light.`,
      ],
    })
  }

  if (race.traitTags) {
    for (const tag of race.traitTags as string[]) {
      if (tag === 'Tool Proficiency' && !traits.some((t) => t.name.includes('Tool'))) {
        traits.push({
          name: 'Tool Proficiency',
          entries: ['You have proficiency with certain tools.'],
        })
      }
    }
  }

  return traits
}
