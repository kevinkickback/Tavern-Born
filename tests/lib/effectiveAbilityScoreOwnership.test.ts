import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, test } from 'vitest'

const EXPECTED_RAW_SCORE_READS = new Map<string, number>([
  ['src/hooks/character/useAbilityScores.ts', 2],
  ['src/lib/calculations/armorClass.ts', 2],
  ['src/lib/calculations/characterCalculationContext.ts', 1],
  ['src/lib/calculations/prerequisites.ts', 1],
  ['src/lib/character/commands/featCommands.ts', 2],
  ['src/lib/readiness/coreReadiness.ts', 1],
])

function findSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return findSourceFiles(path)
    return /\.tsx?$/.test(entry.name) ? [path] : []
  })
}

describe('effective ability-score ownership', () => {
  test('raw persisted scores are read only at approved boundaries', () => {
    const root = process.cwd()
    const actualReads = new Map<string, number>()

    for (const path of findSourceFiles(join(root, 'src'))) {
      const source = readFileSync(path, 'utf8')
      const count =
        source.match(/\b(?:character|activeCharacter)\??\.abilityScores\b/g)?.length ?? 0
      if (count > 0) {
        actualReads.set(relative(root, path).replace(/\\/g, '/'), count)
      }
    }

    expect(actualReads).toEqual(EXPECTED_RAW_SCORE_READS)
  })
})
