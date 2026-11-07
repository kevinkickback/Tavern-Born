// @vitest-environment jsdom
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { PDFDocument, PDFTextField } from '@cantoo/pdf-lib'
import { beforeAll, expect, test } from 'vitest'
import { getSelectedSubclassData } from '@/lib/5etools/classData'
import { getSubclassFeatureIdentity } from '@/lib/5etools/classFeatureIdentity'
import { composeGameDataLayers } from '@/lib/5etools/contentLayers'
import { FiveEToolsDataLoader } from '@/lib/5etools/dataLoader'
import { DataFilter } from '@/lib/5etools/filters'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { parseClassDocument } from '@/lib/5etools/parsers/classes'
import { getEarnedSubclassSpellGrants } from '@/lib/5etools/subclassSpells'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { getSpellReferenceKey } from '@/lib/calculations/spellIdentity'
import { buildClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import {
  createClassChoiceCatalogs,
  getCharacterClassChoices,
  isClassChoiceOptionEligible,
  resolveClassChoiceOptions,
} from '@/lib/character/classChoiceOptions'
import { applyClassChoiceSelectionWithGrantsCommand } from '@/lib/character/commands/classChoiceCommands'
import { applyClassProgressionUpdate, selectSubclass } from '@/lib/character/commands/classCommands'
import type { CharacterCommandResult } from '@/lib/character/commands/commandResult'
import { setDailyClassSpellPreparedCommand } from '@/lib/character/commands/dailyClassSpellCommands'
import { createOptionalClassFeatureActivity } from '@/lib/character/optionalClassFeatureActivity'
import { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import type { Class5e, GameData, SubclassFeature } from '@/types/5etools'
import type { Character, Equipment } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { generateTestCharacterSheet } from '../fixtures/pdfTemplates'

const hasData = existsSync('data/class/class-paladin.json')
const paladin = { name: 'Paladin', source: 'XPHB' }
const profileId = 'class:Paladin|XPHB'
const gains = [3, 5, 9, 13, 17]
let data: GameData

beforeAll(async () => {
  if (!hasData) return
  data = composeGameDataLayers([
    await new FiveEToolsDataLoader(
      { type: 'local', path: resolve('data'), isValid: true },
      {
        type: 'local',
        readJson: async (file) => JSON.parse(await readFile(resolve('data', file), 'utf8')),
      },
    ).loadAllData(),
  ])
})

function reopen(actor: Character, result?: CharacterCommandResult): Character {
  return characterPersistenceSchema.parse(
    JSON.parse(
      JSON.stringify(
        result
          ? { ...actor, ...result.characterPatch, provenance: result.provenanceUpdate }
          : actor,
      ),
    ),
  )
}

function profile(actor: Character) {
  return actor.spells.spellProfiles.find((row) => row.id === profileId)
}

function fixture(printing: string) {
  const sources = ['XPHB', printing]
  const actor = makeCharacterFixture({
    originSystem: '2024',
    allowedSources: sources,
    classProgression: [{ ...paladin, levels: 1 }],
    abilityScores: {
      strength: 13,
      dexterity: 14,
      constitution: 10,
      intelligence: 10,
      wisdom: 10,
      charisma: 16,
    },
  })
  const raw = buildGameDataLookups(data)
  const makeLookups = (enabled: string[]) => {
    const current = {
      ...data,
      classes: DataFilter.filterClasses(data.classes, { sources: enabled }),
    }
    return {
      ...buildGameDataLookups(current),
      classChoiceClasses: current.classes,
      classChoiceFeatureCatalogs: buildClassChoiceFeatureCatalogs(current),
    }
  }
  const current = makeLookups(sources)
  const catalogs = current.classChoiceFeatureCatalogs
  const calculate = (character: Character, lookups = current) =>
    createCharacterCalculationContext(character, lookups, raw)
  const advance = (character: Character, levels: number) =>
    reopen(
      character,
      applyClassProgressionUpdate(character, character.provenance, [
        { ...character.classProgression[0], levels },
      ]),
    )
  const select = (character: Character, name: string) =>
    reopen(
      character,
      selectSubclass(character, character.provenance, name, printing, undefined, {
        classChoiceFeatureCatalogs: catalogs,
      }),
    )
  return { actor, raw, current, makeLookups, catalogs, calculate, advance, select }
}

test.skipIf(!hasData).each([
  [
    'Oath of the Crown',
    'SCAG',
    [
      'Command',
      'Compelled Duel',
      'Warding Bond',
      'Zone of Truth',
      'Aura of Vitality',
      'Spirit Guardians',
      'Banishment',
      'Guardian of Faith',
      'Circle of Power',
      'Geas',
    ],
  ],
  [
    'Oath of Conquest',
    'XGE',
    [
      'Armor of Agathys',
      'Command',
      'Hold Person',
      'Spiritual Weapon',
      'Bestow Curse',
      'Fear',
      'Dominate Beast',
      'Stoneskin',
      'Cloudkill',
      'Dominate Person',
    ],
  ],
  [
    'Oath of Redemption',
    'XGE',
    [
      'Sanctuary',
      'Sleep',
      'Calm Emotions',
      'Hold Person',
      'Counterspell',
      'Hypnotic Pattern',
      "Otiluke's Resilient Sphere",
      'Stoneskin',
      'Hold Monster',
      'Wall of Force',
    ],
  ],
  [
    'Oath of the Watchers',
    'TCE',
    [
      'Alarm',
      'Detect Magic',
      'Moonbeam',
      'See Invisibility',
      'Counterspell',
      'Nondetection',
      'Aura of Purity',
      'Banishment',
      'Hold Monster',
      'Scrying',
    ],
  ],
] as const)('%s prepares only the exact earned revised reprints', (name, source, spellNames) => {
  const { actor, advance, select, calculate, raw, current, makeLookups } = fixture(source)
  const oath = select(advance(actor, 3), name)
  const exact = spellNames.map((spell) => getSpellReferenceKey(spell, 'XPHB'))
  const prepared = (character: Character, lookups = current) =>
    (profile(calculate(character, lookups).character)?.alwaysPreparedSpells ?? [])
      .map((spell) => getSpellReferenceKey(spell))
      .filter((spell) => exact.includes(spell))
      .sort()
  for (const level of [2, 3, 4, 5, 8, 9, 12, 13, 16, 17, 20]) {
    const earned = gains.filter((gain) => gain <= level).length * 2
    expect(prepared(advance(oath, level))).toEqual(exact.slice(0, earned).sort())
  }
  const level5 = advance(oath, 5)
  expect(prepared(level5, makeLookups(['XPHB']))).toEqual([])
  expect(prepared(reopen(level5))).toEqual(exact.slice(0, 4).sort())
  const sheet = createCharacterSheetViewModel(level5, raw, current)
  for (const spell of spellNames.slice(0, 4))
    expect(
      sheet.spellRows.some((row) => row.name.toLowerCase() === spell.toLowerCase() && row.prepared),
    ).toBe(true)
})

test.skipIf(!hasData)('oath source loss preserves an independent Paladin preparation', async () => {
  const { actor, select, advance, calculate, raw, current } = fixture('SCAG')
  const ordinary = reopen(
    actor,
    setDailyClassSpellPreparedCommand(
      actor,
      actor.provenance,
      profileId,
      'Command|XPHB',
      true,
      calculate(actor).classChoices.spellContext,
    ),
  )
  const oath = select(advance(ordinary, 3), 'Oath of the Crown')
  const doc = JSON.parse(await readFile('data/class/class-paladin.json', 'utf8'))
  const leafTarget = 'subclass-feature|oath spells|paladin|phb|crown|scag|3|scag'
  const introTarget = 'subclass-feature|oath of the crown|paladin|phb|crown|scag|3|scag'
  const leaf = doc.subclassFeature.find(
    (row: SubclassFeature) => getSubclassFeatureIdentity(row) === leafTarget,
  )
  const intro = doc.subclassFeature.find(
    (row: SubclassFeature) => getSubclassFeatureIdentity(row) === introTarget,
  )
  const readClass = () =>
    (parseClassDocument(doc).classes as Class5e[]).find((row) => row.source === 'XPHB')
  expect(getEarnedSubclassSpellGrants(readClass(), oath.classProgression[0])).toHaveLength(2)
  doc.subclassFeature = doc.subclassFeature.filter((row: SubclassFeature) => row !== leaf)
  const declaration = intro.entries.find(
    (row: { type?: string; subclassFeature?: string }) =>
      row.type === 'refSubclassFeature' && row.subclassFeature?.startsWith('Oath Spells|'),
  )
  declaration.feature = leaf
  expect(getEarnedSubclassSpellGrants(readClass(), oath.classProgression[0])).toEqual([])

  const withdrawal = {
    ...current,
    spellsByKey: Object.fromEntries(
      Object.entries(current.spellsByKey).map(([key, spell]) => [
        key,
        spell.name === 'Compelled Duel' && spell.source === 'XPHB' ? { ...spell, level: 2 } : spell,
      ]),
    ),
  }
  const invalid = createCharacterCalculationContext(oath, withdrawal, raw)
  expect(invalid.fixedClassSpellStatuses).toContainEqual(
    expect.objectContaining({
      featureName: 'Oath Spells',
      reference: 'compelled duel|XPHB',
      active: false,
    }),
  )
  const exact = 'compelled duel|xphb'
  for (const reprintedAs of [
    [],
    ['Command|XPHB'],
    ['Compelled Duel|XPHB', 'Command|XPHB'],
    undefined,
  ]) {
    const contradictory = {
      ...raw,
      spellsByKey: Object.fromEntries(
        Object.entries(raw.spellsByKey).flatMap(([key, spell]) => {
          if (spell.name !== 'Compelled Duel' || spell.source !== 'PHB') return [[key, spell]]
          return reprintedAs === undefined ? [] : [[key, { ...spell, reprintedAs }]]
        }),
      ),
    }
    const suspended = createCharacterCalculationContext(oath, current, contradictory)
    expect(
      profile(suspended.character)?.alwaysPreparedSpells?.map((spell) =>
        getSpellReferenceKey(spell),
      ) ?? [],
    ).not.toContain(exact)
    expect(suspended.fixedClassSpellStatuses).toContainEqual(
      expect.objectContaining({ reference: 'compelled duel|XPHB', active: false }),
    )
  }
  expect(
    profile(calculate(oath).character)?.alwaysPreparedSpells?.map((spell) =>
      getSpellReferenceKey(spell),
    ),
  ).toContain(exact)
  const rolled = advance(oath, 2)
  expect(profile(calculate(rolled).character)?.preparedSpells).toContain('Command|XPHB')
  expect(profile(calculate(rolled).character)?.alwaysPreparedSpells ?? []).not.toContain(
    'Compelled Duel|XPHB',
  )
})

test.skipIf(!hasData)(
  "Genie's Splendor earns one of four skills and an independent armor formula",
  () => {
    const { actor, select, advance, current, raw, calculate, catalogs, makeLookups } =
      fixture('FRHoF')
    const genie = select(advance(actor, 3), 'Oath of the Noble Genies')
    const cls = catalogs.classes.find((row) => row.name === 'Paladin' && row.source === 'XPHB')!
    const selected = getSelectedSubclassData(cls, genie.classProgression[0])
    const choices = getCharacterClassChoices(
      cls,
      selected,
      createOptionalClassFeatureActivity(genie, catalogs),
      catalogs,
    )
    const choice = choices.find((row) => row.label === "Genie's Splendor skills")!
    expect(choice).toMatchObject({ level: 3, minimumSelections: 1, maximumSelections: 1 })
    const optionCatalogs = createClassChoiceCatalogs(catalogs)
    const options = resolveClassChoiceOptions(choice, optionCatalogs, [], 3, genie)
      .filter(isClassChoiceOptionEligible)
      .map((row) => row.reference)
    expect(options.map((row) => row.name.toLowerCase()).sort()).toEqual([
      'acrobatics',
      'intimidation',
      'performance',
      'persuasion',
    ])
    const skill = options[0].name.toLowerCase()
    const picked = reopen(
      genie,
      applyClassChoiceSelectionWithGrantsCommand(genie, genie.provenance, choice, [options[0]], {
        classes: catalogs.classes,
        catalogs: optionCatalogs,
        spellContext: calculate(genie).classChoices.spellContext,
      }),
    )
    expect(calculate(picked).character.proficiencies.skills).toContain(skill)
    const disabled = makeLookups(['XPHB'])
    expect(calculate(picked, disabled).character.proficiencies.skills).not.toContain(skill)
    expect(calculate(reopen(picked)).character.proficiencies.skills).toContain(skill)

    const shield: Equipment = {
      id: 'shield',
      name: 'Shield',
      type: 'S',
      quantity: 1,
      equipped: true,
      armorType: 'shield',
      ac: 2,
    }
    const chain: Equipment = {
      id: 'chain',
      name: 'Chain Mail',
      type: 'HA',
      quantity: 1,
      equipped: true,
      armorType: 'heavy',
      ac: 16,
    }
    const ac = (character: Character, lookups = current) =>
      createCharacterSheetViewModel(character, raw, lookups).effectiveArmorClass
    expect(ac(advance(genie, 2))).toBe(12)
    expect(ac(genie)).toBe(15)
    expect(ac(picked, disabled)).toBe(12)
    expect(ac({ ...genie, equipment: [shield] })).toBe(17)
    expect(ac({ ...genie, equipment: [shield, chain] })).toBe(18)
    expect(ac({ ...genie, equipment: [shield, { ...chain, equipped: false }] })).toBe(17)
    expect(ac({ ...genie, abilityScores: { ...genie.abilityScores, charisma: 8 } })).toBe(12)
    expect(ac({ ...genie, armorClassOverride: 11 })).toBe(11)
  },
)

test.skipIf(!hasData).each(['PHB', 'XPHB'] as const)(
  '%s prints the exact Crown rules at their earning level',
  (source) => {
    const { raw, makeLookups } = fixture('SCAG')
    const allowedSources = [source, 'SCAG']
    const lookups = makeLookups(allowedSources)
    const summaries = (levels: number) => {
      const actor = makeCharacterFixture({
        originSystem: source === 'PHB' ? '2014' : '2024',
        allowedSources,
        classProgression: [
          {
            name: 'Paladin',
            source,
            levels,
            subclass: 'Oath of the Crown',
            subclassSource: 'SCAG',
          },
        ],
      })
      return (
        createCharacterSheetViewModel(reopen(actor), raw, lookups).declaredClassFeatureSummaries ??
        []
      )
    }
    expect(summaries(2).map((row) => row.compactText)).not.toContain('Oath Spells')
    expect(summaries(3).find((row) => row.compactText === 'Oath Spells')?.text).toMatch(
      /compelled duel/i,
    )
    expect(summaries(6).map((row) => row.compactText)).not.toContain('Divine Allegiance')
    expect(summaries(7).find((row) => row.compactText === 'Divine Allegiance')?.text).toMatch(
      /reaction/i,
    )
    expect(summaries(7).map((row) => row.compactText)).toContain('Aura of Protection')
  },
)

test.skipIf(!hasData)(
  'Elemental Smite includes its four nested rules in both revised PDFs',
  async () => {
    const { actor, advance, select, raw, current } = fixture('FRHoF')
    const genie = select(advance(actor, 3), 'Oath of the Noble Genies')
    const view = createCharacterSheetViewModel(genie, raw, current)
    for (const layout of ['2024-official', '2024-custom'] as const) {
      const bytes = await generateTestCharacterSheet(view, layout, {
        text: { descriptions: 'full', overflow: 'notes' },
      })
      const form = (await PDFDocument.load(bytes)).getForm()
      const text = form
        .getFields()
        .flatMap((field) => (field instanceof PDFTextField ? [field.getText() ?? ''] : []))
        .join(' ')
        .replace(/\s+/g, ' ')
      for (const body of [
        /escape DC equal to your spell save DC/i,
        /semi-incorporeal form/i,
        /second creature also takes 2d4 fire damage/i,
        /pushed 15 feet straight away from you/i,
      ])
        expect(text).toMatch(body)
    }
  },
  20_000,
)

test('classic Oathbreaker requires an evil alignment and the earned subclass level on selection', () => {
  const actor = makeCharacterFixture({
    originSystem: '2014',
    classProgression: [{ name: 'Paladin', source: 'PHB', levels: 3 }],
  })
  const select = (character: Character) =>
    reopen(character, selectSubclass(character, character.provenance, 'Oathbreaker', 'DMG'))
  expect(() => select(actor)).toThrow('evil alignment in Characteristics')
  expect(() => select({ ...actor, details: { alignment: 'neutral-good' } })).toThrow(
    'evil alignment in Characteristics',
  )
  const evil = { ...actor, details: { alignment: 'chaotic-evil' } }
  expect(() =>
    select({ ...evil, classProgression: [{ name: 'Paladin', source: 'PHB', levels: 2 }] }),
  ).toThrow('Paladin level 3')
  expect(select(evil).classProgression[0]).toMatchObject({
    subclass: 'Oathbreaker',
    subclassSource: 'DMG',
  })
})
