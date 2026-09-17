import type { Class5e } from '@/types/5etools'
import type { ClassChoiceDiagnostic, NormalizedCharacterChoice } from '@/types/classRules'

interface ClassChoiceCoverageCell {
  level: number
  requiredSelections: number
  choices: Array<{
    id: string
    kind: NormalizedCharacterChoice['kind']
    requiredSelections: number
  }>
  diagnostics: ClassChoiceDiagnostic[]
}

export interface ClassChoiceCoverageRow {
  owner: { name: string; source: string }
  levels: ClassChoiceCoverageCell[]
}

export interface ClassChoiceCoverageGap {
  owner: { name: string; source: string }
  level?: number
  message: string
}

export type SrdClassMarker = 'srd' | 'srd52'

function requiredAtLevel(choice: NormalizedCharacterChoice, level: number): number {
  const value = choice.selectionCountByLevel[level - 1]
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0
}

/** Builds a source-qualified choice matrix without embedding any rules-content inventory. */
export function createClassChoiceCoverageMatrix(
  classes: readonly Class5e[],
  maximumLevel: number,
): ClassChoiceCoverageRow[] {
  const levelCount = Math.max(0, Math.trunc(maximumLevel))
  return classes
    .map((classData): ClassChoiceCoverageRow => {
      const rules = classData.normalizedRules
      return {
        owner: { name: classData.name, source: classData.source },
        levels: Array.from({ length: levelCount }, (_, index) => {
          const level = index + 1
          const choices = (rules?.choices ?? []).flatMap((choice) => {
            const requiredSelections = requiredAtLevel(choice, level)
            return requiredSelections > 0
              ? [{ id: choice.id, kind: choice.kind, requiredSelections }]
              : []
          })
          const diagnostics = (rules?.choiceDiagnostics ?? []).filter(
            (diagnostic) => diagnostic.level === level,
          )
          return {
            level,
            requiredSelections: choices.reduce(
              (total, choice) => total + choice.requiredSelections,
              0,
            ),
            choices,
            diagnostics,
          }
        }),
      }
    })
    .sort(
      (left, right) =>
        left.owner.name.localeCompare(right.owner.name) ||
        left.owner.source.localeCompare(right.owner.source),
    )
}

/** Returns structural and parser gaps that would make a matrix unsafe as a readiness contract. */
export function findClassChoiceCoverageGaps(
  classes: readonly Class5e[],
  matrix: readonly ClassChoiceCoverageRow[],
  maximumLevel: number,
): ClassChoiceCoverageGap[] {
  const gaps: ClassChoiceCoverageGap[] = []
  const rows = new Map(matrix.map((row) => [`${row.owner.name}|${row.owner.source}`, row]))
  const seenOwners = new Set<string>()
  for (const classData of classes) {
    const owner = { name: classData.name, source: classData.source }
    const ownerKey = `${owner.name}|${owner.source}`
    if (seenOwners.has(ownerKey)) {
      gaps.push({ owner, message: 'Coverage contains a duplicate source-qualified class.' })
      continue
    }
    seenOwners.add(ownerKey)
    const row = rows.get(ownerKey)
    if (!row || row.levels.length !== maximumLevel) {
      gaps.push({ owner, message: `Coverage must contain levels 1-${maximumLevel}.` })
      continue
    }
    if (!classData.normalizedRules) {
      gaps.push({ owner, message: 'Normalized class rules are unavailable.' })
      continue
    }
    for (const diagnostic of classData.normalizedRules.choiceDiagnostics) {
      gaps.push({ owner, level: diagnostic.level, message: diagnostic.message })
    }
    for (const choice of classData.normalizedRules.choices) {
      if (choice.owner.name !== owner.name || choice.owner.source !== owner.source) {
        gaps.push({ owner, level: choice.level, message: `${choice.id} has a mismatched owner.` })
      }
      if (choice.selectionCountByLevel.length !== maximumLevel) {
        gaps.push({
          owner,
          level: choice.level,
          message: `${choice.id} has ${choice.selectionCountByLevel.length} progression entries.`,
        })
      }
    }
  }
  return gaps
}

/** Selects the classes explicitly tagged by upstream as belonging to an SRD generation. */
export function getSrdClassCohort(classes: readonly Class5e[], marker: SrdClassMarker): Class5e[] {
  return classes.filter((classData) => classData[marker] === true)
}

/** Selects the most complete source cohort for an edition marker supplied by parsed data. */
export function getPrimaryClassSourceForEdition(
  classes: readonly Class5e[],
  edition: string,
): string | undefined {
  const counts = new Map<string, number>()
  for (const classData of classes) {
    if (classData.edition !== edition) continue
    counts.set(classData.source, (counts.get(classData.source) ?? 0) + 1)
  }
  return [...counts].sort(
    ([leftSource, leftCount], [rightSource, rightCount]) =>
      rightCount - leftCount || leftSource.localeCompare(rightSource),
  )[0]?.[0]
}
