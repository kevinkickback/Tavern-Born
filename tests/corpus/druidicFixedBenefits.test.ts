// @vitest-environment jsdom
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { PDFDocument, PDFTextField } from '@cantoo/pdf-lib'
import { beforeAll, expect, test } from 'vitest'
import { composeGameDataLayers } from '@/lib/5etools/contentLayers'
import { FiveEToolsDataLoader } from '@/lib/5etools/dataLoader'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { parseSpells } from '@/lib/5etools/parsers/spells'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { getSpellProfileSelectionCounts } from '@/lib/calculations/spellProfiles.profiles'
import { buildClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import { applyClassProgressionUpdate } from '@/lib/character/commands/classCommands'
import type { CharacterCommandResult } from '@/lib/character/commands/commandResult'
import { setDailyClassSpellPreparedCommand } from '@/lib/character/commands/dailyClassSpellCommands'
import { setProfileSpells } from '@/lib/character/commands/spellCommands'
import { getFixedLanguageDetails } from '@/lib/character/fixedProficiencyOwnership'
import { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import { addGrant, makeSourceTag } from '@/lib/provenance'
import { validateSpells } from '@/lib/readiness/spellReadiness'
import type { GameData, Spell5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { generateTestCharacterSheet } from '../fixtures/pdfTemplates'

const spell = 'Speak with Animals|XPHB'
const revised = { name: 'Druid', source: 'XPHB', levels: 1 }
const profileId = 'class:Druid|XPHB'
const profile = (character: Character) =>
  character.spells.spellProfiles.find((row) => row.id === profileId)
const reopen = (character: Character, result?: CharacterCommandResult) =>
  characterPersistenceSchema.parse(
    JSON.parse(
      JSON.stringify(
        result
          ? { ...character, ...result.characterPatch, provenance: result.provenanceUpdate }
          : character,
      ),
    ),
  )

const variants = [
  ['bundled', 'resources/srd/data'],
  ...(existsSync('data/class/class-druid.json') ? [['local', 'data']] : []),
] as Array<['bundled' | 'local', string]>
const readJson = async (path: string) => JSON.parse(await readFile(path, 'utf8'))

async function load(type: 'bundled' | 'local', root: string) {
  return composeGameDataLayers([
    await new FiveEToolsDataLoader(
      type === 'bundled'
        ? {
            type,
            path: 'srd/core',
            packId: 'tavern-born-srd-core',
            packVersion: '1.0.0',
            isValid: true,
          }
        : { type, path: resolve(root), isValid: true },
      { type, readJson: (file) => readJson(resolve(root, file)) },
    ).loadAllData(),
  ])
}

function lookups(data: GameData) {
  return {
    ...buildGameDataLookups(data),
    classChoiceClasses: data.classes,
    classChoiceFeatureCatalogs: buildClassChoiceFeatureCatalogs(data),
  }
}

const catalogs = new Map<
  'bundled' | 'local',
  { data: GameData; current: ReturnType<typeof lookups> }
>()
beforeAll(async () => {
  for (const [type, root] of variants) {
    const data = await load(type, root)
    catalogs.set(type, { data, current: lookups(data) })
  }
})

function getCatalog(type: 'bundled' | 'local') {
  const catalog = catalogs.get(type)
  if (!catalog) throw new Error('Missing Druid catalog for ' + type)
  return catalog
}

test.skipIf(!existsSync('data/class/class-druid.json')).each([
  {
    subclass: 'Circle of Spores',
    level3: ['blindness/deafness', 'gentle repose'],
    laterSpells: {
      5: ['animate dead', 'gaseous form'],
      7: ['blight', 'confusion'],
      9: ['cloudkill', 'contagion'],
    },
    later: 'Fungal Infestation',
    cantrip: 'chill touch',
  },
  {
    subclass: 'Circle of Wildfire',
    level3: ['burning hands', 'cure wounds', 'flaming sphere', 'scorching ray'],
    laterSpells: {
      5: ['plant growth', 'revivify'],
      7: ['aura of life', 'fire shield'],
      9: ['flame strike', 'mass cure wounds'],
    },
    later: 'Enhanced Bond',
  },
])(
  '$subclass keeps its earned spell schedule under the revised Druid',
  async ({ subclass, level3, laterSpells, later, cantrip }) => {
    const { data, current } = getCatalog('local')
    const actor = (source: 'PHB' | 'XPHB', levels: number) =>
      reopen(
        makeCharacterFixture({
          originSystem: source === 'XPHB' ? '2024' : '2014',
          allowedSources: [source, 'TCE'],
          classProgression: [{ name: 'Druid', source, levels, subclass, subclassSource: 'TCE' }],
        }),
      )
    const effective = (saved: Character, visible = current) =>
      createCharacterCalculationContext(
        saved,
        visible,
        current,
      ).character.spells.spellProfiles.find(
        (row) => row.id === 'class:Druid|' + saved.classProgression[0].source,
      )
    const fixed = (saved: Character, visible = current) =>
      effective(saved, visible)
        ?.alwaysPreparedSpells?.map((ref) => ref.toLowerCase())
        .filter((ref) => ref !== spell.toLowerCase())
        .sort() ?? []
    const expected = (source: string, names = level3) =>
      names.map((name) => name + '|' + source).sort()
    expect(fixed(actor('PHB', 3))).toEqual(expected('phb'))
    expect(fixed(actor('XPHB', 2))).toEqual([])
    const earned = actor('XPHB', 3)
    expect(fixed(earned)).toEqual(expected('xphb'))
    for (const source of ['PHB', 'XPHB'] as const) {
      const earnedNames = [...level3]
      for (const [level, spells] of Object.entries(laterSpells)) {
        const gain = Number(level)
        expect(fixed(actor(source, gain - 1))).toEqual(expected(source.toLowerCase(), earnedNames))
        earnedNames.push(...spells)
        expect(fixed(actor(source, gain))).toEqual(expected(source.toLowerCase(), earnedNames))
      }
    }
    const target = data.spells.find(
      (row) => row.name.toLowerCase() === level3[0] && row.source === 'XPHB',
    )
    if (!target) throw new Error('Missing exact revised spell record')
    const [duplicate] = parseSpells([
      { name: target.name, source: 'XPHB', level: target.level },
    ]) as Spell5e[]
    const [wrongRank] = parseSpells([
      { name: target.name, source: 'XPHB', level: target.level + 1 },
    ]) as Spell5e[]
    for (const spells of [
      [...data.spells, duplicate],
      data.spells.map((row) => (row === target ? wrongRank : row)),
    ]) {
      const altered = lookups({ ...data, spells })
      expect(fixed(earned, altered)).toEqual(
        expected('xphb').filter((ref) => ref !== level3[0] + '|xphb'),
      )
      const projection = createCharacterCalculationContext(earned, altered, current)
      expect(
        projection.fixedClassSpellStatuses.filter(
          (row) => row.reference.toLowerCase() === level3[0] + '|xphb',
        ),
      ).toEqual([expect.objectContaining({ featureName: 'Circle Spells', active: false })])
    }
    if (cantrip) {
      expect(effective(earned)?.cantrips.map((ref) => ref.toLowerCase())).toContain(
        cantrip + '|xphb',
      )
      expect(effective(actor('PHB', 3))?.cantrips.map((ref) => ref.toLowerCase())).toContain(
        cantrip + '|phb',
      )
    }
    const removed = lookups({
      ...data,
      classes: data.classes.map((row) => ({
        ...row,
        subclasses: row.subclasses?.filter((candidate) => candidate.source !== 'TCE'),
      })),
    })
    expect(fixed(earned, removed)).toEqual([])
    expect(fixed(earned)).toEqual(expected('xphb'))
    const sheet = createCharacterSheetViewModel(actor('XPHB', 6), current, current)
    expect(sheet.declaredClassFeatureSummaries?.map((row) => row.compactText)).toContain(later)
    expect(
      createCharacterSheetViewModel(
        actor('XPHB', 5),
        current,
        current,
      ).declaredClassFeatureSummaries?.map((row) => row.compactText),
    ).not.toContain(later)
    for (const template of ['2024-official', '2024-custom'] as const) {
      const bytes = await generateTestCharacterSheet(sheet, template, {
        text: { descriptions: 'full', overflow: 'notes' },
      })
      const form = (await PDFDocument.load(bytes)).getForm()
      const printed = form
        .getFields()
        .flatMap((field) => (field instanceof PDFTextField ? [field.getText()] : []))
        .join(' ')
      expect(printed).toContain(later)
    }
  },
  20_000,
)

test.each(variants)(
  'Druidic earns exact language and revised prepared spell through save, Review and PDF (%s)',
  async (type, _root) => {
    const { data, current } = getCatalog(type)
    for (const source of ['PHB', 'XPHB']) {
      const isRevised = source === 'XPHB'
      const actor = makeCharacterFixture({
        originSystem: isRevised ? '2024' : '2014',
        allowedSources: [source],
        classProgression: [{ ...revised, source, levels: 2 }],
      })
      const calculation = createCharacterCalculationContext(actor, current, current)
      const effective = calculation.character
      const tags = effective.provenance.proficiencies.languages.druidic
      expect(tags).toEqual([
        expect.objectContaining({
          sourceType: 'class',
          sourceName: 'Druid',
          sourceRef: source,
          grantType: 'fixed',
        }),
      ])
      expect(getFixedLanguageDetails(data.languages, 'druidic', tags)?.source).toBe(source)
      const sheet = createCharacterSheetViewModel(actor, current, current)
      expect(sheet.languagesSummary).toContain('druidic')
      expect(sheet.spellRows.filter((row) => row.name === 'Speak with Animals')).toEqual(
        isRevised ? [expect.objectContaining({ level: '1', prepared: true })] : [],
      )
      expect(sheet.spellRows.some((row) => row.name === 'Find Familiar')).toBe(false)
      if (!isRevised) continue
      const pdf = await PDFDocument.load(await generateTestCharacterSheet(sheet, '2024-official'))
      const text = pdf
        .getForm()
        .getFields()
        .flatMap((field) => (field instanceof PDFTextField ? [field.getText() ?? ''] : []))
        .join('\n')
      expect(text).toMatch(/druidic/i)
      expect(text).toContain('Speak with Animals')

      const spellContext = calculation.classChoices.spellContext
      const prepare = (saved: Character, reference: string, context = spellContext) =>
        reopen(
          saved,
          setDailyClassSpellPreparedCommand(
            saved,
            saved.provenance,
            profileId,
            reference,
            true,
            context,
          ),
        )
      expect(() => prepare(actor, spell)).toThrow(/already always prepared/)
      const daily = prepare(actor, 'Goodberry|XPHB')
      const active = profile(createCharacterCalculationContext(daily, current, current).character)!
      expect(active.alwaysPreparedSpells).toEqual([spell])
      expect(getSpellProfileSelectionCounts(active).prepared).toBe(1)

      const otherSpells = data.spells.filter(
        (row) => row.name !== 'Speak with Animals' || row.source !== 'XPHB',
      )
      const noSpell = lookups({ ...data, spells: otherSpells })
      const hidden = createCharacterCalculationContext(daily, noSpell, current)
      expect(profile(hidden.character)?.alwaysPreparedSpells ?? []).toEqual([])
      expect(validateSpells(daily, hidden, noSpell.spellsByKey)).toContainEqual(
        expect.objectContaining({ title: `Restore Druidic spell: ${spell}` }),
      )

      const [literalNeighbor] = parseSpells([
        { name: 'Speak with Animals|other', source: 'XPHB', level: 1 },
      ]) as Spell5e[]
      for (const spells of [otherSpells, data.spells]) {
        const withNeighbor = lookups({ ...data, spells: [...spells, literalNeighbor] })
        const view = createCharacterCalculationContext(daily, withNeighbor, current).character
        expect(profile(view)?.alwaysPreparedSpells ?? []).toEqual(
          spells === data.spells ? [spell] : [],
        )
      }

      const noFeature = lookups({
        ...data,
        classFeatures: data.classFeatures.filter(
          (row) => row.name !== 'Druidic' || row.source !== 'XPHB',
        ),
      })
      const lost = createCharacterCalculationContext(daily, noFeature, current)
      expect(lost.character.proficiencies.languages).not.toContain('druidic')
      expect(profile(lost.character)?.alwaysPreparedSpells ?? []).toEqual([])
      const independent = prepare(daily, spell, lost.classChoices.spellContext)
      for (const visible of [current, noFeature, current]) {
        const view = profile(
          createCharacterCalculationContext(independent, visible, current).character,
        )!
        expect(view.preparedSpells).toContain(spell)
        expect(view.alwaysPreparedSpells ?? []).toEqual(visible === current ? [spell] : [])
        expect(getSpellProfileSelectionCounts(view).prepared).toBe(visible === current ? 1 : 2)
      }
    }

    const fighter = { name: 'Fighter', source: 'XPHB', levels: 1 }
    const before = makeCharacterFixture({
      originSystem: '2024',
      allowedSources: ['XPHB'],
      classProgression: [fighter],
    })
    before.proficiencies.languages = ['druidic']
    const manual = makeSourceTag('manual', 'User Choice', 'choice')
    before.provenance = addGrant(before.provenance, 'languages', 'druidic', manual)
    const gain = (saved: Character, progression: Character['classProgression']) =>
      reopen(
        saved,
        applyClassProgressionUpdate(saved, saved.provenance, progression, undefined, {
          ...current,
          spellContext: createCharacterCalculationContext(saved, current, current).classChoices
            .spellContext,
        }),
      )
    const bonusId = 'special:unrestricted'
    const withBonus = reopen(
      before,
      setProfileSpells(before, before.provenance, bonusId, [], [spell], current.spellsByKey),
    )
    const added = gain(withBonus, [fighter, revised])
    expect(added.provenance.proficiencies.languages.druidic).toHaveLength(2)
    expect(
      profile(createCharacterCalculationContext(added, current, current).character)
        ?.alwaysPreparedSpells,
    ).toEqual([spell])
    const removed = gain(added, [fighter])
    expect(removed.provenance.proficiencies.languages.druidic).toEqual([manual])
    expect(
      profile(createCharacterCalculationContext(removed, current, current).character),
    ).toBeUndefined()

    const bonus = createCharacterCalculationContext(
      removed,
      current,
      current,
    ).character.spells.spellProfiles.find((row) => row.id === bonusId)
    expect(bonus?.spellsKnown).toEqual([spell])

    for (const tokens of [
      ['speak with animals|phb'],
      [spell, spell],
      ['speak with animals|xphb#2'],
    ]) {
      const conflict = lookups({
        ...data,
        classes: data.classes.map((row) =>
          row.name === 'Druid' && row.source === 'XPHB'
            ? { ...row, additionalSpells: [{ prepared: { 1: tokens } }] }
            : row,
        ),
      })
      const view = createCharacterCalculationContext(added, conflict, current).character
      expect(profile(view)?.alwaysPreparedSpells ?? []).toEqual([])
      expect(view.provenance.proficiencies.languages.druidic).toHaveLength(2)
    }

    const exactLanguage = data.languages.find(
      (row) => row.name === 'Druidic' && row.source === 'XPHB',
    )!
    const wrongLanguage = lookups({
      ...data,
      languages: data.languages.filter((row) => row !== exactLanguage),
    })
    const duplicated = lookups(
      composeGameDataLayers([{ ...data, languages: [...data.languages, exactLanguage] }]),
    )
    for (const visible of [wrongLanguage, duplicated, current]) {
      const view = createCharacterCalculationContext(added, visible, current).character
      expect(view.provenance.proficiencies.languages.druidic).toHaveLength(
        visible === current ? 2 : 1,
      )
      expect(profile(view)?.alwaysPreparedSpells).toEqual([spell])
    }
  },
  30_000,
)
