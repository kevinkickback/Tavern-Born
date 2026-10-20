import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { getRequiredChoiceSelectionCount } from '@/lib/5etools/classChoiceNormalization'
import { getClassResourceDefs, getSelectedSubclassData } from '@/lib/5etools/classData'
import { decodeClassProficiencyChoiceId } from '@/lib/5etools/classProficiencyIdentity'
import { composeGameDataLayers } from '@/lib/5etools/contentLayers'
import { createEmptyGameData } from '@/lib/5etools/emptyGameData'
import { DataFilter } from '@/lib/5etools/filters'
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
  parseCreatures,
  parseFeats,
  parseItemMasteries,
  parseItems,
  parseItemTypes,
  parseMagicVariants,
  parseOptionalFeatures,
  parseOrganizations,
  parseRaces,
  parseSpells,
} from '@/lib/5etools/parsers'
import { parseClassDocument } from '@/lib/5etools/parsers/classes'
import type { SpellSourceLookup } from '@/lib/5etools/parsers/spells'
import { buildItemLookup } from '@/lib/5etools/startingEquipment'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { normalizeRaceMovement } from '@/lib/calculations/movement'
import { parseSpellReference, resolveSpellReferenceFromMap } from '@/lib/calculations/spellIdentity'
import {
  buildClassSpellSelectionsByLevel,
  isSpellOnClassList,
} from '@/lib/calculations/spellProfiles'
import { getEffectiveClassChoiceSelections } from '@/lib/character/classChoiceActivity'
import {
  buildClassChoiceFeatureCatalogs,
  type ClassChoiceCatalogs,
  getCharacterClassChoices,
  getClassChoiceCandidates,
  getClassChoiceOptionKey,
  resolveClassChoiceOptions,
} from '@/lib/character/classChoiceOptions'
import { getManagedClassSpellSlots } from '@/lib/character/managedClassSpellSlots'
import { createOptionalClassFeatureActivity } from '@/lib/character/optionalClassFeatureActivity'
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
  Creature5e,
  Feat5e,
  Item5e,
  ItemMastery5e,
  ItemType5e,
  Language5e,
  OptionalFeatureLike,
  Race5e,
  Spell5e,
} from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterSchema } from '@/types/characterSchema'
import { createCurrentCharacterSheetViewModel } from '../fixtures/pdfTemplates'

