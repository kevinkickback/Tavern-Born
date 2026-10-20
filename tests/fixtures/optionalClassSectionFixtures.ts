import { readFileSync } from 'node:fs'
import { parseOptionalClassSections } from '@/lib/5etools/optionalClassSectionSource'
import { parseClassDocument } from '@/lib/5etools/parsers/classes'
import { buildClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import type { Class5e, ClassFeature } from '@/types/5etools'
import { makeGameDataFixture } from './gameDataFixtures'

export function makeOptionalClassSectionData(change?: (source: Record<string, any>) => void) {
  const source = JSON.parse(readFileSync('tests/fixtures/optionalClassSectionSources.json', 'utf8'))
  change?.(source)
  const parsed = parseClassDocument(source, 'fixture:optional-book')
  const data = makeGameDataFixture({
    classes: parsed.classes as Class5e[],
    classFeatures: parsed.classFeatures as ClassFeature[],
    optionalClassFeatureSources: parsed.optionalClassFeatureSources,
    optionalClassSections: parseOptionalClassSections(
      source.book,
      source.books,
      'fixture:optional-book',
    ),
    optionalfeatures: source.optionalfeature,
  })
  return { data, catalogs: buildClassChoiceFeatureCatalogs(data) }
}
