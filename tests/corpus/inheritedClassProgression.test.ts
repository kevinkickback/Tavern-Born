import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { beforeAll, describe, expect, test } from 'vitest'
import { getClassSpellProfilePolicy } from '@/lib/5etools/classCastingRules'
import { getCurrentClassCastingProducer } from '@/lib/5etools/classCastingSource'
import { getRequiredChoiceSelectionCount } from '@/lib/5etools/classChoiceNormalization'
import { composeGameDataLayers } from '@/lib/5etools/contentLayers'
import { FiveEToolsDataLoader } from '@/lib/5etools/dataLoader'
import { DataFilter } from '@/lib/5etools/filters'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { getEarnedSubclassSpellGrants } from '@/lib/5etools/subclassSpells'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import {
  buildClassChoiceFeatureCatalogs,
  createClassChoiceCatalogs,
  resolveClassChoiceOptions,
} from '@/lib/character/classChoiceOptions'
import { applyClassChoiceSelectionWithGrantsCommand } from '@/lib/character/commands/classChoiceCommands'
import {
  applyClassSelectionCommand,
  applyLevelDown,
  applyLevelUp,
  selectSubclass,
} from '@/lib/character/commands/classCommands'
import type { CharacterCommandResult } from '@/lib/character/commands/commandResult'
import { setDailyClassSpellPreparedCommand } from '@/lib/character/commands/dailyClassSpellCommands'
import { setManagedClassSpellChoicesCommand } from '@/lib/character/commands/managedClassSpellCommands'
import { getManagedClassSpellSlots } from '@/lib/character/managedClassSpellSlots'
import {
  getManagedClassSpellPool,
  projectManagedClassSpellState,
} from '@/lib/character/managedClassSpells'
import { getRevisedClassFeatSlot } from '@/lib/character/revisedClassFeatSlot'
import { getSelectedFeatureCantripSlots } from '@/lib/character/selectedFeatureSpells'
import type { GameData } from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import type { ManagedClassSpellSlot } from '@/types/classCasting'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

const sources = ['XPHB', 'WoW']
const available = [
  'class/class-deathknight.json',
  'class/class-warlock.json',
  'generated/gendata-spell-source-lookup.json',
].every((path) => existsSync(`data/${path}`))
const reopen = (character: Character, result: CharacterCommandResult) =>
  characterPersistenceSchema.parse(
    JSON.parse(
      JSON.stringify({
        ...character,
        ...result.characterPatch,
        provenance: result.provenanceUpdate,
      }),
    ),
  )

