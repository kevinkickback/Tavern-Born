import { readFileSync } from 'node:fs'
import { composeGameDataLayers } from '@/lib/5etools/contentLayers'
import { parseClassDocument } from '@/lib/5etools/parsers/classes'
import type { Class5e, ClassFeature } from '@/types/5etools'
import { makeGameDataFixture } from './gameDataFixtures'
import type { OptionalDeclarationDocument } from './optionalClassDeclarationFixtures'

export const classCastingDocuments = (
  JSON.parse(readFileSync('tests/fixtures/classCastingSources.json', 'utf8')) as {
    documents: Array<{ file: string; data: OptionalDeclarationDocument }>
  }
).documents

export function makeClassCastingLayer(
  file: string,
  change?: (document: OptionalDeclarationDocument) => void,
) {
  const document = structuredClone(classCastingDocuments.find((row) => row.file === file)!.data)
  change?.(document)
  const parsed = parseClassDocument(document, 'casting-fixture:' + file)
  return makeGameDataFixture({
    classes: parsed.classes as Class5e[],
    classFeatures: parsed.classFeatures as ClassFeature[],
    optionalClassFeatureSources: parsed.optionalClassFeatureSources,
    classCastingSources: parsed.classCastingSources,
  })
}

export const makeClassCastingData = () =>
  composeGameDataLayers(classCastingDocuments.map((row) => makeClassCastingLayer(row.file)))

export function makeBundledClassCastingLayer(
  file: string,
  change?: (document: OptionalDeclarationDocument) => void,
) {
  const document = JSON.parse(
    readFileSync('resources/srd/core/data/' + file, 'utf8'),
  ) as OptionalDeclarationDocument
  change?.(document)
  const parsed = parseClassDocument(document, 'casting-bundled-fixture:' + file)
  return makeGameDataFixture({
    classes: parsed.classes as Class5e[],
    classFeatures: parsed.classFeatures as ClassFeature[],
    classCastingSources: parsed.classCastingSources,
    optionalClassFeatureSources: parsed.optionalClassFeatureSources,
  })
}

export function makeBundledClassCastingData() {
  const index = JSON.parse(
    readFileSync('resources/srd/core/data/class/index.json', 'utf8'),
  ) as Record<string, string>
  return composeGameDataLayers(
    [...new Set(Object.values(index))].map((file) => makeBundledClassCastingLayer('class/' + file)),
  )
}
