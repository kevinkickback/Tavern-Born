import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PDFDocument, PDFTextField } from '@cantoo/pdf-lib'
import { renderHook } from '@testing-library/react'
import { afterAll, beforeAll, expect, test, vi } from 'vitest'
import { useCharacterGameDataParams } from '@/hooks/data/useFilteredGameData'
import { loadGameDataSourceStack } from '@/lib/5etools/contentLayers'
import { buildGameDataLookups, buildSpellLookup } from '@/lib/5etools/lookups'
import { parseSpellRouteSource } from '@/lib/5etools/spellRouteSources'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { SPECIAL_SPELL_PROFILE_ID } from '@/lib/calculations/spellProfiles.constants'
import {
  buildClassChoiceFeatureCatalogs,
  createClassChoiceCatalogs,
  getCharacterClassChoices,
} from '@/lib/character/classChoiceOptions'
import { applyClassChoiceSelectionWithGrantsCommand } from '@/lib/character/commands/classChoiceCommands'
import {
  applyClassProgressionUpdate,
  applyLevelDown,
  applyLevelUp,
} from '@/lib/character/commands/classCommands'
import {
  type ManagedClassSpellRequest,
  setManagedClassSpellChoicesCommand,
} from '@/lib/character/commands/managedClassSpellCommands'
import { setProfileSpells } from '@/lib/character/commands/spellCommands'
import { createEmptyCharacter, emptyProvenance } from '@/lib/character/createCharacter'
import { getManagedClassSpellSlots } from '@/lib/character/managedClassSpellSlots'
import { getManagedClassSpellPool } from '@/lib/character/managedClassSpells'
import { createOptionalClassFeatureActivity } from '@/lib/character/optionalClassFeatureActivity'
import {
  getInvocationRitualTranscriptionOffers,
  getSelectedFeatureCantripSetups,
} from '@/lib/character/selectedFeatureSpells'
import { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import { validateClassChoices } from '@/lib/readiness/classReadiness'
import { validateSpells } from '@/lib/readiness/spellReadiness'
import { useGameDataStore } from '@/store/gameDataStore'
import type { GameData, OptionalFeatureLike, Spell5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { generateTestCharacterSheet } from '../fixtures/pdfTemplates'

const cases = [
  ['2014', 'PHB', 'Armor of Shadows', 'Mage Armor', true],
  ['2014', 'PHB', 'Mask of Many Faces', 'Disguise Self', false],
  ['2014', 'PHB', 'Misty Visions', 'Silent Image', true],
  ['2024', 'XPHB', 'Armor of Shadows', 'Mage Armor', false],
  ['2024', 'XPHB', 'Mask of Many Faces', 'Disguise Self', false],
  ['2024', 'XPHB', 'Misty Visions', 'Silent Image', false],
  ['2014', 'PHB', 'Otherworldly Leap', 'Jump', true, 9],
  ['2024', 'XPHB', 'Otherworldly Leap', 'Jump', false, 2],
  ['2014', 'PHB', 'Master of Myriad Forms', 'Alter Self', false, 15],
  ['2024', 'XPHB', 'Master of Myriad Forms', 'Alter Self', false, 5],
  ['2024', 'XPHB', 'One with Shadows', 'Invisibility', false, 5],
  ['2014', 'PHB', 'Visions of Distant Realms', 'Arcane Eye', false, 15],
  ['2024', 'XPHB', 'Visions of Distant Realms', 'Arcane Eye', false, 9],
  ['2014', 'PHB', 'Whispers of the Grave', 'Speak with Dead', false, 9],
  ['2024', 'XPHB', 'Whispers of the Grave', 'Speak with Dead', false, 7],
] as const
const catalogsByEdition = new Map<string, GameData>()
let allowedSources: string[]

beforeAll(async () => {
  const root = resolve('resources/srd/data')
  const readBundledJson = async (path: string) =>
    JSON.parse(readFileSync(resolve(root, path), 'utf8'))
  vi.stubGlobal('electronAPI', { readBundledJson })
  const { packId, packVersion } = await readBundledJson('../manifest.json')
  const data = await loadGameDataSourceStack({
    base: { type: 'bundled', path: 'srd/core', packId, packVersion, isValid: true },
  })
  useGameDataStore.setState({ gameData: { ...data, lookups: buildGameDataLookups(data) } })
  allowedSources = data.sources
    .filter((row) => row.hasCharacterOptions !== false)
    .map((row) => row.abbreviation)
  for (const originSystem of ['2014', '2024'] as const) {
    const hook = renderHook(() => useCharacterGameDataParams({ allowedSources, originSystem }))
    catalogsByEdition.set(originSystem, hook.result.current)
    hook.unmount()
  }
})

afterAll(() => vi.unstubAllGlobals())

function patch(
  actor: Character,
  result: { characterPatch: Partial<Character>; provenanceUpdate: Character['provenance'] },
) {
  return characterPersistenceSchema.parse(
    JSON.parse(
      JSON.stringify({
        ...actor,
        ...result.characterPatch,
        provenance: result.provenanceUpdate,
      }),
    ),
  )
}

function warlock(edition: '2014' | '2024', source: string) {
  const data = catalogsByEdition.get(edition)
  const cls = data?.classes.find((row) => row.name === 'Warlock' && row.source === source)
  if (!data || !cls) throw new Error('Missing exact Warlock fixture')
  const catalogs = buildClassChoiceFeatureCatalogs(data)
  const lookups = {
    ...buildGameDataLookups(data),
    classChoiceClasses: data.classes,
    classChoiceFeatureCatalogs: catalogs,
  }
  const initial = createEmptyCharacter({
    name: 'Invocation test',
    originSystem: edition,
    allowedSources,
    classProgression: [{ name: 'Warlock', source, levels: 1 }],
    hitPointsInitialized: true,
    hitPoints: { current: 8, temporary: 0 },
    provenance: emptyProvenance(),
  })
  const calc = (actor: Character, current = lookups) =>
    createCharacterCalculationContext(actor, current, lookups)
  const level2 = (actor: Character) =>
    patch(
      actor,
      applyLevelUp(
        actor,
        actor.provenance ?? emptyProvenance(),
        [{ name: 'Warlock', source, levels: 2 }],
        {
          className: 'Warlock',
          classSource: source,
          classLevel: 2,
          hitDie: 8,
          dieResult: 5,
          method: 'average',
        },
        calc(actor),
      ),
    )
  const choose = (actor: Character, label: string, names: string[]) => {
    const choice = getCharacterClassChoices(
      cls,
      undefined,
      createOptionalClassFeatureActivity(actor, catalogs),
      catalogs,
    ).find((row) => row.label === label)
    if (!choice) throw new Error(`Missing native Warlock choice ${label}`)
    return patch(
      actor,
      applyClassChoiceSelectionWithGrantsCommand(
        actor,
        actor.provenance ?? emptyProvenance(),
        choice,
        names.map((name) => ({ entityType: 'optionalFeature', name, source })),
        {
          classes: data.classes,
          catalogs,
          feats: data.feats,
          spellContext: calc(actor).classChoices.spellContext,
        },
      ),
    )
  }
  const bonus = (actor: Character, ...references: string[]) =>
    patch(
      actor,
      setProfileSpells(
        actor,
        actor.provenance ?? emptyProvenance(),
        SPECIAL_SPELL_PROFILE_ID,
        [],
        references,
        lookups.spellsByKey,
      ),
    )
  const select = (actor: Character, ...names: string[]) =>
    choose(actor, 'Eldritch Invocations', names)
  return { data, lookups, initial, level2, select, choose, calc, bonus }
}

test.each(
  cases,
)('%s %s %s grants its exact spell and printing restrictions', (edition, source, invocation, spell, noMaterials, level = 2) => {
  const fixture = warlock(edition, source)
  const original = atLevel(fixture.initial, level)
  const actor = fixture.select(original, invocation)
  const calculation = fixture.calc(actor)
  const reference = `${spell}|${source}`
  expect(calculation.atWillInvocationSpellStatuses).toMatchObject([
    { featureName: invocation, reference, spell: { name: spell, source } },
  ])
  const [grant] = calculation.atWillInvocationSpellStatuses
  expect(grant.rules).toMatch(/without expending a spell slot/)
  expect(grant.rules.includes('or material components')).toBe(noMaterials)
  if (invocation === 'Armor of Shadows' || invocation === 'Otherworldly Leap')
    expect(grant.rules).toMatch(/on yourself/)
  if (invocation === 'One with Shadows') expect(grant.rules).toMatch(/Dim Light or Darkness/)
  if (level > 2)
    expect(fixture.calc(atLevel(actor, level - 1)).atWillInvocationSpellStatuses).toEqual([])
  expect(calculation.classCasting).toEqual(fixture.calc(original).classCasting)
  expect(calculation.classChoices.prerequisites.effectiveSpellProfiles).toEqual(
    fixture.calc(original).classChoices.prerequisites.effectiveSpellProfiles,
  )
  expect(
    validateSpells(actor, calculation, fixture.lookups.spellsByKey).some((row) =>
      row.title.includes(invocation),
    ),
  ).toBe(false)

  const vm = createCharacterSheetViewModel(actor, fixture.lookups, fixture.lookups)
  expect(vm.spellRows).toContainEqual(
    expect.objectContaining({
      name: spell,
      prepared: true,
      castingNote: expect.stringContaining(invocation),
    }),
  )
  expect(
    vm.spellcastingPages.find(({ detail }) => detail.profileId === grant.profileId)?.spellRows,
  ).toContainEqual(
    expect.objectContaining({ name: spell, castingNote: expect.stringContaining(invocation) }),
  )
  expect(fixture.calc(fixture.select(actor)).atWillInvocationSpellStatuses).toEqual([])
})

function atLevel(actor: Character, levels: number): Character {
  return { ...actor, classProgression: [{ ...actor.classProgression[0], levels }] }
}

test.each([
  ['2014', 'PHB', 9, '2014-official'],
  ['2024', 'XPHB', 2, '2024-official'],
] as const)(
  '%s Otherworldly Leap exports Jump on the official spell page',
  async (edition, source, level, template) => {
    const fixture = warlock(edition, source)
    const actor = fixture.select(atLevel(fixture.initial, level), 'Otherworldly Leap')
    const vm = createCharacterSheetViewModel(actor, fixture.lookups, fixture.lookups)
    const bytes = await generateTestCharacterSheet(vm, template)
    const form = (await PDFDocument.load(bytes)).getForm()
    expect(
      form.getFields().flatMap((field) => (field instanceof PDFTextField ? [field.getText()] : [])),
    ).toContain('Jump')
  },
  20_000,
)

test.each([
  ['2014', 'PHB', 'Thief of Five Fates', 'Bane', 2, 'using a warlock spell slot'],
  ['2014', 'PHB', 'Mire the Mind', 'Slow', 5, 'using a warlock spell slot'],
  ['2014', 'PHB', 'Sign of Ill Omen', 'Bestow Curse', 5, 'using a warlock spell slot'],
  ['2014', 'PHB', 'Bewitching Whispers', 'Compulsion', 7, 'using a warlock spell slot'],
  ['2014', 'PHB', 'Dreadful Word', 'Confusion', 7, 'using a warlock spell slot'],
  ['2014', 'PHB', 'Sculptor of Flesh', 'Polymorph', 7, 'using a warlock spell slot'],
  ['2014', 'PHB', 'Minions of Chaos', 'Conjure Elemental', 9, 'using a warlock spell slot'],
  ['2014', 'PHB', 'Chains of Carceri', 'Hold Monster', 15, 'same creature again'],
  ['2024', 'XPHB', 'Gift of the Depths', 'Water Breathing', 5, 'without expending a spell slot'],
] as const)('%s %s %s grants the printed limited cast', (edition, source, invocation, spell, level, restriction) => {
  const fixture = warlock(edition, source)
  let original = atLevel(fixture.initial, level)
  if (invocation === 'Chains of Carceri')
    original = fixture.choose(original, 'Pact Boon', ['Pact of the Chain'])
  const actor = fixture.select(original, invocation)
  const calculation = fixture.calc(actor)
  expect(calculation.fixedClassSpellStatuses).toContainEqual(
    expect.objectContaining({
      featureName: invocation,
      active: true,
      prepared: false,
      castOnly: {},
      castingNote: expect.stringContaining(restriction),
    }),
  )
  expect(calculation.atWillInvocationSpellStatuses).toEqual([])
  expect(calculation.character.spells.spellProfiles).toEqual(
    fixture.calc(original).character.spells.spellProfiles,
  )
  expect(
    validateSpells(actor, calculation, fixture.lookups.spellsByKey).some((row) =>
      row.title.includes(invocation),
    ),
  ).toBe(false)
  const vm = createCharacterSheetViewModel(actor, fixture.lookups, fixture.lookups)
  expect(vm.spellRows).toContainEqual(
    expect.objectContaining({
      name: spell,
      castOnly: true,
      prepared: false,
      castingNote: expect.stringContaining(restriction),
    }),
  )
  expect(
    fixture
      .calc(fixture.select(actor))
      .fixedClassSpellStatuses.some((row) => row.featureName === invocation),
  ).toBe(false)
})

test.each([
  ['2014', 'PHB', 2, '2014-official', 'Thief of Five Fates', 'Bane'],
  ['2024', 'XPHB', 5, '2024-official', 'Gift of the Depths', 'Water Breathing'],
] as const)(
  '%s exports the limited cast to the official PDF',
  async (edition, source, level, template, invocation, spell) => {
    const fixture = warlock(edition, source)
    const actor = fixture.select(atLevel(fixture.initial, level), invocation)
    const vm = createCharacterSheetViewModel(actor, fixture.lookups, fixture.lookups)
    const bytes = await generateTestCharacterSheet(vm, template)
    const form = (await PDFDocument.load(bytes)).getForm()
    expect(
      form.getFields().flatMap((field) => (field instanceof PDFTextField ? [field.getText()] : [])),
    ).toContain(spell)
  },
  20_000,
)

test('2014 Book of Ancient Secrets chooses, retains and exports ritual-only spells', async () => {
  const fixture = warlock('2014', 'PHB')
  const name = 'Book of Ancient Secrets'
  const tome = fixture.choose(atLevel(fixture.initial, 3), 'Pact Boon', ['Pact of the Tome'])
  const book = fixture.select(tome, name)
  const calculation = fixture.calc(book)
  const slots = getManagedClassSpellSlots(
    book.classProgression[0],
    book,
    calculation.classChoices.catalogs,
    calculation.classChoices.prerequisites,
  )
  const ritualSlots = slots.filter((slot) => slot[1] === 'feature-prepared')
  expect(ritualSlots).toHaveLength(2)
  const [first, second] = ritualSlots
  expect(validateSpells(book, calculation, fixture.lookups.spellsByKey)).toContainEqual(
    expect.objectContaining({ title: expect.stringContaining(name), severity: 'blocking' }),
  )
  const pool = getManagedClassSpellPool(book, first, calculation.classChoices.spellContext)
  expect(pool.spells.length).toBeGreaterThan(2)
  expect(pool.spells.every((spell) => spell.meta?.ritual && spell.level === 1)).toBe(true)
  expect(pool.spells.map((spell) => spell.name)).toContain('Find Familiar')
  const assign = (actor: Character, ...requests: ManagedClassSpellRequest[]) =>
    patch(
      actor,
      setManagedClassSpellChoicesCommand(
        actor,
        actor.provenance,
        requests,
        fixture.calc(actor).classChoices.spellContext,
      ),
    )
  const pick = (
    actor: Character,
    slot: ManagedClassSpellRequest['slot'],
    spell: string,
  ): ManagedClassSpellRequest => ({
    slot,
    expected: null,
    expectedEmptyRevision: actor.managedClassSpellRevision ?? 0,
    target: { name: spell, source: 'PHB' },
    policy: 'default',
  })
  expect(() => assign(book, pick(book, first, 'Augury'))).toThrow(/eligible ritual/)
  expect(() => assign(book, pick(book, first, 'Magic Missile'))).toThrow(/eligible ritual/)
  expect(() =>
    assign(book, pick(book, first, 'Find Familiar'), pick(book, second, 'Find Familiar')),
  ).toThrow()

  const ordinary = slots.find((slot) => slot[1] === 'class-known')
  if (!ordinary) throw new Error('Missing Pact Magic spell choice')
  const learned = assign(book, pick(book, ordinary, 'Comprehend Languages'))
  const knownRitual = fixture
    .calc(learned)
    .fixedClassSpellStatuses.filter(({ featureName }) => featureName === name)
  expect(knownRitual).toEqual([
    expect.objectContaining({
      reference: 'Comprehend Languages|PHB',
      active: true,
      prepared: false,
      castOnly: { castingTime: 'Ritual only' },
      castingNote: expect.stringContaining('spell you know as a ritual'),
    }),
  ])
  const knownRitualSheet = createCharacterSheetViewModel(learned, fixture.lookups, fixture.lookups)
  expect(knownRitualSheet.spellRows).toContainEqual(
    expect.objectContaining({
      name: 'Comprehend Languages',
      prepared: true,
      ritual: true,
      castingNote: expect.stringContaining('spell you know as a ritual'),
    }),
  )
  const ready = assign(
    learned,
    pick(learned, first, 'Find Familiar'),
    pick(learned, second, 'Comprehend Languages'),
  )
  const reopened = fixture.calc(ready)
  const profile = reopened.character.spells.spellProfiles.find(
    (row) => row.className === 'Warlock',
  )!
  expect(profile.spellsKnown).toEqual(['Comprehend Languages|PHB'])
  expect(profile?.alwaysPreparedSpells ?? []).toEqual([])
  expect(
    validateSpells(ready, reopened, fixture.lookups.spellsByKey).some((issue) =>
      issue.title.includes(name),
    ),
  ).toBe(false)
  const offer = (actor: Character) => {
    const { catalogs, prerequisites } = fixture.calc(actor).classChoices
    const setups = getSelectedFeatureCantripSetups(actor, catalogs, prerequisites)
    const [current] = getInvocationRitualTranscriptionOffers(
      actor,
      actor.classProgression[0],
      setups,
    )
    if (!current) throw new Error('Missing active transcription offer')
    return current.slot
  }
  const transcription = offer(ready)
  expect(transcription[3]).toBe(3)
  expect(
    getManagedClassSpellSlots(ready.classProgression[0], ready, reopened.classChoices.catalogs),
  ).not.toContainEqual(transcription)
  const eligible = getManagedClassSpellPool(
    ready,
    transcription,
    reopened.classChoices.spellContext,
  )
  expect(eligible.allowedLevels).toEqual([1, 2])
  expect(eligible).toMatchObject({ transcription: { hoursPerLevel: 2, goldPerLevel: 50 } })
  expect(() => assign(ready, pick(ready, transcription, 'Water Breathing'))).toThrow(
    /eligible ritual/,
  )
  expect(() => assign(ready, pick(ready, transcription, 'Find Familiar'))).toThrow(
    /owns that spell choice/,
  )
  const transcribed = assign(ready, pick(ready, transcription, 'Augury'))
  const levelFive = atLevel(transcribed, 5)
  const later = offer(levelFive)
  expect(() => assign(levelFive, pick(levelFive, later, 'Augury'))).toThrow(
    /owns that spell choice/,
  )
  expect(() =>
    assign(
      levelFive,
      pick(
        levelFive,
        [...transcription.slice(0, 4), 1] as typeof transcription,
        'Animal Messenger',
      ),
    ),
  ).toThrow(/current class level/)
  const expanded = assign(levelFive, pick(levelFive, later, 'Water Breathing'))
  const rolledBack = patch(
    expanded,
    applyClassProgressionUpdate(expanded, expanded.provenance, transcribed.classProgression),
  )
  expect(rolledBack.managedClassSpellChoices?.map((row) => row.target.name)).toContain('Augury')
  expect(rolledBack.managedClassSpellChoices?.map((row) => row.target.name)).not.toContain(
    'Water Breathing',
  )
  const vm = createCharacterSheetViewModel(expanded, fixture.lookups, fixture.lookups)
  expect(vm.spellRows).toContainEqual(
    expect.objectContaining({ name: 'Water Breathing', castOnly: true, ritual: true }),
  )
  expect(vm.spellRows).toContainEqual(
    expect.objectContaining({
      name: 'Find Familiar',
      ritual: true,
      prepared: false,
      castOnly: true,
      castingTime: 'Ritual only',
      castingNote: expect.stringContaining('Book of Shadows in hand'),
    }),
  )
  for (const template of ['2014-official', '2014-custom'] as const) {
    const bytes = await generateTestCharacterSheet(vm, template)
    const form = (await PDFDocument.load(bytes)).getForm()
    const values = form
      .getFields()
      .flatMap((field) => (field instanceof PDFTextField ? [field.getText() ?? ''] : []))
    for (const spell of ['Find Familiar', 'Augury', 'Water Breathing'])
      expect(values.some((text) => text.includes(spell))).toBe(true)
    expect(values.some((text) => text.includes('Book of Shadows in hand'))).toBe(true)
  }

  const cleared = fixture.select(expanded)
  const clearedCalculation = fixture.calc(cleared)
  expect(cleared.managedClassSpellChoices).toHaveLength(1)
  expect(
    clearedCalculation.character.spells.spellProfiles.find((row) => row.className === 'Warlock')
      ?.spellsKnown,
  ).toEqual(['Comprehend Languages|PHB'])
  expect(clearedCalculation.fixedClassSpellStatuses.some((row) => row.featureName === name)).toBe(
    false,
  )
  const switched = fixture.choose(ready, 'Pact Boon', ['Pact of the Blade'])
  expect(
    fixture.calc(switched).fixedClassSpellStatuses.some((row) => row.featureName === name),
  ).toBe(false)
}, 25_000)

test('revised replacement may fill the first slot and still follows current Warlock level', () => {
  const fixture = warlock('2024', 'XPHB')
  const levelOne = fixture.select(fixture.initial, 'Armor of Shadows')
  expect(fixture.calc(levelOne).atWillInvocationSpellStatuses[0]?.spell?.name).toBe('Mage Armor')
  const replaced = fixture.select(fixture.level2(levelOne), 'Mask of Many Faces')
  expect(replaced.classChoiceSelections?.[0]?.selected[0]?.slotLevel).toBe(1)
  const down = patch(
    replaced,
    applyLevelDown(replaced, replaced.provenance ?? emptyProvenance(), fixture.calc(replaced)),
  )
  expect(down.classChoiceSelections?.[0]?.selected[0]?.name).toBe('Mask of Many Faces')
  const lower = fixture.calc(down)
  expect(lower.atWillInvocationSpellStatuses).toEqual([])
  expect(lower.character.features.some((row) => row.name === 'Mask of Many Faces')).toBe(false)
  expect(
    validateClassChoices(
      down,
      lower,
      createClassChoiceCatalogs(fixture.lookups.classChoiceFeatureCatalogs),
    ),
  ).toContainEqual(
    expect.objectContaining({ title: 'Finish Eldritch Invocations', severity: 'blocking' }),
  )
  expect(fixture.calc(fixture.level2(down)).atWillInvocationSpellStatuses[0]?.spell?.name).toBe(
    'Disguise Self',
  )
})

test('exact spell loss, restoration and clearing preserve independent ownership', () => {
  const fixture = warlock('2014', 'PHB')
  const actor = fixture.bonus(
    fixture.select(fixture.level2(fixture.initial), 'Armor of Shadows'),
    'Mage Armor|PHB',
  )
  const spellsByKey = buildSpellLookup(
    fixture.data.spells.filter((row) => row.name !== 'Mage Armor' || row.source !== 'PHB'),
  )
  const missing = fixture.calc(actor, { ...fixture.lookups, spellsByKey })
  expect(missing.atWillInvocationSpellStatuses[0]?.spell).toBeUndefined()
  expect(
    validateSpells(actor, missing, spellsByKey).some((row) =>
      row.title.includes('Restore Armor of Shadows spell'),
    ),
  ).toBe(true)
  expect(fixture.calc(actor).atWillInvocationSpellStatuses[0]?.spell?.source).toBe('PHB')
  const withoutInvocation = fixture.calc(fixture.select(actor))
  expect(withoutInvocation.atWillInvocationSpellStatuses).toEqual([])
  expect(
    withoutInvocation.character.spells.spellProfiles.find(
      (row) => row.id === SPECIAL_SPELL_PROFILE_ID,
    )?.spellsKnown,
  ).toEqual(['Mage Armor|PHB'])
  const withoutBonus = fixture.calc(fixture.bonus(actor))
  expect(withoutBonus.atWillInvocationSpellStatuses[0]?.spell?.source).toBe('PHB')
})

test('changed or ambiguous Invocation declarations do not grant a spell', () => {
  const fixture = warlock('2014', 'PHB')
  const actor = fixture.select(fixture.level2(fixture.initial), 'Armor of Shadows')
  const features = fixture.lookups.classChoiceFeatureCatalogs.optionalFeatures
  const matches = (row: OptionalFeatureLike) =>
    row.name === 'Armor of Shadows' && row.source === 'PHB'
  const original = features.find(matches)
  if (!original) throw new Error('Missing native Armor of Shadows fixture')
  for (const rows of [
    features.map((row) =>
      matches(row)
        ? { ...row, entries: [...(row.entries ?? []), 'Only while wearing the amulet.'] }
        : row,
    ),
    features.map((row) =>
      matches(row)
        ? { ...row, additionalSpells: [{ innate: { _: { will: ['mage armor'] } } }] }
        : row,
    ),
    [...features, original],
  ]) {
    const catalogs = buildClassChoiceFeatureCatalogs({ ...fixture.data, optionalfeatures: rows })
    expect(
      fixture.calc(actor, { ...fixture.lookups, classChoiceFeatureCatalogs: catalogs })
        .atWillInvocationSpellStatuses,
    ).toEqual([])
  }
})

test('duplicate current Warlock declarations suspend the spell and exact restoration reactivates it', () => {
  const fixture = warlock('2014', 'PHB')
  const actor = fixture.select(fixture.level2(fixture.initial), 'Armor of Shadows')
  const classes = fixture.data.classes
  const owner = classes.find((row) => row.name === 'Warlock' && row.source === 'PHB')
  if (!owner) throw new Error('Missing native Warlock fixture')
  for (const currentClasses of [
    [...classes, { ...owner }],
    classes.map((row) => (row === owner ? { ...row, sourceIdentityConflict: true as const } : row)),
  ]) {
    const catalogs = { ...fixture.lookups.classChoiceFeatureCatalogs, classes: currentClasses }
    const calculation = fixture.calc(actor, {
      ...fixture.lookups,
      classChoiceFeatureCatalogs: catalogs,
    })
    expect(calculation.atWillInvocationSpellStatuses).toMatchObject([
      {
        featureName: 'Armor of Shadows',
        spell: undefined,
        reason: 'Restore a single exact Warlock class declaration.',
      },
    ])
    expect(validateSpells(actor, calculation, fixture.lookups.spellsByKey)).toContainEqual(
      expect.objectContaining({ explanation: 'Restore a single exact Warlock class declaration.' }),
    )
  }
  expect(fixture.calc(actor).atWillInvocationSpellStatuses[0]?.spell?.name).toBe('Mage Armor')
})

test('duplicate Invocation pools and invalid winning spell packages fail closed', () => {
  const fixture = warlock('2024', 'XPHB')
  const actor = fixture.select(fixture.initial, 'Armor of Shadows')
  const classes = fixture.data.classes
  const owner = classes.find((row) => row.name === 'Warlock' && row.source === 'XPHB')
  const rules = owner?.normalizedRules
  const pool = rules?.choices.find((row) => row.label === 'Eldritch Invocations')
  if (!rules || !pool) throw new Error('Missing native Invocation pool')
  const catalogs = {
    ...fixture.lookups.classChoiceFeatureCatalogs,
    classes: classes.map((row) =>
      row === owner
        ? {
            ...row,
            normalizedRules: {
              ...rules,
              choices: [
                ...rules.choices,
                { ...pool, source: { ...pool.source, field: 'optionalfeatureProgression[1]' } },
              ],
            },
          }
        : row,
    ),
  }
  expect(
    fixture.calc(actor, { ...fixture.lookups, classChoiceFeatureCatalogs: catalogs })
      .atWillInvocationSpellStatuses,
  ).toMatchObject([
    { spell: undefined, reason: 'Restore a single exact Eldritch Invocations declaration.' },
  ])

  const genuine = fixture.data.spells.find(
    (row) => row.name === 'Mage Armor' && row.source === 'XPHB',
  )
  if (!genuine) throw new Error('Missing native Mage Armor')
  const malformed = {
    ...genuine,
    classSpellRouteSource: {},
    entries: ['Conflicting rules'],
  } as Spell5e
  const spellsByKey = buildSpellLookup([malformed, ...fixture.data.spells])
  expect(
    fixture.calc(actor, { ...fixture.lookups, spellsByKey }).atWillInvocationSpellStatuses,
  ).toMatchObject([{ spell: undefined }])
  const badRoute = {
    ...genuine,
    classes: { ...genuine.classes, fromClassList: [{ name: '', source: 'XPHB' }] },
  }
  delete badRoute.classSpellRouteSource
  const diagnosed = parseSpellRouteSource(badRoute, 'test-spell-document', 'mage-armor')
  expect(diagnosed.classSpellRouteDiagnostics).toContainEqual(
    expect.objectContaining({ code: 'invalid-owner' }),
  )
  const diagnosedLookup = buildSpellLookup([
    diagnosed,
    ...fixture.data.spells.filter((row) => row !== genuine),
  ])
  expect(
    fixture.calc(actor, { ...fixture.lookups, spellsByKey: diagnosedLookup })
      .atWillInvocationSpellStatuses,
  ).toMatchObject([{ spell: undefined }])
  expect(fixture.calc(actor).atWillInvocationSpellStatuses[0]?.spell?.name).toBe('Mage Armor')
})
