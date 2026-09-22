import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createCorpusCapabilityReport } from '@/lib/5etools/capabilityReport'
import {
  createClassChoiceCoverageMatrix,
  findClassChoiceCoverageGaps,
  getPrimaryClassSourceForEdition,
  getSrdClassCohort,
} from '@/lib/5etools/classChoiceCoverage'
import { findLayerDependencyIssues } from '@/lib/5etools/contentLayers'
import {
  parseBackgrounds,
  parseClasses,
  parseCreatures,
  parseFeats,
  parseItems,
  parseMagicVariants,
  parseOptionalFeatures,
  parseRaces,
} from '@/lib/5etools/parsers'
import { filterCharacterItems } from '@/lib/5etools/playerItemAvailability'
import { CORE_RULES_METADATA } from '@/lib/5etools/rulesetMetadata'
import { buildCompendiumEntries, filterCompendiumEntries } from '@/lib/compendiumEntries'
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
    expect(report.issues).toEqual([])
    expect(layerDependencyIssues).toEqual([])
    expect(primaryEditionClasses.length).toBeGreaterThan(0)
    expect(srd52Classes.length).toBeGreaterThan(0)
    expect(choiceCoverage.every((row) => row.levels.length === maximumLevel)).toBe(true)
    expect(choiceCoverageGaps).toEqual([])
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
