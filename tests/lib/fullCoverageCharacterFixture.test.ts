import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { getRequiredChoiceSelectionCount } from '@/lib/5etools/classChoiceNormalization'
import {
  getClassResourceDefs,
  getClassSpellGainAtLevel,
  getEffectiveSpellcastingClassData,
  getSelectedSubclassData,
} from '@/lib/5etools/classData'
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
  parseClassFeatures,
  parseFeats,
  parseItemMasteries,
  parseItems,
  parseItemTypes,
  parseMagicVariants,
  parseOptionalFeatures,
  parseRaces,
  parseSpells,
} from '@/lib/5etools/parsers'
import type { SpellSourceLookup } from '@/lib/5etools/parsers/spells'
import { buildItemLookup } from '@/lib/5etools/startingEquipment'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { parseSpellReference, resolveSpellReferenceFromMap } from '@/lib/calculations/spellIdentity'
import {
  buildClassSpellSelectionsByLevel,
  isSpellOnClassList,
} from '@/lib/calculations/spellProfiles'
import {
  type ClassChoiceCatalogs,
  getClassChoiceOptionKey,
  resolveClassChoiceOptions,
} from '@/lib/character/classChoiceOptions'
import {
  buildCharacterSheetFieldMap,
  createCharacterSheetViewModel,
} from '@/lib/pdf/characterSheetPdf'
import {
  getAbilityBonusRows,
  getAllProficiencyRows,
  getEquipmentRows,
  getFeatRows,
  getFeatureRows,
  getSpellRows,
} from '@/lib/provenance'
import { getSourcesRowsBySectionId } from '@/lib/provenance/sectionRows'
import { getCharacterReadiness } from '@/lib/readiness/characterReadiness'
import { buildRecursiveLookup } from '@/lib/renderer/recursiveTooltip'
import { CURRENT_CHARACTER_SCHEMA_VERSION } from '@/lib/schema/characterSchemaVersion'
import { validateCharacterData } from '@/store/characterStore'
import type {
  Background5e,
  Class5e,
  ClassFeature,
  Feat5e,
  Item5e,
  ItemMastery5e,
  ItemType5e,
  OptionalFeatureLike,
  Race5e,
  Spell5e,
} from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterSchema } from '@/types/characterSchema'

const dataRoot = join(process.cwd(), 'data')
const fixtureRoot = join(process.cwd(), 'tests', 'fixtures')
const fixturePaths = {
  '2014': join(fixtureRoot, 'full-coverage-character-2014.tbc'),
  '2024': join(fixtureRoot, 'full-coverage-character-2024.tbc'),
} as const
const hasConfiguredCorpus = existsSync(join(dataRoot, 'class', 'index.json'))

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

const classPayloads = hasConfiguredCorpus ? loadIndexedPayloads('class') : []
const spellPayloads = hasConfiguredCorpus ? loadIndexedPayloads('spells') : []
const classes = classPayloads.flatMap((payload) => parseClasses(payload)) as Class5e[]
const classFeatures = classPayloads.flatMap((payload) =>
  parseClassFeatures(payload),
) as ClassFeature[]
const rawClassFeatures = classPayloads.flatMap((payload) => [
  ...collection(payload, 'classFeature'),
  ...collection(payload, 'subclassFeature'),
]) as Array<{ name: string; source: string }>
const races = hasConfiguredCorpus
  ? (parseRaces(readJson(join(dataRoot, 'races.json'))) as Race5e[])
  : []
const backgrounds = hasConfiguredCorpus
  ? (parseBackgrounds(readJson(join(dataRoot, 'backgrounds.json'))) as Background5e[])
  : []
const feats = hasConfiguredCorpus
  ? (parseFeats(readJson(join(dataRoot, 'feats.json'))) as Feat5e[])
  : []
const items = hasConfiguredCorpus
  ? ([
      ...parseItems(readJson(join(dataRoot, 'items.json'))),
      ...parseMagicVariants(readJson(join(dataRoot, 'magicvariants.json'))),
    ] as Item5e[])
  : []
const itemsBasePayload = hasConfiguredCorpus ? readJson(join(dataRoot, 'items-base.json')) : {}
const itemsBase = hasConfiguredCorpus ? (parseItems(itemsBasePayload) as Item5e[]) : []
const allItems = [...items, ...itemsBase]
const itemMasteries = hasConfiguredCorpus
  ? (parseItemMasteries(itemsBasePayload) as ItemMastery5e[])
  : []
const itemTypes = hasConfiguredCorpus ? (parseItemTypes(itemsBasePayload) as ItemType5e[]) : []
const optionalFeatures = hasConfiguredCorpus
  ? (parseOptionalFeatures(
      readJson(join(dataRoot, 'optionalfeatures.json')),
    ) as OptionalFeatureLike[])
  : []
