import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import {
  buildBackgroundLookup,
  buildClassLookup,
  buildFeatLookup,
  buildRaceLookup,
  buildSpellLookup,
  getEntityLookupKey,
} from '@/lib/5etools/lookups'
import {
  parseBackgrounds,
  parseClasses,
  parseFeats,
  parseItems,
  parseRaces,
  parseSpells,
} from '@/lib/5etools/parsers'
import { buildItemLookup } from '@/lib/5etools/startingEquipment'
import {
  buildCharacterSheetFieldMap,
  createCharacterSheetViewModel,
} from '@/lib/pdf/characterSheetPdf'
import { CURRENT_CHARACTER_SCHEMA_VERSION } from '@/lib/schema/characterSchemaVersion'
import { validateCharacterData } from '@/store/characterStore'
import type { Background5e, Class5e, Feat5e, Item5e, Race5e, Spell5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterSchema } from '@/types/characterSchema'

const dataRoot = join(process.cwd(), 'data')
const fixtureRoot = join(process.cwd(), 'tests', 'fixtures')
const fixturePaths = {
  '2014': join(fixtureRoot, 'pdf-kitchen-sink-2014.tbc'),
  '2024': join(fixtureRoot, 'pdf-kitchen-sink-2024.tbc'),
} as const

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function collection(payload: unknown, field: string): unknown[] {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return []
  const value = (payload as Record<string, unknown>)[field]
  return Array.isArray(value) ? value : []
}

function loadIndexedPayloads(directory: 'class' | 'spells'): unknown[] {
  const index = readJson(join(dataRoot, directory, 'index.json')) as Record<string, string>
  return Object.values(index).map((fileName) => readJson(join(dataRoot, directory, fileName)))
}

const classPayloads = loadIndexedPayloads('class')
const spellPayloads = loadIndexedPayloads('spells')
const classes = classPayloads.flatMap((payload) => parseClasses(payload)) as Class5e[]
const classFeatures = classPayloads.flatMap((payload) => [
  ...collection(payload, 'classFeature'),
  ...collection(payload, 'subclassFeature'),
]) as Array<{ name: string; source: string }>
const races = parseRaces(readJson(join(dataRoot, 'races.json'))) as Race5e[]
const backgrounds = parseBackgrounds(readJson(join(dataRoot, 'backgrounds.json'))) as Background5e[]
const feats = parseFeats(readJson(join(dataRoot, 'feats.json'))) as Feat5e[]
const items = [
  ...(parseItems(readJson(join(dataRoot, 'items.json'))) as Item5e[]),
  ...(parseItems(readJson(join(dataRoot, 'items-base.json'))) as Item5e[]),
]
const spells = spellPayloads.flatMap((payload) => parseSpells(payload)) as Spell5e[]

const lookups = {
  classesByKey: buildClassLookup(classes),
  racesByKey: buildRaceLookup(races),
  backgroundsByKey: buildBackgroundLookup(backgrounds),
  featsByKey: buildFeatLookup(feats),
  spellsByKey: buildSpellLookup(spells),
  itemLookup: buildItemLookup(items),
}
const featureKeys = new Set(
  classFeatures.map((feature) => getEntityLookupKey(feature.name, feature.source)),
)

function loadFixture(edition: keyof typeof fixturePaths): Character {
  return characterSchema.parse(readJson(fixturePaths[edition]))
}

function expectCorpusReference(
  lookup: Readonly<Record<string, unknown>> | ReadonlyMap<string, unknown>,
  name: string,
  source?: string,
) {
  const entityKey = getEntityLookupKey(name, source)
  const exists = lookup instanceof Map ? lookup.has(entityKey.toLowerCase()) : entityKey in lookup
  expect(exists, `Missing corpus reference ${entityKey}`).toBe(true)
}