const dataRoot = join(process.cwd(), 'data')
const fixtureRoot = join(process.cwd(), 'tests', 'fixtures')
const fixturePaths = {
  '2014': join(fixtureRoot, 'full-coverage-character-2014.tbc'),
  '2024': join(fixtureRoot, 'full-coverage-character-2024.tbc'),
} as const
const companionPaths = {
  '2014': join(fixtureRoot, 'companion-choice-character-2014.tbc'),
  '2024': join(fixtureRoot, 'companion-choice-character-2024.tbc'),
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
const castingData = classPayloads.length
  ? composeGameDataLayers(
      classPayloads.map((payload, index) => {
        const parsed = parseClassDocument(payload, `fixture-corpus:${index}`)
        return {
          ...createEmptyGameData(),
          classes: parsed.classes as Class5e[],
          classFeatures: parsed.classFeatures as ClassFeature[],
          classCastingSources: parsed.classCastingSources,
          optionalClassFeatureSources: parsed.optionalClassFeatureSources,
        }
      }),
    )
  : createEmptyGameData()
const classes = castingData.classes
const classFeatures = castingData.classFeatures
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
const organizations = hasConfiguredCorpus
  ? parseOrganizations(readJson(join(dataRoot, 'fluff-backgrounds.json')))
  : []
const companionCreatures = hasConfiguredCorpus
  ? (['bestiary-mm.json', 'bestiary-tce.json', 'bestiary-xphb.json'].flatMap((fileName) =>
      parseCreatures(readJson(join(dataRoot, 'bestiary', fileName))),
    ) as Creature5e[])
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
  organizations,
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
    ...buildClassChoiceFeatureCatalogs({
      classes: DataFilter.filterClasses(classes, { sources: character.allowedSources }),
      classFeatures: classFeatures.filter(fromAllowedSource),
      classCastingSources: castingData.classCastingSources,
      skills: collection(readJson(join(dataRoot, 'skills.json')), 'skill').filter((row) =>
        fromAllowedSource(row as { source?: string }),
      ),
      languages: (
        collection(readJson(join(dataRoot, 'languages.json')), 'language') as Language5e[]
      ).filter(fromAllowedSource),
    }),
    creatures: companionCreatures.filter(fromAllowedSource),
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
    return [
      ...profile.cantrips,
      ...profile.spellsKnown,
      ...profile.preparedSpells,
      ...(profile.fixedSpells ?? []),
      ...(profile.alwaysPreparedSpells ?? []),
      ...choiceReferences,
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
    expect(character.spells.spellProfiles).toHaveLength(character.classProgression.length + 2)
    expect(character.equipment).toHaveLength(90)
    expect(character.features).toHaveLength(21)
    expect(character.proficiencies.skills).toHaveLength(18)
    expect(character.proficiencies.expertise.length).toBeGreaterThan(0)
    expect(character.details.allies).toHaveLength(3)
    expect(character.hitPointGains).toHaveLength(19)
    const organization = organizations.find(
      (candidate) =>
        `${candidate.name}|${candidate.source}` === character.details.organizationSelectionKey,
    )
    expect(organization?.imagePath).toBeTruthy()
    expect(
      existsSync(join(process.cwd(), 'public', organization?.imagePath?.replace(/^\//, '') ?? '')),
    ).toBe(true)
    const classChoiceCatalogs = buildClassChoiceCatalogs(character)
    const inputs = {
      ...lookups,
      classChoiceClasses: classChoiceCatalogs.classes,
      classChoiceFeatureCatalogs: classChoiceCatalogs,
    }
    const viewModel = createCharacterSheetViewModel(character, inputs, inputs)
    expect(viewModel.organizationImage).toBe(organization?.imagePath)

    const calculation = createCharacterCalculationContext(character, inputs)
    if (edition === '2024') {
      const scholar = character.classChoiceSelections?.find(
        (row) =>
          decodeClassProficiencyChoiceId(row.choiceId)?.target ===
          'class-feature|scholar|wizard|xphb|2|xphb',
      )
      expect(scholar?.selected.map((row) => row.name)).toEqual(['History'])
      expect(calculation.character.provenance.proficiencies.expertise?.history).toContainEqual(
        expect.objectContaining({
          sourceType: 'class',
          sourceName: 'Wizard',
          grantVariant: scholar!.choiceId,
        }),
      )
      expect(viewModel.skillByName.get('history')!.modifier).toBe(
        calculation.abilityScores.modifiers.intelligence + 12,
      )
    }
    expect(character.movement).toEqual(
      normalizeRaceMovement(
        calculation.raceResolution.parentRace as Race5e,
        calculation.raceResolution.subraceData,
      ),
    )
    expect(viewModel.walkingSpeed).toBeGreaterThan(0)
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
      expect(
        character.allowedSources.map((source) => source.trim().toLowerCase()),
        `Disallowed spell source in ${reference}`,
      ).toContain(parsed.source?.trim().toLowerCase())
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
      const spellSelectionsByLevel = buildClassSpellSelectionsByLevel({
        character,
        className: entry.name,
        classSource: entry.source,
      })
      for (let level = 1; level <= entry.levels; level += 1) {
        const requiredSpellChoices = getManagedClassSpellSlots(entry).filter(
          (slot) => slot[3] === level,
        ).length
        if (requiredSpellChoices === 0) continue
        expect(
          spellSelectionsByLevel.get(level),
          `Incomplete ${entry.name} spell choices at level ${level}`,
        ).toHaveLength(requiredSpellChoices)
      }

      for (const choice of getCharacterClassChoices(
        classData,
        subclassData,
        createOptionalClassFeatureActivity(character, classChoiceCatalogs),
        classChoiceCatalogs,
      )) {
        const required = getRequiredChoiceSelectionCount(choice, entry.levels)
        if (required === 0) continue
        const selection = storedChoices.get(choice.id)
        expect(selection?.selected, `Missing ${choice.label} selection`).toHaveLength(required)
        const eligible = new Set(
          resolveClassChoiceOptions(
            choice,
            classChoiceCatalogs,
            selection?.selected ?? [],
            entry.levels,
            choice.kind === 'proficiency' ? character : undefined,
          )
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
            if (choice.owner.type === 'subclass') {
              expect(character.provenance.features[option.name.toLowerCase()]).toContainEqual(
                expect.objectContaining({
                  sourceType: 'subclass',
                  grantVariant: choice.id,
                }),
              )
            }
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
    const inputs2014 = {
      ...lookups,
      classChoiceClasses: buildClassChoiceCatalogs(character2014).classes,
      classChoiceFeatureCatalogs: buildClassChoiceCatalogs(character2014),
    }
    const inputs2024 = {
      ...lookups,
      classChoiceClasses: buildClassChoiceCatalogs(character2024).classes,
      classChoiceFeatureCatalogs: buildClassChoiceCatalogs(character2024),
    }
    const viewModel2014 = createCharacterSheetViewModel(character2014, inputs2014, inputs2014)
    const viewModel2024 = createCharacterSheetViewModel(character2024, inputs2024, inputs2024)
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
  }, 15_000)

  test.each([
    '2014',
    '2024',
  ] as const)('%s companion character keeps a source-qualified, eligible Beast Master choice', (edition) => {
    const raw = readJson(companionPaths[edition])
    const character = characterSchema.parse(raw)
    expect(validateCharacterData(raw)).toBeNull()
    expect(
      character.spells.spellProfiles.find((profile) => profile.type === 'racial'),
    ).toMatchObject({
      castingAbility: 'int',
      cantrips: edition === '2014' ? ['Friends|PHB'] : ['dancing lights|xphb'],
      spellsKnown: edition === '2014' ? [] : ['faerie fire|xphb'],
    })
    expect(character.classProgression).toEqual([
      expect.objectContaining({ name: 'Ranger', subclass: 'Beast Master', levels: 3 }),
    ])
    expect(character.details.organizationSelectionKey).toBe('The Harpers|SCAG')
    const organizationImagePath = organizations.find(
      (organization) =>
        `${organization.name}|${organization.source}` ===
        character.details.organizationSelectionKey,
    )?.imagePath
    expect(organizationImagePath).toBeTruthy()
    expect(createCurrentCharacterSheetViewModel(character, lookups).organizationImage).toBe(
      organizationImagePath,
    )

    const catalogs = buildClassChoiceCatalogs(character)
    const calculation = createCharacterCalculationContext(character, {
      ...lookups,
      classChoiceClasses: catalogs.classes,
      classChoiceFeatureCatalogs: catalogs,
    })
    const classData = calculation.classes[0]
    expect(character.movement.speeds.walk).toBeGreaterThan(0)
    const subclassData = getSelectedSubclassData(classData, character.classProgression[0])
    const effectiveSelections = getEffectiveClassChoiceSelections(
      character,
      catalogs.classes!,
      catalogs,
    )
    const choices = getCharacterClassChoices(
      classData,
      subclassData,
      createOptionalClassFeatureActivity(character, catalogs),
      catalogs,
    )
    for (const choice of choices) {
      const required = getRequiredChoiceSelectionCount(choice, 3)
      if (required === 0) continue
      const selection = effectiveSelections.find((candidate) => candidate.choiceId === choice.id)
      if (choice.kind === 'proficiency') {
        // Companion setup is complete; its source-owned proficiency setup stays explicitly pending.
        const revised = edition === '2024'
        expect(decodeClassProficiencyChoiceId(choice.id)).toEqual({
          owner: ['ranger', revised ? 'xphb' : 'phb'],
          target: revised
            ? 'class-feature|deft explorer|ranger|xphb|2|xphb'
            : 'class-feature|deft explorer|ranger|phb|1|tce',
          domain: choice.proficiencyDomain,
          level: revised ? 2 : 1,
        })
        expect(['expertise', 'languages']).toContain(choice.proficiencyDomain)
        expect(choice.maximumSelections).toBe(choice.proficiencyDomain === 'expertise' ? 1 : 2)
        expect(selection).toBeUndefined()
        continue
      }
      if (edition === '2014' && choice.label === 'Natural Explorer') {
        expect(choice.level).toBe(1)
        expect(selection).toBeUndefined()
        continue
      }
      expect(selection?.inactive).not.toBe(true)
      expect(selection?.selected, `Missing ${choice.label} selection`).toHaveLength(required)
      const eligible = new Set(
        resolveClassChoiceOptions(choice, catalogs)
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
            character.classFeatChoices?.some((featChoice) =>
              featChoice.feats.some(
                (feat) => feat.name === option.name && feat.source === option.source,
              ),
            ),
          ).toBe(true)
        }
        if (option.entityType === 'optionalFeature') {
          expect(
            character.features.some(
              (feature) => feature.name === option.name && feature.source === option.source,
            ),
          ).toBe(true)
        }
      }
    }

    const primal = character.classChoiceSelections?.find(
      (selection) => selection.label === 'Primal Companion',
    )
    expect(primal?.selected).toEqual([
      expect.objectContaining({
        entityType: 'creature',
        name: 'Beast of the Land',
        source: edition === '2014' ? 'TCE' : 'XPHB',
      }),
    ])
    if (edition === '2014') {
      const classic = character.classChoiceSelections?.find(
        (selection) => selection.label === "Ranger's Companion",
      )
      expect(classic?.inactive).toBe(true)
      expect(character.optionalClassFeatureAdoptions).toBeUndefined()
      expect(
        effectiveSelections.find((row) => row.choiceId === classic?.choiceId)?.inactive,
      ).not.toBe(true)
      expect(effectiveSelections.find((row) => row.choiceId === primal?.choiceId)?.inactive).toBe(
        true,
      )
      expect(
        createCurrentCharacterSheetViewModel(character, {
          ...lookups,
          classChoiceClasses: catalogs.classes,
          classChoiceFeatureCatalogs: catalogs,
        }).actions.some((row) => row.name === 'Primal Companion'),
      ).toBe(false)
      expect(classic?.selected[0]).toMatchObject({
        entityType: 'creature',
        name: 'Wolf',
        source: 'MM',
      })
      const classicChoice = getClassChoiceCandidates(classData, subclassData).find(
        (choice) => choice.id === classic?.choiceId,
      )
      expect(classicChoice).toBeDefined()
      expect(
        resolveClassChoiceOptions(classicChoice!, catalogs).some(
          (option) =>
            getClassChoiceOptionKey(option.reference) ===
            getClassChoiceOptionKey(classic!.selected[0]),
        ),
      ).toBe(true)
    }

    const selectedSpells = buildClassSpellSelectionsByLevel({
      character,
      className: 'Ranger',
      classSource: classData.source,
    })
    for (let level = 1; level <= 3; level += 1) {
      const required = getManagedClassSpellSlots(character.classProgression[0]).filter(
        (slot) => slot[3] === level,
      ).length
      if (required > 0) {
        expect(selectedSpells.get(level)).toHaveLength(required)
      }
    }
    const readiness = getCharacterReadiness(character, {
      calculation,
      classChoiceCatalogs: catalogs,
      featsByKey: lookups.featsByKey,
      spellsByKey: lookups.spellsByKey,
    })
    // The old optional flag is permission only. Revised Deft Explorer remains standard.
    expect(readiness.status).toBe('incomplete')
    expect(
      readiness.blockingIssues,
      readiness.blockingIssues.map((issue) => `${issue.title}: ${issue.explanation}`).join('\n'),
    ).toEqual(
      edition === '2014'
        ? (() => {
            const choiceId =
              'feature-literals:' +
              encodeURIComponent(
                JSON.stringify([
                  ['ranger', 'phb', '', ''],
                  'class-feature|natural explorer|ranger|phb|1|phb',
                  'favored-terrain',
                  'class-feature|natural explorer|ranger|phb|1|phb',
                  1,
                ]),
              )
            return [
              {
                id: `class-choice:${choiceId}`,
                severity: 'blocking',
                section: 'class',
                title: 'Finish Natural Explorer',
                explanation: 'Ranger: choose 1 selection; 0 chosen.',
                navigationTarget:
                  '/build/class?' +
                  new URLSearchParams({
                    class: 'Ranger|PHB',
                    level: '1',
                    choice: choiceId,
                  }).toString(),
              },
              {
                id: 'class-choice-diagnostic:Ranger|PHB:Favored Enemy:unsupported-required-choice',
                severity: 'blocking',
                section: 'class',
                title: 'Review unresolved Favored Enemy choice',
                explanation:
                  'Favored Enemy requires enemy and associated language choices. Tavern Born does not yet support this setup.',
                navigationTarget: '/build/class?class=Ranger%7CPHB&level=1',
              },
            ]
          })()
        : (['expertise', 'languages'] as const).map((domain, index) => {
            const revised = edition === '2024'
            const choiceId =
              'feature-proficiencies:' +
              encodeURIComponent(
                JSON.stringify([
                  ['ranger', revised ? 'xphb' : 'phb'],
                  revised
                    ? 'class-feature|deft explorer|ranger|xphb|2|xphb'
                    : 'class-feature|deft explorer|ranger|phb|1|tce',
                  domain,
                  revised ? 2 : 1,
                ]),
              )
            return {
              id: `class-choice:${choiceId}`,
              severity: 'blocking',
              section: 'class',
              title: `Finish ${revised ? 'Deft Explorer' : 'Canny'} ${domain}`,
              explanation: `Ranger: choose ${index + 1} ${index === 0 ? 'selection' : 'selections'}; 0 chosen.`,
              navigationTarget:
                '/build/class?' +
                new URLSearchParams({
                  class: revised ? 'Ranger|XPHB' : 'Ranger|PHB',
                  level: revised ? '2' : '1',
                  choice: choiceId,
                }).toString(),
            }
          }),
    )
  })
})
