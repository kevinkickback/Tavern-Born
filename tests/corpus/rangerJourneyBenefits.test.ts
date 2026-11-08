// @vitest-environment jsdom
import { existsSync, readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { parseClassDocument } from '@/lib/5etools/parsers/classes'
import { getCurrentRangerFeatures } from '@/lib/5etools/rangerFeatureSource'
import { getRangerJourneyResources } from '@/lib/5etools/rangerResources'
import { getEarnedSubclassSpellGrants } from '@/lib/5etools/subclassSpells'
import { deriveRangerPassiveEffects } from '@/lib/calculations/rangerPassiveEffects'
import { buildClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import {
  createClassChoiceCatalogs,
  resolveClassChoiceOptions,
} from '@/lib/character/classChoiceOptions'
import { getEffectiveOwnerProficiencyChoices } from '@/lib/character/classProficiencyAuthority'
import { refreshClassProficiencyState } from '@/lib/character/classProficiencySelections'
import { applyClassChoiceSelectionWithGrantsCommand } from '@/lib/character/commands/classChoiceCommands'
import { setHistoricalProficiencySetupCommand } from '@/lib/character/commands/historicalProficiencyCommands'
import { createEmptyCharacter } from '@/lib/character/createCharacter'
import { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import { buildCompanionSheetData } from '@/lib/pdf/companionSheet'
import { addGrant } from '@/lib/provenance/ledger'
import { makeSourceTag } from '@/lib/provenance/sourceLabels'
import type { Class5e, ClassFeature, Creature5e, Language5e } from '@/types/5etools'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeGameDataFixture } from '../fixtures/gameDataFixtures'

const file = 'data/class/class-ranger.json'

test.skipIf(!existsSync(file))(
  'Iron Mind earns the fixed save or its historical alternative',
  () => {
    const parsed = parseClassDocument(JSON.parse(readFileSync(file, 'utf8')))
    const classes = parsed.classes as Class5e[]
    const catalogs = buildClassChoiceFeatureCatalogs({
      classes,
      classFeatures: parsed.classFeatures as ClassFeature[],
    })
    for (const [source, subclassSource] of [
      ['PHB', 'XGE'],
      ['XPHB', 'XPHB'],
    ]) {
      const owner = { name: 'Ranger', source, levels: 7, subclass: 'Gloom Stalker', subclassSource }
      const actor = createEmptyCharacter({
        name: 'Gloom Stalker',
        originSystem: source === 'PHB' ? '2014' : '2024',
        allowedSources: [source, subclassSource],
        classProgression: [owner],
      })
      const beforeGain = { ...actor, classProgression: [{ ...owner, levels: 6 }] }
      expect(
        refreshClassProficiencyState(beforeGain, classes, catalogs).proficiencies.savingThrows,
      ).not.toContain('wisdom')
      expect(
        refreshClassProficiencyState(actor, classes, catalogs).proficiencies.savingThrows,
      ).toContain('wisdom')
      const before = {
        ...actor,
        proficiencies: { ...actor.proficiencies, savingThrows: ['wisdom'] },
        provenance: addGrant(
          actor.provenance,
          'savingThrows',
          'wisdom',
          makeSourceTag('manual', 'Independent', 'choice'),
        ),
      }
      const choice = getEffectiveOwnerProficiencyChoices(before, owner, catalogs).find(
        (row) => row.owner.featureName === 'Iron Mind',
      )
      if (!choice) throw new Error('Missing earned Iron Mind choice')
      expect(choice.level).toBe(7)
      const confirmed = setHistoricalProficiencySetupCommand(
        before,
        before.provenance,
        choice,
        true,
        catalogs,
      )
      const ready = {
        ...before,
        ...confirmed.characterPatch,
        provenance: confirmed.provenanceUpdate,
      }
      const options = resolveClassChoiceOptions(
        choice,
        createClassChoiceCatalogs(catalogs),
        [],
        7,
        ready,
      ).filter((row) => row.availability === 'eligible')
      expect(options.map((option) => option.reference.name.toLowerCase()).sort()).toEqual([
        'charisma',
        'intelligence',
      ])
      const selected = applyClassChoiceSelectionWithGrantsCommand(
        ready,
        ready.provenance,
        choice,
        [options[0].reference],
        { classes, catalogs },
      )
      const saved = characterPersistenceSchema.parse({
        ...ready,
        ...selected.characterPatch,
        provenance: selected.provenanceUpdate,
      })
      expect(saved.classChoiceSelections).toContainEqual(
        expect.objectContaining({
          choiceId: choice.id,
          classLevel: 7,
          proficiencyAtGain: { name: 'wisdom', alreadyProficient: true },
        }),
      )
      expect(saved.proficiencies.savingThrows).toEqual(
        expect.arrayContaining(['wisdom', options[0].reference.name.toLowerCase()]),
      )
    }
  },
)

test.skipIf(!existsSync(file))(
  'Drakewarden prints the fixed companion and earned resource limits',
  () => {
    const parsed = parseClassDocument(JSON.parse(readFileSync(file, 'utf8')))
    const drake = (
      JSON.parse(readFileSync('data/bestiary/bestiary-ftd.json', 'utf8')).monster as Creature5e[]
    ).find((row) => row.name === 'Drake Companion')
    if (!drake) throw new Error('Missing current Drake Companion')
    const data = makeGameDataFixture({
      classes: parsed.classes as Class5e[],
      classFeatures: parsed.classFeatures as ClassFeature[],
      creatures: [drake],
    })
    const catalogs = buildClassChoiceFeatureCatalogs(data)
    const lookups = buildGameDataLookups(data)
    const inputs = {
      ...lookups,
      classChoiceClasses: data.classes,
      classChoiceFeatureCatalogs: catalogs,
    }
    const character = (levels: number, source: string) =>
      createEmptyCharacter({
        name: 'Drakewarden',
        originSystem: source === 'PHB' ? '2014' : '2024',
        allowedSources: [source, 'FTD'],
        classProgression: [
          { name: 'Ranger', source, levels, subclass: 'Drakewarden', subclassSource: 'FTD' },
        ],
      })
    for (const source of ['PHB', 'XPHB']) {
      const sheet = (level: number) =>
        createCharacterSheetViewModel(character(level, source), lookups, inputs)
      expect(sheet(2).companions).toEqual([])
      expect(sheet(3).companions[0]?.creature?.size).toEqual(['S'])
      expect(sheet(7).companions[0]?.creature?.speed).toEqual({ walk: 40, fly: 40 })
      const late = sheet(15)
      expect(late.companions[0]?.creature?.size).toEqual(['L'])
      expect(buildCompanionSheetData(late, late.companions[0])).toMatchObject({
        armorClass: '19',
        maxHp: '80',
        hitDice: '15d10',
        actions: [{ name: 'Bite', bonus: '+8', damage: '1d6 + 5 piercing' }],
      })
      const withoutCreature = {
        ...inputs,
        classChoiceFeatureCatalogs: { ...catalogs, creatures: [] },
      }
      expect(
        createCharacterSheetViewModel(character(15, source), lookups, withoutCreature).companions,
      ).toEqual([])
      const pools = (level: number) =>
        getRangerJourneyResources(
          getCurrentRangerFeatures(character(level, source), catalogs),
          3,
          5,
        )
      expect(pools(10).some((pool) => pool.label === "Drake's Breath")).toBe(false)
      expect(pools(11)).toContainEqual(
        expect.objectContaining({
          label: "Drake's Breath",
          usageText: expect.stringContaining('level 3+'),
          maxPerLevel: [...Array(10).fill(0), ...Array(10).fill(1)],
        }),
      )
    }
  },
)

test.skipIf(!existsSync(file))(
  'Ranger learns the earned skill or language from the source pool',
  () => {
    const parsed = parseClassDocument(JSON.parse(readFileSync(file, 'utf8')))
    const classes = parsed.classes as Class5e[]
    const skills = JSON.parse(readFileSync('resources/srd/core/data/skills.json', 'utf8')).skill
    const languages = JSON.parse(readFileSync('data/languages.json', 'utf8'))
      .language as Language5e[]
    const catalogs = buildClassChoiceFeatureCatalogs({
      classes,
      classFeatures: parsed.classFeatures as ClassFeature[],
      skills,
      languages,
    })
    for (const [source, subclass, subclassSource, domain, selected] of [
      ['PHB', 'Fey Wanderer', 'TCE', 'skills', 'persuasion'],
      ['XPHB', 'Fey Wanderer', 'XPHB', 'skills', 'performance'],
      ['PHB', 'Drakewarden', 'FTD', 'languages', 'dwarvish'],
      ['XPHB', 'Drakewarden', 'FTD', 'languages', 'draconic'],
    ] as const) {
      const owner = { name: 'Ranger', source, levels: 3, subclass, subclassSource }
      const character = createEmptyCharacter({
        name: 'Ranger proficiency journey',
        originSystem: source === 'PHB' ? '2014' : '2024',
        allowedSources: [source, subclassSource],
        classProgression: [owner],
      })
      const choices = getEffectiveOwnerProficiencyChoices(character, owner, catalogs)
      const choice = choices.find(
        (row) => row.owner.type === 'subclass' && row.proficiencyDomain === domain,
      )
      expect(choice).toMatchObject({ level: 3, minimumSelections: 1, maximumSelections: 1 })
      if (!choice) throw new Error('Missing earned Ranger proficiency')
      const options = resolveClassChoiceOptions(
        choice,
        createClassChoiceCatalogs(catalogs),
        [],
        3,
        character,
      )
      const option = options.find((row) => row.reference.name.toLowerCase() === selected)
      expect(option?.availability).toBe('eligible')
      if (!option) throw new Error(`Missing Ranger proficiency option ${selected}`)
      const { characterPatch, provenanceUpdate } = applyClassChoiceSelectionWithGrantsCommand(
        character,
        character.provenance,
        choice,
        [option.reference],
        { classes, catalogs },
      )
      const reopened = characterPersistenceSchema.parse({
        ...character,
        ...characterPatch,
        provenance: provenanceUpdate,
      })
      expect(reopened.provenance.proficiencies[domain][selected]).toContainEqual(
        expect.objectContaining({ grantVariant: choice.id }),
      )
    }
  },
)

test.skipIf(!existsSync(file))(
  'Ranger passive rules follow exact earned source declarations',
  () => {
    const document = JSON.parse(readFileSync(file, 'utf8'))
    const parsed = parseClassDocument(document)
    const catalogs = buildClassChoiceFeatureCatalogs({
      classes: parsed.classes as Class5e[],
      classFeatures: parsed.classFeatures as ClassFeature[],
    })
    const effects = (source: string, levels: number, subclass?: string, subclassSource?: string) =>
      deriveRangerPassiveEffects(
        createEmptyCharacter({
          originSystem: source === 'PHB' ? '2014' : '2024',
          classProgression: [{ name: 'Ranger', source, levels, subclass, subclassSource }],
          movement: { speeds: { walk: 30 }, source: { kind: 'manual', name: 'Movement' } },
        }),
        catalogs,
        3,
        [],
      )
    expect(effects('XPHB', 5)).toEqual([])
    expect(effects('XPHB', 6)).toMatchObject([
      { target: { kind: 'speed', mode: 'walk' }, operation: { kind: 'add', value: 10 } },
      { target: { kind: 'speed', mode: 'climb' }, operation: { kind: 'minimum', value: 40 } },
      { target: { kind: 'speed', mode: 'swim' }, operation: { kind: 'minimum', value: 40 } },
    ])
    expect(effects('XPHB', 18)).toContainEqual(
      expect.objectContaining({
        target: { kind: 'sense', sense: 'blindsight' },
        operation: { kind: 'minimum', value: 30 },
      }),
    )
    for (const source of ['PHB', 'XPHB']) {
      expect(effects(source, 3, 'Gloom Stalker', source === 'PHB' ? 'XGE' : 'XPHB')).toMatchObject([
        { target: { kind: 'initiative' }, operation: { kind: 'add', value: 3 } },
        {
          target: { kind: 'sense', sense: 'darkvision' },
          operation: { kind: 'minimum', value: 60 },
        },
      ])
      expect(effects(source, 3, 'Fey Wanderer', source === 'PHB' ? 'TCE' : 'XPHB')).toMatchObject([
        {
          target: { kind: 'ability-check-modifier', ability: 'charisma' },
          operation: { value: 3 },
        },
      ])
    }
    expect(effects('XPHB', 3, 'Winter Walker', 'FRHoF')).toMatchObject([
      { target: { kind: 'damage-resistance', damageType: 'cold' }, operation: { kind: 'grant' } },
    ])
    expect(effects('XPHB', 6, 'Hollow Warden', 'RHW')).toHaveLength(3)
    expect(effects('XPHB', 7, 'Hollow Warden', 'RHW')).toContainEqual(
      expect.objectContaining({
        target: { kind: 'saving-throw-modifier', ability: 'constitution' },
        operation: { kind: 'add', value: 3 },
      }),
    )
  },
)

test.skipIf(!existsSync(file))(
  'Ranger spell modes and later Fey casting follow their sources',
  () => {
    const document = JSON.parse(readFileSync(file, 'utf8'))
    const spells = (source: string, subclass: string, subclassSource: string, levels: number) => {
      const cls = (parseClassDocument(document).classes as Class5e[]).find(
        (row) => row.name === 'Ranger' && row.source === source,
      )
      return getEarnedSubclassSpellGrants(cls, {
        name: 'Ranger',
        source,
        levels,
        subclass,
        subclassSource,
      })
    }
    expect(spells('XPHB', 'Gloom Stalker', 'XPHB', 3)).toMatchObject([
      { spellName: 'Disguise Self|XPHB', mode: 'prepared' },
    ])
    expect(spells('XPHB', 'Winter Walker', 'FRHoF', 3)).toMatchObject([
      { spellName: 'Ice Knife|XPHB', mode: 'prepared' },
    ])
    expect(spells('XPHB', 'Hollow Warden', 'RHW', 3)).toMatchObject([
      { spellName: 'Wrathful Smite|XPHB', mode: 'prepared' },
    ])
    expect(spells('XPHB', 'Horizon Walker', 'XGE', 5)).toMatchObject([
      {
        spellName: 'protection from evil and good|XPHB',
        mode: 'prepared',
        requiresClassicReprint: true,
      },
      { spellName: 'misty step|XPHB', mode: 'prepared', requiresClassicReprint: true },
    ])
    expect(spells('XPHB', 'Swarmkeeper', 'TCE', 3)).toMatchObject([
      { spellName: 'mage hand|XPHB', mode: 'known', requiresClassicReprint: true },
      { spellName: 'faerie fire|XPHB', mode: 'prepared', requiresClassicReprint: true },
    ])
    expect(spells('XPHB', 'Drakewarden', 'FTD', 3)).toMatchObject([
      { spellName: 'thaumaturgy|XPHB', mode: 'known', requiresClassicReprint: true },
    ])
    expect(spells('PHB', 'Horizon Walker', 'XGE', 7)).toContainEqual(
      expect.objectContaining({
        spellName: 'etherealness|PHB',
        mode: 'cast-only',
        castOnly: { castingTime: 'Bonus Action', duration: 'Until end of current turn' },
      }),
    )
    const inherited = document.subclass.find(
      (row: { name: string; classSource: string }) =>
        row.name === 'Horizon Walker' && row.classSource === 'XPHB',
    )
    inherited.additionalSpells = [{ known: { 3: ['charm person'] } }]
    expect(spells('XPHB', 'Horizon Walker', 'XGE', 7)).toEqual([])
    const at = (source: string, subclassSource: string, levels: number) =>
      spells(source, 'Fey Wanderer', subclassSource, levels)?.find((grant) =>
        grant.spellName.toLowerCase().startsWith('summon fey|'),
      )
    expect(at('PHB', 'TCE', 10)).toBeUndefined()
    expect(at('PHB', 'TCE', 11)).toMatchObject({
      spellName: 'summon fey|tce',
      level: 11,
      mode: 'known',
      feature: { name: 'Fey Reinforcements', castingNote: expect.stringContaining('slot-free') },
    })
    expect(at('XPHB', 'XPHB', 10)).toMatchObject({
      level: 9,
      mode: 'prepared',
      feature: { name: 'Fey Wanderer Spells' },
    })
    expect(at('XPHB', 'XPHB', 11)).toMatchObject({
      level: 9,
      mode: 'prepared',
      feature: { name: 'Fey Reinforcements', castingNote: expect.stringContaining('slot-free') },
    })
    const feature = document.subclassFeature.find(
      (row: { name: string; source: string }) =>
        row.name === 'Fey Reinforcements' && row.source === 'XPHB',
    )
    feature.entries[0] = feature.entries[0].replace('cast it once', 'cast it twice')
    expect(at('XPHB', 'XPHB', 11)).toMatchObject({
      level: 9,
      mode: 'prepared',
      feature: {
        name: 'Fey Reinforcements',
        castingNote: expect.stringContaining('2 slot-free casts'),
      },
    })
  },
)

test.skipIf(!existsSync(file))(
  'revised Fey Wanderer earns prepared spells at the agreed source levels',
  () => {
    const document = JSON.parse(readFileSync(file, 'utf8'))
    const spells = (levels: number) => {
      const cls = (parseClassDocument(document).classes as Class5e[]).find(
        (row) => row.name === 'Ranger' && row.source === 'XPHB',
      )
      return getEarnedSubclassSpellGrants(cls, {
        name: 'Ranger',
        source: 'XPHB',
        levels,
        subclass: 'Fey Wanderer',
        subclassSource: 'XPHB',
      })
    }
    expect(spells(2)).toEqual([])
    expect(spells(3)).toMatchObject([
      { spellName: 'Charm Person|XPHB', level: 3, mode: 'prepared' },
    ])
    const root = document.subclass.find(
      (row: { name: string; source: string }) =>
        row.name === 'Fey Wanderer' && row.source === 'XPHB',
    )
    const table = document.subclassFeature.find(
      (row: { name: string; source: string }) =>
        row.name === 'Fey Wanderer Spells' && row.source === 'XPHB',
    ).entries[1]
    const block = root.additionalSpells[0]
    const first = block.known[3]
    block.known[3] = { ritual: first }
    expect(spells(3)).toEqual([])
    block.known[3] = first
    block.ability = 'int'
    expect(spells(3)).toEqual([])
    delete block.ability
    root.additionalSpells[0].known[6] = root.additionalSpells[0].known[5]
    delete root.additionalSpells[0].known[5]
    expect(spells(6)).toEqual([])
    table.rows[1][0] = '6th'
    expect(spells(5)).toHaveLength(1)
    expect(spells(6)?.[1]).toMatchObject({
      spellName: 'Misty Step|XPHB',
      level: 6,
      mode: 'prepared',
    })
  },
)
