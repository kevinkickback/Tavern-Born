// @vitest-environment jsdom
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { beforeAll, expect, test } from 'vitest'
import { composeGameDataLayers } from '@/lib/5etools/contentLayers'
import { FiveEToolsDataLoader } from '@/lib/5etools/dataLoader'
import { buildGameDataLookups, getEntityLookupKey } from '@/lib/5etools/lookups'
import { REVISED_INVOCATION_POOL } from '@/lib/5etools/warlockInvocationCantripSource'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { getSpellReferenceKey } from '@/lib/calculations/spellIdentity'
import { getClassChoiceFeatureId } from '@/lib/character/classChoiceIdentity'
import {
  buildClassChoiceFeatureCatalogs,
  createClassChoiceCatalogs,
  getCharacterClassChoices,
  getClassChoiceOptionKey,
  isClassChoiceOptionEligibleInDraft,
  resolveClassChoiceOptions,
} from '@/lib/character/classChoiceOptions'
import {
  applyClassChoiceSelectionWithGrantsCommand,
  retainSavedFeatureOptionsCommand,
} from '@/lib/character/commands/classChoiceCommands'
import { applyClassProgressionUpdate } from '@/lib/character/commands/classCommands'
import type { CharacterCommandResult } from '@/lib/character/commands/commandResult'
import { setManagedClassSpellChoiceCommand } from '@/lib/character/commands/managedClassSpellCommands'
import { getFeatureOptionSelectionStates } from '@/lib/character/featureOptionSelections'
import { managedClassSpellId } from '@/lib/character/managedClassSpellIdentity'
import { getManagedClassSpellSlots } from '@/lib/character/managedClassSpellSlots'
import { createOptionalClassFeatureActivity } from '@/lib/character/optionalClassFeatureActivity'
import { getOptionalPoolSelectionHandle } from '@/lib/character/optionalClassPoolSelections'
import {
  createCharacterSheetViewModel,
  withoutSheetDescriptions,
} from '@/lib/pdf/characterSheetViewModel'
import { validateClassChoices } from '@/lib/readiness/classReadiness'
import type { GameData } from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import type { NormalizedChoiceOptionReference } from '@/types/classRules'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

const owner = { name: 'Warlock', source: 'XPHB' }
const eldritchBlast = { name: 'Eldritch Blast', source: 'XPHB' }
const poisonSpray = { name: 'Poison Spray', source: 'XPHB' }
const trueStrike = { name: 'True Strike', source: 'XPHB' }
const agonizing = {
  entityType: 'optionalFeature',
  name: 'Agonizing Blast',
  source: 'XPHB',
} as const
const eldritchSpear = { ...agonizing, name: 'Eldritch Spear' }
const repelling = { ...agonizing, name: 'Repelling Blast' }
const pact = { ...agonizing, name: 'Pact of the Blade' }
const thirsting = { ...agonizing, name: 'Thirsting Blade' }
const lifedrinker = { ...agonizing, name: 'Lifedrinker' }
let data: GameData
let lookups: ReturnType<typeof currentLookups>

function currentLookups(current: GameData) {
  return {
    ...buildGameDataLookups(current),
    classChoiceClasses: current.classes,
    classChoiceFeatureCatalogs: buildClassChoiceFeatureCatalogs(current),
  }
}

beforeAll(async () => {
  const root = 'resources/srd/data'
  data = composeGameDataLayers([
    await new FiveEToolsDataLoader(
      {
        type: 'bundled',
        path: 'srd/core',
        packId: 'tavern-born-srd-core',
        packVersion: '1.0.1',
        isValid: true,
      },
      {
        type: 'bundled',
        readJson: async (file) => JSON.parse(await readFile(resolve(root, file), 'utf8')),
      },
    ).loadAllData(),
  ])
  lookups = currentLookups(data)
})

function reopen(saved: Character, result?: CharacterCommandResult) {
  return characterPersistenceSchema.parse(
    JSON.parse(
      JSON.stringify(
        result
          ? { ...saved, ...result.characterPatch, provenance: result.provenanceUpdate }
          : saved,
      ),
    ),
  )
}

function actor(levels = 5) {
  return reopen(
    makeCharacterFixture({
      originSystem: '2024',
      allowedSources: ['XPHB'],
      classProgression: [{ ...owner, levels }],
    }),
  )
}

