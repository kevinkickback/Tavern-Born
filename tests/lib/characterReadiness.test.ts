import { describe, expect, test } from 'vitest'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { getCharacterReadiness } from '@/lib/readiness/characterReadiness'
import type { Background5e, Class5e, Feat5e, Item5e, Race5e } from '@/types/5etools'
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
    expect(
      result.issues.find((entry) => entry.id === 'race:ability-choice:0')?.navigationTarget,
    ).toBe('/build/ability-scores')
    const classChoiceTarget = result.issues.find(
      (entry) => entry.id === 'class-choice:test-choice',
    )?.navigationTarget
    expect(classChoiceTarget).toBeTruthy()
    const classChoiceParams = new URL(classChoiceTarget!, 'https://tavern-born.test').searchParams
    expect(classChoiceParams.get('class')).toBe('Test Class|TEST')
    expect(classChoiceParams.get('level')).toBe('1')
    expect(classChoiceParams.get('choice')).toBe('test-choice')
    for (const issueId of ['class:subclass:Test Class|TEST', 'class:asi:Test Class|TEST:1']) {
      const target = result.issues.find((entry) => entry.id === issueId)?.navigationTarget
      const params = new URL(target!, 'https://tavern-born.test').searchParams
      expect(params.get('class')).toBe('Test Class|TEST')
      expect(params.get('level')).toBe('1')
    }
  })

  test('routes revised background ability choices to the canonical ability-score editor', () => {
    const testRace = { name: 'Test Race', source: 'TEST' } as Race5e
    const testBackground = {
      name: 'Test Background',
      source: 'TEST',
      ability: [
        {
          choose: {
            weighted: { from: ['str', 'dex', 'con'], weights: [2, 1] },
          },
        },
      ],
    } as Background5e
    const character = makeCharacterFixture({
      originSystem: '2024',
      race: testRace.name,
      raceSource: testRace.source,
      background: testBackground.name,
      backgroundSource: testBackground.source,
      backgroundAsiChoices: [],
    })
    const calculation = createCharacterCalculationContext(character, {
      racesByKey: { 'Test Race|TEST': testRace },
      backgroundsByKey: { 'Test Background|TEST': testBackground },
    })

    const result = getCharacterReadiness(character, { calculation })

    expect(
      result.issues.find((entry) => entry.id === 'background:ability-choices')?.navigationTarget,
    ).toBe('/build/ability-scores')
  })

  test('treats a stored class choice outside its current eligibility rules as incomplete', () => {
    const testClass = {
      name: 'Test Barbarian',
      source: 'TEST',
      hd: { faces: 12 },
      normalizedRules: {
        resources: [],
        asiLevels: [],
        ritualCasting: false,
        choiceDiagnostics: [],
        choices: [
          {
            id: 'test-mastery-choice',
            label: 'Weapon Mastery',
            kind: 'item',
            owner: { type: 'class', name: 'Test Barbarian', source: 'TEST' },
            level: 1,
            minimumSelections: 1,
            maximumSelections: 1,
            selectionCountByLevel: Array.from({ length: 20 }, () => 1),
            options: [],
            optionFilter: {
              entityType: 'item',
              itemTypes: ['simple weapon', 'martial weapon'],
              weaponRanges: ['melee'],
              requiresMastery: true,
            },
            repeatable: false,
            replacement: { cadence: 'long-rest', maximumPerEvent: 1 },
            source: { kind: 'class-feature-options', field: 'test' },
          },
        ],
      },
    } as Class5e
    const character = makeCharacterFixture({
      class: testClass.name,
      classSource: testClass.source,
      classProgression: [{ name: testClass.name, source: testClass.source, levels: 1 }],
      classChoiceSelections: [
        {
          choiceId: 'test-mastery-choice',
          label: 'Weapon Mastery',
          kind: 'item',
          className: testClass.name,
          classSource: testClass.source,
          classLevel: 1,
          selected: [{ entityType: 'item', name: 'Test Bow', source: 'TEST', slotLevel: 1 }],
        },
      ],
    })
    const calculation = createCharacterCalculationContext(character, {
      classesByKey: { [`${testClass.name}|${testClass.source}`]: testClass },
    })
    const testBow = {
      name: 'Test Bow',
      source: 'TEST',
      type: 'R',
      weaponCategory: 'martial',
      mastery: ['Vex|TEST'],
    } as Item5e

    const result = getCharacterReadiness(character, {
      calculation,
      classChoiceCatalogs: {
        classFeatures: [],
        feats: [],
        items: [],
        itemsBase: [testBow],
        itemMasteries: [],
        optionalFeatures: [],
        itemTypeByAbbr: {},
        weaponProficiencies: ['martial weapons'],
      },
    })

    expect(result.blockingIssues.map((entry) => entry.id)).toContain(
      'class-choice:test-mastery-choice',
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

  test('validates Wizard spellbook, cantrip, and prepared limits independently', () => {
    const wizard = {
      name: 'Wizard',
      source: 'PHB',
      hd: { faces: 6 },
      spellcastingAbility: 'int',
      casterProgression: 'full',
      cantripProgression: [3],
      spellsKnownProgressionFixed: [6],
      preparedSpells: '<$level$> + <$int_mod$>',
      normalizedRules: {
        resources: [],
        asiLevels: [],
        ritualCasting: false,
        choices: [],
        choiceDiagnostics: [],
      },
    } as Class5e
    const character = makeCharacterFixture({
      class: 'Wizard',
      classSource: 'PHB',
      classProgression: [{ name: 'Wizard', source: 'PHB', levels: 1 }],
      level: 1,
      abilityScores: {
        ...makeCharacterFixture().abilityScores,
        intelligence: 16,
      },
      spells: {
        ...makeCharacterFixture().spells,
        spellProfiles: [
          {
            id: 'class:Wizard|PHB',
            type: 'class',
            label: 'Wizard (Lv 1)',
            className: 'Wizard',
            classSource: 'PHB',
            cantrips: ['Fire Bolt', 'Mage Hand', 'Ray of Frost', 'Light'],
            spellsKnown: [
              'Burning Hands',
              'Charm Person',
              'Find Familiar',
              'Mage Armor',
              'Magic Missile',
              'Sleep',
              'Detect Magic',
              'Shield',
            ],
            preparedSpells: ['Burning Hands', 'Mage Armor', 'Magic Missile', 'Sleep', 'Shield'],
            fixedSpells: ['Light', 'Detect Magic', 'Shield'],
            alwaysPreparedSpells: ['Shield'],
            alwaysPrepared: false,
          },
        ],
      },
    })
    const calculation = createCharacterCalculationContext(character, {
      classesByKey: { 'Wizard|PHB': wizard },
    })

    const result = getCharacterReadiness(character, { calculation })

    expect(result.blockingIssues.filter((issue) => issue.id.startsWith('spells:'))).toEqual([])
  })
})