const spellSourceLookup = hasConfiguredCorpus
  ? (readJson(join(dataRoot, 'generated', 'gendata-spell-source-lookup.json')) as SpellSourceLookup)
  : ({} as SpellSourceLookup)
const spells = spellPayloads.flatMap((payload) =>
  parseSpells(payload, { sourceLookup: spellSourceLookup }),
) as Spell5e[]
const recursiveLookup = buildRecursiveLookup({ spells })
const itemTypeByAbbr = Object.fromEntries(
  itemTypes.map((itemType) => [itemType.abbreviation, itemType.name]),
)

const lookups = {
  classesByKey: buildClassLookup(classes),
  racesByKey: buildRaceLookup(races),
  backgroundsByKey: buildBackgroundLookup(backgrounds),
  featsByKey: buildFeatLookup(feats),
  spellsByKey: buildSpellLookup(spells),
  itemLookup: buildItemLookup(allItems),
}
const featureKeys = new Set(
  [...rawClassFeatures, ...optionalFeatures].map((feature) =>
    getEntityLookupKey(feature.name, feature.source),
  ),
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

function buildClassChoiceCatalogs(character: Character): ClassChoiceCatalogs {
  const allowedSources = new Set(character.allowedSources)
  const fromAllowedSource = (entity: { source?: string }) =>
    !entity.source || allowedSources.has(entity.source)
  return {
    classFeatures: classFeatures.filter(fromAllowedSource),
    subclassFeatures: [],
    creatures: [],
    feats: feats.filter(fromAllowedSource),
    items: items.filter(fromAllowedSource),
    itemsBase: itemsBase.filter(fromAllowedSource),
    itemMasteries: itemMasteries.filter(fromAllowedSource),
    optionalFeatures: optionalFeatures.filter(fromAllowedSource),
    itemPropertyByAbbr: {},
    itemTypeByAbbr,
    weaponProficiencies: character.proficiencies.weapons,
  }
}

function getStoredSpellReferences(character: Character): Array<{
  profile: Character['spells']['spellProfiles'][number]
  reference: string
}> {
  return character.spells.spellProfiles.flatMap((profile) => {
    const choiceReferences = (profile.choices ?? []).flatMap((choice) => [
      ...(choice.pool ?? []),
      ...choice.selected,
    ])
    const swapReferences = Object.values(profile.spellSwaps ?? {}).flatMap((swap) => [
      swap.removed,
      swap.added,
    ])
    return [
      ...profile.cantrips,
      ...profile.spellsKnown,
      ...profile.preparedSpells,
      ...(profile.fixedSpells ?? []),
      ...(profile.alwaysPreparedSpells ?? []),
      ...choiceReferences,
      ...swapReferences,
    ].map((reference) => ({ profile, reference }))
  })
}

describe.runIf(hasConfiguredCorpus)('full-coverage character fixtures', () => {
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
    expect(character.features).toHaveLength(18)
    expect(character.proficiencies.skills).toHaveLength(18)
    expect(character.proficiencies.expertise.length).toBeGreaterThan(0)
    expect(character.details.allies).toHaveLength(3)
    expect(character.hitPointGains).toHaveLength(19)

    const calculation = createCharacterCalculationContext(character, lookups)
    const classChoiceCatalogs = buildClassChoiceCatalogs(character)
    const readiness = getCharacterReadiness(character, {
      calculation,
      classChoiceCatalogs,
      featsByKey: lookups.featsByKey,
      spellsByKey: lookups.spellsByKey,
    })
    expect(
      readiness.blockingIssues,
      readiness.blockingIssues.map((issue) => `${issue.title}: ${issue.explanation}`).join('\n'),
    ).toEqual([])

    const ledger = character.provenance
    const proficiencyRows = getAllProficiencyRows(ledger)
    const abilityBonusRows = getAbilityBonusRows(ledger)
    const featRows = getFeatRows(ledger)
    const featureRows = getFeatureRows(ledger)
    const spellRows = getSpellRows(ledger)
    const equipmentRows = getEquipmentRows(ledger)
    expect(abilityBonusRows.length).toBeGreaterThan(0)
    expect(
      Object.values(proficiencyRows)
        .flat()
        .filter((row) => !row.isPending).length,
    ).toBeGreaterThan(0)
    expect(featRows.length).toBeGreaterThan(0)
    expect(featureRows.length).toBeGreaterThan(0)
    expect(spellRows.length).toBeGreaterThan(0)
    expect(equipmentRows.length).toBeGreaterThan(0)
    for (const sectionId of [
      'build-race',
      'build-background',
      'build-class',
      'build-proficiencies',
      'build-ability-scores',
      'feats',
      'features',
      'spells',
      'equipment',
    ]) {
      expect(
        getSourcesRowsBySectionId({
          sectionId,
          proficiencyRows,
          abilityBonusRows,
          featRows,
          featureRows,
          spellRows,
          equipmentRows,
        }).length,
        `Missing Sources footer rows for ${sectionId}`,
      ).toBeGreaterThan(0)
    }

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
      expect(
        featureKeys.has(getEntityLookupKey(feature.name, feature.source)),
        `Missing corpus feature ${feature.name}|${feature.source}`,
      ).toBe(true)
      expect(feature.description).toBe('')
    }
    for (const item of character.equipment) {
      expectCorpusReference(lookups.itemLookup, item.name, item.source)
      expect(item.description).toBe('')
    }

    const fixedSpellKeysByProfile = new Map(
      character.spells.spellProfiles.map((profile) => [
        profile.id,
        new Set(
          (profile.fixedSpells ?? []).map((reference) => parseSpellReference(reference).name),
        ),
      ]),
    )
    for (const { profile, reference } of getStoredSpellReferences(character)) {
      const parsed = parseSpellReference(reference)
      expect(parsed.source, `Spell reference must include its source: ${reference}`).toBeTruthy()
      expect(character.allowedSources, `Disallowed spell source in ${reference}`).toContain(
        parsed.source,
      )
      const spell = resolveSpellReferenceFromMap(reference, recursiveLookup.spells)
      expect(spell, `Runtime lookup could not resolve ${reference}`).toBeDefined()
      if (
        spell &&
        profile.type === 'class' &&
        profile.className &&
        !fixedSpellKeysByProfile.get(profile.id)?.has(parsed.name)
      ) {
        expect(
          isSpellOnClassList(spell, profile.className, profile.classSource),
          `${reference} is not on the ${profile.className}|${profile.classSource} spell list`,
        ).toBe(true)
      }
    }

    const storedChoices = new Map(
      (character.classChoiceSelections ?? []).map((selection) => [selection.choiceId, selection]),
    )
    for (const classData of calculation.classes) {
      const entry = character.classProgression.find(
        (candidate) => candidate.name === classData.name && candidate.source === classData.source,
      )
      expect(entry, `Missing progression for ${classData.name}|${classData.source}`).toBeDefined()
      if (!entry) continue

      const subclassData = getSelectedSubclassData(classData, entry)
      const spellcastingData = getEffectiveSpellcastingClassData(classData, subclassData)
      const spellSelectionsByLevel = buildClassSpellSelectionsByLevel({
        character,
        className: entry.name,
        classSource: entry.source,
      })
      for (let level = 1; level <= entry.levels; level += 1) {
        const spellGain = getClassSpellGainAtLevel(spellcastingData, level, calculation.classes)
        const requiredSpellChoices = spellGain.cantrips + spellGain.spells
        if (requiredSpellChoices === 0) continue
        expect(
          spellSelectionsByLevel.get(level),
          `Incomplete ${entry.name} spell choices at level ${level}`,
        ).toHaveLength(requiredSpellChoices)
      }

      for (const choice of classData.normalizedRules?.choices ?? []) {
        const required = getRequiredChoiceSelectionCount(choice, entry.levels)
        if (required === 0) continue
        const selection = storedChoices.get(choice.id)
        expect(selection?.selected, `Missing ${choice.label} selection`).toHaveLength(required)
        const eligible = new Set(
          resolveClassChoiceOptions(choice, classChoiceCatalogs)
            .filter((option) => option.availability === 'eligible')
            .map((option) => getClassChoiceOptionKey(option.reference)),
        )
        for (const option of selection?.selected ?? []) {
          expect(
            eligible.has(getClassChoiceOptionKey(option)),
            `Ineligible ${choice.label} option ${option.name}|${option.source}`,
          ).toBe(true)

          if (option.entityType === 'feat') {
            expect(
              character.classFeatChoices?.some(
                (featChoice) =>
                  featChoice.id === choice.id &&
                  featChoice.feats.some(
                    (feat) => feat.name === option.name && feat.source === option.source,
                  ),
              ),
              `Missing materialized feat choice ${option.name}|${option.source}`,
            ).toBe(true)
          }
          if (option.entityType === 'classFeature' || option.entityType === 'optionalFeature') {
            expect(
              character.features.some(
                (feature) => feature.name === option.name && feature.source === option.source,
              ),
              `Missing materialized feature choice ${option.name}|${option.source}`,
            ).toBe(true)
          }
        }
      }
    }

    const resourceIds = new Set(
      calculation.classes.flatMap((classData) => {
        const entry = character.classProgression.find(
          (candidate) => candidate.name === classData.name && candidate.source === classData.source,
        )
        return getClassResourceDefs(classData, entry?.levels ?? 0).map((resource) => resource.id)
      }),
    )
    for (const [resourceId, used] of Object.entries(character.classResources ?? {})) {
      expect(resourceIds, `Unknown class resource ${resourceId}`).toContain(resourceId)
      expect(used).toBeGreaterThanOrEqual(0)
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
