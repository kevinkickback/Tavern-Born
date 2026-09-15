import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createCorpusCapabilityReport } from '@/lib/5etools/capabilityReport'
import {
  createClassChoiceCoverageMatrix,
  findClassChoiceCoverageGaps,
  getPrimaryClassSourceForEdition,
} from '@/lib/5etools/classChoiceCoverage'
import {
  parseBackgrounds,
  parseClasses,
  parseFeats,
  parseItems,
  parseOptionalFeatures,
  parseRaces,
} from '@/lib/5etools/parsers'
import { CORE_RULES_METADATA } from '@/lib/5etools/rulesetMetadata'
import type { Background5e, Class5e, ClassFeature, Feat5e, Item5e, Race5e } from '@/types/5etools'
import { makeGameDataFixture } from '../fixtures/gameDataFixtures'

const DATA_ROOT = resolve(process.cwd(), 'data')

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function collection(payload: unknown, field: string): unknown[] {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return []
  const value = (payload as Record<string, unknown>)[field]
  return Array.isArray(value) ? value : []
}

describe.runIf(existsSync(DATA_ROOT))('configured 5etools corpus capabilities', () => {
  it('reports parsed capabilities and every observable gap', () => {
    const classIndex = readJson(resolve(DATA_ROOT, 'class', 'index.json')) as Record<string, string>
    const classPayloads = Object.values(classIndex).map((fileName) =>
      readJson(resolve(DATA_ROOT, 'class', fileName)),
    )
    const classes = classPayloads.flatMap((payload) => parseClasses(payload)) as Class5e[]
    const classFeatures = classPayloads.flatMap((payload) =>
      collection(payload, 'classFeature'),
    ) as ClassFeature[]
    const races = parseRaces(readJson(resolve(DATA_ROOT, 'races.json'))) as Race5e[]
    const backgrounds = parseBackgrounds(
      readJson(resolve(DATA_ROOT, 'backgrounds.json')),
    ) as Background5e[]
    const feats = parseFeats(readJson(resolve(DATA_ROOT, 'feats.json'))) as Feat5e[]
    const items = parseItems(readJson(resolve(DATA_ROOT, 'items.json'))) as Item5e[]
    const itemsBase = parseItems(readJson(resolve(DATA_ROOT, 'items-base.json'))) as Item5e[]
    const optionalfeatures = parseOptionalFeatures(
      readJson(resolve(DATA_ROOT, 'optionalfeatures.json')),
    )

    const report = createCorpusCapabilityReport(
      makeGameDataFixture({
        classes,
        classFeatures,
        races,
        backgrounds,
        feats,
        items,
        itemsBase,
        optionalfeatures,
      }),
    )
    const primaryEditionSource = getPrimaryClassSourceForEdition(classes, 'one')
    const primaryEditionClasses = classes.filter(
      (classData) => classData.source === primaryEditionSource,
    )
    const maximumLevel = CORE_RULES_METADATA['2024'].maxCharacterLevel
    const choiceCoverage = createClassChoiceCoverageMatrix(primaryEditionClasses, maximumLevel)
    const choiceCoverageGaps = findClassChoiceCoverageGaps(
      primaryEditionClasses,
      choiceCoverage,
      maximumLevel,
    )
    const issuesByCode = Object.fromEntries(
      Array.from(
        report.issues.reduce((counts, issue) => {
          counts.set(issue.code, (counts.get(issue.code) ?? 0) + 1)
          return counts
        }, new Map<string, number>()),
      ).sort(([left], [right]) => left.localeCompare(right)),
    )

    console.info(
      '[corpus-capabilities]',
      JSON.stringify(
        {
          entities: report.entities,
          classChoices: report.classChoices,
          primaryEditionChoiceCoverage: {
            source: primaryEditionSource,
            classes: choiceCoverage.length,
            levelsPerClass: maximumLevel,
            gaps: choiceCoverageGaps,
          },
          movement: report.movement,
          fieldCount: report.fields.length,
          issuesByCode,
          choiceGaps: report.issues
            .filter((issue) => issue.code === 'choice-diagnostic')
            .map(({ entity, message }) => ({ entity, message })),
          unresolvedReferenceSamples: report.issues
            .filter((issue) => issue.code === 'unresolved-reference')
            .slice(0, 20)
            .map(({ entity, path, message }) => ({ entity, path, message })),
        },
        null,
        2,
      ),
    )

    expect(report.entities.classes).toBeGreaterThan(0)
    expect(report.entities.races).toBeGreaterThan(0)
    expect(report.fields.length).toBeGreaterThan(0)
    expect(report.issues.filter((issue) => issue.code === 'unresolved-reference')).toEqual([])
    expect(primaryEditionClasses.length).toBeGreaterThan(0)
    expect(choiceCoverage.every((row) => row.levels.length === maximumLevel)).toBe(true)
    expect(choiceCoverageGaps).toEqual([])
    expect(
      report.movement.absent +
        report.movement.numeric +
        report.movement.structured +
        report.movement.unsupported,
    ).toBe(report.entities.races)
  })
})
