import { readFileSync } from 'node:fs'
import { composeGameDataLayers } from '@/lib/5etools/contentLayers'
import type { OptionalDeclarationOwner } from '@/lib/5etools/optionalClassDeclarationStructure'
import { parseClassDocument } from '@/lib/5etools/parsers/classes'
import {
  buildClassChoiceFeatureCatalogs,
  scopeClassChoiceFeatureCatalogs,
} from '@/lib/character/classChoiceFeatureCatalogs'
import { getFeatureOwnerKey } from '@/lib/character/classChoiceIdentity'
import type { Class5e, ClassFeature } from '@/types/5etools'
import { makeGameDataFixture } from './gameDataFixtures'

export interface OptionalDeclarationDocument extends Record<string, unknown> {
  class: Record<string, unknown>[]
  subclass: Record<string, unknown>[]
  classFeature: Record<string, unknown>[]
  subclassFeature: Record<string, unknown>[]
}
export const optionalDeclarationSources: {
  documents: Array<{ file: string; data: OptionalDeclarationDocument }>
  optionalfeatures?: unknown[]
} = JSON.parse(readFileSync('tests/fixtures/optionalClassDeclarationSources.json', 'utf8'))
export function makeOptionalDeclarationLayer(
  file: string,
  change?: (document: OptionalDeclarationDocument) => void,
  origin = 'fixture:' + file,
) {
  const document = structuredClone(
    optionalDeclarationSources.documents.find((row) => row.file === file)!.data,
  )
  change?.(document)
  const parsed = parseClassDocument(document, origin)
  return makeGameDataFixture({
    classes: parsed.classes as Class5e[],
    classFeatures: parsed.classFeatures as ClassFeature[],
    optionalClassFeatureSources: parsed.optionalClassFeatureSources,
    optionalfeatures: optionalDeclarationSources.optionalfeatures ?? [],
  })
}
export function makeOptionalDeclarationCatalog(
  file: string,
  owner: OptionalDeclarationOwner,
  change?: (document: OptionalDeclarationDocument) => void,
) {
  const data = composeGameDataLayers([makeOptionalDeclarationLayer(file, change)])
  const catalogs = buildClassChoiceFeatureCatalogs(data)
  return {
    data,
    catalogs: scopeClassChoiceFeatureCatalogs(
      catalogs,
      owner[0] === 'subclass'
        ? getFeatureOwnerKey(...(owner.slice(1) as [string, string, string, string]))
        : undefined,
    ),
  }
}
