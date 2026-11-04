// @vitest-environment jsdom
import { existsSync, readFileSync } from 'node:fs'
import { PDFDocument, PDFTextField } from '@cantoo/pdf-lib'
import { describe, expect, test } from 'vitest'
import { deriveSpellActions } from '@/lib/calculations/actions'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { buildPrerequisiteSnapshot } from '@/lib/calculations/prerequisites'
import { buildSpellSelectionSourceMap } from '@/lib/calculations/spellProfiles.attribution'
import {
  ensureSpellProfiles,
  getSpellProfileSelectionCounts,
} from '@/lib/calculations/spellProfiles.profiles'
import { applyClassProgressionUpdate } from '@/lib/character/commands/classCommands'
import type { CharacterCommandResult } from '@/lib/character/commands/commandResult'
import {
  setManagedClassSpellChoiceCommand,
  setManagedClassSpellChoicesCommand,
} from '@/lib/character/commands/managedClassSpellCommands'
import {
  getOptionalClassFamilyKeys,
  setOptionalClassAdoptionCommand,
} from '@/lib/character/commands/optionalClassFeatureCommands'
import { getManagedClassSpellSlots } from '@/lib/character/managedClassSpellSlots'
import {
  getManagedClassSpellPool,
  type ManagedClassSpellContext,
  projectManagedClassSpellState,
} from '@/lib/character/managedClassSpells'
import { createOptionalClassFeatureActivity } from '@/lib/character/optionalClassFeatureActivity'
import {
  createCharacterSheetViewModel,
  withoutSheetDescriptions,
} from '@/lib/pdf/characterSheetViewModel'
import { validateSpells } from '@/lib/readiness/spellReadiness'
import type { Spell5e } from '@/types/5etools'
import type { Character, OptionalClassFeatureAdoption } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { selectBonusSpellFixture } from '../fixtures/bonusSpellSelection'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import type { OptionalDeclarationDocument } from '../fixtures/optionalClassDeclarationFixtures'
import { generateTestCharacterSheet } from '../fixtures/pdfTemplates'
import { makePrimalAwarenessSpellFixtures } from '../fixtures/primalAwarenessSpellFixtures'

const fixture = makePrimalAwarenessSpellFixtures()
const adoption: OptionalClassFeatureAdoption = {
  owner: ['class', 'ranger', 'phb'],
  target: 'class-feature|primal awareness|ranger|phb|3|tce',
  earnedLevel: 3,
}
const profileId = 'class:Ranger|PHB'
const apply = (character: Character, result: CharacterCommandResult) =>
  characterPersistenceSchema.parse({
    ...character,
    ...result.characterPatch,
    provenance: result.provenanceUpdate,
  })
function initial(levels = 3) {
  const character = makeCharacterFixture({
    allowedSources: ['PHB', 'TCE'],
    classProgression: [{ name: 'Ranger', source: 'PHB', levels }],
    variantRules: { optionalClassFeatures: true },
  })
  character.spells.spellProfiles = ensureSpellProfiles(character)
  return character
}
const adopt = (
  character: Character,
  selected = true,
  context: ManagedClassSpellContext = fixture.context,
) =>
  apply(
    character,
    setOptionalClassAdoptionCommand(
      character,
      character.provenance,
      context.catalogs,
      adoption,
      selected,
      getOptionalClassFamilyKeys(character, adoption),
      context,
    ),
  )
const project = (character: Character, context: ManagedClassSpellContext = fixture.context) =>
  projectManagedClassSpellState(character, context)
const profile = (character: Character) =>
  character.spells.spellProfiles.find((row) => row.id === profileId)!
const expected = [
  'speak with animals|PHB',
  'beast sense|PHB',
  'speak with plants|PHB',
  'locate creature|PHB',
  'commune with nature|PHB',
]
const slot = (character: Character, gain = 3) =>
  getManagedClassSpellSlots(character.classProgression[0]).find(
    (row) => row[1] === 'class-known' && row[3] === gain,
  )!
function learn(character: Character, gain = 3) {
  return apply(
    character,
    setManagedClassSpellChoiceCommand(
      character,
      character.provenance,
      {
        slot: slot(character, gain),
        expected: null,
        expectedEmptyRevision: character.managedClassSpellRevision ?? 0,
        target: { name: 'Speak with Animals', source: 'PHB' },
        policy: 'default',
      },
      fixture.context,
    ),
  )
}

