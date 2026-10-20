import { readFileSync } from 'node:fs'
import { composeGameDataLayers } from '@/lib/5etools/contentLayers'
import { parseClassDocument } from '@/lib/5etools/parsers/classes'
import { buildClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import type { Class5e, ClassFeature } from '@/types/5etools'
import { makeGameDataFixture } from './gameDataFixtures'

export interface OptionalClassSourceDocument extends Record<string, unknown> {
  class: Record<string, unknown>[]
  classFeature: Record<string, unknown>[]
  subclass: Record<string, unknown>[]
  subclassFeature: Record<string, unknown>[]
  variantrule: Record<string, unknown>[]
}
// Ranger bodies are actual complete source; other families intentionally prove identity classification only.
export const optionalClassSources: OptionalClassSourceDocument = JSON.parse(
  readFileSync('tests/fixtures/optionalClassFeatureSources.json', 'utf8'),
)
export function makeOptionalClassSourceLayer(
  change?: (document: OptionalClassSourceDocument) => void,
  origin = 'fixture:optional-class',
) {
  const document = structuredClone(optionalClassSources)
  change?.(document)
  const parsed = parseClassDocument(document, origin)
  return makeGameDataFixture({
    classes: parsed.classes as Class5e[],
    classFeatures: parsed.classFeatures as ClassFeature[],
    optionalClassFeatureSources: parsed.optionalClassFeatureSources,
  })
}
export function makeOptionalClassSourceData(
  change?: (document: OptionalClassSourceDocument) => void,
) {
  const data = composeGameDataLayers([makeOptionalClassSourceLayer(change)])
  return { data, catalogs: buildClassChoiceFeatureCatalogs(data) }
}
