import { extractProficiencyBlockNames } from '@/lib/5etools/parsers'
import {
  ABILITY_ABBREVIATIONS,
  type BackgroundAbilityData,
  normalizeAbilityName,
} from '@/lib/calculations/abilityScores'
import type { Background5e } from '@/types/5etools'

type BackgroundEntry = {
  type?: string
  name?: string
  entries?: unknown[]
}

export function getBackgroundEntries(
  background: Background5e,
): { name?: string; entries: unknown[] }[] {
  return ((background.entries as unknown[]) ?? [])
    .filter((entry) => {
      const typedEntry = entry as BackgroundEntry
      return (
        typeof entry === 'object' && (typedEntry.type === 'entries' || typedEntry.type === 'list')
      )
    })
    .map((entry) => {
      const typedEntry = entry as BackgroundEntry
      if (typedEntry.type === 'list') {
        return { name: undefined, entries: [entry] }
      }
      return {
        name: typedEntry.name,
        entries: typedEntry.entries ?? [],
      }
    })
}

export function getBackgroundSkillNames(background?: Background5e): string[] {
  if (!background) return []
  return extractProficiencyBlockNames(background.skillProficiencies ?? [])
}

export function getBackgroundLanguageNames(background?: Background5e): string[] {
  if (!background) return []
  return extractProficiencyBlockNames(background.languageProficiencies ?? [])
}

export function getBackgroundToolNames(background?: Background5e): string[] {
  if (!background) return []
  return extractProficiencyBlockNames(background.toolProficiencies ?? [])
}

export function getBackgroundAbilitySummary(
  data: BackgroundAbilityData,
  blockIndex: number,
  choices: string[],
): { current: string; options: string } {
  const selectedBlock = data.blocks[blockIndex] ?? data.blocks[0]
  const selected = selectedBlock
    ? selectedBlock.weights.map((weight, index) => {
        const ability = normalizeAbilityName(choices[index] ?? '')
        if (!ability || !selectedBlock.from.includes(ability)) return null
        return `+${weight} ${ABILITY_ABBREVIATIONS[ability]}`
      })
    : []
  const hasCompleteSelection =
    !!selectedBlock &&
    selected.every((choice) => choice !== null) &&
    new Set(choices.map((choice) => normalizeAbilityName(choice)).filter(Boolean)).size ===
      selectedBlock.weights.length

  const options = data.blocks.map((block) => {
    const weights = block.weights.map((weight) => `+${weight}`).join('/')
    const abilities = block.from.map((ability) => ABILITY_ABBREVIATIONS[ability]).join(', ')
    const count = block.weights.length
    return `${weights} across ${count} different ${count === 1 ? 'ability' : 'abilities'} from ${abilities}`
  })

  return {
    current: hasCompleteSelection ? selected.join(' · ') : 'Not configured',
    options: options.join(' or '),
  }
}

export function getBackgroundEquipmentPackages(
  background?: Background5e,
): { key: 'a' | 'b'; label: string; entries: unknown[] }[] {
  const packages: { key: 'a' | 'b'; label: string; entries: unknown[] }[] = []

  for (const block of background?.startingEquipment ?? []) {
    if (Array.isArray(block)) continue
    const equipmentBlock = block as {
      A?: unknown[]
      B?: unknown[]
      a?: unknown[]
      b?: unknown[]
    }
    if (typeof block === 'object') {
      const optionA = equipmentBlock.A ?? equipmentBlock.a
      const optionB = equipmentBlock.B ?? equipmentBlock.b

      if (!optionA) continue

      packages.push({
        key: 'a',
        label: 'Option A',
        entries: optionA,
      })

      if (optionB) {
        packages.push({
          key: 'b',
          label: 'Option B',
          entries: optionB,
        })
      }
    }
  }

  return packages
}