describe('source-owned Primal Awareness knowledge grants', () => {
  test.each([
    [3, 1],
    [4, 1],
    [5, 2],
    [8, 2],
    [9, 3],
    [13, 4],
    [17, 5],
    [20, 5],
  ])('level %i earns exactly %i table grants without quota or saved choice', (level, count) => {
    const saved = characterPersistenceSchema.parse(
      JSON.parse(JSON.stringify(adopt(initial(level)))),
    )
    const before = JSON.stringify(saved)
    const current = project(saved).character
    expect(profile(current).fixedSpells).toEqual(expected.slice(0, count))
    expect(profile(current).spellsKnown).toEqual(expected.slice(0, count))
    expect(getSpellProfileSelectionCounts(profile(current)).spells).toBe(0)
    expect(saved.managedClassSpellChoices).toBeUndefined()
    expect(saved.managedClassSpellRevision).toBeUndefined()
    expect(characterPersistenceSchema.parse(JSON.parse(JSON.stringify(current)))).toEqual(current)
    expect(project(current).character).toEqual(current)
    expect(JSON.stringify(saved)).toBe(before)
  })

  test('permission alone and an unearned root grant nothing', () => {
    expect(profile(project(initial()).character).spellsKnown).toEqual([])
    expect(() => adopt(initial(2))).toThrow()
    const forged = { ...initial(2), optionalClassFeatureAdoptions: [adoption] }
    expect(project(forged).fixedClassSpellStatuses).toEqual([])
  })

  test('OFF, clear, source loss and exact restoration retain adoption intent without stale fixed benefits', () => {
    const saved = project(adopt(initial(17))).character
    for (const dormant of [
      { ...saved, variantRules: { optionalClassFeatures: false } },
      { ...saved, allowedSources: ['PHB'] },
      adopt(saved, false),
    ]) {
      const view = project(dormant)
      expect(profile(view.character).spellsKnown).toEqual([])
      expect(view.fixedClassSpellStatuses).toEqual([])
      expect(view.character.provenance.spells['speak with animals']).toBeUndefined()
      expect(profile(ensureContextFree(dormant)).spellsKnown).toEqual([])
    }
    expect(
      profile(project(saved, { catalogs: fixture.context.catalogs, spellsByKey: {} }).character)
        .spellsKnown,
    ).toEqual([])
    expect(profile(project(saved).character).spellsKnown).toEqual(expected)
    expect(profile(project(adopt(adopt(saved, false))).character).spellsKnown).toEqual(expected)
  })

  test('exact target loss, conflicting printing, duplicate target and empty authority create recovery without fallback', () => {
    const saved = adopt(initial())
    const exact = fixture.context.spellsByKey['Speak with Animals|PHB']
    const unavailable: Array<Record<string, Spell5e>> = [
      {},
      { neighbor: { ...exact, source: 'XPHB' } },
      { one: exact, two: exact },
    ]
    for (const spellsByKey of unavailable) {
      const context = { ...fixture.context, spellsByKey }
      const view = project(saved, context)
      expect(profile(view.character).spellsKnown).toEqual([])
      expect(view.fixedClassSpellStatuses).toMatchObject([
        { reference: expected[0], active: false },
      ])
      const lookups = { ...fixture.lookups, spellsByKey }
      const calculation = createCharacterCalculationContext(saved, lookups, fixture.lookups)
      expect(
        validateSpells(saved, calculation, spellsByKey).filter((row) =>
          row.id.startsWith('spells:optional-fixed:'),
        ),
      ).toHaveLength(1)
      expect(createCharacterSheetViewModel(saved, fixture.lookups, lookups).spellRows).toEqual([])
    }
    expect(project(saved).fixedClassSpellStatuses[0].active).toBe(true)
  })

  test.each<{ name: string; change: (document: OptionalDeclarationDocument) => void }>([
    {
      name: 'feature body',
      change: (document) => {
        const feature = document.classFeature.find((row) => row.name === 'Primal Awareness')!
        ;(feature.entries as unknown[]).push('changed meaning')
      },
    },
    {
      name: 'grant table',
      change: (document) => {
        const feature = document.classFeature.find((row) => row.name === 'Primal Awareness')!
        const table = (feature.entries as Array<{ type?: string; rows?: unknown[][] }>).find(
          (row) => row?.type === 'table',
        )!
        table.rows![0][0] = '4th'
      },
    },
  ])('changed $name cannot certify the feature', ({ change }) => {
    const saved = adopt(initial())
    const context = makePrimalAwarenessSpellFixtures(change).context
    expect(project(saved, context).fixedClassSpellStatuses).toEqual([])
    expect(
      createOptionalClassFeatureActivity(saved, context.catalogs).states.find(
        (row) => row.root.target === adoption.target,
      )?.state,
    ).toBe('unavailable')
  })

  test('duplicate owner cannot certify the feature', () => {
    const saved = adopt(initial())
    const duplicate = {
      ...saved,
      classProgression: [...saved.classProgression, ...saved.classProgression],
    }
    expect(project(duplicate).fixedClassSpellStatuses).toEqual([])
  })

  test.each([
    2, 3,
  ])('independent numeric gain %i survives adoption, strict reopen, both inverse orders and policy edit', (gain) => {
    const learned = learn(initial(), gain)
    const saved = characterPersistenceSchema.parse(JSON.parse(JSON.stringify(adopt(learned))))
    const current = project(saved)
    expect(current.statuses[0].active).toBe(true)
    expect(current.character.provenance.spells['speak with animals']).toHaveLength(2)
    const calculation = createCharacterCalculationContext(saved, fixture.lookups, fixture.lookups)
    const duty = validateSpells(saved, calculation, fixture.lookups.spellsByKey).find(
      (issue) => issue.title === `Finish Ranger spell choices at level ${gain}`,
    )
    if (gain === 3) expect(duty).toBeUndefined()
    else expect(duty?.explanation).toBe('2 choices are earned here; 1 are active.')
    const choice = saved.managedClassSpellChoices![0]
    const edited = apply(
      saved,
      setManagedClassSpellChoiceCommand(
        saved,
        saved.provenance,
        { slot: choice.slot, expected: choice, target: choice.target, policy: 'ignore-class-list' },
        fixture.context,
      ),
    )
    expect(project(edited).statuses[0].active).toBe(true)
    const cleared = apply(
      edited,
      setManagedClassSpellChoiceCommand(
        edited,
        edited.provenance,
        { slot: choice.slot, expected: edited.managedClassSpellChoices![0] },
        fixture.context,
      ),
    )
    expect(profile(project(cleared).character).spellsKnown).toEqual([expected[0]])
    const withoutAdoption = adopt(saved, false)
    expect(project(withoutAdoption).statuses[0].active).toBe(true)
    expect(profile(project(withoutAdoption).character).spellsKnown).toEqual([
      'Speak with Animals|PHB',
    ])
  })

  test('new redundant picks reject atomically under both policies; older gains keep their own scope', () => {
    const saved = adopt(initial(5))
    for (const policy of ['default', 'ignore-class-list'] as const) {
      expect(
        getManagedClassSpellPool(saved, slot(saved), fixture.context).spells.some(
          (spell) => spell.name === 'Speak with Animals',
        ),
      ).toBe(false)
      const before = JSON.stringify(saved)
      expect(() =>
        setManagedClassSpellChoicesCommand(
          saved,
          saved.provenance,
          [
            {
              slot: slot(saved, 2),
              expected: null,
              expectedEmptyRevision: 0,
              target: { name: 'Cure Wounds', source: 'PHB' },
              policy,
            },
            {
              slot: slot(saved),
              expected: null,
              expectedEmptyRevision: 0,
              target: { name: 'Speak with Animals', source: 'PHB' },
              policy,
            },
          ],
          fixture.context,
        ),
      ).toThrow(/already grants/)
      expect(JSON.stringify(saved)).toBe(before)
    }
    expect(
      getManagedClassSpellPool(saved, slot(saved, 2), fixture.context).spells.some(
        (spell) => spell.name === 'Speak with Animals',
      ),
    ).toBe(true)
  })

  test('independent Bonus owner survives feature loss and level/class removal', () => {
    const saved = adopt(
      apply(
        initial(17),
        selectBonusSpellFixture(
          initial(17),
          'Speak with Animals|PHB',
          'spell',
          fixture.context.spellsByKey,
        ),
      ),
    )
    const lowered = apply(
      saved,
      applyClassProgressionUpdate(
        saved,
        saved.provenance,
        [{ name: 'Ranger', source: 'PHB', levels: 4 }],
        undefined,
        { ...fixture.lookups, spellContext: fixture.context },
      ),
    )
    expect(profile(project(lowered).character).fixedSpells).toEqual([expected[0]])
    const removed = apply(
      saved,
      applyClassProgressionUpdate(saved, saved.provenance, [], undefined, {
        ...fixture.lookups,
        spellContext: fixture.context,
      }),
    )
    expect(removed.optionalClassFeatureAdoptions).toEqual([])
    expect(
      project(removed).character.spells.spellProfiles.find((row) => row.type === 'special')
        ?.spellsKnown,
    ).toEqual(['Speak with Animals|PHB'])
  })

  test('current prerequisite, source attribution, Actions, Review and PDF views share the exact grant', () => {
    for (const active of [true, false]) {
      const saved = { ...adopt(initial()), variantRules: { optionalClassFeatures: active } }
      const calculation = createCharacterCalculationContext(saved, fixture.lookups, fixture.lookups)
      const current = calculation.character
      expect(
        buildPrerequisiteSnapshot({
          character: saved,
          effectiveSpellProfiles: current.spells.spellProfiles,
        }).spells?.spellsKnown?.some(
          (reference) => reference.toLowerCase() === expected[0].toLowerCase(),
        ) ?? false,
      ).toBe(active)
      expect(
        deriveSpellActions(current, fixture.lookups.spellsByKey, {
          classes: fixture.gameData.classes,
          effectiveSpellProfiles: current.spells.spellProfiles,
        }).some((row) => row.name === 'Speak with Animals'),
      ).toBe(active)
      const sources = buildSpellSelectionSourceMap({
        spellProfiles: current.spells.spellProfiles,
        ledger: current.provenance,
        classProgression: current.classProgression,
      })
      expect(sources.get(`${profileId}|${expected[0]}`)).toBe(
        active ? 'Class: Ranger — Primal Awareness' : undefined,
      )
      const model = createCharacterSheetViewModel(saved, fixture.lookups, fixture.lookups)
      for (const view of [model, withoutSheetDescriptions(model)])
        expect(view.spellRows.some((row) => row.name === 'Speak with Animals')).toBe(active)
    }
  })

  test('a selected subclass cannot relabel the parent feature grant, and independent subclass labels remain exact', () => {
    const saved = adopt(initial())
    const current = project(saved).character
    const ranger = {
      ...current.classProgression[0],
      subclass: 'Beast Master',
      subclassSource: 'PHB',
    }
    // Current fixed/subclass tags have separate owner tuples; this label projection must keep both.
    const ledger = structuredClone(current.provenance)
    ledger.spells['speak with animals'].push({
      sourceType: 'subclass',
      sourceName: 'Beast Master',
      sourceRef: 'PHB',
      grantSource: 'PHB',
      grantType: 'fixed',
      label: 'Beast Master',
    })
    ledger.spells['beast sense'] = [
      {
        sourceType: 'subclass',
        sourceName: 'Another Printing',
        sourceRef: 'XPHB',
        grantSource: 'PHB',
        grantType: 'fixed',
        label: 'Another Printing',
      },
    ]
    const owned = buildSpellSelectionSourceMap({
      spellProfiles: current.spells.spellProfiles,
      ledger: current.provenance,
      classProgression: [ranger],
    })
    expect(owned.get(`${profileId}|${expected[0]}`)).toBe('Class: Ranger — Primal Awareness')
    const both = buildSpellSelectionSourceMap({
      spellProfiles: current.spells.spellProfiles,
      ledger,
      classProgression: [ranger],
    })
    expect(both.get(`${profileId}|${expected[0]}`)).toBe(
      'Class: Ranger — Primal Awareness; Subclass: Beast Master',
    )
  })

  test.skipIf(!existsSync('data/class/class-ranger.json'))(
    'the configured complete Ranger source certifies current table grants and target facts',
    () => {
      const document = JSON.parse(
        readFileSync('data/class/class-ranger.json', 'utf8'),
      ) as OptionalDeclarationDocument
      const current = makePrimalAwarenessSpellFixtures((captured) =>
        Object.assign(captured, document),
      )
      const saved = adopt(initial(17), true, current.context)
      expect(profile(project(saved, current.context).character).fixedSpells).toEqual(expected)
      const actual = JSON.parse(readFileSync('data/spells/spells-phb.json', 'utf8')).spell.find(
        (spell: { name: string }) => spell.name === 'Beast Sense',
      )
      expect(
        JSON.parse(readFileSync('tests/fixtures/primalAwarenessBeastSense.json', 'utf8')),
      ).toEqual(actual)
    },
  )
})

function ensureContextFree(character: Character) {
  return {
    ...character,
    spells: { ...character.spells, spellProfiles: ensureSpellProfiles(character) },
  }
}

test.each([
  ['2014-official', false],
  ['2014-official', true],
  ['2024-official', false],
  ['2024-official', true],
] as const)('Primal Awareness appears in actual %s PDF, namesOnly=%s', async (template, namesOnly) => {
  const model = createCharacterSheetViewModel(adopt(initial()), fixture.lookups, fixture.lookups)
  const bytes = await generateTestCharacterSheet(
    namesOnly ? withoutSheetDescriptions(model) : model,
    template,
  )
  const text = (await PDFDocument.load(bytes))
    .getForm()
    .getFields()
    .flatMap((field) => (field instanceof PDFTextField ? [field.getText() ?? ''] : []))
    .join('\n')
  expect(text).toContain('Speak with Animals')
})
