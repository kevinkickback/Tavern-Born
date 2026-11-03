import { readFileSync } from 'node:fs'
import { composeGameDataLayers } from '@/lib/5etools/contentLayers'
import { createEmptyGameData } from '@/lib/5etools/emptyGameData'
import { parseItems } from '@/lib/5etools/parsers/basic'
import { parseClassDocument } from '@/lib/5etools/parsers/classes'
import { buildItemLookup } from '@/lib/5etools/startingEquipment'
import { applyClassSelectionCommand } from '@/lib/character/commands/classCommands'
import type { Class5e, ClassFeature, Item5e } from '@/types/5etools'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from './characterFixtures'

/** Read configured source declarations at execution; their rule text stays outside Git. */
export function makeConfiguredStartingEquipmentScenario(
  edition: '2014' | '2024',
  className?: 'Fighter' | 'Cleric' | 'Sorcerer',
) {
  const name = className ?? (edition === '2014' ? 'Fighter' : 'Cleric')
  const source = edition === '2014' ? 'PHB' : 'XPHB'
  const parsed = parseClassDocument(
    JSON.parse(readFileSync(`data/class/class-${name.toLowerCase()}.json`, 'utf8')),
  )
  const data = composeGameDataLayers([
    {
      ...createEmptyGameData(),
      classes: parsed.classes as Class5e[],
      classFeatures: parsed.classFeatures as ClassFeature[],
      classCastingSources: parsed.classCastingSources,
      items: parseItems(JSON.parse(readFileSync('data/items.json', 'utf8'))) as Item5e[],
      itemsBase: parseItems(JSON.parse(readFileSync('data/items-base.json', 'utf8'))) as Item5e[],
      sources: ['PHB', 'XPHB'].map((abbreviation) => ({
        abbreviation,
        name: abbreviation,
        hasCharacterOptions: true,
        group: 'other' as const,
      })),
    },
  ])
  const cls = data.classes.find((row) => row.name === name && row.source === source)!
  const character = makeCharacterFixture({
    id: `configured-starting-${edition}`,
    name: `Starting ${name} ${edition}`,
    originSystem: edition,
    allowedSources: [source],
    classProgression: [],
    initialClass: undefined,
    race: '',
    raceSource: undefined,
    background: '',
    backgroundSource: undefined,
  })
  const result = applyClassSelectionCommand(
    character,
    character.provenance,
    cls,
    undefined,
    buildItemLookup([...data.items, ...data.itemsBase]),
  )
  return {
    data,
    character: characterPersistenceSchema.parse({
      ...character,
      ...result.characterPatch,
      provenance: result.provenanceUpdate,
    }),
  }
}
