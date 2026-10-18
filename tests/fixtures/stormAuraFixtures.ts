import { readFileSync } from 'node:fs'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { parseClassDocument } from '@/lib/5etools/parsers/classes'
import {
  buildClassChoiceFeatureCatalogs,
  type ClassChoiceCatalogs,
} from '@/lib/character/classChoiceOptions'
import { applyClassChoiceSelectionWithGrantsCommand } from '@/lib/character/commands/classChoiceCommands'
import type { Class5e, ClassFeature, SubclassFeature } from '@/types/5etools'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from './characterFixtures'
import { makeGameDataFixture } from './gameDataFixtures'

export interface StormDocument {
  class: unknown[]
  classFeature: unknown[]
  subclass: Record<string, unknown>[]
  subclassFeature: SubclassFeature[]
}
// Controlled source-shaped examples, not a distributed XGE rules pack.
function makeStormDocument(): StormDocument {
  const document = JSON.parse(
    readFileSync('resources/srd/core/data/class/class-barbarian.json', 'utf8'),
  ) as StormDocument
  const uid = (name: string, level: number) => `${name}|Barbarian|PHB|Storm Herald|XGE|${level}|XGE`
  const ref = (name: string, level: number) => ({
    type: 'refSubclassFeature',
    subclassFeature: uid(name, level),
  })
  const group = (level: number) => ({
    type: 'options',
    entries: ['Desert', 'Sea', 'Tundra'].map((name) => ref(name, level)),
  })
  const feature = (name: string, level: number, entries: unknown[]): SubclassFeature => ({
    name,
    level,
    className: 'Barbarian',
    classSource: 'PHB',
    subclassShortName: 'Storm Herald',
    subclassSource: 'XGE',
    source: 'XGE',
    entries,
  })
  document.subclass.push(
    {
      name: 'Path of the Storm Herald',
      shortName: 'Storm Herald',
      source: 'XGE',
      className: 'Barbarian',
      classSource: 'PHB',
      subclassFeatures: [
        uid('Path of the Storm Herald', 3),
        uid('Storm Soul', 6),
        uid('Shielding Storm', 10),
        uid('Raging Storm', 14),
      ],
    },
    {
      name: 'Path of the Storm Herald',
      shortName: 'Storm Herald',
      source: 'XGE',
      className: 'Barbarian',
      classSource: 'XPHB',
      _copy: {
        name: 'Path of the Storm Herald',
        source: 'XGE',
        shortName: 'Storm Herald',
        className: 'Barbarian',
        classSource: 'PHB',
        _preserve: { page: true, hasFluff: true },
      },
    },
  )
  document.subclassFeature.push(
    feature('Path of the Storm Herald', 3, [ref('Storm Aura', 3)]),
    feature('Storm Aura', 3, [
      'While you rage, the aura extends 10 feet except through total cover. Activate on entering rage or with a bonus action. Choose desert, sea, or tundra. You can change your environment choice whenever you gain a level in this class. Save DC is 8 + your proficiency bonus + your Constitution modifier.',
      group(3),
    ]),
    feature('Desert', 3, ['When this effect is activated, nearby creatures take fire damage.']),
    feature('Sea', 3, [
      'When this effect is activated, one creature makes a Dexterity saving throw against lightning damage.',
    ]),
    feature('Tundra', 3, [
      'When this effect is activated, chosen creatures gain temporary hit points.',
    ]),
    feature('Storm Soul', 6, [
      "Benefits work even when your aura isn't active, using the environment you chose for your Storm Aura.",
      group(6),
    ]),
    feature('Desert', 6, [
      'You gain resistance to fire damage and protection from extreme heat. As an action, ignite an eligible flammable object.',
    ]),
    feature('Sea', 6, [
      'You gain resistance to lightning damage, can breathe underwater, and gain a swimming speed of 30 feet.',
    ]),
    feature('Tundra', 6, [
      'You gain resistance to cold damage and protection from extreme cold. As an action, touch water to freeze an eligible cube.',
    ]),
    feature('Shielding Storm', 10, [
      'Share the resistance you gained from the Storm Soul feature with chosen creatures while the creature is in your Storm Aura.',
    ]),
    feature('Raging Storm', 14, ['Uses the environment you chose for your Storm Aura.', group(14)]),
    feature('Desert', 14, [
      'After a creature in your aura hits you with an attack, use your reaction for a Dexterity saving throw against fire damage equal to half your barbarian level.',
    ]),
    feature('Sea', 14, [
      'When you hit a creature in your aura with an attack, use your reaction for a Strength saving throw against being knocked prone.',
    ]),
    feature('Tundra', 14, [
      'Whenever the effect of your Storm Aura is activated, one creature makes a Strength saving throw or its speed is reduced to 0 until the start of your next turn.',
    ]),
  )
  return document
}
export function makeStormAuraFixture(
  level = 3,
  source = 'PHB',
  change?: (document: StormDocument) => void,
) {
  const document = makeStormDocument()
  change?.(document)
  const parsed = parseClassDocument(document)
  const data = makeGameDataFixture({
    classes: parsed.classes as Class5e[],
    classFeatures: parsed.classFeatures as ClassFeature[],
  })
  data.lookups = buildGameDataLookups(data)
  const classData = data.classes.find((row) => row.source === source)!
  const subclass = classData.subclasses!.find((row) => row.shortName === 'Storm Herald')!
  const choice = subclass.normalizedRules!.choices.find((row) => row.label === 'Storm Aura')
  const character = makeCharacterFixture({
    originSystem: source === 'PHB' ? '2014' : '2024',
    allowedSources: ['PHB', 'XPHB', 'XGE'],
    classProgression: [
      { name: 'Barbarian', source, subclass: subclass.name, subclassSource: 'XGE', levels: level },
    ],
    features: [
      {
        id: 'manual:independent',
        name: 'Independent',
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
  return { document, data, classData, subclass, choice, character, catalogs }
}
export function selectStormAura(fixture: ReturnType<typeof makeStormAuraFixture>, name = 'Sea') {
  const result = applyClassChoiceSelectionWithGrantsCommand(
    fixture.character,
    fixture.character.provenance!,
    fixture.choice!,
    [fixture.choice!.options.find((row) => row.name === name)!],
  )
  return characterPersistenceSchema.parse({
    ...fixture.character,
    ...result.characterPatch,
    provenance: result.provenanceUpdate,
  })
}
