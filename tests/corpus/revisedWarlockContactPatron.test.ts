// @vitest-environment jsdom
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { beforeAll, expect, test } from 'vitest'
import { composeGameDataLayers } from '@/lib/5etools/contentLayers'
import { FiveEToolsDataLoader } from '@/lib/5etools/dataLoader'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { parseSpells } from '@/lib/5etools/parsers/spells'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { getFixedClassSpellCastingNotes } from '@/lib/calculations/managedSpellCasting'
import { getSpellReferenceKey } from '@/lib/calculations/spellIdentity'
import { buildClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import { applyLevelDown, applyLevelUp } from '@/lib/character/commands/classCommands'
import type { CharacterCommandResult } from '@/lib/character/commands/commandResult'
import { setManagedClassSpellChoiceCommand } from '@/lib/character/commands/managedClassSpellCommands'
import { getManagedClassSpellSlots } from '@/lib/character/managedClassSpellSlots'
import { getManagedClassSpellPool } from '@/lib/character/managedClassSpells'
import {
  createCharacterSheetViewModel,
  withoutSheetDescriptions,
} from '@/lib/pdf/characterSheetViewModel'
import { validateSpells } from '@/lib/readiness/spellReadiness'
import type { Class5e, ClassFeature, GameData, Spell5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { selectBonusSpellFixture } from '../fixtures/bonusSpellSelection'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { makeGameDataFixture } from '../fixtures/gameDataFixtures'

const owner = { name: 'Warlock', source: 'XPHB' }
const featureName = 'Contact Patron'
const reference = 'Contact Other Plane|XPHB'
const key = 'contact other plane|xphb'
const target = { name: 'Contact Other Plane', source: 'XPHB' }
const profileId = 'class:Warlock|XPHB'
const isContact = (row: ClassFeature) =>
  row.name === featureName && row.className === owner.name && row.classSource === owner.source
const isWarlock = (row: Class5e) => row.name === owner.name && row.source === owner.source
const isSpell = (row: { name: string; source: string }) =>
  getSpellReferenceKey(row.name, row.source) === key
const rule =
  /without expending a spell slot to contact your patron.*automatically succeed.*Long Rest/i
let data: GameData
let full: ReturnType<typeof lookups>

function lookups(current: GameData) {
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
  full = lookups(data)
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

function actor(levels: number, source = 'XPHB') {
  return reopen(
    makeCharacterFixture({
      originSystem: source === 'XPHB' ? '2024' : '2014',
      allowedSources: [source],
      classProgression: [{ ...owner, source, levels }],
    }),
  )
}

const calculate = (saved: Character, current = full) =>
  createCharacterCalculationContext(saved, current, full)
const contactStatus = (saved: Character, current = full) =>
  calculate(saved, current).fixedClassSpellStatuses.find((row) => row.featureName === featureName)
const profile = (saved: Character) => saved.spells.spellProfiles.find((row) => row.id === profileId)
const ordinaryAtNine = (saved: Character) => {
  const slot = getManagedClassSpellSlots(saved.classProgression[0]).find(
    (row) => row[1] === 'class-known' && row[3] === 9,
  )
  if (!slot) throw new Error('Missing ordinary level-9 spell choice')
  return slot
}

function levelNine(saved: Character) {
  return reopen(
    saved,
    applyLevelUp(
      saved,
      saved.provenance,
      [{ ...saved.classProgression[0], levels: 9 }],
      {
        className: owner.name,
        classSource: owner.source,
        classLevel: 9,
        hitDie: 8,
        dieResult: 5,
        method: 'average',
      },
      calculate(saved),
    ),
  )
}

test('earns the fixed preparation through level-up, strict reopen, rollback and re-earn', () => {
  const eight = actor(8)
  expect(contactStatus(eight)).toBeUndefined()
  expect(contactStatus(actor(20, 'PHB'))).toBeUndefined()
  const nine = levelNine(eight)
  const current = calculate(nine)
  expect(contactStatus(nine)).toMatchObject({
    owner: ['class', 'warlock', 'xphb'],
    target: 'class-feature|contact patron|warlock|xphb|9|xphb',
    level: 9,
    reference,
    active: true,
    prepared: true,
    castingNote: expect.stringMatching(rule),
  })
  expect(profile(current.character)).toMatchObject({
    spellsKnown: [reference],
    fixedSpells: [reference],
    alwaysPreparedSpells: [reference],
  })
  expect(current.managedClassSpellStatuses).toEqual([])
  expect(current.character.provenance.spells['contact other plane']).toEqual([
    expect.objectContaining({
      sourceType: 'class',
      sourceName: 'Warlock',
      sourceRef: 'XPHB',
      grantType: 'fixed',
      label: featureName,
      grantSource: 'XPHB',
    }),
  ])
  const down = reopen(nine, applyLevelDown(nine, nine.provenance, current))
  expect(down.classProgression[0].levels).toBe(8)
  expect(contactStatus(down)).toBeUndefined()
  expect(profile(calculate(down).character)?.spellsKnown).not.toContain(reference)
  expect(contactStatus(levelNine(down))?.active).toBe(true)
})

test('rejects new ordinary use through the pool and command and preserves older independent ownership', () => {
  const eight = actor(8)
  const bonus = reopen(eight, selectBonusSpellFixture(eight, reference, 'spell', full.spellsByKey))
  const nine = levelNine(bonus)
  const context = calculate(nine).classChoices.spellContext
  const slot = ordinaryAtNine(nine)
  expect(getManagedClassSpellPool(nine, slot, context).spells.some(isSpell)).toBe(false)
  for (const policy of ['default', 'ignore-class-list'] as const) {
    expect(() =>
      setManagedClassSpellChoiceCommand(
        nine,
        nine.provenance,
        {
          slot,
          expected: null,
          expectedEmptyRevision: nine.managedClassSpellRevision ?? 0,
          target,
          policy,
        },
        context,
      ),
    ).toThrow(/already grants that spell/)
  }

  const withoutFeature = lookups({
    ...data,
    classFeatures: data.classFeatures.filter((row) => !isContact(row)),
  })
  const historicalContext = calculate(nine, withoutFeature).classChoices.spellContext
  expect(getManagedClassSpellPool(nine, slot, historicalContext).defaultReferences.has(key)).toBe(
    true,
  )
  const saved = reopen(
    nine,
    setManagedClassSpellChoiceCommand(
      nine,
      nine.provenance,
      {
        slot,
        expected: null,
        expectedEmptyRevision: nine.managedClassSpellRevision ?? 0,
        target,
        policy: 'default',
      },
      historicalContext,
    ),
  )
  const [choice] = saved.managedClassSpellChoices ?? []
  expect(calculate(saved).managedClassSpellStatuses).toEqual([
    expect.objectContaining({ choice, active: true }),
  ])
  expect(calculate(saved, withoutFeature).managedClassSpellStatuses[0]?.active).toBe(true)
  expect(
    validateSpells(saved, calculate(saved, withoutFeature), withoutFeature.spellsByKey),
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        severity: 'blocking',
        explanation: 'Restore the exact Contact Patron feature and its class spell schedule.',
      }),
    ]),
  )
  expect(calculate(saved).character.provenance.spells['contact other plane']).toHaveLength(3)
  const cleared = reopen(
    saved,
    setManagedClassSpellChoiceCommand(
      saved,
      saved.provenance,
      {
        slot,
        expected: choice,
      },
      calculate(saved).classChoices.spellContext,
    ),
  )
  expect(profile(calculate(cleared).character)?.spellsKnown).toEqual([reference])
  expect(contactStatus(cleared)?.active).toBe(true)
  expect(
    calculate(cleared, withoutFeature).character.spells.spellProfiles.find(
      (row) => row.type === 'special',
    )?.spellsKnown,
  ).toEqual([reference])
})

