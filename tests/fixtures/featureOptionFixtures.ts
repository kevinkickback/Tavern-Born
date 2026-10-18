import { readFileSync } from 'node:fs'
import {
  decodeSubclassFeatureReference,
  getSubclassFeatureIdentity,
} from '@/lib/5etools/classFeatureIdentity'
import { DRAGON_ANCESTOR_REF } from '@/lib/5etools/featureTableOptions'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { parseClasses, parseClassFeatures } from '@/lib/5etools/parsers/classes'
import {
  buildClassChoiceFeatureCatalogs,
  type ClassChoiceCatalogs,
} from '@/lib/character/classChoiceOptions'
import { applyClassChoiceSelectionWithGrantsCommand } from '@/lib/character/commands/classChoiceCommands'
import type { Class5e, ClassFeature, SubclassFeature } from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from './characterFixtures'
import { makeGameDataFixture } from './gameDataFixtures'

export interface FeatureOptionDocument {
  class: unknown[]
  classFeature: ClassFeature[]
  subclass: unknown[]
  subclassFeature: SubclassFeature[]
}

export function makeFeatureOptionFixture(
  level = 1,
  change?: (document: FeatureOptionDocument) => void,
) {
  const document = JSON.parse(
    readFileSync('resources/srd/core/data/class/class-sorcerer.json', 'utf8'),
  ) as FeatureOptionDocument
  change?.(document)
  const data = makeGameDataFixture({
    classes: parseClasses(document) as Class5e[],
    classFeatures: parseClassFeatures(document) as ClassFeature[],
  })
  data.lookups = buildGameDataLookups(data)
  const classData = data.classes.find((row) => row.source === 'PHB')!
  const subclass = classData.subclasses!.find(
    (row) => row.shortName === 'Draconic' && row.source === 'PHB',
  )!
  const choice = subclass.normalizedRules!.choices.find((row) => row.kind === 'feature-option')
  const character = makeCharacterFixture({
    name: 'Source-backed ancestry',
    originSystem: '2014',
    allowedSources: ['PHB'],
    classProgression: [
      {
        name: 'Sorcerer',
        source: 'PHB',
        subclass: 'Draconic Bloodline',
        subclassSource: 'PHB',
        levels: level,
      },
    ],
    features: [
      {
        id: 'manual:independent',
        name: 'Independent feature',
        source: 'PHB',
        description: 'Keep this feature.',
      },
    ],
  })
  const catalogs: ClassChoiceCatalogs = {
    ...buildClassChoiceFeatureCatalogs(data),
    creatures: [],
    feats: [],
    items: [],
    itemsBase: [],
    itemMasteries: [],
    optionalFeatures: [],
    itemPropertyByAbbr: {},
    itemTypeByAbbr: {},
    weaponProficiencies: [],
  }
  return { data, classData, subclass, choice, character, catalogs }
}

export function selectFeatureOption(
  fixture: ReturnType<typeof makeFeatureOptionFixture>,
  name = 'Red',
): Character {
  if (!fixture.choice) throw new Error('The source fixture has no supported ancestry choice.')
  const option = fixture.choice.options.find((row) => row.name === name)
  if (!option) throw new Error('Unknown source fixture row.')
  const result = applyClassChoiceSelectionWithGrantsCommand(
    fixture.character,
    fixture.character.provenance!,
    fixture.choice,
    [option],
  )
  return characterPersistenceSchema.parse({
    ...fixture.character,
    ...result.characterPatch,
    provenance: result.provenanceUpdate,
  })
}

export function pruneFeatureOptionDeclaration(document: FeatureOptionDocument): void {
  const target = getSubclassFeatureIdentity(decodeSubclassFeatureReference(DRAGON_ANCESTOR_REF))
  const rewrite = (value: unknown): unknown => {
    if (Array.isArray(value))
      return value.flatMap((entry) => {
        if (entry && typeof entry === 'object') {
          const record = entry as Record<string, unknown>
          if (
            record.type === 'refSubclassFeature' &&
            typeof record.subclassFeature === 'string' &&
            getSubclassFeatureIdentity(decodeSubclassFeatureReference(record.subclassFeature)) ===
              target
          )
            return []
        }
        return [rewrite(entry)]
      })
    if (!value || typeof value !== 'object') return value
    const record = value as Record<string, unknown>
    return Object.fromEntries(Object.entries(record).map(([key, nested]) => [key, rewrite(nested)]))
  }
  document.subclassFeature = document.subclassFeature
    .filter((feature) => getSubclassFeatureIdentity(feature) !== target)
    .map((feature) => ({ ...feature, entries: rewrite(feature.entries) as unknown[] }))
}