const calculate = (saved: Character, current = lookups) =>
  createCharacterCalculationContext(saved, current, lookups)
const invocationRow = (saved: Character) =>
  saved.classChoiceSelections?.find((row) => row.choiceId === REVISED_INVOCATION_POOL)

function setup(saved: Character, current = lookups) {
  const calculated = calculate(saved, current)
  const catalogs = current.classChoiceFeatureCatalogs
  const cls = current.classChoiceClasses.find(
    (row) => row.name === owner.name && row.source === owner.source,
  )
  if (!cls) throw new Error('Missing revised Warlock')
  const choice = getCharacterClassChoices(
    cls,
    undefined,
    createOptionalClassFeatureActivity(saved, catalogs),
    catalogs,
  ).find((row) => row.id === REVISED_INVOCATION_POOL)
  if (!choice) throw new Error('Missing revised Invocation pool')
  return {
    calculated,
    choice,
    views: resolveClassChoiceOptions(
      choice,
      createClassChoiceCatalogs(catalogs),
      invocationRow(saved)?.selected,
      saved.classProgression[0].levels,
      saved,
      calculated.classChoices.prerequisites.knownWarlockCantrips,
    ),
    authority: {
      classes: current.classChoiceClasses,
      catalogs,
      spellContext: calculated.classChoices.spellContext,
    },
  }
}

function learn(saved: Character, index: number, target?: typeof eldritchBlast) {
  const slot = getManagedClassSpellSlots(saved.classProgression[0]).filter(
    (row) => row[1] === 'class-cantrip',
  )[index]
  const previous = saved.managedClassSpellChoices?.find(
    (row) => managedClassSpellId(row.slot) === managedClassSpellId(slot),
  )
  return reopen(
    saved,
    setManagedClassSpellChoiceCommand(
      saved,
      saved.provenance,
      {
        slot,
        target,
        expected: previous ?? null,
        expectedEmptyRevision: saved.managedClassSpellRevision ?? 0,
        ...(target ? { policy: 'default' } : {}),
      },
      calculate(saved).classChoices.spellContext,
    ),
  )
}

function choose(
  saved: Character,
  options: readonly NormalizedChoiceOptionReference[],
  handle?: string,
) {
  const { choice, authority } = setup(saved)
  const previous = invocationRow(saved)
  return reopen(
    saved,
    applyClassChoiceSelectionWithGrantsCommand(
      saved,
      saved.provenance,
      choice,
      options,
      authority,
      undefined,
      handle ?? (previous ? getOptionalPoolSelectionHandle(previous) : ''),
    ),
  )
}

function state(saved: Character, current = lookups) {
  const { classChoices } = calculate(saved, current)
  return getFeatureOptionSelectionStates(
    saved,
    classChoices.classes,
    classChoices.catalogs,
    classChoices.prerequisites.knownWarlockCantrips,
  ).find((row) => row.revisedInvocations)
}

test.each([
  [4, 5, thirsting, 'Extra Attack'],
  [8, 9, lifedrinker, 'Hit Point Dice'],
] as const)('requires the exact Blade Pact and Warlock level %s to %s for %j', (before, level, option, phrase) => {
  expect(() => choose(actor(before), [pact, option])).toThrow(/earned Blade Invocation/)
  expect(() => choose(actor(level), [option])).toThrow(/current Pact of the Blade/)
  const draft = actor(level)
  const view = setup(draft).views.find(
    (candidate) => getClassChoiceOptionKey(candidate.reference) === getClassChoiceOptionKey(option),
  )
  if (!view) throw new Error('Missing current native Blade Invocation')
  expect(view.availability).toBe('retained')
  expect(isClassChoiceOptionEligibleInDraft(view, new Set([getClassChoiceOptionKey(pact)]))).toBe(
    true,
  )
  const selected = choose(draft, [pact, option])
  expect(state(selected)?.recovery).toBe(false)
  const staleRaw = {
    ...lookups,
    optionalFeaturesByKey: {
      ...lookups.optionalFeaturesByKey,
      [getEntityLookupKey(option.name, option.source)]: {
        ...option,
        entries: ['As a bonus action, you launch a beam.'],
      },
    },
  }
  const sheet = createCharacterSheetViewModel(selected, staleRaw, lookups)
  expect(
    sheet.declaredClassFeatureSummaries?.find((row) => row.compactText === option.name)?.text,
  ).toContain(phrase)
  expect(withoutSheetDescriptions(sheet).featuresSummary).toContain(option.name)
  expect(withoutSheetDescriptions(sheet).featuresSummary).not.toContain(phrase)
  expect(sheet.actions.some((row) => row.name === option.name)).toBe(false)
})

