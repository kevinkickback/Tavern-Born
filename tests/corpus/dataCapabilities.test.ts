import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createCorpusCapabilityReport } from '@/lib/5etools/capabilityReport'
import {
  createClassChoiceCoverageMatrix,
  findClassChoiceCoverageGaps,
  getPrimaryClassSourceForEdition,
  getSrdClassCohort,
} from '@/lib/5etools/classChoiceCoverage'
import { findLayerDependencyIssues, loadGameDataSourceStack } from '@/lib/5etools/contentLayers'
import { FiveEToolsDataLoader } from '@/lib/5etools/dataLoader'
import { getItemRulesEntries } from '@/lib/5etools/itemTypeEntries'
import {
  parseBackgrounds,
  parseClasses,
  parseConditions,
  parseCreatures,
  parseFeats,
  parseItems,
  parseMagicVariants,
  parseOptionalFeatures,
  parseRaces,
  parseTrapHazards,
} from '@/lib/5etools/parsers'
import { filterCharacterItems } from '@/lib/5etools/playerItemAvailability'
import { CORE_RULES_METADATA } from '@/lib/5etools/rulesetMetadata'
import { buildCompendiumEntries, filterCompendiumEntries } from '@/lib/compendiumEntries'
import { renderEntriesToText } from '@/lib/entryText'
import type {
  Background5e,
  Class5e,
  ClassFeature,
  Creature5e,
  Feat5e,
  Item5e,
  Race5e,
} from '@/types/5etools'
import { makeGameDataFixture } from '../fixtures/gameDataFixtures'

const DATA_ROOT = resolve(process.cwd(), 'data')

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function collection(payload: unknown, field: string): unknown[] {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return []
  const value = (payload as Record<string, unknown>)[field]
  return Array.isArray(value) ? value : []
}