describe('PDF kitchen sink character fixtures', () => {
  test.each([
    '2014',
    '2024',
  ] as const)('%s fixture is importable and every game-data reference resolves against the corpus', (edition) => {
    const rawCharacter = readJson(fixturePaths[edition])
    const character = characterSchema.parse(rawCharacter)

    expect(validateCharacterData(rawCharacter)).toBeNull()
    expect(character.schemaVersion).toBe(CURRENT_CHARACTER_SCHEMA_VERSION)
    expect(character.originSystem).toBe(edition)
    expect(character.classProgression).toHaveLength(3)
    expect(character.spells.spellProfiles).toHaveLength(4)
    expect(character.equipment).toHaveLength(90)
    expect(character.features).toHaveLength(17)
    expect(character.proficiencies.skills).toHaveLength(18)
    expect(character.details.allies).toHaveLength(3)
    expect(character.hitPointGains).toHaveLength(19)

    expectCorpusReference(lookups.racesByKey, character.race, character.raceSource)
    const resolvedRace =
      lookups.racesByKey[getEntityLookupKey(character.race, character.raceSource)]
    if ((resolvedRace?.subraces?.length ?? 0) > 0) {
      expect(
        character.subrace,
        "Fixture must select one of the race's available subraces",
      ).toBeTruthy()
    }
    expectCorpusReference(
      lookups.backgroundsByKey,
      character.background,
      character.backgroundSource,
    )
    for (const entry of character.classProgression ?? []) {
      expectCorpusReference(lookups.classesByKey, entry.name, entry.source)
      const resolvedClass = lookups.classesByKey[getEntityLookupKey(entry.name, entry.source)]
      expect(
        resolvedClass?.subclasses?.some(
          (subclass) =>
            (subclass.name === entry.subclass || subclass.shortName === entry.subclass) &&
            subclass.source === entry.subclassSource,
        ),
        `Missing corpus subclass ${entry.subclass}|${entry.subclassSource}`,
      ).toBe(true)
    }
    if (character.subrace) {
      expect(
        resolvedRace?.subraces?.some(
          (subrace) =>
            subrace.name === character.subrace && subrace.source === character.subraceSource,
        ),
        `Missing corpus subrace ${character.subrace}|${character.subraceSource}`,
      ).toBe(true)
    }

    const allFeats = [
      ...character.feats,
      ...(character.specialFeats ?? []),
      ...(character.classFeatChoices ?? []).flatMap((choice) => choice.feats),
    ]
    for (const feat of allFeats) {
      expectCorpusReference(lookups.featsByKey, feat.name, feat.source)
      expect(feat.description).toBe('')
    }
    for (const selectionKey of Object.keys(character.fixedFeatOptions ?? {})) {
      const [name, source] = selectionKey.split('|')
      expectCorpusReference(lookups.featsByKey, name, source)
    }
    for (const feature of character.features) {
      expect(featureKeys.has(getEntityLookupKey(feature.name, feature.source))).toBe(true)
      expect(feature.description).toBe('')
    }
    for (const item of character.equipment) {
      expectCorpusReference(lookups.itemLookup, item.name, item.source)
      expect(item.description).toBe('')
    }
    for (const profile of character.spells.spellProfiles) {
      const choiceReferences = (profile.choices ?? []).flatMap((choice) => [
        ...(choice.pool ?? []),
        ...choice.selected,
      ])
      const swapReferences = Object.values(profile.spellSwaps ?? {}).flatMap((swap) => [
        swap.removed,
        swap.added,
      ])
      for (const reference of [
        ...profile.cantrips,
        ...profile.spellsKnown,
        ...profile.preparedSpells,
        ...(profile.fixedSpells ?? []),
        ...(profile.alwaysPreparedSpells ?? []),
        ...choiceReferences,
        ...swapReferences,
      ]) {
        const separator = reference.lastIndexOf('|')
        expectCorpusReference(
          lookups.spellsByKey,
          separator >= 0 ? reference.slice(0, separator) : reference,
          separator >= 0 ? reference.slice(separator + 1) : undefined,
        )
      }
    }
  })

  test('each ruleset fixture exercises its own fixed-template capacity boundary', () => {
    const character2014 = loadFixture('2014')
    const character2024 = loadFixture('2024')
    const viewModel2014 = createCharacterSheetViewModel(character2014, lookups)
    const viewModel2024 = createCharacterSheetViewModel(character2024, lookups)
    const map2014 = buildCharacterSheetFieldMap(viewModel2014, '2014')
    const map2024 = buildCharacterSheetFieldMap(viewModel2024, '2024')

    expect(viewModel2014.weaponRows.length).toBeGreaterThanOrEqual(6)
    expect(viewModel2024.weaponRows.length).toBeGreaterThanOrEqual(6)
    expect(viewModel2014.spellRows.length).toBeGreaterThan(30)
    expect(viewModel2024.spellRows.length).toBeGreaterThan(30)
    expect(viewModel2014.magicItems.length).toBeGreaterThanOrEqual(5)
    expect(viewModel2024.magicItems.length).toBeGreaterThanOrEqual(5)
    expect(map2014.textFields['Extra.Gear Row 36']).toBe(character2014.equipment[89]?.name)
    expect(map2014.textFields['Attack.5.Weapon Selection']).not.toBe('')
    expect(map2024.textFields.Text_66).not.toBe('')
    expect(map2024.textFields.Text_151).not.toBe('')
    expect(map2024.textFields.Text_214).not.toBe('')
  })
})
