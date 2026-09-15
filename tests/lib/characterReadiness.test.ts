import { describe, expect, test } from 'vitest'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { getCharacterReadiness } from '@/lib/readiness/characterReadiness'
import type { Class5e, Feat5e, Race5e } from '@/types/5etools'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

describe('getCharacterReadiness', () => {
  test('returns stable navigation issues for an incomplete draft without game data', () => {
    const character = makeCharacterFixture({
      name: '',
      race: '',
      class: '',
      classProgression: [],
      background: '',
      variantRules: {},
      portrait: undefined,
    })

    const result = getCharacterReadiness(character)

    expect(result.status).toBe('incomplete')
    expect(result.blockingIssues.map((entry) => entry.id)).toEqual([
      'identity:name',
      'identity:race',
      'identity:class',
      'identity:background',
      'rules:ability-score-method',
    ])
    expect(result.issues.find((entry) => entry.id === 'identity:race')?.navigationTarget).toBe(
      '/build/race',
    )
    expect(result.recommendations.map((entry) => entry.id)).toEqual(['portrait:missing'])
  })

  test('validates structured origin, subclass, class-choice, ASI, and provenance requirements', () => {
    const testRace = {
      name: 'Test Race',
      source: 'TEST',
      ability: [{ choose: { count: 1, amount: 2, from: ['str', 'dex'] } }],
    } as Race5e
    const testClass = {
      name: 'Test Class',
      source: 'TEST',
      hd: { faces: 8 },
      subclasses: [
        { name: 'Test Path', shortName: 'Test Path', source: 'TEST', className: 'Test Class' },
      ],
      classFeatureRefs: [
        {
          ref: 'test',
          name: 'Test Choice Level',
          className: 'Test Class',
          level: 1,
          gainSubclassFeature: true,
        },
      ],
      normalizedRules: {
        resources: [],
        asiLevels: [1],
        ritualCasting: false,
        choiceDiagnostics: [],
        choices: [
          {
            id: 'test-choice',
            label: 'Test Choice',
            kind: 'class-feature',
            owner: { type: 'class', name: 'Test Class', source: 'TEST' },
            level: 1,
            minimumSelections: 1,
            maximumSelections: 1,
            selectionCountByLevel: Array.from({ length: 20 }, () => 1),
            options: [{ entityType: 'classFeature', name: 'Test Option', source: 'TEST' }],
            repeatable: false,
            replacement: { cadence: 'never' },
            source: { kind: 'class-feature-options', field: 'test' },
          },
        ],
      },
    } as Class5e
    const character = makeCharacterFixture({
      name: 'Test Character',
      race: testRace.name,
      raceSource: testRace.source,
      class: testClass.name,
      classSource: testClass.source,
      classProgression: [{ name: testClass.name, source: testClass.source, levels: 1 }],
      background: 'Test Background',
      backgroundSource: 'TEST',
      raceAsiChoices: [],
      asiChoices: [],
      classChoiceSelections: [],
      provenance: {
        ...makeCharacterFixture().provenance!,
        choices: [
          {
            id: 'test-skill-choice',
            domain: 'skills',
            sourceTag: {
              sourceType: 'race',
              sourceName: testRace.name,
              sourceRef: testRace.source,
              grantType: 'choice',
              label: 'Test skill choice',
            },
            chooseCount: 1,
            optionPool: ['test skill'],
            selected: [],
            status: 'pending',
          },
        ],
      },
    })
    const calculation = createCharacterCalculationContext(character, {
      racesByKey: { [`${testRace.name}|${testRace.source}`]: testRace },
      classesByKey: { [`${testClass.name}|${testClass.source}`]: testClass },
      backgroundsByKey: { 'Test Background|TEST': { name: 'Test Background', source: 'TEST' } },
    })

    const result = getCharacterReadiness(character, { calculation })

    expect(result.blockingIssues.map((entry) => entry.id)).toEqual(
      expect.arrayContaining([
        'race:ability-choice:0',
        'choice:test-skill-choice',
        'class:subclass:Test Class|TEST',
        'class-choice:test-choice',
        'class:asi:Test Class|TEST:1',
      ]),
    )
  })

  test('distinguishes optional recommendations from blockers for a complete data-driven character', () => {
    const testRace = { name: 'Test Race', source: 'TEST' } as Race5e
    const testClass = {
      name: 'Test Class',
      source: 'TEST',
      hd: { faces: 8 },
      normalizedRules: {
        resources: [],
        asiLevels: [],
        ritualCasting: false,
        choices: [],
        choiceDiagnostics: [],
      },
    } as Class5e
    const character = makeCharacterFixture({
      name: 'Test Character',
      race: testRace.name,
      raceSource: testRace.source,
      class: testClass.name,
      classSource: testClass.source,
      classProgression: [{ name: testClass.name, source: testClass.source, levels: 1 }],
      background: 'Test Background',
      backgroundSource: 'TEST',
      portrait: undefined,
      variantRules: { abilityScoreMethod: 'standard-array' },
      raceAsiChoices: [['strength'], ['dexterity']],
      abilityScores: {
        strength: 15,
        dexterity: 14,
        constitution: 13,
        intelligence: 12,
        wisdom: 10,
        charisma: 8,
      },
    })
    const calculation = createCharacterCalculationContext(character, {
      racesByKey: { [`${testRace.name}|${testRace.source}`]: testRace },
      classesByKey: { [`${testClass.name}|${testClass.source}`]: testClass },
      backgroundsByKey: { 'Test Background|TEST': { name: 'Test Background', source: 'TEST' } },
    })

    const result = getCharacterReadiness(character, { calculation })

    expect(result.blockingIssues).toEqual([])
    expect(result.status).toBe('ready')
    expect(result.recommendations.map((entry) => entry.id)).toEqual(['portrait:missing'])
  })

  test('reports missing content records and unresolved equipment without discarding the draft', () => {
    const character = makeCharacterFixture({
      name: 'Test Character',
      race: 'Missing Race',
      raceSource: 'TEST',
      class: 'Missing Class',
      classSource: 'TEST',
      classProgression: [{ name: 'Missing Class', source: 'TEST', levels: 1 }],
      background: 'Missing Background',
      backgroundSource: 'TEST',
      variantRules: { abilityScoreMethod: 'standard-array' },
      abilityScores: {
        strength: 15,
        dexterity: 14,
        constitution: 13,
        intelligence: 12,
        wisdom: 10,
        charisma: 8,
      },
      equipment: [
        {
          id: 'test-item',
          name: 'Missing Item',
          type: 'G',
          quantity: 1,
          equipped: false,
          _unresolved: true,
        },
      ],
    })
    const calculation = createCharacterCalculationContext(character, {})

    const result = getCharacterReadiness(character, { calculation })

    expect(result.blockingIssues.map((entry) => entry.id)).toEqual(
      expect.arrayContaining([
        'source:race:Missing Race|TEST',
        'source:background:Missing Background|TEST',
        'source:class:Missing Class|TEST',
        'equipment:unresolved:test-item',
      ]),
    )
    expect(character.race).toBe('Missing Race')
    expect(character.equipment).toHaveLength(1)
  })

  test('requires structured feat setup when the selected feat declares follow-up choices', () => {
    const character = makeCharacterFixture({
      feats: [
        {
          id: 'test-feat-instance',
          name: 'Test Feat',
          source: 'TEST',
          description: '',
        },
      ],
    })
    const feat = {
      name: 'Test Feat',
      source: 'TEST',
      ability: [{ choose: { count: 1, amount: 1, from: ['str', 'dex'] } }],
    } as Feat5e

    const result = getCharacterReadiness(character, {
      featsByKey: { 'Test Feat|TEST': feat },
    })

    expect(result.blockingIssues.map((entry) => entry.id)).toContain('feat:setup:Test Feat|TEST::')
  })

  test('validates data-driven spell profile quotas and selected spell references', () => {
    const testRace = { name: 'Test Race', source: 'TEST' } as Race5e
    const testClass = {
      name: 'Test Class',
      source: 'TEST',
      hd: { faces: 8 },
      spellcastingAbility: 'int',
      casterProgression: 'full',
      cantripProgression: [2],
      spellsKnownProgression: [1],
      normalizedRules: {
        resources: [],
        asiLevels: [],
        ritualCasting: false,
        choices: [],
        choiceDiagnostics: [],
      },
    } as Class5e
    const character = makeCharacterFixture({
      name: 'Test Character',
      race: testRace.name,
      raceSource: testRace.source,
      class: testClass.name,
      classSource: testClass.source,
      classProgression: [{ name: testClass.name, source: testClass.source, levels: 1 }],
      background: 'Test Background',
      backgroundSource: 'TEST',
      variantRules: { abilityScoreMethod: 'standard-array' },
      abilityScores: {
        strength: 15,
        dexterity: 14,
        constitution: 13,
        intelligence: 12,
        wisdom: 10,
        charisma: 8,
      },
      spells: {
        ...makeCharacterFixture().spells,
        spellProfiles: [
          {
            id: `class:${testClass.name}|${testClass.source}`,
            type: 'class',
            label: testClass.name,
            className: testClass.name,
            classSource: testClass.source,
            cantrips: ['Missing Cantrip'],
            spellsKnown: [],
            preparedSpells: [],
          },
        ],
      },
    })
    const calculation = createCharacterCalculationContext(character, {
      racesByKey: { [`${testRace.name}|${testRace.source}`]: testRace },
      classesByKey: { [`${testClass.name}|${testClass.source}`]: testClass },
      backgroundsByKey: { 'Test Background|TEST': { name: 'Test Background', source: 'TEST' } },
    })

    const result = getCharacterReadiness(character, { calculation, spellsByKey: {} })

    expect(result.blockingIssues.map((entry) => entry.id)).toEqual(
      expect.arrayContaining([
        'spells:cantrips:class:Test Class|TEST',
        'spells:known:class:Test Class|TEST',
        'source:spell:Missing Cantrip',
      ]),
    )
  })
})
