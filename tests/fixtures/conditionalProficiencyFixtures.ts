import { readFileSync } from 'node:fs'
import { composeGameDataLayers } from '@/lib/5etools/contentLayers'
import { parseOptionalFeatures } from '@/lib/5etools/parsers/basic'
import { parseClassDocument } from '@/lib/5etools/parsers/classes'
import { buildClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import {
  createClassChoiceCatalogs,
  getCharacterClassChoices,
  resolveClassChoiceOptions,
} from '@/lib/character/classChoiceOptions'
import { applyClassChoiceSelectionWithGrantsCommand } from '@/lib/character/commands/classChoiceCommands'
import { createOptionalClassFeatureActivity } from '@/lib/character/optionalClassFeatureActivity'
import type { Class5e, ClassFeature } from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from './characterFixtures'
import { makeGameDataFixture } from './gameDataFixtures'

export interface ConditionalSourceDocument extends Record<string, unknown> {
  class: Record<string, unknown>[]
  subclass: Record<string, unknown>[]
  classFeature: Record<string, unknown>[]
  subclassFeature: Record<string, unknown>[]
  optionalfeature: Record<string, unknown>[]
}
export const conditionalSources: ConditionalSourceDocument = JSON.parse(
  readFileSync('tests/fixtures/conditionalProficiencySources.json', 'utf8'),
)
export function makeConditionalSourceLayer(
  change?: (document: ConditionalSourceDocument) => void,
  origin = 'fixture:conditional-sources',
) {
  const document = structuredClone(conditionalSources)
  change?.(document)
  const parsed = parseClassDocument(document, origin)
  return makeGameDataFixture({
    classes: parsed.classes as Class5e[],
    classFeatures: parsed.classFeatures as ClassFeature[],
    optionalfeatures: parseOptionalFeatures(document, origin),
    skills: JSON.parse(readFileSync('resources/srd/core/data/skills.json', 'utf8')).skill,
  })
}
export function makeConditionalSourceData(change?: (document: ConditionalSourceDocument) => void) {
  const data = composeGameDataLayers([makeConditionalSourceLayer(change)])
  return { data, catalogs: buildClassChoiceFeatureCatalogs(data) }
}

export function makeConditionalCharacterFixture(name = 'Fighter', source = 'PHB', levels = 3) {
  const { data, catalogs } = makeConditionalSourceData()
  const cls = data.classes.find((row) => row.name === name && row.source === source)!
  const sub = cls.subclasses?.find(
    (row) => row.name === (name === 'Fighter' ? 'Rune Knight' : 'Draconic Bloodline'),
  )
  const character = makeCharacterFixture({
    race: '',
    raceSource: '',
    background: '',
    backgroundSource: '',
    allowedSources: ['PHB', 'XPHB', 'TCE'],
    originSystem: source === 'XPHB' ? '2024' : '2014',
    classProgression: [
      { name, source, levels, ...(sub ? { subclass: sub.name, subclassSource: sub.source } : {}) },
    ],
  })
  const choices = getCharacterClassChoices(
    cls,
    sub,
    createOptionalClassFeatureActivity(character, catalogs),
    catalogs,
  )
  const choice = choices.find(
    (row) => row.source.kind === 'optional-feature-progression' && row.label === 'Runes',
  )
  const options = choice
    ? resolveClassChoiceOptions(choice, createClassChoiceCatalogs(catalogs), [], levels)
    : []
  const select = (names: string[], before: Character = character) => {
    const result = applyClassChoiceSelectionWithGrantsCommand(
      before,
      before.provenance!,
      choice!,
      names.map((name) => options.find((row) => row.reference.name === name)!.reference),
      { classes: data.classes, catalogs },
    )
    return characterPersistenceSchema.parse({
      ...before,
      ...result.characterPatch,
      provenance: result.provenanceUpdate,
    }) as Character
  }
  const selectTerrain = (gain: number, name: string, before: Character = character) => {
    const terrain = choices.find((row) => row.label === 'Natural Explorer' && row.level === gain)!
    const result = applyClassChoiceSelectionWithGrantsCommand(
      before,
      before.provenance!,
      terrain,
      [terrain.options.find((row) => row.name === name)!],
      { classes: data.classes, catalogs },
    )
    return characterPersistenceSchema.parse({
      ...before,
      ...result.characterPatch,
      provenance: result.provenanceUpdate,
    }) as Character
  }
  return {
    data,
    catalogs,
    character,
    cls,
    sub,
    choices,
    choice,
    options,
    select,
    selectTerrain,
    input: {
      ...data.lookups!,
      classChoiceClasses: data.classes,
      classChoiceFeatureCatalogs: catalogs,
    },
  }
}