describe.runIf(available)('configured inherited class progression', () => {
  let data: GameData
  let lookups: ReturnType<typeof buildGameDataLookups>
  let catalogs: ReturnType<typeof buildClassChoiceFeatureCatalogs>

  beforeAll(async () => {
    const layer = await new FiveEToolsDataLoader(
      { type: 'local', path: 'data', isValid: true },
      {
        type: 'local',
        readJson: async (file) => JSON.parse(await readFile(`data/${file}`, 'utf8')),
      },
    ).loadAllData()
    data = composeGameDataLayers([layer])
    lookups = buildGameDataLookups(data)
    catalogs = buildClassChoiceFeatureCatalogs(data)
  }, 45_000)

  const classRow = (name: string) =>
    data.classes.find((row) => row.name === name && row.source === 'WoW')!
  const spellContext = (character: Character) => ({
    catalogs,
    spellsByKey: lookups.spellsByKey,
    abilityScores: character.abilityScores,
  })
  const calculation = (character: Character) =>
    createCharacterCalculationContext(character, {
      ...lookups,
      classChoiceClasses: data.classes,
      classChoiceFeatureCatalogs: catalogs,
    })
  const start = (name: string) => {
    const character = makeCharacterFixture({
      originSystem: '2024',
      allowedSources: sources,
      classProgression: [],
      initialClass: undefined,
    })
    return reopen(
      character,
      applyClassSelectionCommand(
        character,
        character.provenance,
        classRow(name),
        undefined,
        lookups.itemLookup,
        { classChoiceFeatureCatalogs: catalogs },
      ),
    )
  }
  const levelUp = (character: Character, hitDie: number) => {
    const [entry] = character.classProgression
    return reopen(
      character,
      applyLevelUp(
        character,
        character.provenance,
        [{ ...entry, levels: entry.levels + 1 }],
        {
          className: entry.name,
          classSource: entry.source,
          classLevel: entry.levels + 1,
          hitDie,
          dieResult: hitDie / 2 + 1,
          method: 'average',
        },
        calculation(character),
      ),
    )
  }

  test('Death Knight earns weapon mastery, daily preparation and Fighting Style at the source levels', () => {
    let character = start('Death Knight')
    const cls = classRow('Death Knight')
    const choices = cls.normalizedRules!.choices
    const mastery = choices.find((choice) => choice.label === 'Weapon Mastery')!
    const fightingStyle = choices.find((choice) => choice.label === 'Fighting Style')!
    const currentOptions = (choice: typeof mastery) =>
      resolveClassChoiceOptions(
        choice,
        { ...createClassChoiceCatalogs(catalogs), feats: data.feats },
        [],
        character.classProgression[0].levels,
        character,
      )
    const choose = (choice: typeof mastery, names: string[]) => {
      const options = names.map(
        (name) =>
          currentOptions(choice).find(
            (row) =>
              row.reference.name === name &&
              row.reference.source === 'XPHB' &&
              row.availability === 'eligible',
          )!.reference,
      )
      return reopen(
        character,
        applyClassChoiceSelectionWithGrantsCommand(
          character,
          character.provenance,
          choice,
          options,
          {
            classes: data.classes,
            catalogs,
            feats: data.feats,
            spellContext: spellContext(character),
          },
        ),
      )
    }
    expect(getRequiredChoiceSelectionCount(mastery, 1)).toBe(2)
    character = choose(mastery, ['Longsword', 'Javelin'])
    expect(character.classChoiceSelections?.[0]).toMatchObject({
      className: 'Death Knight',
      classSource: 'WoW',
    })
    expect(calculation(character).classCasting.slots.shared[1]?.max).toBe(2)
    const prepare = (spell: string) =>
      setDailyClassSpellPreparedCommand(
        character,
        character.provenance,
        'class:Death Knight|WoW',
        spell,
        true,
        spellContext(character),
      )
    character = reopen(character, prepare('Heroism|XPHB'))
    expect(() => prepare('Consecration|WoW')).toThrow()
    expect(
      projectManagedClassSpellState(character, spellContext(character)).dailyStatuses,
    ).toContainEqual(expect.objectContaining({ profileId: 'class:Death Knight|WoW', active: true }))
    character = levelUp(character, 10)
    expect(getRequiredChoiceSelectionCount(fightingStyle, 2)).toBe(1)
    const unlinked = createClassChoiceCatalogs({
      ...catalogs,
      classes: data.classes.map((row) => (row === cls ? { ...row, classFeatures: [] } : row)),
    })
    const alternative = {
      ...fightingStyle,
      options: [{ entityType: 'feat' as const, name: 'Defense', source: 'XPHB' }],
    }
    for (const choice of [mastery, fightingStyle, alternative]) {
      const result = resolveClassChoiceOptions(
        choice,
        { ...unlinked, feats: data.feats },
        [],
        2,
        character,
      )
      expect(result.some((option) => option.availability === 'eligible')).toBe(false)
    }
    const defense = currentOptions(fightingStyle).find(
      (row) => row.reference.name === 'Defense' && row.reference.source === 'XPHB',
    )
    expect(defense).toBeDefined()
    expect(defense?.prerequisite).toBeUndefined()
    character = choose(fightingStyle, ['Blessed Warrior'])
    const bonus = getSelectedFeatureCantripSlots(character, catalogs)
    expect(bonus).toHaveLength(2)
    character = reopen(
      character,
      setManagedClassSpellChoicesCommand(
        character,
        character.provenance,
        bonus.map((slot, index) => ({
          slot,
          expected: null,
          expectedEmptyRevision: 0,
          target: { name: index ? 'Resistance' : 'Guidance', source: 'XPHB' },
          policy: 'default',
        })),
        spellContext(character),
      ),
    )
    expect(
      projectManagedClassSpellState(character, spellContext(character)).statuses.map((row) => [
        row.choice.slot[0],
        row.active,
      ]),
    ).toEqual([
      [['class', 'death knight', 'wow'], true],
      [['class', 'death knight', 'wow'], true],
    ])
    expect(character.classChoiceSelections?.map((row) => row.classSource)).toEqual(['WoW', 'WoW'])
    character = levelUp(character, 10)
    const oath = cls.subclasses!.find((row) => row.name === 'Oath of the Ebon Blade')!
    character = reopen(
      character,
      selectSubclass(character, character.provenance, oath.name, oath.source, undefined, {
        classChoiceFeatureCatalogs: catalogs,
      }),
    )
    expect(getEarnedSubclassSpellGrants(cls, character.classProgression[0])).toEqual([])
    character = levelUp(character, 10)
    const featRequest = { name: 'Death Knight', source: 'WoW', level: 4 }
    expect(getRevisedClassFeatSlot(character, featRequest, catalogs)).toMatchObject({
      openFeatCategories: true,
      hasSpellcastingFeature: true,
    })
    expect(
      getRevisedClassFeatSlot(character, featRequest, {
        ...catalogs,
        classCastingSources: catalogs.classCastingSources?.filter(
          (row) => row.kind !== 'casting-copy',
        ),
      })?.hasSpellcastingFeature,
    ).toBeUndefined()
  }, 25_000)

  test('Warlock earns Pact Magic and Mystic Arcanum with its own list, profile and inverse', () => {
    let character: Character = start('Warlock')
    const slots = () =>
      getManagedClassSpellSlots(character.classProgression[0], character, catalogs)
    const choose = (earned: ManagedClassSpellSlot[], names: string[]) =>
      reopen(
        character,
        setManagedClassSpellChoicesCommand(
          character,
          character.provenance,
          earned.map((slot, index) => ({
            slot,
            expected: null,
            expectedEmptyRevision: character.managedClassSpellRevision ?? 0,
            target: { name: names[index], source: 'XPHB' },
            policy: 'default',
          })),
          spellContext(character),
        ),
      )
    const first = slots()
    expect(first.map((slot) => [slot[0], slot[1]])).toEqual([
      [['class', 'warlock', 'wow'], 'class-cantrip'],
      [['class', 'warlock', 'wow'], 'class-cantrip'],
      [['class', 'warlock', 'wow'], 'class-known'],
      [['class', 'warlock', 'wow'], 'class-known'],
    ])
    expect(calculation(character).classCasting.slots.pact[1]?.max).toBe(1)
    character = choose(first, ['Eldritch Blast', 'Mage Hand', 'Hex', 'Armor of Agathys'])
    character = levelUp(character, 8)
    expect(calculation(character).classCasting.slots.pact[1]?.max).toBe(2)
    character = choose(
      slots().filter((slot) => slot[3] === 2),
      ['Witch Bolt'],
    )
    expect(
      projectManagedClassSpellState(character, spellContext(character)).statuses.every(
        (row) => row.active,
      ),
    ).toBe(true)
    const lost = {
      ...spellContext(character),
      catalogs: {
        ...catalogs,
        classCastingSources: catalogs.classCastingSources?.filter(
          (row) => row.kind !== 'casting-copy',
        ),
      },
    }
    expect(
      projectManagedClassSpellState(character, lost).statuses.every((row) => !row.active),
    ).toBe(true)
    expect(character.managedClassSpellChoices).toHaveLength(5)
    character = reopen(
      character,
      applyLevelDown(character, character.provenance, calculation(character)),
    )
    expect(character.managedClassSpellChoices).toHaveLength(4)

    const veteran = makeCharacterFixture({
      originSystem: '2024',
      allowedSources: sources,
      classProgression: [{ name: 'Warlock', source: 'WoW', levels: 11 }],
    })
    const arcanum = getManagedClassSpellSlots(veteran.classProgression[0]).find(
      (slot) => slot[1] === 'class-arcanum',
    )!
    const pool = getManagedClassSpellPool(veteran, arcanum, spellContext(veteran))
    expect(pool.spells.length).toBeGreaterThan(0)
    expect(new Set(pool.spells.map((spell) => spell.level))).toEqual(new Set([6]))
    expect(calculation(veteran).classCasting.slots.pact[5]?.max).toBe(3)
    character = veteran
    expect(() => choose([arcanum], ['Mass Suggestion'])).toThrow(/spell list/)
    character = choose([arcanum], ['Circle of Death'])
    expect(character.managedClassSpellChoices?.[0]).toMatchObject({
      slot: [['class', 'warlock', 'wow'], 'class-arcanum', arcanum[2], 11, 0],
      target: { name: 'Circle of Death', source: 'XPHB' },
    })
  }, 30_000)

  test('casting authority requires the current selected copy and exact retained declaration', () => {
    const cls = classRow('Warlock')
    const { owner, rule } = getClassSpellProfilePolicy({
      name: cls.name,
      source: cls.source,
      levels: 1,
    })
    const target = rule!.declaration.target
    const current = (source = catalogs) => getCurrentClassCastingProducer(source, owner, target, 1)
    expect(current()?.effective.source).toBe('WoW')
    for (const broken of [
      { ...cls, classFeatures: [] },
      { ...cls, classFeatureRefs: [] },
      { ...cls, spellcastingAbility: 'wis' },
      { ...cls, sourceIdentityConflict: true as const },
      {
        ...cls,
        classFeatureRefs: [
          ...cls.classFeatureRefs!,
          {
            ref: 'Pact Magic|Warlock|PHB|1',
            name: 'Pact Magic',
            className: 'Warlock',
            source: 'PHB',
            classSource: 'PHB',
            level: 1,
          },
        ],
      },
    ]) {
      expect(
        current({ ...catalogs, classes: data.classes.map((row) => (row === cls ? broken : row)) }),
      ).toBeUndefined()
    }
    expect(
      getClassSpellProfilePolicy({ name: 'Demon Hunter', source: 'WoW', levels: 1 }).rule,
    ).toBeUndefined()
    const warrior = classRow('Warrior').normalizedRules!.choices.find(
      (choice) => choice.label === 'Weapon Mastery',
    )!
    expect(getRequiredChoiceSelectionCount(warrior, 4)).toBe(4)
    expect(
      resolveClassChoiceOptions(warrior, createClassChoiceCatalogs(catalogs), [], 4).length,
    ).toBeGreaterThan(4)
  })

  test('source filters cannot hide a competing casting declaration on a copied class', async () => {
    const layer = await new FiveEToolsDataLoader(
      { type: 'local', path: 'data', isValid: true, availableResources: ['class/index.json'] },
      {
        type: 'local',
        readJson: async (file) => {
          const document = JSON.parse(await readFile(`data/${file}`, 'utf8'))
          if (file === 'class/class-warlock.json') {
            const copy = document.class.find((row: { source: string }) => row.source === 'WoW')
            const parent = document.class.find((row: { source: string }) => row.source === 'XPHB')
            copy.classFeatures = [...parent.classFeatures, 'Pact Magic|Warlock|PHB|1']
          }
          return document
        },
      },
    ).loadAllData()
    const loaded = composeGameDataLayers([layer])
    const filtered = buildClassChoiceFeatureCatalogs({
      ...loaded,
      classes: DataFilter.filterClasses(loaded.classes, { sources }),
    })
    const { owner, rule } = getClassSpellProfilePolicy({
      name: 'Warlock',
      source: 'WoW',
      levels: 1,
    })
    const copy = filtered.classes!.find((row) => row.name === 'Warlock' && row.source === 'WoW')
    expect(copy?.classFeatureRefs?.filter((ref) => ref.name === 'Pact Magic')).toHaveLength(1)
    expect(
      getCurrentClassCastingProducer(filtered, owner, rule!.declaration.target, 1),
    ).toBeUndefined()
    expect(
      getCurrentClassCastingProducer(
        filtered,
        owner,
        'class-feature|mystic arcanum|warlock|xphb|11|xphb',
        11,
      ),
    ).toBeDefined()
  })
})
