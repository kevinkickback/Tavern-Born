// @vitest-environment jsdom
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { PDFDocument, PDFTextField } from '@cantoo/pdf-lib'
import { renderHook } from '@testing-library/react'
import { afterEach, beforeAll, expect, test } from 'vitest'
import { useCharacterGameDataParams } from '@/hooks/data/useFilteredGameData'
import { getSelectedSubclassData } from '@/lib/5etools/classData'
import {
  decodeSubclassFeatureReference,
  getSubclassFeatureIdentity,
} from '@/lib/5etools/classFeatureIdentity'
import { composeGameDataLayers } from '@/lib/5etools/contentLayers'
import { FiveEToolsDataLoader } from '@/lib/5etools/dataLoader'
import { DataFilter } from '@/lib/5etools/filters'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { getDirectSubclassFeatureReference } from '@/lib/5etools/nativeSubclassFeatureSource'
import { parseClassDocument } from '@/lib/5etools/parsers/classes'
import { materializeSubclassFeatureCopies } from '@/lib/5etools/subclassSourcePreparation'
import { getEarnedSubclassSpellGrants } from '@/lib/5etools/subclassSpells'
import { WIZARD_THIRD_EYE_TARGET } from '@/lib/5etools/wizardTraditionSpellSources'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
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
import { setManagedClassSpellChoiceCommand } from '@/lib/character/commands/managedClassSpellCommands'
import { getManagedClassSpellSlots } from '@/lib/character/managedClassSpellSlots'
import { getManagedClassSpellPool } from '@/lib/character/managedClassSpells'
import { createOptionalClassFeatureActivity } from '@/lib/character/optionalClassFeatureActivity'
import { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Class5e, GameData } from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import type { ManagedClassSpellSlot } from '@/types/classCasting'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { generateTestCharacterSheet } from '../fixtures/pdfTemplates'

const hasData = existsSync('data/class/class-wizard.json')
let data: GameData
afterEach(() => useGameDataStore.setState({ gameData: null }))
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

function fixture(source: 'PHB' | 'XPHB', printing = source as string) {
  const sources = [source, printing]
  const filtered = { ...data, classes: DataFilter.filterClasses(data.classes, { sources }) }
  const catalogs = buildClassChoiceFeatureCatalogs(filtered)
  const current = {
    ...buildGameDataLookups(filtered),
    classChoiceClasses: filtered.classes,
    classChoiceFeatureCatalogs: catalogs,
  }
  const raw = buildGameDataLookups(data)
  const character = makeCharacterFixture({
    originSystem: source === 'PHB' ? '2014' : '2024',
    allowedSources: sources,
    classProgression: [{ name: 'Wizard', source, levels: 1 }],
  })
  const calculate = (actor: Character) => createCharacterCalculationContext(actor, current, raw)
  const apply = (actor: Character, result: CharacterCommandResult) =>
    characterPersistenceSchema.parse(
      JSON.parse(
        JSON.stringify({ ...actor, ...result.characterPatch, provenance: result.provenanceUpdate }),
      ),
    )
  const choose = (actor: Character, slot: ManagedClassSpellSlot, name: string) =>
    apply(
      actor,
      setManagedClassSpellChoiceCommand(
        actor,
        actor.provenance,
        {
          slot,
          expected: null,
          expectedEmptyRevision: actor.managedClassSpellRevision ?? 0,
          target: { name, source },
          policy: 'default',
        },
        calculate(actor).classChoices.spellContext,
      ),
    )
  const advance = (actor: Character, levels: number) =>
    apply(
      actor,
      applyClassProgressionUpdate(actor, actor.provenance, [
        { ...actor.classProgression[0], levels },
      ]),
    )
  const subclass = (actor: Character, name: string) =>
    apply(
      actor,
      selectSubclass(actor, actor.provenance, name, printing, undefined, {
        classChoiceFeatureCatalogs: catalogs,
      }),
    )
  const slots = (actor: Character) =>
    getManagedClassSpellSlots(
      actor.classProgression[0],
      actor,
      catalogs,
      calculate(actor).classChoices.prerequisites,
    )
  return { character, catalogs, calculate, apply, choose, advance, subclass, slots, current, raw }
}

