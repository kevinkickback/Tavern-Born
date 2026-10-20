import { readFileSync } from 'node:fs'
import { getProficiencyOption } from '@/lib/5etools/classProficiencyIdentity'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { parseClassDocument } from '@/lib/5etools/parsers/classes'
import {
  buildClassChoiceFeatureCatalogs,
  createClassChoiceCatalogs,
  getCharacterClassChoices,
} from '@/lib/character/classChoiceOptions'
import { applyClassChoiceSelectionWithGrantsCommand } from '@/lib/character/commands/classChoiceCommands'
import { createOptionalClassFeatureActivity } from '@/lib/character/optionalClassFeatureActivity'
import type { Class5e, ClassFeature } from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import type { NormalizedCharacterChoice, NormalizedChoiceOptionReference } from '@/types/classRules'
import { makeCharacterFixture } from './characterFixtures'
import { makeGameDataFixture } from './gameDataFixtures'

export const proficiencySources = JSON.parse(
  readFileSync('tests/fixtures/classProficiencySources.json', 'utf8'),
) as ClassFeature[]
export function makeClassProficiencyFixture(
  name = 'Rogue',
  source = 'PHB',
  level = 6,
  change?: (features: ClassFeature[]) => void,
) {
  const features = structuredClone(proficiencySources)
  change?.(features)
  const owners = new Map<string, Record<string, unknown>>()
  for (const feature of features) {
    const key = `${feature.className}|${feature.classSource}`
    if (!owners.has(key))
      owners.set(key, { name: feature.className, source: feature.classSource, classFeatures: [] })
    ;(owners.get(key)!.classFeatures as string[]).push(
      `${feature.name}|${feature.className}|${feature.classSource}|${feature.level}|${feature.source}`,
    )
  }
  const parsed = parseClassDocument({ class: [...owners.values()], classFeature: features })
  const data = makeGameDataFixture({
    classes: parsed.classes as Class5e[],
    classFeatures: parsed.classFeatures as ClassFeature[],
    skills: JSON.parse(readFileSync('resources/srd/core/data/skills.json', 'utf8')).skill,
    languages: JSON.parse(readFileSync('resources/srd/core/data/languages.json', 'utf8')).language,
  })
  data.lookups = buildGameDataLookups(data)
  const cls = data.classes.find((row) => row.name === name && row.source === source)!
  const catalogs = createClassChoiceCatalogs(buildClassChoiceFeatureCatalogs(data))
  const character = makeCharacterFixture({
    race: '',
    raceSource: '',
    originSystem: source === 'XPHB' ? '2024' : '2014',
    allowedSources: ['PHB', 'XPHB', 'TCE'],
    classProgression: [{ name, source, levels: level }],
    proficiencies: {
      armor: [],
      weapons: [],
      tools: ["thieves' tools"],
      skills: [
        'arcana',
        'history',
        'investigation',
        'nature',
        'perception',
        'stealth',
        'survival',
        'religion',
      ],
      expertise: [],
      languages: ['Common'],
      savingThrows: [],
    },
  })
  return {
    data,
    cls,
    catalogs,
    character,
    choices: getCharacterClassChoices(
      cls,
      undefined,
      createOptionalClassFeatureActivity(character, catalogs),
      catalogs,
    ).filter((row) => row.kind === 'proficiency'),
  }
}
export function applyProficiency(
  f: ReturnType<typeof makeClassProficiencyFixture>,
  choice: NormalizedCharacterChoice,
  options: readonly NormalizedChoiceOptionReference[],
  character: Character = f.character,
) {
  const result = applyClassChoiceSelectionWithGrantsCommand(
    character,
    character.provenance!,
    choice,
    options,
    { classes: f.data.classes, catalogs: f.catalogs },
  )
  return characterPersistenceSchema.parse({
    ...character,
    ...result.characterPatch,
    provenance: result.provenanceUpdate,
  })
}
export const expertiseOption = (name: string) => getProficiencyOption('expertise', name)
