import { describe, expect, test } from 'vitest'
import { getSourcesRowsBySectionId } from '@/lib/provenance/sectionRows'
import type { SourceRow } from '@/lib/provenance/types'

function row(
  itemName: string,
  sourceTypes: SourceRow['sourceTypes'],
  isPending = false,
): SourceRow {
  return {
    itemName,
    category: 'test',
    attribution: 'test',
    sourceTypes,
    isPending,
  }
}

describe('provenanceSectionRows', () => {
  test('build-proficiencies excludes manual rows and keeps pending choice rows', () => {
    const result = getSourcesRowsBySectionId({
      sectionId: 'build-proficiencies',
      proficiencyRows: {
        skills: [row('Arcana', ['class'])],
        savingThrows: [],
        armor: [],
        weapons: [],
        tools: [row("Smith's Tools", ['manual'])],
        languages: [row('Elvish', ['race'])],
        pendingChoices: [row('Pick one skill', ['class'], true)],
      },
      abilityBonusRows: [],
      featRows: [],
      featureRows: [],
      spellRows: [],
      equipmentRows: [],
    })

    expect(result.map((r) => r.itemName)).toEqual(['Arcana', 'Elvish', 'Pick one skill'])
  })

  test('build-class excludes class/subclass rows and keeps other source rows', () => {
    const result = getSourcesRowsBySectionId({
      sectionId: 'build-class',
      proficiencyRows: {
        skills: [row('Arcana', ['class'])],
        savingThrows: [],
        armor: [row('Light Armor', ['manual'])],
        weapons: [],
        tools: [],
        languages: [],
        pendingChoices: [],
      },
      abilityBonusRows: [],
      featRows: [],
      featureRows: [row('Rage', ['class'])],
      spellRows: [row('Magic Missile', ['subclass'])],
      equipmentRows: [],
    })

    expect(result.map((r) => r.itemName)).toEqual(['Light Armor'])
  })
})
