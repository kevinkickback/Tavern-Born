import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, expectTypeOf, test } from 'vitest'
import { buildInitialCharacter } from '@/lib/character/commands/originSelectionCommand'
import { CURRENT_CHARACTER_SCHEMA_VERSION } from '@/lib/schema/characterSchemaVersion'
import type { Race5e } from '@/types/5etools'
import {
  type CharacterSchemaOutputContract,
  characterPersistenceSchema,
} from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

describe('characterPersistenceSchema', () => {
  test('keeps normalized persistence output compatible with the runtime Character type', () => {
    expectTypeOf<CharacterSchemaOutputContract>().toEqualTypeOf<true>()
  })

  test('accepts a full persisted character shape', () => {
    const character = makeCharacterFixture()
    const result = characterPersistenceSchema.safeParse(character)

    expect(result.success).toBe(true)
  })

  test('accepts the current exported character fixture', () => {
    const fixture = JSON.parse(
      fs.readFileSync(path.resolve('tests/fixtures/equipment-e2e.tbc'), 'utf8'),
    ) as { schemaVersion?: unknown }
    const result = characterPersistenceSchema.safeParse(fixture)

    expect(fixture.schemaVersion).toBe(CURRENT_CHARACTER_SCHEMA_VERSION)
    expect(result.success ? [] : result.error.issues).toEqual([])
  })

  test.each([
    { bladesingerAnyRace: true },
    { bladesingerAnyRace: false },
    { battleragerAnyRace: true },
    { battleragerAnyRace: false },
    { bladesingerAnyRace: false, battleragerAnyRace: true },
    { bladesingerAnyRace: false, battleragerAnyRace: false },
    { anyRaceSubclasses: false, bladesingerAnyRace: true },
    { anyRaceSubclasses: true, battleragerAnyRace: false },
    { unknownRule: true },
    { anyRaceSubclasses: true, unknownRule: false },
  ])('rejects discontinued or unknown variant rules without conversion: %j', (variantRules) => {
    const character = { ...makeCharacterFixture(), variantRules }
    const before = structuredClone(character)

    expect(characterPersistenceSchema.safeParse(character).success).toBe(false)
    expect(character).toEqual(before)
  })

  test.each([
    ['2014', false],
    ['2014', true],
    ['2024', false],
    ['2024', true],
  ] as const)('Finish and strict reopen retain canonical settings for %s with any-race %s', (originSystem, anyRaceSubclasses) => {
    const variantRules = {
      optionalClassFeatures: true,
      averageHitPoints: false,
      abilityScoreMethod: 'custom' as const,
      anyRaceSubclasses,
      preferNewerPrintings: false,
      ignoreEquipRestrictions: true,
    }
    const character = buildInitialCharacter(
      { initial: { name: 'Canonical settings', originSystem, variantRules } },
      new Map(),
      () => [],
    )
    const reopened = characterPersistenceSchema.parse(JSON.parse(JSON.stringify(character)))

    expect(reopened.schemaVersion).toBe(CURRENT_CHARACTER_SCHEMA_VERSION)
    expect(reopened.variantRules).toEqual(variantRules)
  })

  test('preserves optional current variant-rule defaults without introducing discontinued settings', () => {
    expect(
      characterPersistenceSchema.parse(makeCharacterFixture({ variantRules: undefined }))
        .variantRules,
    ).toBeUndefined()
    expect(
      characterPersistenceSchema.parse(makeCharacterFixture({ variantRules: {} })).variantRules,
    ).toEqual({
      optionalClassFeatures: false,
      averageHitPoints: true,
      anyRaceSubclasses: false,
      ignoreEquipRestrictions: false,
    })
  })

  test('requires an exact source for every selected subclass', () => {
    const character = makeCharacterFixture({
      classProgression: [
        {
          name: 'Rogue',
          source: 'PHB',
          levels: 3,
          subclass: 'Arcane Trickster',
        },
      ],
    })

    const result = characterPersistenceSchema.safeParse(character)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: ['classProgression', 0, 'subclassSource'],
          }),
        ]),
      )
    }
  })

  test('rejects malformed spell profiles in persisted data', () => {
    const character = makeCharacterFixture({
      spells: {
        spellProfiles: [
          {
            id: 'class:Wizard|PHB',
            type: 'class',
            label: 'Wizard (Lv 1)',
            cantrips: [],
            spellsKnown: [],
            preparedSpells: [],
          },
        ],
        spellSlots: {
          1: { max: 0, used: 0 },
          2: { max: 0, used: 0 },
          3: { max: 0, used: 0 },
          4: { max: 0, used: 0 },
          5: { max: 0, used: 0 },
          6: { max: 0, used: 0 },
          7: { max: 0, used: 0 },
          8: { max: 0, used: 0 },
          9: { max: 0, used: 0 },
        },
      },
    })

    const result = characterPersistenceSchema.safeParse(character)
    expect(result.success).toBe(false)
  })

  test('round-trips structured movement, adjustments, and overrides', () => {
    const character = makeCharacterFixture({
      movement: {
        speeds: { walk: 25, swim: 30 },
        hover: false,
        other: { phase: 10, glide: true },
        source: { kind: 'race', name: 'River Dwarf', source: 'HB' },
      },
      movementAdjustments: [
        {
          id: 'training',
          label: 'Training',
          mode: 'walk',
          amount: 5,
          sourceType: 'manual',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      movementOverrides: { fly: 40 },
      movementHoverOverride: true,
    })

    const result = characterPersistenceSchema.parse(
      JSON.parse(JSON.stringify(character)) as unknown,
    )

    expect(result.movement).toEqual(character.movement)
    expect(result.movementAdjustments).toEqual(character.movementAdjustments)
    expect(result.movementOverrides).toEqual({ fly: 40 })
    expect(result.movementHoverOverride).toBe(true)
  })

  test('round-trips source-qualified class choice selections and slot ownership', () => {
    const character = makeCharacterFixture({
      classChoiceSelections: [
        {
          choiceId: 'class:sorcerer|xphb|choice:metamagic|2',
          label: 'Metamagic',
          kind: 'optional-feature',
          className: 'Sorcerer',
          classSource: 'XPHB',
          classLevel: 2,
          selected: [
            {
              entityType: 'optionalFeature',
              name: 'Quickened Spell',
              source: 'XPHB',
              slotLevel: 2,
            },
          ],
        },
      ],
    })

    const result = characterPersistenceSchema.parse(
      JSON.parse(JSON.stringify(character)) as unknown,
    )

    expect(result.classChoiceSelections).toEqual(character.classChoiceSelections)
  })

  test('round-trips provenance ability-choice amounts', () => {
    const character = makeCharacterFixture({ race: 'Test Race', raceSource: 'TEST' })
    character.provenance.choices = [
      {
        id: 'race:test%20race|test:abilityBonuses:choose:0',
        domain: 'abilityBonuses',
        sourceTag: {
          sourceType: 'race',
          sourceName: 'Test Race',
          sourceRef: 'TEST',
          grantType: 'placeholder',
          label: 'Test Race',
        },
        chooseCount: 1,
        amount: 2,
        optionPool: ['strength', 'dexterity'],
        selected: ['strength'],
        status: 'resolved',
      },
    ]
    character.raceAsiChoices = [['strength']]

    const result = characterPersistenceSchema.parse(
      JSON.parse(JSON.stringify(character)) as unknown,
    )

    expect(result.provenance.choices[0]?.amount).toBe(2)
  })

  function abilityCharacter() {
    return buildInitialCharacter(
      {
        initial: { name: 'Native block references', originSystem: '2014' },
        race: {
          name: ' Parent|With:% escapes ',
          source: ' TEST|:% ',
          ability: [
            { choose: { from: ['str', 'dex', 'wis'], amount: 2 } },
            { choose: { from: ['str', 'dex', 'wis'], amount: 1 } },
          ],
        } as Race5e,
        raceAsiChoices: [
          ['str', 'invalid', 'wis'],
          ['dex', 'str'],
        ],
      },
      new Map(),
      () => [],
    )
  }

  test('canonical full owner references preserve bounded raw slots across array permutations and case refresh', () => {
    const character = abilityCharacter()
    character.race = 'pARENT|wITH:% ESCAPES'
    character.raceSource = 'test|:%'
    character.provenance!.choices.reverse()
    const before = structuredClone(character)
    const saved = characterPersistenceSchema.parse(JSON.parse(JSON.stringify(character)))
    expect(saved.raceAsiChoices).toEqual([
      ['str', 'invalid', 'wis'],
      ['dex', 'str'],
    ])
    expect(
      saved.provenance.choices.map((c) => ({ id: c.id, selected: c.selected, status: c.status })),
    ).toEqual([
      {
        id: 'race:parent%7Cwith%3A%25%20escapes|test%7C%3A%25:abilityBonuses:choose:1',
        selected: ['dexterity'],
        status: 'resolved',
      },
      {
        id: 'race:parent%7Cwith%3A%25%20escapes|test%7C%3A%25:abilityBonuses:choose:0',
        selected: ['strength'],
        status: 'resolved',
      },
    ])
    expect(character).toEqual(before)
  })

  test.each([
    'opaque',
    'wrong-type',
    'wrong-name',
    'wrong-source',
    'wrong-domain',
    'negative',
    'fractional',
    'leading-zero',
    'unsafe',
    'duplicate',
    'gap',
    'missing-amount',
    'wrong-selected',
    'wrong-status',
    'malformed-unicode',
  ])('rejects ambiguous or incoherent current racial ability blocks: %s', (defect) => {
    const character = abilityCharacter()
    const record = character.provenance!.choices[0]
    if (defect === 'opaque') record.id = 'old-opaque-id'
    if (defect === 'wrong-type') record.id = record.id.replace(/^race:/, 'subrace:')
    if (defect === 'wrong-name') record.id = record.id.replace('parent%7Cwith', 'different')
    if (defect === 'wrong-source') record.id = record.id.replace('|test', '|other')
    if (defect === 'wrong-domain') record.id = record.id.replace(':abilityBonuses:', ':skills:')
    if (defect === 'negative') record.id = record.id.replace(/:0$/, ':-1')
    if (defect === 'fractional') record.id = record.id.replace(/:0$/, ':0.5')
    if (defect === 'leading-zero') record.id = record.id.replace(/:0$/, ':00')
    if (defect === 'unsafe') record.id = record.id.replace(/:0$/, ':9007199254740992')
    if (defect === 'duplicate') character.provenance!.choices.push(structuredClone(record))
    if (defect === 'gap') record.id = record.id.replace(/:0$/, ':2')
    if (defect === 'missing-amount') delete record.amount
    if (defect === 'wrong-selected') record.selected = ['wisdom']
    if (defect === 'wrong-status') record.status = 'pending'
    if (defect === 'malformed-unicode') {
      record.sourceTag.sourceName = '\uD800'
      character.race = '\uD800'
    }
    const before = structuredClone(character)
    expect(characterPersistenceSchema.safeParse(character).success).toBe(false)
    expect(character).toEqual(before)
  })

  test('unrelated domains and manual/class choices may share a racial block ID without consuming its slots', () => {
    const character = abilityCharacter()
    const record = character.provenance!.choices[0]
    const unrelated = [
      { ...record, domain: 'skills' as const },
      { ...record, sourceTag: { ...record.sourceTag, sourceType: 'manual' as const } },
      { ...record, sourceTag: { ...record.sourceTag, sourceType: 'class' as const } },
    ]
    character.provenance!.choices.unshift(...unrelated)
    const saved = characterPersistenceSchema.parse(character)
    expect(saved.provenance.choices.slice(0, 3)).toEqual(unrelated)
  })

  test.each([
    false,
    true,
  ])('2024 rejects retained racial blocks, whether their slots are coherent: %s', (coherent) => {
    const character = abilityCharacter()
    character.originSystem = '2024'
    if (!coherent) {
      character.provenance!.choices[0].selected = ['wisdom']
      character.provenance!.choices[0].status = 'pending'
    }
    const before = structuredClone(character)
    expect(characterPersistenceSchema.safeParse(character).success).toBe(false)
    expect(character).toEqual(before)
  })

  test.each([
    'race',
    'subrace',
  ] as const)('2024 rejects fixed racial ability grants from %s while retaining independent ability owners', (sourceType) => {
    const current = buildInitialCharacter(
      {
        initial: { name: 'Revised origin', originSystem: '2024' },
        race: { name: 'Parent', source: 'TEST', ability: [{ con: 2 }] } as Race5e,
        subrace: { name: 'Child', source: 'TEST', ability: [{ dex: 1 }] } as Race5e,
      },
      new Map(),
      () => [],
    )
    const independent = ['manual', 'class', 'background'].map((owner) => ({
      ability: 'wisdom',
      value: 1,
      sourceTag: {
        sourceType: owner as 'manual' | 'class' | 'background',
        sourceName: 'Independent',
        sourceRef: 'TEST',
        grantType: 'fixed' as const,
        label: 'Independent',
      },
    }))
    current.provenance!.abilityBonuses.push(...independent)
    expect(
      characterPersistenceSchema.parse(JSON.parse(JSON.stringify(current))).provenance
        .abilityBonuses,
    ).toEqual(independent)
    const malformed = structuredClone(current)
    malformed.provenance!.abilityBonuses.push({
      ability: 'constitution',
      value: 2,
      sourceTag: {
        sourceType,
        sourceName: sourceType === 'race' ? 'Parent' : 'Child',
        sourceRef: 'TEST',
        grantType: 'fixed',
        label: 'Retained racial grant',
      },
    })
    expect(characterPersistenceSchema.safeParse(malformed).success).toBe(false)
    expect(characterPersistenceSchema.safeParse(current).success).toBe(true)
  })

  test('round-trips typed manual effects and their activation state', () => {
    const character = makeCharacterFixture({
      manualEffects: [
        {
          id: 'manual-speed',
          label: 'Situational speed adjustment',
          target: { kind: 'speed', mode: 'walk' },
          operation: { kind: 'add', value: 5 },
          source: {
            kind: 'manual',
            name: 'User adjustment',
            provenance: { choiceId: 'manual-choice' },
          },
          requirements: [{ kind: 'flag', key: 'active', expected: true }],
          condition: 'Applies while the declared condition is met.',
        },
      ],
      suppressedEffectIds: ['source-effect'],
      effectFlags: { active: true },
    })

    const result = characterPersistenceSchema.parse(
      JSON.parse(JSON.stringify(character)) as unknown,
    )

    expect(result.manualEffects).toEqual(character.manualEffects)
    expect(result.suppressedEffectIds).toEqual(['source-effect'])
    expect(result.effectFlags).toEqual({ active: true })
  })

  test('rejects an operation that does not match its typed effect target', () => {
    const character = makeCharacterFixture({
      manualEffects: [
        {
          id: 'invalid-effect',
          label: 'Invalid effect',
          target: { kind: 'damage-resistance', damageType: 'test' },
          operation: { kind: 'add', value: 1 },
          source: { kind: 'manual', name: 'User adjustment' },
        } as never,
      ],
    })

    expect(characterPersistenceSchema.safeParse(character).success).toBe(false)
  })

  test('round-trips manual structured actions and rejects source-derived snapshots', () => {
    const action = {
      id: 'manual-action',
      name: 'Test action',
      kind: 'bonus-action' as const,
      description: 'Test description.',
      source: { kind: 'manual' as const, name: 'Test action' },
      active: true,
      attackBonus: 3,
      range: 'Test range',
      damage: [{ dice: '1d6', bonus: 1, damageType: 'test damage' }],
      resourceCost: { resourceId: 'test-resource', amount: 1 },
      recharge: { rest: 'long' as const, note: 'Test recharge.' },
    }
    const character = makeCharacterFixture({ manualActions: [action] })

    expect(characterPersistenceSchema.parse(character).manualActions).toEqual([action])
    expect(
      characterPersistenceSchema.safeParse({
        ...character,
        manualActions: [{ ...action, source: { kind: 'class', name: 'Test source' } }],
      }).success,
    ).toBe(false)
  })
})