test('revised Pact removal protects active dependents and preserves dormant intent', () => {
  const selected = choose(actor(5), [pact, thirsting])
  const saved = invocationRow(selected)
  if (!saved) throw new Error('Missing saved native Invocation pool')
  expect(() => choose(selected, [thirsting])).toThrow(/Remove the dependent Invocations/)
  expect(() =>
    retainSavedFeatureOptionsCommand(
      selected,
      selected.provenance,
      saved.choiceId,
      [getClassChoiceOptionKey(thirsting)],
      setup(selected).authority,
      getOptionalPoolSelectionHandle(saved),
    ),
  ).toThrow(/Remove the dependent Invocations/)
  expect(invocationRow(choose(selected, []))).toBeUndefined()
  const dormant = reopen({
    ...selected,
    classChoiceSelections: [
      { ...saved, selected: saved.selected.filter((option) => option.name === thirsting.name) },
    ],
  })
  expect(state(dormant)?.revisedInvocations).toBe('blade-prerequisites')
  expect(calculate(dormant).character.features.some((row) => row.name === thirsting.name)).toBe(
    false,
  )
  expect(state(choose(dormant, [thirsting, pact]))?.recovery).toBe(false)
})

test('rejects new Blade invocation impostors and preserves older wrong-printing intent for removal', () => {
  const saved = actor()
  const wrongPrinting = { ...thirsting, source: 'PHB' }
  for (const option of [
    wrongPrinting,
    { ...thirsting, source: undefined },
    { ...thirsting, entityType: 'classFeature' as const },
    { ...thirsting, ref: '' },
  ]) {
    expect(() => choose(saved, [pact, option])).toThrow(/exact native Blade Invocation/)
  }
  const active = choose(saved, [pact, thirsting])
  expect(() => choose(active, [{ ...pact, ref: '' }, thirsting])).toThrow(
    /exact native Blade Invocation/,
  )
  const older = reopen({
    ...active,
    classChoiceSelections: active.classChoiceSelections?.map((row) => ({
      ...row,
      selected: row.selected.map((option) =>
        option.name === thirsting.name ? { ...option, ...wrongPrinting } : option,
      ),
    })),
  })
  expect(state(older)?.details.map((row) => row.available)).toEqual([true, false])
  expect(invocationRow(choose(older, [pact, wrongPrinting]))?.selected[1].source).toBe('PHB')
  expect(invocationRow(choose(older, [pact]))?.selected.map((row) => row.name)).toEqual([pact.name])
})

test('rejects stale Blade edits and recovers an older overbooked invocation row', () => {
  const saved = choose(actor(), [pact, thirsting])
  expect(() => choose(saved, [pact], '')).toThrow(/choices changed/)
  const row = invocationRow(saved)
  if (!row) throw new Error('Missing saved Blade invocations')
  const duplicate = reopen({
    ...saved,
    classChoiceSelections: [{ ...row, selected: [...row.selected, row.selected[1]] }],
  })
  const badRow = invocationRow(duplicate)
  if (!badRow) throw new Error('Missing older duplicate')
  expect(state(duplicate)?.details.map(({ available }) => available)).toEqual([false, false, false])
  expect(calculate(duplicate).character.features.some(({ name }) => name === thirsting.name)).toBe(
    false,
  )
  const fixed = reopen(
    duplicate,
    retainSavedFeatureOptionsCommand(
      duplicate,
      duplicate.provenance,
      REVISED_INVOCATION_POOL,
      [getClassChoiceOptionKey(pact)],
      setup(duplicate).authority,
      getOptionalPoolSelectionHandle(badRow),
    ),
  )
  expect(invocationRow(fixed)?.selected.map(({ name }) => name)).toEqual([pact.name])
})