describe.runIf(existsSync(DATA_ROOT))('configured 5etools corpus capabilities', () => {
  it('loads the actual bundled and managed source stack with concrete shield item-choice targets', async () => {
    const failures: string[] = []
    vi.stubGlobal('electronAPI', {
      readBundledJson: async (file: string) => readJson(resolve('resources/srd/core/data', file)),
      readLocalJson: async (file: string) => readJson(file),
    })
    try {
      const data = await loadGameDataSourceStack(
        {
          base: {
            type: 'bundled',
            path: 'srd/core',
            packId: 'tavern-born-srd-core',
            packVersion: 'test',
            isValid: true,
          },
          additional: { type: 'local', path: DATA_ROOT, isValid: true },
        },
        {
          onResourceFailure: (file) => {
            failures.push(file)
          },
        },
      )
      expect(failures).toEqual([])
      expect(findLayerDependencyIssues(data, data)).toEqual([])
      expect(data.magicVariants).toHaveLength(230)
      expect(
        data.items
          .filter((item) => item.magicVariantGenerated)
          .map((item) => `${item.name}|${item.source}`)
          .sort(),
      ).toEqual([
        '+1 Shield|DMG',
        '+1 Shield|XDMG',
        '+2 Shield|DMG',
        '+2 Shield|XDMG',
        '+3 Shield|DMG',
        '+3 Shield|XDMG',
      ])
    } finally {
      vi.unstubAllGlobals()
    }
  })
  it('retains canonical templates and resolves all five actual copied magic definitions', async () => {
    const files = ['items.json', 'items-base.json', 'magicvariants.json']
    const raw = collection(readJson(resolve(DATA_ROOT, 'magicvariants.json')), 'magicvariant')
    const before = structuredClone(raw)
    const data = await new FiveEToolsDataLoader(
      { type: 'local', path: DATA_ROOT, isValid: true, availableResources: files },
      { type: 'local', readJson: async (file) => readJson(resolve(DATA_ROOT, file)) },
    ).loadAllData()
    expect(data.magicVariants).toEqual(before)
    expect(data.magicVariants).toHaveLength(230)
    expect(data.magicVariantDiagnostics).toEqual([])
    expect(data.items.filter((item) => item.magicVariantReference)).toHaveLength(230)
    for (const name of [
      'All-Seeing Blade of the Guardian',
      'Resistant Blade of the Guardian',
      'Studious Blade of the Guardian',
      'Regal Breastplate of the Tyrant (*)',
      'Subjugating Breastplate of the Tyrant (*)',
    ]) {
      const item = data.items.find((row) => row.name === name && row.source === 'AU')!
      expect(item).toBeDefined()
      expect(item.type).toBe('GV|XDMG')
      expect(item.propertyAdd).toContain('Evo|AU')
      expect(item).not.toHaveProperty('_copy')
      expect(item.magicVariantReference).toEqual({ name, source: 'AU' })
      expect(renderEntriesToText(item.entries)).toMatch(
        /Studious|Resistant|All-Seeing|Regal|Subjugating/,
      )
    }
    const barding = data.items.find((item) => item.name === 'Barding')!
    expect(barding.type).toBe('GV|DMG')
    expect(
      data.items.find((item) => item.name === '+1 Shield (*)' && item.source === 'XDMG'),
    ).toBeDefined()
  })
  it('projects actual instrument groups, legacy ships and both inherited AIR printings', async () => {
    const files = ['items.json', 'items-base.json', 'magicvariants.json']
    const raw = readJson(resolve(DATA_ROOT, 'items-base.json')) as {
      itemType: Array<{ abbreviation: string; source: string; entries?: unknown[] }>
    }
    const data = await new FiveEToolsDataLoader(
      { type: 'local', path: DATA_ROOT, isValid: true, availableResources: files },
      { type: 'local', readJson: async (file) => readJson(resolve(DATA_ROOT, file)) },
    ).loadAllData()
    for (const source of ['PHB', 'XPHB']) {
      const group = data.items.find(
        (item) => item.name === 'Musical Instrument' && item.source === source,
      )!
      const definition = raw.itemType.find(
        (type) => type.abbreviation === 'INS' && type.source === source,
      )!
      expect(group.primaryItemTypeText?.source).toBe(source)
      expect(group.primaryItemTypeText?.entries).toEqual(definition.entries)
      expect(
        renderEntriesToText(
          getItemRulesEntries(group, { allowedSources: [], originSystem: '2024' }),
        ),
      ).toContain('Instrument')
    }
    const galley = [...data.items, ...data.itemsBase].find(
      (item) => item.name === 'Galley' && item.source === 'DMG',
    )!
    expect(galley.type).toBe('SHP')
    expect(galley.primaryItemTypeText?.source).toBe('DMG')
    for (const source of ['DMG', 'XPHB']) {
      expect(
        data.itemTypes.find((type) => type.abbreviation === 'AIR' && type.source === source)
          ?.entries,
      ).toEqual(
        raw.itemType.find((type) => type.abbreviation === 'SHP' && type.source === source)?.entries,
      )
    }
    expect(
      createCorpusCapabilityReport(data).issues.filter(
        (issue) => issue.code === 'primary-item-type-diagnostic',
      ),
    ).toEqual([])
  })
  it('retains every declared compound reference collection without editing the input', () => {
    const rawConditions = readJson(resolve(DATA_ROOT, 'conditionsdiseases.json'))
    const rawTraps = readJson(resolve(DATA_ROOT, 'trapshazards.json'))
    const before = structuredClone([rawConditions, rawTraps])
    const conditions = parseConditions(rawConditions)
    const traps = parseTrapHazards(rawTraps)
    expect(conditions).toEqual(
      ['condition', 'disease', 'status'].flatMap((kind) =>
        collection(rawConditions, kind).map((row) => ({ ...(row as object), _sourceType: kind })),
      ),
    )
    expect(traps).toEqual(
      ['trap', 'hazard'].flatMap((kind) =>
        collection(rawTraps, kind).map((row) => ({ ...(row as object), _sourceType: kind })),
      ),
    )
    expect([rawConditions, rawTraps]).toEqual(before)
  })
  it('reports parsed capabilities and every observable gap', () => {
    const classIndex = readJson(resolve(DATA_ROOT, 'class', 'index.json')) as Record<string, string>
    const classPayloads = Object.values(classIndex).map((fileName) =>
      readJson(resolve(DATA_ROOT, 'class', fileName)),
    )
    const classes = classPayloads.flatMap((payload) => parseClasses(payload)) as Class5e[]
    const classFeatures = classPayloads.flatMap((payload) =>
      collection(payload, 'classFeature'),
    ) as ClassFeature[]
    const races = parseRaces(readJson(resolve(DATA_ROOT, 'races.json'))) as Race5e[]
    const backgrounds = parseBackgrounds(
      readJson(resolve(DATA_ROOT, 'backgrounds.json')),
    ) as Background5e[]
    const feats = parseFeats(readJson(resolve(DATA_ROOT, 'feats.json'))) as Feat5e[]
    const items = [
      ...parseItems(readJson(resolve(DATA_ROOT, 'items.json'))),
      ...parseMagicVariants(readJson(resolve(DATA_ROOT, 'magicvariants.json'))),
    ] as Item5e[]
    const itemsBase = parseItems(readJson(resolve(DATA_ROOT, 'items-base.json'))) as Item5e[]
    const legacyCoreItems = filterCharacterItems(items, {
      allowedSources: ['PHB'],
      originSystem: '2014',
    })
    const revisedCoreItems = filterCharacterItems(items, {
      allowedSources: ['XPHB'],
      originSystem: '2024',
    })
    const optionalfeatures = parseOptionalFeatures(
      readJson(resolve(DATA_ROOT, 'optionalfeatures.json')),
    )
    const bestiaryIndex = readJson(resolve(DATA_ROOT, 'bestiary', 'index.json')) as Record<
      string,
      string
    >
    const creatures = Object.values(bestiaryIndex).flatMap(
      (fileName) =>
        parseCreatures(readJson(resolve(DATA_ROOT, 'bestiary', fileName))) as Creature5e[],
    )

    const gameData = makeGameDataFixture({
      classes,
      classFeatures,
      races,
      backgrounds,
      feats,
      items,
      itemsBase,
      creatures,
      optionalfeatures,
    })
    const report = createCorpusCapabilityReport(gameData)
    const compendiumEntries = buildCompendiumEntries(gameData)
    const layerDependencyIssues = findLayerDependencyIssues(gameData, gameData)
    const primaryEditionSource = getPrimaryClassSourceForEdition(classes, 'one')
    const primaryEditionClasses = classes.filter(
      (classData) => classData.source === primaryEditionSource,
    )
    const srd52Classes = getSrdClassCohort(classes, 'srd52')
    const maximumLevel = CORE_RULES_METADATA['2024'].maxCharacterLevel
    const choiceCoverage = createClassChoiceCoverageMatrix(srd52Classes, maximumLevel)
    const choiceCoverageGaps = findClassChoiceCoverageGaps(
      srd52Classes,
      choiceCoverage,
      maximumLevel,
    )
    const revisedFighter = classes.find(
      (classData) => classData.name === 'Fighter' && classData.source === 'XPHB',
    )
    const copiedArcaneArcher = revisedFighter?.subclasses?.find(
      (subclass) => subclass.name === 'Arcane Archer' && subclass.source === 'XGE',
    )
    const legacyHuman = races.find((race) => race.name === 'Human' && race.source === 'PHB')
    const variantHuman = legacyHuman?.subraces?.find(
      (subrace) => subrace.name === 'Variant' && subrace.source === 'PHB',
    )
    const revisedHuman = races.find((race) => race.name === 'Human' && race.source === 'XPHB')
    const revisedSoldier = backgrounds.find(
      (background) => background.name === 'Soldier' && background.source === 'XPHB',
    )
    const arcaneTrickster = classes
      .find((classData) => classData.name === 'Rogue' && classData.source === 'PHB')
      ?.subclasses?.find(
        (subclass) => subclass.name === 'Arcane Trickster' && subclass.source === 'PHB',
      )
    const eldritchKnight = revisedFighter?.subclasses?.find(
      (subclass) => subclass.name === 'Eldritch Knight' && subclass.source === 'XPHB',
    )
    const issuesByCode = Object.fromEntries(
      Array.from(
        report.issues.reduce((counts, issue) => {
          counts.set(issue.code, (counts.get(issue.code) ?? 0) + 1)
          return counts
        }, new Map<string, number>()),
      ).sort(([left], [right]) => left.localeCompare(right)),
    )

    console.info(
      '[corpus-capabilities]',
      JSON.stringify(
        {
          entities: report.entities,
          classChoices: report.classChoices,
          primaryEditionChoiceCoverage: {
            source: primaryEditionSource,
            primarySourceClasses: primaryEditionClasses.length,
            srdTaggedClasses: choiceCoverage.length,
            levelsPerClass: maximumLevel,
            gaps: choiceCoverageGaps,
          },
          movement: report.movement,
          fieldCount: report.fields.length,
          issuesByCode,
          choiceGaps: report.issues
            .filter((issue) => issue.code === 'choice-diagnostic')
            .map(({ entity, message }) => ({ entity, message })),
          unresolvedReferenceSamples: report.issues
            .filter((issue) => issue.code === 'unresolved-reference')
            .slice(0, 20)
            .map(({ entity, path, message }) => ({ entity, path, message })),
        },
        null,
        2,
      ),
    )

    expect(report.entities.classes).toBeGreaterThan(0)
    expect(report.entities.races).toBeGreaterThan(0)
    expect(report.fields.length).toBeGreaterThan(0)
    // Finished shields remain unavailable until materialization; (*) templates are not aliases.
    const setupIssues = report.issues.filter((issue) => issue.code === 'choice-diagnostic')
    expect(
      setupIssues.map(({ entity, message }) => ({ entity, feature: message.split(':')[0] })),
    ).toEqual([
      { entity: 'Mystic|UATheMysticClass', feature: 'Psionics' },
      { entity: 'Ranger|PHB', feature: 'Deft Explorer' },
      { entity: 'Ranger|PHB', feature: 'Favored Enemy' },
    ])
    expect(
      setupIssues.every((issue) => issue.message.includes(': unsupported-required-choice: ')),
    ).toBe(true)
    expect(report.issues.filter((issue) => issue.code !== 'choice-diagnostic')).toEqual([
      {
        code: 'unresolved-reference',
        collection: 'classes',
        entity: 'Artificer|EFA',
        path: 'normalizedRules.choices[0].options[43]',
        message: 'The item option +2 Shield|XDMG was not found in the parsed catalog.',
      },
      {
        code: 'unresolved-reference',
        collection: 'classes',
        entity: 'Artificer|EFA',
        path: 'normalizedRules.choices[0].options[9]',
        message: 'The item option +1 Shield|XDMG was not found in the parsed catalog.',
      },
    ])
    expect(layerDependencyIssues).toEqual([
      {
        owner: 'Artificer|EFA',
        path: 'normalizedRules.choices[0].options[9]',
        reference: '+1 Shield|XDMG',
        required: false,
      },
      {
        owner: 'Artificer|EFA',
        path: 'normalizedRules.choices[0].options[43]',
        reference: '+2 Shield|XDMG',
        required: false,
      },
    ])
    const terrain = classes
      .find((row) => row.name === 'Ranger' && row.source === 'PHB')!
      .normalizedRules!.choices.filter((row) => row.label === 'Natural Explorer')
    expect(terrain.map((row) => row.level)).toEqual([1, 6, 10])
    expect(
      terrain.every(
        (row) =>
          row.kind === 'feature-option' &&
          row.minimumSelections === 1 &&
          row.maximumSelections === 1 &&
          row.options.length === 8,
      ),
    ).toBe(true)
    expect(primaryEditionClasses.length).toBeGreaterThan(0)
    expect(srd52Classes.length).toBeGreaterThan(0)
    expect(choiceCoverage.every((row) => row.levels.length === maximumLevel)).toBe(true)
    // Normalized setup gaps are bounded evidence, not complete legal 1–20 qualification.
    expect(choiceCoverageGaps).toEqual([])
    for (const source of ['PHB', 'XPHB']) {
      const stormRules = classes
        .find((classData) => classData.name === 'Barbarian' && classData.source === source)
        ?.subclasses?.find(
          (subclass) => subclass.name === 'Path of the Storm Herald' && subclass.source === 'XGE',
        )?.normalizedRules
      expect(stormRules?.choiceDiagnostics).toEqual([])
      expect(stormRules?.choices).toMatchObject([
        {
          label: 'Storm Aura',
          kind: 'subclass-feature',
          level: 3,
          minimumSelections: 1,
          maximumSelections: 1,
        },
      ])
      expect(stormRules!.choices[0].options.map((option) => option.ref)).toEqual([
        'Desert|Barbarian|PHB|Storm Herald|XGE|3|XGE',
        'Sea|Barbarian|PHB|Storm Herald|XGE|3|XGE',
        'Tundra|Barbarian|PHB|Storm Herald|XGE|3|XGE',
      ])
    }
    expect(copiedArcaneArcher?.entries?.length).toBeGreaterThan(0)
    expect(copiedArcaneArcher?.subclassFeatureRefs?.length).toBeGreaterThan(0)
    expect(
      filterCompendiumEntries(compendiumEntries, 'wolf', new Set(['Creature']), new Set(['MM'])),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Wolf', type: 'Creature', source: 'MM' }),
      ]),
    )
    expect(
      filterCompendiumEntries(
        compendiumEntries,
        'colossus slayer',
        new Set(['Subclass Feature']),
        new Set(['PHB']),
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Colossus Slayer',
          type: 'Subclass Feature',
          source: 'PHB',
        }),
      ]),
    )
    expect(
      filterCompendiumEntries(
        compendiumEntries,
        'primal companion',
        new Set(['Subclass Feature']),
        new Set(['TCE']),
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Primal Companion',
          type: 'Subclass Feature',
          source: 'TCE',
          context: 'Ranger · Beast Master · Level 3',
        }),
      ]),
    )
    expect(
      filterCompendiumEntries(
        compendiumEntries,
        'beast of the land',
        new Set(['Creature']),
        new Set(['TCE']),
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Beast of the Land',
          type: 'Creature',
          source: 'TCE',
        }),
      ]),
    )
    expect(variantHuman?.ability).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          choose: expect.objectContaining({ count: 2 }),
        }),
      ]),
    )
    expect(variantHuman?.feats).toEqual(
      expect.arrayContaining([expect.objectContaining({ any: 1 })]),
    )
    expect(variantHuman?.skillProficiencies).toEqual(
      expect.arrayContaining([expect.objectContaining({ any: 1 })]),
    )
    expect(revisedHuman?.feats).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          anyFromCategory: expect.objectContaining({ category: expect.arrayContaining(['O']) }),
        }),
      ]),
    )
    expect(revisedHuman?.skillProficiencies).toEqual(
      expect.arrayContaining([expect.objectContaining({ any: 1 })]),
    )
    expect(revisedSoldier?.ability).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          choose: expect.objectContaining({
            weighted: expect.objectContaining({ weights: [2, 1] }),
          }),
        }),
      ]),
    )
    expect(revisedSoldier?.feats).toEqual(
      expect.arrayContaining([expect.objectContaining({ 'savage attacker|xphb': true })]),
    )
    expect(arcaneTrickster).toMatchObject({
      casterProgression: expect.stringMatching(/^(?:third|1\/3)$/),
      spellcastingAbility: expect.stringMatching(/int/i),
    })
    expect(eldritchKnight).toMatchObject({
      casterProgression: expect.stringMatching(/^(?:third|1\/3)$/),
      spellcastingAbility: expect.stringMatching(/int/i),
    })
    expect(feats).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Alert', source: 'XPHB', category: 'O' }),
        expect.objectContaining({ name: 'Savage Attacker', source: 'XPHB', category: 'O' }),
      ]),
    )
    expect(legacyCoreItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: '+1 Wand of the War Mage', source: 'DMG' }),
        expect.objectContaining({ name: 'Bag of Holding', source: 'DMG' }),
        expect.objectContaining({ name: 'Potion of Healing', source: 'DMG' }),
        expect.objectContaining({ name: 'Spell Scroll (1st Level)', source: 'DMG' }),
      ]),
    )
    expect(revisedCoreItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: '+1 Wand of the War Mage', source: 'XDMG' }),
        expect.objectContaining({ name: 'Bag of Holding', source: 'XDMG' }),
        expect.objectContaining({ name: 'Potion of Healing', source: 'XDMG' }),
        expect.objectContaining({ name: 'Spell Scroll (Level 1)', source: 'XDMG' }),
      ]),
    )
    expect(
      report.movement.absent +
        report.movement.numeric +
        report.movement.structured +
        report.movement.unsupported,
    ).toBe(report.entities.races)
  })
})
