import { readFileSync } from 'node:fs'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { parseClassDocument } from '@/lib/5etools/parsers/classes'
import {
  buildClassChoiceFeatureCatalogs,
  createClassChoiceCatalogs,
  getCharacterClassChoices,
} from '@/lib/character/classChoiceOptions'
import { createOptionalClassFeatureActivity } from '@/lib/character/optionalClassFeatureActivity'
import type { Class5e, ClassFeature, Item5e } from '@/types/5etools'
import { makeCharacterFixture } from './characterFixtures'
import { makeGameDataFixture } from './gameDataFixtures'
export const knowledgeSources = JSON.parse(
  readFileSync('tests/fixtures/knowledgeProficiencySources.json', 'utf8'),
)
export function makeKnowledgeFixture(
  classSource = 'PHB',
  subclassSource = 'PHB',
  subclassName = 'Knowledge Domain',
  change?: (document: typeof knowledgeSources.document) => void,
) {
  const document = structuredClone(knowledgeSources.document)
  change?.(document)
  const parsed = parseClassDocument(document, 'fixture:class-cleric.json')
  const data = makeGameDataFixture({
    classes: parsed.classes as Class5e[],
    classFeatures: parsed.classFeatures as ClassFeature[],
    skills: JSON.parse(readFileSync('resources/srd/core/data/skills.json', 'utf8')).skill,
    languages: JSON.parse(readFileSync('resources/srd/core/data/languages.json', 'utf8')).language,
    items: knowledgeSources.items.item as Item5e[],
  })
  data.lookups = buildGameDataLookups(data)
  const cls = data.classes.find((row) => row.source === classSource)!
  const subclass = cls.subclasses?.find(
    (row) => row.name === subclassName && row.source === subclassSource,
  )
  if (!subclass) throw new Error('Knowledge source fixture has no selected subclass.')
  const catalogs = createClassChoiceCatalogs(buildClassChoiceFeatureCatalogs(data))
  const character = makeCharacterFixture({
    race: '',
    raceSource: '',
    originSystem: classSource === 'XPHB' ? '2024' : '2014',
    allowedSources: ['PHB', 'XPHB', 'PSA', 'FRHoF'],
    classProgression: [
      { name: 'Cleric', source: classSource, levels: 3, subclass: subclassName, subclassSource },
    ],
    proficiencies: {
      armor: [],
      weapons: [],
      tools: [],
      skills: [],
      expertise: [],
      languages: [],
      savingThrows: [],
    },
  })
  const choices = getCharacterClassChoices(
    cls,
    subclass,
    createOptionalClassFeatureActivity(character, catalogs),
    catalogs,
  ).filter((row) => row.kind === 'proficiency')
  return { data, cls, subclass, catalogs, character, choices }
}
