// @vitest-environment jsdom
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { PDFDocument, PDFTextField } from '@cantoo/pdf-lib'
import { expect, test } from 'vitest'
import { composeGameDataLayers } from '@/lib/5etools/contentLayers'
import { FiveEToolsDataLoader } from '@/lib/5etools/dataLoader'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { parseClassDocument } from '@/lib/5etools/parsers/classes'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { getSpellReferenceKey } from '@/lib/calculations/spellIdentity'
import { getSpellProfileSelectionCounts } from '@/lib/calculations/spellProfiles.profiles'
import { buildClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import {
  applyLevelDown,
  applyLevelUp,
  selectSubclass,
} from '@/lib/character/commands/classCommands'
import type { CharacterCommandResult } from '@/lib/character/commands/commandResult'
import { setDailyClassSpellPreparedCommand } from '@/lib/character/commands/dailyClassSpellCommands'
import { projectManagedClassSpellState } from '@/lib/character/managedClassSpells'
import { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import { validateSpells } from '@/lib/readiness/spellReadiness'
import type { Class5e, ClassFeature, GameData } from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { generateTestCharacterSheet } from '../fixtures/pdfTemplates'

const owner = { name: 'Paladin', source: 'XPHB' }
const profileId = 'class:Paladin|XPHB'
const smite = 'Divine Smite|XPHB'
const steed = 'Find Steed|XPHB'
const spellKeys = [smite, steed].map((spell) => getSpellReferenceKey(spell))
const smiteName = "Paladin's Smite"
const steedName = 'Faithful Steed'
const isPaladin = (row: { name: string; source: string }) =>
  row.name === owner.name && row.source === owner.source
const isSteedFeature = (row: ClassFeature) => row.name === steedName && row.source === 'XPHB'
const exactSpell = (name: string, source: string) => getSpellReferenceKey(name, source)

const stacks: Array<['bundled' | 'local', string]> = [['bundled', 'resources/srd/data']]
if (existsSync('data/class/class-paladin.json')) stacks.push(['local', 'data'])

function lookups(data: GameData) {
  return {
    ...buildGameDataLookups(data),
    classChoiceClasses: data.classes,
    classChoiceFeatureCatalogs: buildClassChoiceFeatureCatalogs(data),
  }
}

function reopen(saved: Character, result?: CharacterCommandResult) {
  const actor = result
    ? { ...saved, ...result.characterPatch, provenance: result.provenanceUpdate }
    : saved
  return characterPersistenceSchema.parse(JSON.parse(JSON.stringify(actor)))
}

const profile = (character: Character) =>
  character.spells.spellProfiles.find((row) => row.id === profileId)

test.each([
  'paladin',
  'ranger',
])('malformed revised %s declarations grant no spells', async (name) => {
  const raw = JSON.parse(await readFile(`resources/srd/data/class/class-${name}.json`, 'utf8'))
  const actorClass = raw.class.find((row: Class5e) => row.source === 'XPHB')
  const actor = makeCharacterFixture({
    originSystem: '2024',
    allowedSources: ['XPHB'],
    classProgression: [{ name: actorClass.name, source: actorClass.source, levels: 5 }],
  })
  const project = (classRow: unknown) => {
    const parsed = parseClassDocument({ ...raw, class: [classRow] })
    const catalogs = buildClassChoiceFeatureCatalogs({
      classes: parsed.classes as Class5e[],
      classFeatures: parsed.classFeatures as ClassFeature[],
    })
    return projectManagedClassSpellState(actor, { catalogs }).fixedClassSpellStatuses
  }
  expect(project(actorClass)).toHaveLength(name === 'paladin' ? 2 : 1)
  expect(project({ ...actorClass, classFeatures: {} })).toEqual([])
})

test.each(stacks)(
  'earns exact revised Paladin class preparations through progression, strict reopen and PDF (%s)',
  async (type, root) => {
    const data = composeGameDataLayers([
      await new FiveEToolsDataLoader(
        type === 'bundled'
          ? {
              type,
              path: 'srd/core',
              packId: 'tavern-born-srd-core',
              packVersion: '1.0.1',
              isValid: true,
            }
          : { type, path: resolve(root), isValid: true },
        { type, readJson: async (file) => JSON.parse(await readFile(resolve(root, file), 'utf8')) },
      ).loadAllData(),
    ])
    const full = lookups(data)
    const calculate = (actor: Character, current = full) =>
      createCharacterCalculationContext(actor, current, full)
    const fixed = (actor: Character, current = full) =>
      (profile(calculate(actor, current).character)?.alwaysPreparedSpells ?? [])
        .map((spell) => getSpellReferenceKey(spell))
        .filter((key) => spellKeys.includes(key))
    const prepare = (actor: Character, reference: string, selected = true, current = full) =>
      reopen(
        actor,
        setDailyClassSpellPreparedCommand(
          actor,
          actor.provenance,
          profileId,
          reference,
          selected,
          calculate(actor, current).classChoices.spellContext,
        ),
      )
    const advance = (actor: Character, level: number) =>
      reopen(
        actor,
        applyLevelUp(
          actor,
          actor.provenance,
          [{ ...actor.classProgression[0], levels: level }],
          {
            className: 'Paladin',
            classSource: 'XPHB',
            classLevel: level,
            hitDie: 10,
            dieResult: 6,
            method: 'average',
          },
          calculate(actor),
        ),
      )

    const level1 = reopen(
      makeCharacterFixture({
        originSystem: '2024',
        allowedSources: ['XPHB'],
        classProgression: [{ ...owner, levels: 1 }],
      }),
    )
    expect(fixed(level1)).toEqual([])
    const selected = prepare(prepare(level1, smite), 'Bless|XPHB')
    expect(getSpellProfileSelectionCounts(profile(calculate(selected).character)!).prepared).toBe(2)
    const level2 = advance(selected, 2)
    expect(fixed(level2)).toEqual(spellKeys.slice(0, 1))
    expect(profile(level2)?.preparedSpells).toEqual([smite, 'Bless|XPHB'])
    expect(getSpellProfileSelectionCounts(profile(calculate(level2).character)!).prepared).toBe(1)
    const level3 = advance(level2, 3)
    const withOath = reopen(
      level3,
      selectSubclass(level3, level3.provenance, 'Oath of Devotion', 'XPHB', undefined, {
        classChoiceFeatureCatalogs: full.classChoiceFeatureCatalogs,
      }),
    )
    const level4 = advance(withOath, 4)
    expect(fixed(level4)).toEqual(spellKeys.slice(0, 1))
    const level5 = advance(level4, 5)
    expect(fixed(level5)).toEqual(spellKeys)
    expect(() => prepare(level5, steed)).toThrow(/already always prepared/)
    const effective = calculate(level5).character
    expect(
      profile(effective)?.alwaysPreparedSpells?.map((spell) => getSpellReferenceKey(spell)),
    ).toEqual(expect.arrayContaining(['shield of faith|xphb', 'zone of truth|xphb', ...spellKeys]))
    for (const [index, name] of [smiteName, steedName].entries()) {
      const [spell] = spellKeys[index].split('|')
      expect(effective.provenance.spells[spell]).toContainEqual(
        expect.objectContaining({
          sourceType: 'class',
          sourceName: 'Paladin',
          sourceRef: 'XPHB',
          grantType: 'fixed',
          grantSource: 'XPHB',
          label: name,
        }),
      )
    }
    expect(getSpellProfileSelectionCounts(profile(effective)!).prepared).toBe(1)

    const afterWithdrawal = prepare(level5, smite, false)
    expect(profile(afterWithdrawal)?.preparedSpells).toEqual(['Bless|XPHB'])
    expect(fixed(afterWithdrawal)).toEqual(spellKeys)
    const backTo4 = reopen(level5, applyLevelDown(level5, level5.provenance, calculate(level5)))
    expect(fixed(backTo4)).toEqual(spellKeys.slice(0, 1))
    expect(fixed(advance(backTo4, 5))).toEqual(spellKeys)
    const backTo1 = reopen(level2, applyLevelDown(level2, level2.provenance, calculate(level2)))
    expect(fixed(backTo1)).toEqual([])
    expect(profile(backTo1)?.preparedSpells).toEqual([smite, 'Bless|XPHB'])
    expect(getSpellProfileSelectionCounts(profile(calculate(backTo1).character)!).prepared).toBe(2)

    const withoutSmite = lookups({
      ...data,
      classFeatures: data.classFeatures.filter(
        (row) => row.name !== smiteName || row.source !== 'XPHB',
      ),
    })
    const missingFeature = calculate(level5, withoutSmite).character
    expect(fixed(level5, withoutSmite)).toEqual(spellKeys.slice(1))
    expect(profile(missingFeature)?.preparedSpells).toContain(smite)
    expect(getSpellProfileSelectionCounts(profile(missingFeature)!).prepared).toBe(2)
    const withoutSteed = lookups({
      ...data,
      classFeatures: data.classFeatures.filter((row) => !isSteedFeature(row)),
    })
    const dailySteed = prepare(level5, steed, true, withoutSteed)
    expect(profile(reopen(dailySteed))?.preparedSpells).toContain(steed)
    expect(getSpellProfileSelectionCounts(profile(calculate(dailySteed).character)!).prepared).toBe(
      1,
    )
    const dormantSteed = reopen(
      dailySteed,
      applyLevelDown(dailySteed, dailySteed.provenance, calculate(dailySteed)),
    )
    expect(profile(dormantSteed)?.preparedSpells).toContain(steed)
    expect(calculate(dormantSteed).dailyClassSpellStatuses).toContainEqual(
      expect.objectContaining({ reference: steed, active: false }),
    )
    expect(fixed(advance(dormantSteed, 5))).toEqual(spellKeys)

    const absentSteed = data.spells.filter(
      (spell) => exactSpell(spell.name, spell.source) !== spellKeys[1],
    )
    expect(
      absentSteed.some((spell) => exactSpell(spell.name, spell.source) === 'find steed|phb'),
    ).toBe(true)
    const missingSpell = lookups({ ...data, spells: absentSteed })
    expect(fixed(level5, missingSpell)).toEqual(spellKeys.slice(0, 1))
    expect(
      validateSpells(level5, calculate(level5, missingSpell), missingSpell.spellsByKey),
    ).toContainEqual(expect.objectContaining({ title: `Restore ${steedName} spell: ${steed}` }))
    const steedRow = data.spells.find(
      (spell) => exactSpell(spell.name, spell.source) === spellKeys[1],
    )!
    for (const spells of [
      [...absentSteed, { ...steedRow, level: 1 }],
      [...data.spells, steedRow],
    ]) {
      expect(fixed(level5, lookups({ ...data, spells }))).toEqual(spellKeys.slice(0, 1))
    }

    const editPaladin = (edit: (cls: Class5e) => Class5e) =>
      lookups({ ...data, classes: data.classes.map((cls) => (isPaladin(cls) ? edit(cls) : cls)) })
    const reference = 'Faithful Steed|Paladin|XPHB|5'
    const unavailable = [
      editPaladin(
        (cls) =>
          ({
            ...cls,
            classFeatures: cls.classFeatures?.filter((row) => row !== reference),
          }) as Class5e,
      ),
      editPaladin(
        (cls) =>
          ({
            ...cls,
            classFeatures: [...(cls.classFeatures ?? []), reference],
          }) as Class5e,
      ),
      editPaladin((cls) => ({
        ...cls,
        classFeatureRefs: cls.classFeatureRefs?.filter((row) => row.ref !== reference),
      })),
      editPaladin((cls) => ({
        ...cls,
        additionalSpells: [{ prepared: { 2: [smite], 5: ['Find Steed|PHB'] } }],
      })),
      editPaladin((cls) => ({
        ...cls,
        additionalSpells: [{ prepared: { 2: [smite], 5: [steed], '05': [steed] } }],
      })),
    ]
    const feature = data.classFeatures.find(isSteedFeature)!
    for (const conflict of [
      { name: 'Different Feature' },
      { className: 'Ranger' },
      { classSource: 'PHB' },
      { classSource: '' },
      { source: 'PHB' },
      { source: '' },
      { level: 4 },
      { entries: ['This feature does not prepare a spell.'] },
      { additionalSpells: [{ prepared: { 5: ['Bless|XPHB'] } }] },
    ]) {
      unavailable.push(
        lookups({
          ...data,
          classFeatures: data.classFeatures.map((row) =>
            row === feature ? { ...row, ...conflict } : row,
          ),
        }),
      )
    }
    unavailable.push(lookups({ ...data, classFeatures: [...data.classFeatures, feature] }))
    for (const current of unavailable) expect(fixed(level5, current)).toEqual(spellKeys.slice(0, 1))
    expect(fixed(reopen(level5))).toEqual(spellKeys)

    const classic = reopen(
      makeCharacterFixture({
        allowedSources: ['PHB'],
        classProgression: [{ ...owner, source: 'PHB', levels: 5 }],
      }),
    )
    expect(calculate(classic).fixedClassSpellStatuses).toEqual([])
    const sheet = createCharacterSheetViewModel(level5, full, full)
    for (const [index, name] of ['Divine Smite', 'Find Steed'].entries()) {
      expect(sheet.spellRows.filter((row) => row.name === name)).toEqual([
        expect.objectContaining({ prepared: true, level: String(index + 1) }),
      ])
    }
    for (const template of ['2024-official', '2024-custom'] as const) {
      const pdf = await PDFDocument.load(await generateTestCharacterSheet(sheet, template))
      const fields = pdf
        .getForm()
        .getFields()
        .flatMap((field) => (field instanceof PDFTextField ? [field.getText()] : []))
      expect(fields).toEqual(expect.arrayContaining(['Divine Smite', 'Find Steed']))
    }
  },
  45_000,
)
