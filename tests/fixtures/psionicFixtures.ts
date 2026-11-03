import { readFileSync } from 'node:fs'
import { createEmptyGameData } from '@/lib/5etools/emptyGameData'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { parseClassDocument } from '@/lib/5etools/parsers/classes'
import { parsePsionics } from '@/lib/5etools/parsers/psionics'
import type { Class5e, ClassFeature, GameData } from '@/types/5etools'
import { makeCharacterFixture } from './characterFixtures'

/** Read the configured catalog at test time; external psionic content is never redistributed. */
export function makePsionicFixture(
  originSystem: '2014' | '2024' = '2014',
  levels = 1,
  order = 'Avatar',
) {
  const parsed = parseClassDocument(
    JSON.parse(readFileSync('data/class/class-mystic.json', 'utf8')),
  )
  const data: GameData = {
    ...createEmptyGameData(),
    classes: parsed.classes as Class5e[],
    classFeatures: parsed.classFeatures as ClassFeature[],
    psionics: parsePsionics(JSON.parse(readFileSync('data/psionics.json', 'utf8'))),
    sources: [
      {
        abbreviation: 'UATheMysticClass',
        name: 'The Mystic Class',
        group: 'other',
        hasCharacterOptions: true,
      },
    ],
  }
  data.lookups = buildGameDataLookups(data)
  const character = makeCharacterFixture({
    name: `Mystic setup ${originSystem}`,
    originSystem,
    allowedSources: ['UATheMysticClass'],
    classProgression: [
      {
        name: 'Mystic',
        source: 'UATheMysticClass',
        levels,
        subclass: `Order of the ${order}`,
        subclassSource: 'UATheMysticClass',
      },
    ],
    features: [],
  })
  return { data, character }
}