test.skipIf(!hasData).each([
  ['PHB', 'School of Illusion', 2],
  ['XPHB', 'Illusionist', 3],
] as const)(
  '%s earns an independent alternative when Minor Illusion is already known',
  (source, tradition, gain) => {
    const { character, calculate, apply, choose, advance, subclass, slots, current, raw } =
      fixture(source)
    const ordinary = slots(character).find((slot) => slot[1] === 'class-cantrip')!
    const normal = subclass(advance(character, gain), tradition)
    const profile = (actor: Character) =>
      calculate(actor).character.spells.spellProfiles.find(
        (row) => row.id === `class:Wizard|${source}`,
      )
    const alternate = (actor: Character) =>
      slots(actor).find((slot) => slot[1] === 'feature-cantrip')
    expect(alternate(normal)).toBeUndefined()
    expect(profile(normal)?.fixedSpells?.map((value) => value.toLowerCase())).toContain(
      `minor illusion|${source.toLowerCase()}`,
    )
    const afterGain = advance(normal, 4)
    const laterCantrip = slots(afterGain).find(
      (slot) => slot[1] === 'class-cantrip' && slot[3] === 4,
    )!
    expect(() => choose(afterGain, laterCantrip, 'Minor Illusion')).toThrow(
      'supplies Minor Illusion',
    )
    const prior = choose(character, ordinary, 'Minor Illusion')
    expect(alternate(prior)).toBeUndefined()
    const learned = subclass(advance(prior, gain), tradition)
    const slot = alternate(learned)
    if (!slot) throw new Error('Missing the earned alternate')
    expect(slot[3]).toBe(gain)
    const pool = getManagedClassSpellPool(
      learned,
      slot,
      calculate(learned).classChoices.spellContext,
    )
    expect(pool.spells.some((row) => row.name === 'Minor Illusion')).toBe(false)
    expect(pool.spells.some((row) => row.name === 'Mage Hand' && row.source === source)).toBe(true)
    const chosen = choose(learned, slot, 'Mage Hand')
    expect(profile(chosen)?.cantrips.map((value) => value.toLowerCase())).toEqual(
      expect.arrayContaining([
        `mage hand|${source.toLowerCase()}`,
        `minor illusion|${source.toLowerCase()}`,
      ]),
    )
    expect(profile(chosen)?.fixedSpells?.map((value) => value.toLowerCase()) ?? []).not.toContain(
      `minor illusion|${source.toLowerCase()}`,
    )
    const earlier = chosen.managedClassSpellChoices?.find(
      (row) => row.target.name === 'Minor Illusion',
    )
    if (!earlier) throw new Error('Missing independent ordinary cantrip')
    const unavailableOrdinaryList = createCharacterCalculationContext(
      chosen,
      {
        ...current,
        spellsByKey: Object.fromEntries(
          Object.entries(current.spellsByKey).map(([key, spell]) => [
            key,
            spell.name === 'Minor Illusion' && spell.source === source
              ? { ...spell, classes: {}, classSpellRoutes: [], classSpellRouteSource: undefined }
              : spell,
          ]),
        ),
      },
      raw,
    )
    expect(unavailableOrdinaryList.managedClassSpellStatuses.map(({ active }) => active)).toEqual([
      false,
      false,
    ])
    expect(
      unavailableOrdinaryList.character.spells.spellProfiles.find(
        (row) => row.id === `class:Wizard|${source}`,
      )?.fixedSpells,
    ).toContain(`Minor Illusion|${source}`)
    expect(unavailableOrdinaryList.character.managedClassSpellChoices).toEqual(
      chosen.managedClassSpellChoices,
    )
    expect(calculate(chosen).managedClassSpellStatuses.map(({ active }) => active)).toEqual([
      true,
      true,
    ])
    const corrected = apply(
      chosen,
      setManagedClassSpellChoiceCommand(
        chosen,
        chosen.provenance,
        {
          slot: earlier.slot,
          expected: earlier,
          target: { name: 'Fire Bolt', source },
          policy: 'default',
        },
        calculate(chosen).classChoices.spellContext,
      ),
    )
    expect(profile(corrected)?.fixedSpells?.map((value) => value.toLowerCase())).toContain(
      `minor illusion|${source.toLowerCase()}`,
    )
    expect(
      calculate(corrected).managedClassSpellStatuses.find(
        (row) => row.choice.target.name === 'Mage Hand',
      )?.active,
    ).toBe(false)
    const down = advance(chosen, gain - 1)
    expect(down.managedClassSpellChoices?.map((row) => row.target.name)).toEqual(['Minor Illusion'])
  },
)