test('does not turn a missing or altered current printing into a fixed spell or casting note', () => {
  const nine = levelNine(actor(8))
  const withoutTarget = lookups({ ...data, spells: data.spells.filter((row) => !isSpell(row)) })
  const wrongRank = lookups({
    ...data,
    spells: data.spells.map((row) => (isSpell(row) ? { ...row, level: 4 } : row)),
  })
  for (const catalog of [withoutTarget, wrongRank]) {
    const current = calculate(nine, catalog)
    expect(contactStatus(nine, catalog)).toMatchObject({
      active: false,
      reason: expect.any(String),
    })
    expect(profile(current.character)?.spellsKnown).not.toContain(reference)
    expect(validateSpells(nine, current, catalog.spellsByKey)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'blocking',
          title: expect.stringContaining('Restore Contact Patron spell'),
        }),
      ]),
    )
  }
  const changedFeature = lookups({
    ...data,
    classFeatures: data.classFeatures.map((row) =>
      isContact(row) ? { ...row, entries: ['Other rule.'] } : row,
    ),
  })
  const duplicateFeature = lookups({
    ...data,
    classFeatures: [...data.classFeatures, ...data.classFeatures.filter(isContact)],
  })
  const changedSchedule = lookups({
    ...data,
    classes: data.classes.map((row) =>
      isWarlock(row)
        ? { ...row, additionalSpells: [{ prepared: { '9': ['contact other plane|phb'] } }] }
        : row,
    ),
  })
  for (const catalog of [changedFeature, duplicateFeature, changedSchedule]) {
    expect(contactStatus(nine, catalog)).toMatchObject({
      active: false,
      reason: 'Restore the exact Contact Patron feature and its class spell schedule.',
    })
    expect(contactStatus(nine, catalog)?.castingNote).toBeUndefined()
    expect(profile(calculate(nine, catalog).character)?.spellsKnown).not.toContain(reference)
  }
  expect(contactStatus(reopen(nine))?.active).toBe(true)
})