test('an older Blade row for a different owner cannot authorize a new Warlock pick', () => {
  const saved = choose(actor(), [pact, thirsting])
  const row = invocationRow(saved)
  if (!row) throw new Error('Missing saved Blade invocations')
  const imported = reopen({
    ...saved,
    classChoiceSelections: [{ ...row, className: 'Wizard', selected: [row.selected[1]] }],
  })
  expect(() => choose(imported, [thirsting])).toThrow(/current Pact of the Blade/)
})

test('an empty source list still requires the matching ruleset for the native Blade', () => {
  const saved = reopen({ ...actor(), allowedSources: [] })
  expect(state(choose(saved, [pact, thirsting]))?.recovery).toBe(false)
  expect(() => choose(reopen({ ...saved, originSystem: '2014' }), [pact, thirsting])).toThrow(
    /current Pact of the Blade/,
  )
})

test('offers only current known cantrips and permits distinct repeat targets', () => {
  const saved = learn(learn(learn(actor(), 0, eldritchBlast), 1, poisonSpray), 2, trueStrike)
  const { views } = setup(saved)
  const targets = (name: string) =>
    views
      .filter(
        (row) =>
          row.reference.name === name &&
          row.reference.source === owner.source &&
          row.availability === 'eligible',
      )
      .map((row) => row.reference.invocationCantrip?.name)
      .sort()
  expect(targets(agonizing.name)).toEqual(['Eldritch Blast', 'Poison Spray', 'True Strike'])
  expect(targets(eldritchSpear.name)).toEqual(['Eldritch Blast', 'Poison Spray'])
  expect(targets(repelling.name)).toEqual(['Eldritch Blast', 'Poison Spray'])
  expect(
    views.find(
      (row) =>
        row.reference.name === repelling.name &&
        row.reference.invocationCantrip?.name === trueStrike.name,
    ),
  ).toMatchObject({
    availability: 'retained',
    entries: [expect.stringContaining('attack-roll metadata')],
  })
  expect(() => choose(saved, [agonizing])).toThrow(/eligible known Warlock cantrip/)
  expect(() => choose(saved, [{ ...repelling, invocationCantrip: trueStrike }])).toThrow(
    /eligible known Warlock cantrip/,
  )
  const first = { ...agonizing, invocationCantrip: eldritchBlast }
  expect(() => choose(saved, [first, first])).toThrow(/different eligible cantrip/)
  const chosen = choose(saved, [first, { ...agonizing, invocationCantrip: poisonSpray }])
  expect(invocationRow(chosen)?.selected.map((row) => row.invocationCantrip)).toEqual([
    eldritchBlast,
    poisonSpray,
  ])
  expect(state(chosen)?.details.map((row) => row.available)).toEqual([true, true])
  expect(
    calculate(chosen).character.features.filter((row) => row.name === agonizing.name),
  ).toHaveLength(2)
  expect(
    calculate(chosen)
      .character.spells.spellProfiles.find((row) => row.id === 'class:Warlock|XPHB')
      ?.cantrips.map((ref) => getSpellReferenceKey(ref)),
  ).toEqual(
    calculate(saved)
      .character.spells.spellProfiles.find((row) => row.id === 'class:Warlock|XPHB')
      ?.cantrips.map((ref) => getSpellReferenceKey(ref)),
  )
})