test.skipIf(!hasData)('Enchanting Conversationalist earns one of its three authored skills', () => {
  const { character, catalogs, calculate, apply, advance, subclass } = fixture('XPHB', 'AU')
  const saved = subclass(advance(character, 3), 'Enchanter')
  const cls = catalogs.classes.find((row) => row.name === 'Wizard' && row.source === 'XPHB')!
  const owner = getSelectedSubclassData(cls, saved.classProgression[0])
  const choices = getCharacterClassChoices(
    cls,
    owner,
    createOptionalClassFeatureActivity(saved, catalogs),
    catalogs,
  )
  const choice = choices.find((row) => row.label === 'Enchanting Conversationalist skills')!
  expect(choice.level).toBe(3)
  const pool = resolveClassChoiceOptions(choice, createClassChoiceCatalogs(catalogs), [], 3, saved)
    .filter(isClassChoiceOptionEligible)
    .map((row) => row.reference)
  expect(pool.map((row) => row.name.toLowerCase()).sort()).toEqual([
    'deception',
    'intimidation',
    'persuasion',
  ])
  const picked = apply(
    saved,
    applyClassChoiceSelectionWithGrantsCommand(saved, saved.provenance, choice, [pool[0]], {
      classes: catalogs.classes,
      catalogs: createClassChoiceCatalogs(catalogs),
      spellContext: calculate(saved).classChoices.spellContext,
    }),
  )
  expect(
    calculate(picked).character.proficiencies.skills.map((skill) => skill.toLowerCase()),
  ).toContain(pool[0].name.toLowerCase())
  const skill = pool[0].name.toLowerCase()
  const effect = (intelligence: number) =>
    calculate({
      ...picked,
      abilityScores: { ...picked.abilityScores, intelligence },
    }).effects.sourceDeclarations.find((row) => row.label === 'Enchanting Conversationalist')
  expect(effect(8)).toMatchObject({
    target: { kind: 'skill-modifier', skill },
    operation: { kind: 'add', value: 1 },
  })
  expect(effect(18)).toMatchObject({
    target: { kind: 'skill-modifier', skill },
    operation: { kind: 'add', value: 4 },
  })
  const unavailable = fixture('XPHB').calculate(picked)
  expect(
    unavailable.effects.sourceDeclarations.some(
      (row) => row.label === 'Enchanting Conversationalist',
    ),
  ).toBe(false)
  expect(unavailable.character.proficiencies.skills).not.toContain(skill)
})

test.skipIf(!hasData)(
  'Diviner exposes The Third Eye only at its level-10 gain',
  async () => {
    const { character, calculate, advance, subclass, current, raw } = fixture('XPHB')
    const initial = subclass(advance(character, 3), 'Diviner')
    const cast = (level: number) =>
      calculate(advance(initial, level)).fixedClassSpellStatuses.find(
        (row) => row.featureName === 'The Third Eye',
      )
    expect(cast(9)).toBeUndefined()
    expect(cast(10)).toMatchObject({
      reference: 'See Invisibility|XPHB',
      prepared: false,
      active: true,
      castOnly: {},
    })
    expect(cast(10)?.castingNote).toContain('while this benefit is active')
    expect(cast(10)?.castingNote).toContain('Finish a Short or Long Rest before activating again')
    const doc = JSON.parse(await readFile('data/class/class-wizard.json', 'utf8'))
    const index = doc.subclassFeature.findIndex(
      (row: Parameters<typeof getSubclassFeatureIdentity>[0]) =>
        getSubclassFeatureIdentity(row) === WIZARD_THIRD_EYE_TARGET,
    )
    const { entries, ...original } = doc.subclassFeature[index]
    const substitute = { ...original, entries, name: 'Unrelated Diviner Feature' }
    doc.subclassFeature[index] = {
      ...original,
      _copy: {
        name: substitute.name,
        source: substitute.source,
        className: substitute.className,
        classSource: substitute.classSource,
        subclassShortName: substitute.subclassShortName,
        subclassSource: substitute.subclassSource,
        level: substitute.level,
      },
    }
    doc.subclassFeature.push(substitute)
    const copiedWizard = (parseClassDocument(doc).classes as Class5e[]).find(
      (row) => row.source === 'XPHB',
    )
    expect(copiedWizard).toBeDefined()
    const copiedDiviner = copiedWizard?.subclasses?.find((row) => row.name === 'Diviner')
    expect(
      copiedDiviner &&
        getDirectSubclassFeatureReference(copiedDiviner, WIZARD_THIRD_EYE_TARGET)?.feature?.entries,
    ).toEqual(entries)
    expect(
      getEarnedSubclassSpellGrants(copiedWizard, advance(initial, 10).classProgression[0]),
    ).toEqual([])
    const profile = calculate(advance(initial, 10)).character.spells.spellProfiles.find(
      (row) => row.id === 'class:Wizard|XPHB',
    )
    expect(profile?.spellsKnown).not.toContain('See Invisibility|XPHB')
    expect(profile?.alwaysPreparedSpells ?? []).not.toContain('See Invisibility|XPHB')
    const sheet = createCharacterSheetViewModel(advance(initial, 10), raw, current)
    expect(sheet.spellRows.find((row) => row.name === 'See Invisibility')).toMatchObject({
      prepared: false,
      castOnly: true,
    })
    const bytes = await generateTestCharacterSheet(sheet, '2024-official', {
      text: { descriptions: 'full', overflow: 'notes' },
    })
    const form = (await PDFDocument.load(bytes)).getForm()
    expect(
      form
        .getFields()
        .some(
          (field) =>
            field instanceof PDFTextField &&
            /^Text_1(?:2[2-9]|[34]\d|5[01])$/.test(field.getName()) &&
            field.getText() === 'See Invisibility',
        ),
    ).toBe(true)
  },
  20_000,
)

