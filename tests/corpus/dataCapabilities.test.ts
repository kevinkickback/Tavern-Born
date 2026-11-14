// @vitest-environment jsdom
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PDFDocument } from '@cantoo/pdf-lib'
import { clear, get } from 'idb-keyval'
import { beforeAll, describe, expect, it, vi } from 'vitest'
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
import { parseConditions, parseTrapHazards } from '@/lib/5etools/parsers'
import { filterCharacterItems } from '@/lib/5etools/playerItemAvailability'
import { CORE_RULES_METADATA } from '@/lib/5etools/rulesetMetadata'
import { isSelectableEquipmentItem } from '@/lib/calculations/itemClassification'
import { addManualEquipmentBatchCommand } from '@/lib/character/commands/equipmentCommands'
import { buildCompendiumEntries, filterCompendiumEntries } from '@/lib/compendiumEntries'
import { renderEntriesToText } from '@/lib/entryText'
import { buildItemDetailFields } from '@/lib/itemDetailFields'
import { normalizeSelectableAllowedSources } from '@/lib/sourceCompatibility'
import { useCharacterStore } from '@/store/characterStore'
import type { GameData, Item5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import {
  createCurrentCharacterSheetViewModel,
  generateTestCharacterSheet,
} from '../fixtures/pdfTemplates'

const DATA_ROOT = resolve(process.cwd(), 'data')

vi.unmock('@/lib/storage/idb-storage')

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function collection(payload: unknown, field: string): unknown[] {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return []
  const value = (payload as Record<string, unknown>)[field]
  return Array.isArray(value) ? value : []
}

async function saveAndReopenEquipment(
  items: Item5e[],
  originSystem: Character['originSystem'],
  equippedName?: string,
) {
  await clear()
  await useCharacterStore.persist.rehydrate()
  const character = await useCharacterStore
    .getState()
    .addCharacter(makeCharacterFixture({ originSystem, equipment: [] }))
  const { characterPatch, provenanceUpdate } = addManualEquipmentBatchCommand(
    character,
    character.provenance,
    items,
  )
  useCharacterStore.getState().setActiveCharacter(character.id)
  useCharacterStore.getState().updateCharacter(character.id, {
    ...characterPatch,
    equipment: characterPatch.equipment?.map((item) =>
      item.name === equippedName ? { ...item, equipped: true } : item,
    ),
    provenance: provenanceUpdate,
  })
  await useCharacterStore.getState().saveActiveCharacter()
  const stored = await get<{ state: { characters: Character[] } }>('character-storage')
  const saved = characterPersistenceSchema.parse(
    stored?.state.characters.find((row) => row.id === character.id),
  )
  useCharacterStore.getState().setActiveCharacter(null)
  await useCharacterStore.persist.rehydrate()
  useCharacterStore.getState().setActiveCharacter(character.id)
  expect(useCharacterStore.getState().activeCharacter).toEqual(saved)
  return saved
}

describe.runIf(existsSync(DATA_ROOT))('configured 5etools corpus capabilities', () => {
  let gameData: GameData
  const failures: string[] = []
  beforeAll(async () => {
    gameData = await loadGameDataSourceStack(
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
        baseReader: {
          type: 'bundled',
          readJson: async (file) => readJson(resolve('resources/srd/data', file)),
        },
        additionalReader: {
          type: 'local',
          readJson: async (file) => readJson(resolve(DATA_ROOT, file)),
        },
        onResourceFailure: (file) => {
          failures.push(file)
        },
      },
    )
  })
  it('materializes the pinned public resistance armor pairs as exact inventory items', () => {
    const names = [
      'Breastplate',
      'Chain Mail',
      'Chain Shirt',
      'Half Plate Armor',
      'Hide Armor',
      'Leather Armor',
      'Padded Armor',
      'Plate Armor',
      'Ring Mail',
      'Scale Mail',
      'Splint Armor',
      'Studded Leather Armor',
    ]
    const damageTypes = [
      'Acid',
      'Cold',
      'Fire',
      'Force',
      'Lightning',
      'Necrotic',
      'Poison',
      'Psychic',
      'Radiant',
      'Thunder',
    ]
    const expected = ['DMG', 'XDMG']
      .flatMap((source) =>
        names.flatMap((base) =>
          damageTypes.map((damage) => `${base} of ${damage} Resistance|${source}`),
        ),
      )
      .sort()
    const actual = gameData.items.filter((item) =>
      /^Armor of .+ Resistance$/.test(item.magicVariantGenerated?.template.name ?? ''),
    )
    expect(actual.map((item) => `${item.name}|${item.source}`).sort()).toEqual(expected)
    expect(gameData.resistanceArmorDiagnostics).toEqual([])
    for (const item of actual) {
      const damageType = /^.+ of (\w+) Resistance$/.exec(item.name)?.[1].toLowerCase()
      expect(isSelectableEquipmentItem(item)).toBe(true)
      expect(item.resist).toEqual([damageType])
      expect(item.reqAttune).toBe(true)
      expect(item.itemEntryDiagnostics).toBeUndefined()
      expect(renderEntriesToText(getItemRulesEntries(item))).toContain(`${damageType} damage`)
    }
  })
  it('verifies all 32 material armor variants through inventory, reopen, details and PDF output', async () => {
    const names = [
      'Breastplate',
      'Chain Mail',
      'Chain Shirt',
      'Half Plate Armor',
      'Plate Armor',
      'Ring Mail',
      'Scale Mail',
      'Splint Armor',
    ]
    const expected = ['DMG', 'XDMG']
      .flatMap((source) =>
        ['Mithral', 'Adamantine'].flatMap((material) =>
          names.map((name) => `${material} ${name}|${source}`),
        ),
      )
      .sort()
    const actual = gameData.items.filter((item) =>
      /^(Mithral|Adamantine) Armor$/.test(item.magicVariantGenerated?.template.name ?? ''),
    )
    expect(actual.map((item) => `${item.name}|${item.source}`).sort()).toEqual(expected)
    for (const item of actual) {
      expect(isSelectableEquipmentItem(item)).toBe(true)
      expect(item.magicVariantGenerated?.base.source).toBe(item.source === 'DMG' ? 'PHB' : 'XPHB')
      const base = gameData.itemsBase.find(
        (row) =>
          row.name === item.magicVariantGenerated?.base.name &&
          row.source === item.magicVariantGenerated?.base.source,
      )!
      expect([item.type, item.ac, item.weight]).toEqual([base.type, base.ac, base.weight])
      const mithral = item.magicVariantGenerated?.template.name === 'Mithral Armor'
      expect(item.strength).toBe(mithral ? null : base.strength)
      expect(item.stealth).toBe(mithral ? false : base.stealth)
      expect(renderEntriesToText(getItemRulesEntries(item))).toMatch(
        mithral ? /mithral is a light, flexible metal/i : /critical hit.*becomes a normal hit/i,
      )
    }
    expect(gameData.materialArmorDiagnostics).toEqual([])
    for (const source of ['DMG', 'XDMG']) {
      const items = actual.filter((item) => item.source === source)
      const originSystem = source === 'DMG' ? '2014' : '2024'
      const saved = await saveAndReopenEquipment(items, originSystem)
      expect(saved.equipment).toHaveLength(16)
      const lookup = gameData.lookups!
      for (const [index, equipment] of saved.equipment.entries()) {
        const item = items[index]
        const base = gameData.itemsBase.find(
          (row) =>
            row.name === item.magicVariantGenerated?.base.name &&
            row.source === item.magicVariantGenerated?.base.source,
        )!
        expect(equipment).toMatchObject({
          name: item.name,
          source,
          ac: base.ac,
          weight: base.weight,
        })
        const current = lookup.itemLookup.get(
          `${equipment.name.toLowerCase()}|${source.toLowerCase()}`,
        )
        expect(current).toBe(item)
        const facts = buildItemDetailFields(equipment, current, {})
        expect(facts).toContainEqual({ label: 'Armor Class', value: base.ac })
        expect(facts.some((field) => field.label === 'Strength')).toBe(Boolean(item.strength))
        expect(facts.some((field) => field.label === 'Stealth')).toBe(Boolean(item.stealth))
      }
      const view = createCurrentCharacterSheetViewModel(saved, lookup)
      expect(view.magicItems).toHaveLength(items.length)
      for (const [index, row] of view.magicItems.entries()) {
        expect(row.description).toContain(renderEntriesToText(items[index].entries))
      }
      const form = (
        await PDFDocument.load(
          await generateTestCharacterSheet(
            view,
            source === 'DMG' ? '2014-custom' : '2024-official',
            { pages: { notes: false, spells: false } },
          ),
        )
      ).getForm()
      const printed =
        source === 'DMG'
          ? items
              .map((_, index) => form.getTextField(`Adventuring Gear Row ${index + 1}`).getText())
              .join('\n')
          : form.getTextField('Text_90').getText()
      for (const item of items) expect(printed).toContain(item.name)
    }
    await clear()
  }, 30_000)
  it('verifies all 77 additional armor variants through inventory, reopen, details and exports', async () => {
    const mithralBases = [
      'Breastplate',
      'Chain Mail',
      'Chain Shirt',
      'Half Plate Armor',
      'Plate Armor',
      'Ring Mail',
      'Scale Mail',
      'Splint Armor',
    ]
    const mediumAndHeavy = [...mithralBases, 'Hide Armor']
    const all = [...mediumAndHeavy, 'Leather Armor', 'Padded Armor', 'Studded Leather Armor']
    const templates = [
      ['Armor of Gleaming', 'XGE', mediumAndHeavy, '', ' of Gleaming', /never gets dirty/i],
      ['Armor of Gleaming', 'XDMG', all, '', ' of Gleaming', /never gets dirty/i],
      ['Cast-Off Armor', 'XGE', all, 'Cast-Off ', '', /doff this armor as an action/i],
      ['Cast-Off Armor', 'XDMG', all, 'Cast-Off ', '', /doff this armor as a Magic action/i],
      ['Smoldering Armor', 'XGE', all, 'Smoldering ', '', /harmless, odorless smoke/i],
      ['Smoldering Armor', 'XDMG', all, 'Smoldering ', '', /harmless, odorless smoke/i],
      ['Mithral +1 Armor', 'AI', mithralBases, 'Mithral +1 ', '', /\+1 bonus to AC/i],
    ] as const
    const lookup = gameData.lookups!
    const targets = new Set<string>(templates.map(([template]) => template))
    const allGenerated = gameData.items.filter((item) =>
      targets.has(item.magicVariantGenerated?.template.name ?? ''),
    )
    expect(allGenerated).toHaveLength(77)
    const classicSources = normalizeSelectableAllowedSources(
      ['AI', 'XGE', 'XPHB', 'XDMG'],
      '2014',
      gameData.sources,
    )
    expect(classicSources).toEqual(['AI', 'XGE'])
    const classicItems = filterCharacterItems(gameData.items, {
      originSystem: '2014',
      allowedSources: classicSources,
    })
    expect(classicItems).toContainEqual(
      expect.objectContaining({ name: 'Coin of Decisionry', source: 'AI' }),
    )
    for (const [template, source, bases, prefix, suffix, authoredRule] of templates) {
      const classic = source === 'XGE'
      const baseSource = classic ? 'PHB' : 'XPHB'
      const originSystem = classic ? '2014' : '2024'
      const items = allGenerated.filter(
        (item) => item.magicVariantGenerated?.template.name === template && item.source === source,
      )
      const expected = bases.map((base) => `${prefix}${base}${suffix}`)
      expect(items.map((item) => item.name).sort()).toEqual(expected.sort())
      expect(filterCharacterItems(items, { originSystem, allowedSources: [baseSource] })).toEqual(
        [],
      )
      expect(
        filterCharacterItems(items, { originSystem, allowedSources: [baseSource, source] }),
      ).toEqual(items)
      const saved = await saveAndReopenEquipment(
        items,
        originSystem,
        source === 'AI' ? 'Mithral +1 Plate Armor' : undefined,
      )
      expect(saved.equipment).toHaveLength(bases.length)
      for (const [index, equipment] of saved.equipment.entries()) {
        const item = items[index]
        const baseName = item.name.slice(prefix.length, item.name.length - suffix.length)
        const base = lookup.itemLookup.get(`${baseName.toLowerCase()}|${baseSource.toLowerCase()}`)!
        expect(item.magicVariantGenerated).toEqual({
          template: { name: template, source },
          base: { name: baseName, source: baseSource },
        })
        expect(item.genericVariant).toEqual({ name: template, source })
        expect(item.edition).toBe(classic ? 'classic' : 'one')
        expect(isSelectableEquipmentItem(item)).toBe(true)
        expect(item.reprintedAs).toBeUndefined()
        expect([item.type, item.ac, item.weight]).toEqual([base.type, base.ac, base.weight])
        expect(item.bonusAc).toBe(source === 'AI' ? '+1' : undefined)
        expect(item.strength).toBe(source === 'AI' ? null : base.strength)
        expect(item.stealth).toBe(source === 'AI' ? false : base.stealth)
        expect(equipment).toMatchObject({
          name: item.name,
          source,
          ac: base.ac,
          weight: base.weight,
        })
        const current = lookup.itemLookup.get(
          `${equipment.name.toLowerCase()}|${source.toLowerCase()}`,
        )
        expect(current).toBe(item)
        const facts = buildItemDetailFields(equipment, current, {})
        expect(facts).toContainEqual({ label: 'Armor Class', value: base.ac })
        expect(facts.some((field) => field.label === 'Strength')).toBe(Boolean(item.strength))
        expect(facts.some((field) => field.label === 'Stealth')).toBe(Boolean(item.stealth))
        expect(renderEntriesToText(getItemRulesEntries(current))).toMatch(authoredRule)
      }
      const view = createCurrentCharacterSheetViewModel(saved, lookup)
      expect(view.magicItems).toHaveLength(items.length)
      for (const row of view.magicItems) expect(row.description).toMatch(authoredRule)
      const bytes = await generateTestCharacterSheet(
        view,
        classic ? '2014-custom' : '2024-official',
        {
          pages: { notes: false, spells: false },
        },
      )
      const form = (await PDFDocument.load(bytes)).getForm()
      const printed = classic
        ? items.map((_, index) => form.getTextField(`Adventuring Gear Row ${index + 1}`).getText())
        : form.getTextField('Text_90').getText()?.split('\n')
      expect(printed).toEqual(items.map((item) => item.name))
      if (source === 'AI') expect(form.getTextField('Text_8').getText()).toBe('19')
      if (classic)
        expect(form.getTextField('Extra.Magic Item Description 1').getText()).toMatch(authoredRule)
    }
    await clear()
  }, 60_000)
  it('loads the bundled and managed source stack with the four fixed equipment families', () => {
    expect(failures).toEqual([])
    expect(findLayerDependencyIssues(gameData, gameData)).toEqual([])
    expect(gameData.magicVariants).toHaveLength(230)
    const generated = gameData.items.filter((item) => item.magicVariantGenerated)
    const weapons = generated.filter((item) =>
      item.magicVariantGenerated?.template.name.endsWith(' Weapon'),
    )
    expect(
      generated
        .filter((item) => item.magicVariantGenerated?.base.name === 'Shield')
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
    for (const bonus of ['+1', '+2', '+3']) {
      expect(
        weapons.filter((item) => item.bonusWeapon === bonus && item.source === 'DMG'),
      ).toHaveLength(36)
      expect(
        weapons.filter((item) => item.bonusWeapon === bonus && item.source === 'XDMG'),
      ).toHaveLength(38)
      for (const source of ['DMG', 'XDMG'])
        expect(
          generated.filter(
            (item) =>
              item.bonusAc === bonus &&
              item.source === source &&
              item.magicVariantGenerated?.base.name !== 'Shield',
          ),
        ).toHaveLength(12)
    }
    const ammunition = generated.filter((item) =>
      item.magicVariantGenerated?.template.name.endsWith(' Ammunition'),
    )
    for (const bonus of ['+1', '+2', '+3']) {
      expect(
        ammunition.filter((item) => item.bonusWeapon === bonus && item.source === 'DMG'),
      ).toHaveLength(4)
      expect(
        ammunition.filter((item) => item.bonusWeapon === bonus && item.source === 'XDMG'),
      ).toHaveLength(5)
    }
    expect(generated.filter((item) => /^\+[123] /.test(item.name))).toHaveLength(327)
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
    const { classes, races, backgrounds, feats, items } = gameData
    const legacyCoreItems = filterCharacterItems(items, {
      allowedSources: ['PHB'],
      originSystem: '2014',
    })
    const revisedCoreItems = filterCharacterItems(items, {
      allowedSources: ['XPHB'],
      originSystem: '2024',
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
    const setupIssues = report.issues.filter((issue) => issue.code === 'choice-diagnostic')
    // Mystic base and order-bonus setup now have source-qualified selectors; absence of
    // diagnostics here is structural coverage, not complete legal progression qualification.
    expect(setupIssues).toEqual([])
    expect(report.issues.filter((issue) => issue.code !== 'choice-diagnostic')).toEqual([])
    expect(layerDependencyIssues).toEqual([])
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
