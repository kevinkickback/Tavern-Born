import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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
import { applyLevelDown, applyLevelUp } from '@/lib/character/commands/classCommands'
import { setProfileSpells } from '@/lib/character/commands/spellCommands'
import { createEmptyCharacter, emptyProvenance } from '@/lib/character/createCharacter'
import { createOptionalClassFeatureActivity } from '@/lib/character/optionalClassFeatureActivity'
import { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import { validateClassChoices } from '@/lib/readiness/classReadiness'
import { validateSpells } from '@/lib/readiness/spellReadiness'
import { useGameDataStore } from '@/store/gameDataStore'
import type { GameData, OptionalFeatureLike, Spell5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'

const cases = [
  ['2014', 'PHB', 'Armor of Shadows', 'Mage Armor', true],
  ['2014', 'PHB', 'Mask of Many Faces', 'Disguise Self', false],
  ['2014', 'PHB', 'Misty Visions', 'Silent Image', true],
  ['2024', 'XPHB', 'Armor of Shadows', 'Mage Armor', false],
  ['2024', 'XPHB', 'Mask of Many Faces', 'Disguise Self', false],
  ['2024', 'XPHB', 'Misty Visions', 'Silent Image', false],
] as const
const catalogsByEdition = new Map<string, GameData>()
let allowedSources: string[]

beforeAll(async () => {
  const root = resolve('resources/srd/core/data')
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
  const select = (actor: Character, ...names: string[]) => {
    const choice = getCharacterClassChoices(
      cls,
      undefined,
      createOptionalClassFeatureActivity(actor, catalogs),
      catalogs,
    ).find((row) => row.label === 'Eldritch Invocations')
    if (!choice) throw new Error('Missing native Invocation pool')
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
  return { data, lookups, initial, level2, select, calc, bonus }
}

test.each(
  cases,
)('%s %s %s grants its exact spell and printing restrictions', (edition, source, invocation, spell, noMaterials) => {
  const fixture = warlock(edition, source)
  const original = fixture.level2(fixture.initial)
  const actor = fixture.select(original, invocation)
  const calculation = fixture.calc(actor)
  const reference = `${spell}|${source}`
  expect(calculation.atWillInvocationSpellStatuses).toMatchObject([
    { featureName: invocation, reference, spell: { name: spell, source } },
  ])
  const [grant] = calculation.atWillInvocationSpellStatuses
  expect(grant.rules).toMatch(/without expending a spell slot/)
  expect(grant.rules.includes('or material components')).toBe(noMaterials)
  if (invocation === 'Armor of Shadows') expect(grant.rules).toMatch(/on yourself/)
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