test('older untargeted intent needs setup and retains its original slot on an edit', () => {
  const saved = learn(learn(actor(), 0, eldritchBlast), 1, poisonSpray)
  const older = reopen({
    ...saved,
    classChoiceSelections: [
      {
        choiceId: REVISED_INVOCATION_POOL,
        label: 'Eldritch Invocations',
        kind: 'optional-feature',
        className: owner.name,
        classSource: owner.source,
        classLevel: 1,
        selected: [{ ...agonizing, slotLevel: 2 }],
      },
    ],
  })
  expect(state(older)).toMatchObject({
    recovery: true,
    details: [expect.objectContaining({ available: false })],
  })
  const issues = validateClassChoices(
    older,
    calculate(older),
    createClassChoiceCatalogs(lookups.classChoiceFeatureCatalogs),
  ).filter((row) => row.id.includes(REVISED_INVOCATION_POOL))
  expect(issues).toEqual([
    expect.objectContaining({
      title: 'Review Eldritch Invocation cantrip targets',
      severity: 'blocking',
    }),
  ])
  const oldRow = invocationRow(older)
  if (!oldRow) throw new Error('Missing saved Invocation')
  const captured = getOptionalPoolSelectionHandle(oldRow)
  const first = choose(older, [{ ...agonizing, invocationCantrip: eldritchBlast }])
  expect(invocationRow(first)?.selected[0].slotLevel).toBe(2)
  expect(() => choose(first, [{ ...agonizing, invocationCantrip: poisonSpray }], captured)).toThrow(
    /choices changed/,
  )
  const retargeted = choose(first, [{ ...agonizing, invocationCantrip: poisonSpray }])
  expect(invocationRow(retargeted)?.selected[0]).toMatchObject({
    slotLevel: 2,
    invocationCantrip: poisonSpray,
  })
  const withoutKnowledge = learn(retargeted, 1)
  expect(invocationRow(withoutKnowledge)).toEqual(invocationRow(retargeted))
  expect(state(withoutKnowledge)?.recovery).toBe(true)
  expect(state(learn(withoutKnowledge, 1, poisonSpray))?.recovery).toBe(false)
  const retained = invocationRow(withoutKnowledge)
  if (!retained) throw new Error('Missing saved recovery')
  const removed = reopen(
    withoutKnowledge,
    retainSavedFeatureOptionsCommand(
      withoutKnowledge,
      withoutKnowledge.provenance,
      REVISED_INVOCATION_POOL,
      [],
      undefined,
      getOptionalPoolSelectionHandle(retained),
    ),
  )
  expect(invocationRow(removed)).toBeUndefined()
})

test('prints each active target and omits the effect of a dormant target', () => {
  const saved = learn(learn(actor(), 0, eldritchBlast), 1, poisonSpray)
  const chosen = choose(saved, [
    { ...agonizing, invocationCantrip: eldritchBlast },
    { ...agonizing, invocationCantrip: poisonSpray },
  ])
  const restored = reopen({
    ...chosen,
    classChoiceSelections: chosen.classChoiceSelections?.map((row) => ({
      ...row,
      inactive: true,
    })),
  })
  expect(state(restored)?.details.map((row) => row.available)).toEqual([true, true])
  const sheet = createCharacterSheetViewModel(restored, lookups, lookups)
  for (const target of [eldritchBlast, poisonSpray]) {
    const label = `Agonizing Blast — ${target.name} (XPHB)`
    const summary = sheet.declaredClassFeatureSummaries?.find((row) => row.compactText === label)
    expect(summary?.text).toMatch(/Charisma modifier.*damage rolls/i)
    expect(
      withoutSheetDescriptions(sheet).declaredClassFeatureSummaries?.some(
        (row) => row.compactText === label,
      ),
    ).toBe(true)
  }
  const lost = createCharacterSheetViewModel(learn(chosen, 1), lookups, lookups)
  expect(lost.declaredClassFeatureSummaries?.map((row) => row.compactText)).not.toContain(
    'Agonizing Blast — Poison Spray (XPHB)',
  )
})

test('retains the target when the current pool disagrees with its source progression', () => {
  const learned = learn(actor(), 0, eldritchBlast)
  const chosen = choose(learned, [{ ...agonizing, invocationCantrip: eldritchBlast }])
  const altered = currentLookups({
    ...data,
    classes: data.classes.map((row) =>
      row.name !== owner.name || row.source !== owner.source || !row.normalizedRules
        ? row
        : {
            ...row,
            normalizedRules: {
              ...row.normalizedRules,
              choices: row.normalizedRules.choices.map((choice) =>
                choice.id === REVISED_INVOCATION_POOL
                  ? {
                      ...choice,
                      selectionCountByLevel: [2, ...choice.selectionCountByLevel.slice(1)],
                    }
                  : choice,
              ),
            },
          },
    ),
  })
  expect(state(chosen, altered)).toMatchObject({
    recovery: true,
    details: [{ name: 'Agonizing Blast — Eldritch Blast (XPHB)', available: false }],
  })
  expect(
    calculate(chosen, altered).character.features.some((row) => row.name === agonizing.name),
  ).toBe(false)
  expect(state(chosen)?.details[0].available).toBe(true)
})

