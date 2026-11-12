// @vitest-environment jsdom

import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { beforeAll, expect, test } from 'vitest'
import { FiveEToolsDataLoader } from '@/lib/5etools/dataLoader'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { LAND_BONUS_SPELL_SLOT } from '@/lib/5etools/selectedFeatureSpellIdentity'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { buildClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import { getCharacterClassChoices } from '@/lib/character/classChoiceOptions'
import { hasCurrentClassSpellListRoute } from '@/lib/character/classSpellAuthority'
import { applyClassChoiceSelectionWithGrantsCommand } from '@/lib/character/commands/classChoiceCommands'
import { applyLevelDown, selectSubclass } from '@/lib/character/commands/classCommands'
import { setDailyClassSpellPreparedCommand } from '@/lib/character/commands/dailyClassSpellCommands'
import { setManagedClassSpellChoiceCommand } from '@/lib/character/commands/managedClassSpellCommands'
import { createEmptyCharacter } from '@/lib/character/createCharacter'
import {
  getFeatureOptionSelectionStates,
  summarizeFeatureOptionSelectionGroups,
} from '@/lib/character/featureOptionSelections'
import { getManagedClassSpellSlots } from '@/lib/character/managedClassSpellSlots'
import { getManagedClassSpellPool } from '@/lib/character/managedClassSpells'
import { createOptionalClassFeatureActivity } from '@/lib/character/optionalClassFeatureActivity'
import { getOptionalPoolSelectionHandle } from '@/lib/character/optionalClassPoolSelections'
import type { GameData } from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'

let data: GameData
beforeAll(async () => {
  data = await new FiveEToolsDataLoader(
    {
      type: 'bundled',
      path: 'srd/core',
      packId: 'tavern-born-srd-core',
      packVersion: '1.0.0',
      isValid: true,
    },
    {
      type: 'bundled',
      readJson: async (file) =>
        JSON.parse(await readFile(resolve('resources/srd/data', file), 'utf8')),
    },
  ).loadAllData()
})

function setup(source: 'PHB' | 'XPHB', level: number, current = data) {
  const cls = current.classes.find((row) => row.name === 'Druid' && row.source === source)!
  const subclass = cls.subclasses!.find(
    (row) => row.name === 'Circle of the Land' && row.source === source,
  )!
  const catalogs = buildClassChoiceFeatureCatalogs(current)
  const lookups = {
    ...buildGameDataLookups(current),
    classChoiceClasses: current.classes,
    classChoiceFeatureCatalogs: catalogs,
  }
  const actor = createEmptyCharacter({
    name: 'Land Druid',
    originSystem: source === 'PHB' ? '2014' : '2024',
    allowedSources: [source],
    classProgression: [
      { name: 'Druid', source, subclass: subclass.name, subclassSource: source, levels: level },
    ],
    abilityScores: {
      strength: 10,
      dexterity: 10,
      constitution: 10,
      intelligence: 10,
      wisdom: 16,
      charisma: 10,
    },
  })
  const calc = (character: Character) => createCharacterCalculationContext(character, lookups)
  const choices = getCharacterClassChoices(
    cls,
    subclass,
    createOptionalClassFeatureActivity(actor, catalogs),
    catalogs,
  )
  const choice = choices.find((row) => row.label === 'Circle of the Land Terrain')!
  const change = (character: Character, terrain?: string) => {
    const option = choice.options.find((row) => row.name === terrain)
    if (terrain && !option) throw new Error('Unknown test terrain')
    return reopen(
      character,
      applyClassChoiceSelectionWithGrantsCommand(
        character,
        character.provenance,
        choice,
        option ? [option] : [],
        { classes: current.classes, catalogs },
      ),
    )
  }
  const profile = (character: Character) =>
    calc(character).character.spells.spellProfiles.find((row) => row.className === 'Druid')!
  return { actor, cls, subclass, catalogs, calc, change, choice, profile }
}

function reopen(
  character: Character,
  result: ReturnType<typeof setManagedClassSpellChoiceCommand>,
) {
  return characterPersistenceSchema.parse(
    JSON.parse(
      JSON.stringify({
        ...character,
        ...result.characterPatch,
        provenance: result.provenanceUpdate,
      }),
    ),
  )
}

test('classic terrain is optional only until level two, and Swamp and its independent cantrip survive reopen', () => {
  const before = setup('PHB', 1)
  expect(before.choice).toBeUndefined()
  const { actor, choice, change, calc, profile } = setup('PHB', 3)
  expect(choice.level).toBe(2)
  expect(choice.options).toHaveLength(7)
  expect(profile(actor).fixedSpells).toBeUndefined()
  const base = calc(actor).classChoices.spellContext
  expect(base).toBeDefined()
  if (!base) throw new Error('Expected current spell context')
  const pool = getManagedClassSpellPool(actor, LAND_BONUS_SPELL_SLOT, base)
  expect(pool.reason).toBeUndefined()
  expect(pool.spells.some((spell) => spell.name === 'Druidcraft')).toBe(true)
  const cantrip = reopen(
    actor,
    setManagedClassSpellChoiceCommand(
      actor,
      actor.provenance,
      {
        slot: LAND_BONUS_SPELL_SLOT,
        expected: null,
        expectedEmptyRevision: 0,
        target: { name: 'Druidcraft', source: 'PHB' },
        policy: 'default',
      },
      base,
    ),
  )
  const swamp = change(cantrip, 'Swamp')
  expect(profile(swamp).fixedSpells?.map((row) => row.toLowerCase())).toEqual([
    'darkness|phb',
    'acid arrow|phb',
  ])
  expect(profile(swamp).cantrips).toContain('Druidcraft|PHB')
  expect(profile(change(swamp)).fixedSpells).toBeUndefined()
  expect(profile(change(swamp)).cantrips).toContain('Druidcraft|PHB')
  const second = reopen(swamp, applyLevelDown(swamp, swamp.provenance, calc(swamp)))
  expect(profile(second).fixedSpells).toBeUndefined()
  expect(profile(second).cantrips).toContain('Druidcraft|PHB')
  const first = reopen(second, applyLevelDown(second, second.provenance, calc(second)))
  expect(first.classChoiceSelections).toEqual([])
  expect(first.managedClassSpellChoices).toEqual([])
  const other = reopen(swamp, selectSubclass(swamp, swamp.provenance, 'Circle of the Moon', 'PHB'))
  expect(other.classChoiceSelections).toEqual([])
  expect(other.managedClassSpellChoices).toEqual([])
  const spell = data.spells.find((row) => row.name === 'Mirror Image' && row.source === 'PHB')!
  expect(hasCurrentClassSpellListRoute(swamp, swamp.classProgression[0], spell, base)).toBe(false)
})

test('revised terrain changes its own grants and preserves Druidic', () => {
  const { actor, change, choice, profile, catalogs, calc } = setup('XPHB', 14)
  expect(choice.options).toHaveLength(4)
  const druidicSpell = 'Speak with Animals|XPHB'
  expect(profile(actor).fixedSpells).toEqual([druidicSpell])
  const arid = change(actor, 'Arid Land')
  expect(profile(arid).cantrips.map((row) => row.toLowerCase())).toEqual(['fire bolt|xphb'])
  expect(profile(arid).fixedSpells).toHaveLength(7)
  expect(profile(arid).fixedSpells).toContain(druidicSpell)
  const slot = getManagedClassSpellSlots(arid.classProgression[0]).find(
    (row) => row[1] === 'class-cantrip' && row[3] === 4,
  )
  if (!slot) throw new Error('Missing level-four Druid cantrip slot')
  expect(() =>
    setManagedClassSpellChoiceCommand(
      arid,
      arid.provenance,
      {
        slot,
        target: { name: 'Fire Bolt', source: 'XPHB' },
        expected: null,
        expectedEmptyRevision: 0,
        policy: 'ignore-class-list',
      },
      calc(arid).classChoices.spellContext,
    ),
  ).toThrow(/already grants that spell/)
  const prepared = reopen(
    arid,
    setDailyClassSpellPreparedCommand(
      arid,
      arid.provenance,
      'class:Druid|XPHB',
      'Fog Cloud|XPHB',
      true,
      calc(arid).classChoices.spellContext,
    ),
  )
  const polar = change(prepared, 'Polar Land')
  expect(
    characterPersistenceSchema.safeParse({
      ...polar,
      classProgression: [{ ...polar.classProgression[0], levels: 2 }],
    }).success,
  ).toBe(false)
  const staleHandle = getOptionalPoolSelectionHandle(arid.classChoiceSelections![0])
  expect(() =>
    applyClassChoiceSelectionWithGrantsCommand(
      polar,
      polar.provenance,
      choice,
      [],
      { classes: data.classes, catalogs },
      undefined,
      staleHandle,
    ),
  ).toThrow(/saved allocation changed/)
  const withoutCantrip = {
    ...data,
    spells: data.spells.filter(
      (spell) => !(spell.name === 'Ray of Frost' && spell.source === 'XPHB'),
    ),
  }
  const missing = setup('XPHB', 14, withoutCantrip).calc(polar)
  expect(missing.fixedClassSpellStatuses).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ active: false, reference: 'ray of frost|xphb' }),
    ]),
  )
  expect(profile(polar).cantrips.map((row) => row.toLowerCase())).toEqual(['ray of frost|xphb'])
  expect(profile(polar).fixedSpells).toHaveLength(7)
  expect(profile(polar).fixedSpells).toContain(druidicSpell)
  expect(profile(polar).fixedSpells?.some((row) => row.toLowerCase() === 'fire bolt|xphb')).toBe(
    false,
  )
  const summaries = summarizeFeatureOptionSelectionGroups(
    getFeatureOptionSelectionStates(polar, data.classes, catalogs),
  )
  expect(summaries[0].compactText).toContain('cold resistance')
  expect(summaries[0].compactText).toContain('shares it with allies')
  expect(summaries[0].text).toMatch(/Long Rest/i)
  expect(profile(change(polar, 'Arid Land')).preparedSpells).toContain('Fog Cloud|XPHB')
  const withoutLand = {
    ...data,
    classes: data.classes.map((row) =>
      row.name === 'Druid' && row.source === 'XPHB' ? { ...row, subclasses: [] } : row,
    ),
  }
  const withdrawnCatalogs = buildClassChoiceFeatureCatalogs(withoutLand)
  const withdrawn = createCharacterCalculationContext(polar, {
    ...buildGameDataLookups(withoutLand),
    classChoiceClasses: withoutLand.classes,
    classChoiceFeatureCatalogs: withdrawnCatalogs,
  })
  expect(
    withdrawn.character.spells.spellProfiles.find((row) => row.className === 'Druid')?.fixedSpells,
  ).toEqual([druidicSpell])
  expect(withdrawn.character.classChoiceSelections).toEqual(polar.classChoiceSelections)
  expect(profile(polar).cantrips.map((row) => row.toLowerCase())).toEqual(['ray of frost|xphb'])
})

test.runIf(existsSync('data/class/class-druid.json'))(
  'configured classic Swamp keeps the authored spell printing and adds Underdark',
  async () => {
    const configured = await new FiveEToolsDataLoader(
      { type: 'local', path: resolve('data'), isValid: true },
      {
        type: 'local',
        readJson: async (file) => JSON.parse(await readFile(resolve('data', file), 'utf8')),
      },
    ).loadAllData()
    const { actor, choice, change, profile } = setup('PHB', 3, configured)
    expect(choice.options.map((row) => row.name)).toContain('Underdark')
    const swamp = change(actor, 'Swamp')
    expect(profile(swamp).fixedSpells?.map((row) => row.toLowerCase())).toEqual([
      'darkness|phb',
      "melf's acid arrow|phb",
    ])
  },
  20_000,
)