test.skipIf(!hasData)(
  'reviewed Wizard traditions expose their actual rules at the earning boundary',
  async () => {
    const sourceDocument = JSON.parse(await readFile('data/class/class-wizard.json', 'utf8'))
    const producers = materializeSubclassFeatureCopies(sourceDocument.subclassFeature)
    useGameDataStore.setState({ gameData: { ...data, lookups: buildGameDataLookups(data) } })
    for (const [source, edition, gain, extra] of [
      ['PHB', '2014', 2, ['XGE', 'EGW', 'TCE']],
      ['XPHB', '2024', 3, ['XGE', 'EGW', 'TCE', 'FRHoF', 'AU']],
    ] as const) {
      const allowedSources = [source, ...extra]
      const hook = renderHook(() =>
        useCharacterGameDataParams({ allowedSources, originSystem: edition }),
      )
      const visible = hook.result.current
      hook.unmount()
      const classes = visible.classes
      const wizard = classes.find((row) => row.name === 'Wizard' && row.source === source)
      if (!wizard?.subclasses) throw new Error('Missing current Wizard traditions')
      expect(wizard.subclasses).toHaveLength(13)
      const current = {
        ...buildGameDataLookups(visible),
        classChoiceClasses: classes,
        classChoiceFeatureCatalogs: buildClassChoiceFeatureCatalogs(visible),
      }
      for (const tradition of wizard.subclasses) {
        const declared = sourceDocument.subclass.find(
          (row: Record<string, unknown>) =>
            row.classSource === source &&
            row.name === tradition.name &&
            row.source === tradition.source,
        )
        if (!declared) throw new Error(`Missing authored Wizard tradition ${tradition.name}`)
        const expected = declared.subclassFeatures.flatMap(
          (row: string | { subclassFeature: string }) => {
            const ref = typeof row === 'string' ? row : row.subclassFeature
            const decoded = decodeSubclassFeatureReference(ref)
            if (!decoded.level || decoded.level <= gain) return []
            const target = getSubclassFeatureIdentity(decoded)
            const feature = producers.find((row) => getSubclassFeatureIdentity(row) === target)
            return feature ? [{ name: feature.name as string, level: decoded.level }] : []
          },
        )
        expect(expected.length, tradition.name).toBeGreaterThanOrEqual(3)
        const summaries = (level: number) =>
          createCharacterSheetViewModel(
            makeCharacterFixture({
              originSystem: edition,
              allowedSources,
              classProgression: [
                {
                  name: 'Wizard',
                  source,
                  levels: level,
                  subclass: tradition.name,
                  subclassSource: tradition.source,
                },
              ],
            }),
            current,
            current,
          ).declaredClassFeatureSummaries ?? []
        for (const level of new Set<number>(expected.map((row: { level: number }) => row.level))) {
          const before = summaries(level - 1).map((row) => row.compactText)
          const after = summaries(level)
          for (const { name } of expected.filter((row: { level: number }) => row.level === level)) {
            expect(before, tradition.name).not.toContain(name)
            expect(
              after.filter((row) => row.compactText === name),
              tradition.name,
            ).toHaveLength(1)
            expect(after.find((row) => row.compactText === name)?.text.length).toBeGreaterThan(
              name.length,
            )
          }
        }
      }
    }
  },
  90_000,
)