test('unrelated progression preserves the stored invocation when its exact target is unavailable', () => {
  const chosen = choose(learn(actor(), 0, eldritchBlast), [
    { ...agonizing, invocationCantrip: eldritchBlast },
  ])
  const missing = currentLookups({
    ...data,
    spells: data.spells.filter(
      (spell) => spell.name !== eldritchBlast.name || spell.source !== eldritchBlast.source,
    ),
  })
  const context = calculate(chosen, missing)
  const progressed = reopen(
    chosen,
    applyClassProgressionUpdate(
      chosen,
      chosen.provenance,
      [...chosen.classProgression, { name: 'Fighter', source: 'XPHB', levels: 1 }],
      undefined,
      {
        classChoiceFeatureCatalogs: missing.classChoiceFeatureCatalogs,
        spellContext: context.classChoices.spellContext,
      },
    ),
  )
  expect(invocationRow(progressed)).toEqual(invocationRow(chosen))
  expect(progressed.features.find((feature) => feature.name === agonizing.name)).toEqual(
    chosen.features.find((feature) => feature.name === agonizing.name),
  )
  expect(progressed.provenance.features['agonizing blast']).toEqual(
    chosen.provenance.features['agonizing blast'],
  )
  expect(
    calculate(progressed, missing).character.features.some((row) => row.name === agonizing.name),
  ).toBe(false)
  expect(calculate(progressed).character.features.some((row) => row.name === agonizing.name)).toBe(
    true,
  )
})

test('omitted authority preserves only the surviving saved exact Invocation target and grant', () => {
  const chosen = choose(learn(learn(actor(), 0, eldritchBlast), 1, poisonSpray), [
    { ...agonizing, invocationCantrip: eldritchBlast },
    { ...agonizing, invocationCantrip: poisonSpray },
  ])
  const selection = invocationRow(chosen)!
  const kept = selection.selected.find(
    (option) => option.invocationCantrip?.name === eldritchBlast.name,
  )!
  const savedGrant = chosen.provenance.features['agonizing blast']
  const storedFeatures = (saved: Character) =>
    saved.features.filter((feature) => feature.name === agonizing.name)
  expect(storedFeatures(chosen)).toHaveLength(2)
  expect(savedGrant).toHaveLength(1)

  const next = [...chosen.classProgression, { name: 'Fighter', source: 'XPHB', levels: 1 }]
  for (const authority of [
    undefined,
    { classChoiceFeatureCatalogs: lookups.classChoiceFeatureCatalogs },
    {
      classChoiceFeatureCatalogs: { ...lookups.classChoiceFeatureCatalogs, classes: undefined },
      spellContext: calculate(chosen).classChoices.spellContext,
    },
  ]) {
    const progressed = reopen(
      chosen,
      applyClassProgressionUpdate(chosen, chosen.provenance, next, undefined, authority),
    )
    expect(invocationRow(progressed)).toEqual(selection)
    expect(storedFeatures(progressed)).toEqual(storedFeatures(chosen))
    expect(progressed.provenance.features['agonizing blast']).toEqual(savedGrant)
  }

  const partial = reopen(
    chosen,
    retainSavedFeatureOptionsCommand(
      chosen,
      chosen.provenance,
      selection.choiceId,
      [getClassChoiceOptionKey(kept)],
      undefined,
      getOptionalPoolSelectionHandle(selection),
    ),
  )
  const partialSelection = invocationRow(partial)
  if (!partialSelection) throw new Error('The retained Invocation choice is missing')
  expect(partialSelection.selected).toEqual([kept])
  expect(storedFeatures(partial).map((feature) => feature.id)).toEqual([
    getClassChoiceFeatureId(selection, kept),
  ])
  expect(partial.provenance.features['agonizing blast']).toEqual(savedGrant)
  const cleared = reopen(
    partial,
    retainSavedFeatureOptionsCommand(
      partial,
      partial.provenance,
      selection.choiceId,
      [],
      undefined,
      getOptionalPoolSelectionHandle(partialSelection),
    ),
  )
  expect(storedFeatures(cleared)).toEqual([])
  expect(cleared.provenance.features['agonizing blast']).toBeUndefined()
  const removedOwner = reopen(
    chosen,
    applyClassProgressionUpdate(chosen, chosen.provenance, [next[1]]),
  )
  expect(invocationRow(removedOwner)).toBeUndefined()
  expect(storedFeatures(removedOwner)).toEqual([])
  expect(removedOwner.provenance.features['agonizing blast']).toBeUndefined()
})