test('rejects an invalid spell package even when it hides a duplicate of the exact printing', () => {
  const spell = data.spells.find(isSpell)
  if (!spell?.classSpellRouteSource) throw new Error('Missing parsed Contact Other Plane')
  const malformed = {
    ...spell,
    classSpellRouteSource: { ...spell.classSpellRouteSource, sourceDigest: '0' },
  }
  const layer = makeGameDataFixture({
    spells: parseSpells({ spell: [spell, malformed] }) as Spell5e[],
  })
  const conflicted = lookups(composeGameDataLayers([data, layer]))
  const visible = Object.values(conflicted.spellsByKey).find(isSpell)
  expect(visible?.classSpellRouteDiagnostics).toContainEqual(
    expect.objectContaining({ code: 'invalid-package' }),
  )
  const nine = levelNine(actor(8))
  expect(contactStatus(nine, conflicted)).toMatchObject({
    active: false,
    reason: 'Restore the exact spell printing from the enabled content.',
  })
  expect(profile(calculate(nine, conflicted).character)?.spellsKnown).not.toContain(reference)
  expect(contactStatus(reopen(nine))?.active).toBe(true)
})

test('rejects a Contact Patron schedule with an extra prepared gain', () => {
  const nine = levelNine(actor(8))
  const extended = lookups({
    ...data,
    classes: data.classes.map((row) =>
      isWarlock(row)
        ? {
            ...row,
            additionalSpells: [
              {
                prepared: { '9': ['contact other plane|xphb'], '10': ['dream|xphb'] },
              },
            ],
          }
        : row,
    ),
  })
  expect(contactStatus(nine, extended)).toMatchObject({
    active: false,
    reason: 'Restore the exact Contact Patron feature and its class spell schedule.',
  })
  expect(profile(calculate(nine, extended).character)?.spellsKnown).not.toContain(reference)
  expect(contactStatus(reopen(nine))?.active).toBe(true)
})

test('projects the rule into creator spell notes, Actions and compact PDF summaries', () => {
  const nine = levelNine(actor(8))
  const current = calculate(nine)
  const warlock = profile(current.character)
  const bonus = current.character.spells.spellProfiles.find((row) => row.type === 'special')
  if (!warlock || !bonus) throw new Error('Missing spell profile fixture')
  expect(
    getFixedClassSpellCastingNotes(current.fixedClassSpellStatuses, reference, warlock),
  ).toEqual([expect.stringMatching(rule)])
  expect(getFixedClassSpellCastingNotes(current.fixedClassSpellStatuses, reference, bonus)).toEqual(
    [],
  )
  expect(
    getFixedClassSpellCastingNotes(
      current.fixedClassSpellStatuses,
      'Contact Other Plane|PHB',
      warlock,
    ),
  ).toEqual([])

  const sheet = createCharacterSheetViewModel(nine, full, full)
  expect(sheet.spellRows.filter((row) => row.id === key)).toEqual([
    expect.objectContaining({
      prepared: true,
      level: '5',
      castingNote: expect.stringMatching(rule),
    }),
  ])
  expect(sheet.actions.find((row) => row.name === target.name)).toMatchObject({
    active: true,
    description: expect.stringMatching(rule),
  })
  expect(withoutSheetDescriptions(sheet).managedSpellCastingSummaries).toContainEqual(
    expect.stringMatching(rule),
  )
})
