// @vitest-environment jsdom
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { beforeAll, expect, test } from 'vitest'
import { composeGameDataLayers } from '@/lib/5etools/contentLayers'
import { FiveEToolsDataLoader } from '@/lib/5etools/dataLoader'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { REVISED_INVOCATION_POOL } from '@/lib/5etools/warlockInvocationCantripSource'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { getSpellReferenceKey } from '@/lib/calculations/spellIdentity'
import {
  buildClassChoiceFeatureCatalogs,
  createClassChoiceCatalogs,
  getCharacterClassChoices,
  resolveClassChoiceOptions,
} from '@/lib/character/classChoiceOptions'
import {
  applyClassChoiceSelectionWithGrantsCommand,
  retainSavedFeatureOptionsCommand,
} from '@/lib/character/commands/classChoiceCommands'
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
  const root = 'resources/srd/core/data'
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
  ).find((row) => row.invocationCantrips)
}

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
