import { readFileSync } from 'node:fs'
import { composeGameDataLayers } from '@/lib/5etools/contentLayers'
import { createEmptyGameData } from '@/lib/5etools/emptyGameData'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { parseItems, parseOptionalFeatures } from '@/lib/5etools/parsers/basic'
import { parseClassDocument } from '@/lib/5etools/parsers/classes'
import { buildItemLookup } from '@/lib/5etools/startingEquipment'
import { buildClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceOptions'
import { applyClassSelectionCommand, selectSubclass } from '@/lib/character/commands/classCommands'
import type { Class5e, ClassFeature, GameData, Item5e } from '@/types/5etools'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from './characterFixtures'

type RawDocument = Record<string, Array<Record<string, unknown>>>
export interface LegacySubclassSources {
  bard: RawDocument
  monk: RawDocument
  items: RawDocument
  optional: RawDocument
}
/** Configured licensed sources are read at execution; their contents are never redistributed. */
export function makeLegacySubclassData(mutate?: (raw: LegacySubclassSources) => void): GameData {
  const raw: LegacySubclassSources = {
    bard: JSON.parse(readFileSync('data/class/class-bard.json', 'utf8')),
    monk: JSON.parse(readFileSync('data/class/class-monk.json', 'utf8')),
    items: JSON.parse(readFileSync('data/items-base.json', 'utf8')),
    optional: JSON.parse(readFileSync('data/optionalfeatures.json', 'utf8')),
  }
  mutate?.(raw)
  const parsed = [parseClassDocument(raw.bard), parseClassDocument(raw.monk)]
  const data = composeGameDataLayers([
    {
      ...createEmptyGameData(),
      classes: parsed.flatMap((p) => p.classes) as Class5e[],
      classFeatures: parsed.flatMap((p) => p.classFeatures) as ClassFeature[],
      itemsBase: parseItems(raw.items) as Item5e[],
      itemProperties: raw.items.itemProperty as GameData['itemProperties'],
      itemTypes: raw.items.itemType as GameData['itemTypes'],
      optionalfeatures: parseOptionalFeatures(raw.optional),
      sources: ['PHB', 'XPHB', 'XGE'].map((abbreviation) => ({
        abbreviation,
        name: abbreviation,
        hasCharacterOptions: true,
        group: 'other' as const,
      })),
    },
  ])
  data.lookups = buildGameDataLookups(data)
  return data
}
export function makeLegacySubclassActor(
  data: GameData,
  edition: '2014' | '2024',
  family: 'Bard' | 'Monk',
  levels = 3,
) {
  const cls = data.classes.find(
    (c) => c.name === family && c.source === (edition === '2014' ? 'PHB' : 'XPHB'),
  )!
  const sub = cls.subclasses!.find(
    (s) =>
      s.name === (family === 'Bard' ? 'College of Swords' : 'Way of the Kensei') &&
      s.source === 'XGE',
  )!
  const catalogs = buildClassChoiceFeatureCatalogs(data)
  let character = makeCharacterFixture({
    name: `Legacy ${family} ${edition}`,
    originSystem: edition,
    allowedSources: ['XGE'],
    features: [],
    classProgression: [{ name: cls.name, source: cls.source, levels }],
  })
  const base = applyClassSelectionCommand(
    character,
    character.provenance,
    cls,
    undefined,
    buildItemLookup([...data.items, ...data.itemsBase]),
    { classChoiceFeatureCatalogs: catalogs },
  )
  character = { ...character, ...base.characterPatch, provenance: base.provenanceUpdate }
  const selected = selectSubclass(
    character,
    character.provenance,
    sub.name,
    sub.source,
    undefined,
    { classChoiceFeatureCatalogs: catalogs },
  )
  return characterPersistenceSchema.parse({
    ...character,
    ...selected.characterPatch,
    provenance: selected.provenanceUpdate,
  })
}
