import { readFileSync } from 'node:fs'
import { composeGameDataLayers } from '@/lib/5etools/contentLayers'
import { retainRawItems } from '@/lib/5etools/itemEntries'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { parseClassDocument } from '@/lib/5etools/parsers/classes'
import { buildClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import type { Class5e, ClassFeature, Item5e } from '@/types/5etools'
import { makeCharacterFixture } from './characterFixtures'
import { makeGameDataFixture } from './gameDataFixtures'

export interface FixedSourceDocument extends Record<string, unknown> {
  class: Record<string, unknown>[]
  subclass: Record<string, unknown>[]
  classFeature: Record<string, unknown>[]
  subclassFeature: Record<string, unknown>[]
  item: Item5e[]
  baseitem: Item5e[]
}
export const fixedSources: FixedSourceDocument = JSON.parse(
  readFileSync('tests/fixtures/fixedProficiencySources.json', 'utf8'),
)
export function makeFixedSourceLayer(
  change?: (document: FixedSourceDocument) => void,
  origin = 'fixture:fixed-sources',
) {
  const document = structuredClone(fixedSources)
  change?.(document)
  const parsed = parseClassDocument(document, origin)
  const data = makeGameDataFixture({
    classes: parsed.classes as Class5e[],
    classFeatures: parsed.classFeatures as ClassFeature[],
    items: document.item,
    itemsBase: document.baseitem,
  })
  retainRawItems(data)
  return data
}
export function makeFixedSourceData(change?: (document: FixedSourceDocument) => void) {
  const data = composeGameDataLayers([makeFixedSourceLayer(change)])
  return { data, catalogs: buildClassChoiceFeatureCatalogs(data) }
}

export function makeFixedCharacterFixture(name = 'Rogue', source = 'PHB') {
  const { data } = makeFixedSourceData()
  data.skills = JSON.parse(readFileSync('resources/srd/core/data/skills.json', 'utf8')).skill
  data.lookups = buildGameDataLookups(data)
  const character = makeCharacterFixture({
    race: '',
    raceSource: '',
    background: '',
    backgroundSource: '',
    originSystem: source === 'XPHB' ? '2024' : '2014',
    allowedSources: ['PHB', 'XPHB', 'XGE', 'SCAG', 'TCE', 'OGA'],
    classProgression: [
      {
        name,
        source,
        levels: name === 'Fighter' ? 7 : name === 'Artificer' ? 6 : 3,
        ...(name === 'Rogue'
          ? { subclass: 'Scout', subclassSource: 'XGE' }
          : name === 'Fighter'
            ? { subclass: 'Purple Dragon Knight (Banneret)', subclassSource: 'SCAG' }
            : {}),
      },
    ],
  })
  return { data, character, catalogs: buildClassChoiceFeatureCatalogs(data) }
}
