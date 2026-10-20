import { readFileSync } from 'node:fs'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { parseClassDocument } from '@/lib/5etools/parsers/classes'
import {
  buildClassChoiceFeatureCatalogs,
  createClassChoiceCatalogs,
} from '@/lib/character/classChoiceOptions'
import { applyClassChoiceSelectionWithGrantsCommand } from '@/lib/character/commands/classChoiceCommands'
import type { Class5e, ClassFeature } from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from './characterFixtures'
import { makeGameDataFixture } from './gameDataFixtures'
export interface RangerDocument {
  class: Record<string, unknown>[]
  classFeature: ClassFeature[]
  subclass: Record<string, unknown>[]
  subclassFeature: ClassFeature[]
}
export function makeNaturalExplorerFixture(
  level = 10,
  change?: (doc: RangerDocument) => void,
  file = 'resources/srd/core/data/class/class-ranger.json',
) {
  const document = JSON.parse(readFileSync(file, 'utf8')) as RangerDocument
  change?.(document)
  const parsed = parseClassDocument(document)
  const data = makeGameDataFixture({
    classes: parsed.classes as Class5e[],
    classFeatures: parsed.classFeatures as ClassFeature[],
    optionalClassFeatureSources: parsed.optionalClassFeatureSources,
  })
  data.lookups = buildGameDataLookups(data)
  const classData = data.classes.find((row) => row.source === 'PHB')!
  const choices = classData.normalizedRules!.choices.filter(
    (row) => row.label === 'Natural Explorer',
  )
  const catalogs = createClassChoiceCatalogs(buildClassChoiceFeatureCatalogs(data))
  const character = makeCharacterFixture({
    race: '',
    raceSource: '',
    background: '',
    backgroundSource: '',
    allowedSources: ['PHB', 'TCE'],
    classProgression: [{ name: 'Ranger', source: 'PHB', levels: level }],
    features: [
      {
        id: 'manual:independent',
        name: 'Independent',
        source: 'PHB',
        description: 'Keep this feature.',
      },
    ],
  })
  return { document, data, classData, choices, catalogs, character }
}
export function selectNaturalExplorer(
  f: ReturnType<typeof makeNaturalExplorerFixture>,
  gain = 1,
  name = 'Forest',
  character: Character = f.character,
) {
  const choice = f.choices.find((row) => row.level === gain)!
  const result = applyClassChoiceSelectionWithGrantsCommand(
    character,
    character.provenance!,
    choice,
    [choice.options.find((row) => row.name === name)!],
    { classes: f.data.classes, catalogs: f.catalogs },
  )
  return characterPersistenceSchema.parse({
    ...character,
    ...result.characterPatch,
    provenance: result.provenanceUpdate,
  })
}
