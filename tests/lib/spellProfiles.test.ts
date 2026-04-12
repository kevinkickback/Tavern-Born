import { describe, expect, test } from 'vitest'
import {
  buildClassSpellLevelKey,
  buildClassSpellSelectionsByLevel,
  buildSpellcastingClassDetails,
  calculateCharacterSpellSlots,
  collectKnownSpells,
  ensureSpellProfiles,
  evaluatePreparedSpellsFormula,
  getPreparedSpellLimit,
  inferClassSpellAttributionLevels,
  isSpellOnClassList,
  SPECIAL_SPELL_PROFILE_ID,
  SPECIAL_SPELL_PROFILE_LABEL,
} from '@/lib/calculations/spellProfiles'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { makeClassFixture } from '../fixtures/gameDataFixtures'

function makeBaseProvenance() {
  const provenance = makeCharacterFixture().provenance
  if (!provenance) {
    throw new Error('Expected fixture provenance to be defined')
  }
  return provenance
}

describe('spellProfiles', () => {
  test('ensureSpellProfiles creates class profiles and special unrestricted profile', () => {
    const character = makeCharacterFixture({
      class: 'Wizard',
      classSource: 'PHB',
      level: 3,
      classProgression: [
        { name: 'Wizard', source: 'PHB', levels: 3 },
        { name: 'Cleric', source: 'PHB', levels: 2 },
      ],
      spells: {
        spellProfiles: [
          {
            id: 'class:Wizard|PHB',
            type: 'class',
            label: 'Wizard (Lv 3)',
            className: 'Wizard',
            classSource: 'PHB',
            cantrips: ['Mage Hand'],
            spellsKnown: ['Magic Missile'],
            preparedSpells: ['Magic Missile'],
            alwaysPrepared: false,
          },
        ],
        spellSlots: makeCharacterFixture().spells.spellSlots,
      },
    })

    const profiles = ensureSpellProfiles(character)
    expect(profiles.map((profile) => profile.id)).toEqual([
      'class:Wizard|PHB',
      'class:Cleric|PHB',
      SPECIAL_SPELL_PROFILE_ID,
    ])
    expect(profiles[0].cantrips).toEqual(['Mage Hand'])
    expect(profiles[2].alwaysPrepared).toBe(true)
    expect(profiles[2].label).toBe(SPECIAL_SPELL_PROFILE_LABEL)
  })

  test('ensureSpellProfiles adds subclass always-prepared and known spells', () => {
    const character = makeCharacterFixture({
      class: 'Fighter',
      classSource: 'PHB',
      subclass: 'Eldritch Knight',
      subclassSource: 'PHB',
      level: 3,
      classProgression: [
        {
          name: 'Fighter',
          source: 'PHB',
          levels: 3,
          subclass: 'Eldritch Knight',
          subclassSource: 'PHB',
        },
      ],
      spells: {
        spellProfiles: [],
        spellSlots: makeCharacterFixture().spells.spellSlots,
      },
    })

    const classesById = new Map([
      [
        'class:Fighter|PHB',
        makeClassFixture({
          name: 'Fighter',
          source: 'PHB',
          casterProgression: 'none',
          subclasses: [
            {
              name: 'Eldritch Knight',
              shortName: 'EK',
              source: 'PHB',
              className: 'Fighter',
              classSource: 'PHB',
              spellcastingAbility: 'int',
              casterProgression: '1/3',
              additionalSpells: [
                {
                  prepared: { '3': ['shield'] },
                  known: { '3': ['mage armor'] },
                },
              ],
            },
          ],
        }),
      ],
    ])

    const profiles = ensureSpellProfiles(character, classesById)
    const classProfile = profiles.find((profile) => profile.id === 'class:Fighter|PHB')
    const subclassProfile = profiles.find((profile) =>
      profile.id.includes('Eldritch Knight|PHB:prepared'),
    )

    expect(classProfile?.spellsKnown).toContain('mage armor')
    expect(subclassProfile?.alwaysPrepared).toBe(true)
    expect(subclassProfile?.spellsKnown).toContain('shield')
  })

  test('buildClassSpellLevelKey includes class source to avoid multiclass collisions', () => {
    expect(buildClassSpellLevelKey('Wizard', 'PHB', 3)).toBe('Wizard|PHB:3')
    expect(buildClassSpellLevelKey('Wizard', 'XPHB', 3)).toBe('Wizard|XPHB:3')
  })

  test('isSpellOnClassList matches exact class source when present', () => {
    const spell = {
      classes: {
        fromClassList: [
          { name: 'Wizard', source: 'PHB' },
          { name: 'Cleric', source: 'PHB' },
        ],
      },
    }

    expect(isSpellOnClassList(spell, 'Wizard', 'PHB')).toBe(true)
    expect(isSpellOnClassList(spell, 'Wizard', 'XPHB')).toBe(false)
    expect(isSpellOnClassList(spell, 'Druid', 'PHB')).toBe(false)
  })

  test('isSpellOnClassList does not treat missing class lists as universally available', () => {
    expect(isSpellOnClassList({}, 'Wizard', 'PHB')).toBe(false)
  })

  test('collectKnownSpells includes always-prepared unrestricted spells', () => {
    const character = makeCharacterFixture({
      class: 'Wizard',
      classSource: 'PHB',
      level: 2,
      classProgression: [{ name: 'Wizard', source: 'PHB', levels: 2 }],
      spells: {
        spellProfiles: [
          {
            id: 'class:Wizard|PHB',
            type: 'class',
            label: 'Wizard (Lv 2)',
            className: 'Wizard',
            classSource: 'PHB',
            cantrips: ['Mage Hand'],
            spellsKnown: ['Shield'],
            preparedSpells: ['Shield'],
            alwaysPrepared: false,
          },
          {
            id: SPECIAL_SPELL_PROFILE_ID,
            type: 'special',
            label: 'Special (Unrestricted)',
            cantrips: ['Guidance'],
            spellsKnown: ['Fireball'],
            preparedSpells: [],
            alwaysPrepared: true,
          },
        ],
        spellSlots: makeCharacterFixture().spells.spellSlots,
      },
    })

    const known = collectKnownSpells(ensureSpellProfiles(character))
    expect(known.cantrips).toEqual(expect.arrayContaining(['Mage Hand', 'Guidance']))
    expect(known.spellsKnown).toEqual(expect.arrayContaining(['Shield', 'Fireball']))
    expect(known.preparedSpells).toEqual(expect.arrayContaining(['Shield', 'Fireball', 'Guidance']))
  })

  test('calculateCharacterSpellSlots combines multiclass shared slots and keeps pact separate', () => {
    const character = makeCharacterFixture({
      class: 'Wizard',
      classSource: 'PHB',
      level: 5,
      classProgression: [
        { name: 'Wizard', source: 'PHB', levels: 3 },
        { name: 'Cleric', source: 'PHB', levels: 2 },
        { name: 'Warlock', source: 'PHB', levels: 2 },
      ],
      spells: {
        spellProfiles: [],
        spellSlots: {
          level1: { max: 0, used: 2 },
          level2: { max: 0, used: 1 },
          level3: { max: 0, used: 0 },
          level4: { max: 0, used: 0 },
          level5: { max: 0, used: 0 },
          level6: { max: 0, used: 0 },
          level7: { max: 0, used: 0 },
          level8: { max: 0, used: 0 },
          level9: { max: 0, used: 0 },
        },
      },
    })

    const classesById = new Map([
      [
        'class:Wizard|PHB',
        makeClassFixture({
          name: 'Wizard',
          source: 'PHB',
          casterProgression: 'full',
        }),
      ],
      [
        'class:Cleric|PHB',
        makeClassFixture({
          name: 'Cleric',
          source: 'PHB',
          casterProgression: 'full',
        }),
      ],
      [
        'class:Warlock|PHB',
        makeClassFixture({
          name: 'Warlock',
          source: 'PHB',
          casterProgression: 'pact',
          classTableGroups: [
            {
              colLabels: ['Spell Slots', 'Slot Level'],
              rows: [
                [1, 1],
                [2, 1],
              ],
            },
          ],
        }),
      ],
    ])

    const slots = calculateCharacterSpellSlots(character, classesById)
    expect(slots.shared[1]?.max).toBe(4)
    expect(slots.shared[2]?.max).toBe(3)
    expect(slots.pact[1]?.max).toBe(2)
  })

  test('calculateCharacterSpellSlots uses subclass caster progression for non-caster classes', () => {
    const character = makeCharacterFixture({
      class: 'Fighter',
      classSource: 'PHB',
      subclass: 'Eldritch Knight',
      subclassSource: 'PHB',
      level: 3,
      classProgression: [
        {
          name: 'Fighter',
          source: 'PHB',
          levels: 3,
          subclass: 'Eldritch Knight',
          subclassSource: 'PHB',
        },
      ],
      spells: {
        spellProfiles: [],
        spellSlots: makeCharacterFixture().spells.spellSlots,
      },
    })

    const classesById = new Map([
      [
        'class:Fighter|PHB',
        makeClassFixture({
          name: 'Fighter',
          source: 'PHB',
          casterProgression: 'none',
          subclasses: [
            {
              name: 'Eldritch Knight',
              shortName: 'EK',
              source: 'PHB',
              className: 'Fighter',
              classSource: 'PHB',
              spellcastingAbility: 'int',
              casterProgression: '1/3',
            },
          ],
        }),
      ],
    ])

    const slots = calculateCharacterSpellSlots(character, classesById)
    expect(slots.shared[1]?.max).toBe(2)
  })

  test('buildSpellcastingClassDetails computes save and attack values per class', () => {
    const character = makeCharacterFixture({
      class: 'Wizard',
      classSource: 'PHB',
      level: 5,
      classProgression: [{ name: 'Wizard', source: 'PHB', levels: 5 }],
      abilityScores: {
        strength: 10,
        dexterity: 10,
        constitution: 10,
        intelligence: 16,
        wisdom: 12,
        charisma: 10,
      },
      spells: {
        spellProfiles: [
          {
            id: 'class:Wizard|PHB',
            type: 'class',
            label: 'Wizard (Lv 5)',
            className: 'Wizard',
            classSource: 'PHB',
            cantrips: [],
            spellsKnown: [],
            preparedSpells: [],
            alwaysPrepared: false,
          },
          {
            id: SPECIAL_SPELL_PROFILE_ID,
            type: 'special',
            label: 'Special (Unrestricted)',
            cantrips: [],
            spellsKnown: [],
            preparedSpells: [],
            alwaysPrepared: true,
          },
        ],
        spellSlots: makeCharacterFixture().spells.spellSlots,
      },
    })

    const classesById = new Map([
      [
        'class:Wizard|PHB',
        makeClassFixture({
          name: 'Wizard',
          source: 'PHB',
          casterProgression: 'full',
          spellcastingAbility: 'int',
          spellsKnownProgression: [6, 8, 10, 12, 14],
        }),
      ],
    ])

    const details = buildSpellcastingClassDetails(character, classesById)
    expect(details).toHaveLength(1)
    expect(details[0].spellSaveDC).toBe(14)
    expect(details[0].spellAttackBonus).toBe(6)
    expect(details[0].isPreparedCaster).toBe(false)
  })

  test('inferClassSpellAttributionLevels assigns to lowest eligible level with capacity', () => {
    const wizard = makeClassFixture({
      name: 'Wizard',
      source: 'PHB',
      spellcastingAbility: 'int',
      cantripProgression: [3, 3, 3, 4, 4],
      spellsKnownProgressionFixed: [6, 2, 2, 2, 2],
      casterProgression: 'full',
    })

    const spellLevelByName = new Map<string, number>([
      ['Scorching Ray', 2],
      ['Misty Step', 2],
      ['Counterspell', 3],
    ])

    const assignments = inferClassSpellAttributionLevels({
      classData: wizard,
      classLevel: 5,
      newSpellNames: ['Scorching Ray', 'Misty Step', 'Counterspell'],
      spellLevelByName,
      existingAttributions: [
        { spellName: 'Magic Missile', grantedAtLevel: 1 },
        { spellName: 'Shield', grantedAtLevel: 1 },
        { spellName: 'Sleep', grantedAtLevel: 1 },
        { spellName: 'Find Familiar', grantedAtLevel: 1 },
        { spellName: 'Identify', grantedAtLevel: 1 },
        { spellName: 'Detect Magic', grantedAtLevel: 1 },
      ],
    })

    expect(assignments).toEqual([
      { spellName: 'Misty Step', grantedAtLevel: 3 },
      { spellName: 'Scorching Ray', grantedAtLevel: 3 },
      { spellName: 'Counterspell', grantedAtLevel: 5 },
    ])
  })

  test('inferClassSpellAttributionLevels uses cantrip capacity independently', () => {
    const wizard = makeClassFixture({
      name: 'Wizard',
      source: 'PHB',
      spellcastingAbility: 'int',
      cantripProgression: [3, 3, 3, 4],
      spellsKnownProgressionFixed: [6, 2, 2, 2],
      casterProgression: 'full',
    })

    const spellLevelByName = new Map<string, number>([
      ['Light', 0],
      ['Fire Bolt', 0],
      ['Mage Hand', 0],
      ['Prestidigitation', 0],
    ])

    const assignments = inferClassSpellAttributionLevels({
      classData: wizard,
      classLevel: 4,
      newSpellNames: ['Light'],
      spellLevelByName,
      existingAttributions: [
        { spellName: 'Fire Bolt', grantedAtLevel: 1 },
        { spellName: 'Mage Hand', grantedAtLevel: 1 },
        { spellName: 'Prestidigitation', grantedAtLevel: 1 },
      ],
    })

    expect(assignments).toEqual([{ spellName: 'Light', grantedAtLevel: 4 }])
  })

  test('buildClassSpellSelectionsByLevel reconstructs class-level picks from provenance attribution', () => {
    const baseProvenance = makeBaseProvenance()
    const character = makeCharacterFixture({
      class: 'Wizard',
      classSource: 'PHB',
      level: 5,
      classProgression: [{ name: 'Wizard', source: 'PHB', levels: 5 }],
      spells: {
        spellProfiles: [
          {
            id: 'class:Wizard|PHB',
            type: 'class',
            label: 'Wizard (Lv 5)',
            className: 'Wizard',
            classSource: 'PHB',
            cantrips: ['Fire Bolt'],
            spellsKnown: ['Magic Missile', 'Fireball'],
            preparedSpells: [],
            alwaysPrepared: false,
          },
          {
            id: SPECIAL_SPELL_PROFILE_ID,
            type: 'special',
            label: SPECIAL_SPELL_PROFILE_LABEL,
            cantrips: [],
            spellsKnown: [],
            preparedSpells: [],
            alwaysPrepared: true,
          },
        ],
        spellSlots: makeCharacterFixture().spells.spellSlots,
      },
      provenance: {
        ...baseProvenance,
        spells: {
          'fire bolt': [
            {
              sourceType: 'class',
              sourceName: 'Wizard',
              sourceRef: 'PHB',
              grantType: 'choice',
              label: 'Wizard',
              spellGrantedAtLevel: 1,
              spellAttributionMode: 'exact',
            },
          ],
          'magic missile': [
            {
              sourceType: 'class',
              sourceName: 'Wizard',
              sourceRef: 'PHB',
              grantType: 'choice',
              label: 'Wizard',
              spellGrantedAtLevel: 1,
              spellAttributionMode: 'exact',
            },
          ],
          fireball: [
            {
              sourceType: 'class',
              sourceName: 'Wizard',
              sourceRef: 'PHB',
              grantType: 'choice',
              label: 'Wizard',
              spellGrantedAtLevel: 5,
              spellAttributionMode: 'inferred-lowest-eligible',
            },
          ],
        },
      },
    })

    const byLevel = buildClassSpellSelectionsByLevel({
      character,
      className: 'Wizard',
      classSource: 'PHB',
    })

    expect(byLevel.get(1)).toEqual(['Fire Bolt', 'Magic Missile'])
    expect(byLevel.get(5)).toEqual(['Fireball'])
  })

  test('buildClassSpellSelectionsByLevel excludes swap-added spells from level selections', () => {
    const baseProvenance = makeBaseProvenance()
    // Scenario: at level 3 the user swapped Shield→Absorb Elements.
    // Absorb Elements has provenance at level 3 but should NOT count as a
    // level-3 selection — the swap is independent of new spell choices.
    const character = makeCharacterFixture({
      class: 'Wizard',
      classSource: 'PHB',
      level: 3,
      classProgression: [{ name: 'Wizard', source: 'PHB', levels: 3 }],
      spells: {
        spellProfiles: [
          {
            id: 'class:Wizard|PHB',
            type: 'class',
            label: 'Wizard (Lv 3)',
            className: 'Wizard',
            classSource: 'PHB',
            cantrips: ['Fire Bolt'],
            spellsKnown: ['Magic Missile', 'Absorb Elements'],
            preparedSpells: [],
            alwaysPrepared: false,
            spellSwaps: { 3: { removed: 'Shield', added: 'Absorb Elements' } },
          },
          {
            id: SPECIAL_SPELL_PROFILE_ID,
            type: 'special',
            label: SPECIAL_SPELL_PROFILE_LABEL,
            cantrips: [],
            spellsKnown: [],
            preparedSpells: [],
            alwaysPrepared: true,
          },
        ],
        spellSlots: makeCharacterFixture().spells.spellSlots,
      },
      provenance: {
        ...baseProvenance,
        spells: {
          'fire bolt': [
            {
              sourceType: 'class',
              sourceName: 'Wizard',
              sourceRef: 'PHB',
              grantType: 'choice',
              label: 'Wizard',
              spellGrantedAtLevel: 1,
              spellAttributionMode: 'exact',
            },
          ],
          'magic missile': [
            {
              sourceType: 'class',
              sourceName: 'Wizard',
              sourceRef: 'PHB',
              grantType: 'choice',
              label: 'Wizard',
              spellGrantedAtLevel: 1,
              spellAttributionMode: 'exact',
            },
          ],
          'absorb elements': [
            {
              sourceType: 'class',
              sourceName: 'Wizard',
              sourceRef: 'PHB',
              grantType: 'choice',
              label: 'Wizard',
              spellGrantedAtLevel: 3,
              spellAttributionMode: 'exact',
            },
          ],
        },
      },
    })

    const byLevel = buildClassSpellSelectionsByLevel({
      character,
      className: 'Wizard',
      classSource: 'PHB',
    })

    expect(byLevel.get(1)).toEqual(['Fire Bolt', 'Magic Missile'])
    // Level 3 should have NO selections — Absorb Elements entered via swap, not choice.
    expect(byLevel.has(3)).toBe(false)
  })

  test('buildClassSpellSelectionsByLevel keeps original level slot filled after swap when replacement inherits old level', () => {
    const baseProvenance = makeBaseProvenance()
    // Scenario: Shield (picked at level 1) is swapped out at level 3 for Absorb Elements.
    // The replacement should still occupy the original level-1 spell pick slot.
    const character = makeCharacterFixture({
      class: 'Wizard',
      classSource: 'PHB',
      level: 3,
      classProgression: [{ name: 'Wizard', source: 'PHB', levels: 3 }],
      spells: {
        spellProfiles: [
          {
            id: 'class:Wizard|PHB',
            type: 'class',
            label: 'Wizard (Lv 3)',
            className: 'Wizard',
            classSource: 'PHB',
            cantrips: ['Fire Bolt'],
            spellsKnown: ['Magic Missile', 'Absorb Elements'],
            preparedSpells: [],
            alwaysPrepared: false,
            spellSwaps: { 3: { removed: 'Shield', added: 'Absorb Elements' } },
          },
          {
            id: SPECIAL_SPELL_PROFILE_ID,
            type: 'special',
            label: SPECIAL_SPELL_PROFILE_LABEL,
            cantrips: [],
            spellsKnown: [],
            preparedSpells: [],
            alwaysPrepared: true,
          },
        ],
        spellSlots: makeCharacterFixture().spells.spellSlots,
      },
      provenance: {
        ...baseProvenance,
        spells: {
          'fire bolt': [
            {
              sourceType: 'class',
              sourceName: 'Wizard',
              sourceRef: 'PHB',
              grantType: 'choice',
              label: 'Wizard',
              spellGrantedAtLevel: 1,
              spellAttributionMode: 'exact',
            },
          ],
          'magic missile': [
            {
              sourceType: 'class',
              sourceName: 'Wizard',
              sourceRef: 'PHB',
              grantType: 'choice',
              label: 'Wizard',
              spellGrantedAtLevel: 1,
              spellAttributionMode: 'exact',
            },
          ],
          'absorb elements': [
            {
              sourceType: 'class',
              sourceName: 'Wizard',
              sourceRef: 'PHB',
              grantType: 'choice',
              label: 'Wizard',
              spellGrantedAtLevel: 1,
              spellAttributionMode: 'exact',
            },
          ],
        },
      },
    })

    const byLevel = buildClassSpellSelectionsByLevel({
      character,
      className: 'Wizard',
      classSource: 'PHB',
    })

    expect(byLevel.get(1)).toEqual(['Fire Bolt', 'Magic Missile', 'Absorb Elements'])
    expect(byLevel.has(3)).toBe(false)
  })

  test('spellSwaps survives schema validation and buildClassSpellSelectionsByLevel still excludes swap spells', () => {
    const baseProvenance = makeBaseProvenance()
    // Simulate the EXACT character state after the swap onConfirm handler:
    // - spellsKnown: Shield removed, Absorb Elements added
    // - spellSwaps: records the swap at level 3
    // - provenance: Shield provenance still lingers (stale closure overwrites
    //   the removal), Absorb Elements has provenance at level 3
    const rawCharacter = makeCharacterFixture({
      class: 'Wizard',
      classSource: 'PHB',
      level: 3,
      classProgression: [{ name: 'Wizard', source: 'PHB', levels: 3 }],
      spells: {
        spellProfiles: [
          {
            id: 'class:Wizard|PHB',
            type: 'class',
            label: 'Wizard (Lv 3)',
            className: 'Wizard',
            classSource: 'PHB',
            cantrips: ['Fire Bolt'],
            spellsKnown: ['Magic Missile', 'Absorb Elements'],
            preparedSpells: [],
            alwaysPrepared: false,
            spellSwaps: { 3: { removed: 'Shield', added: 'Absorb Elements' } },
          },
          {
            id: SPECIAL_SPELL_PROFILE_ID,
            type: 'special',
            label: SPECIAL_SPELL_PROFILE_LABEL,
            cantrips: [],
            spellsKnown: [],
            preparedSpells: [],
            alwaysPrepared: true,
          },
        ],
        spellSlots: makeCharacterFixture().spells.spellSlots,
      },
      provenance: {
        ...baseProvenance,
        spells: {
          'fire bolt': [
            {
              sourceType: 'class',
              sourceName: 'Wizard',
              sourceRef: 'PHB',
              grantType: 'choice',
              label: 'Wizard',
              spellGrantedAtLevel: 1,
              spellAttributionMode: 'exact',
            },
          ],
          'magic missile': [
            {
              sourceType: 'class',
              sourceName: 'Wizard',
              sourceRef: 'PHB',
              grantType: 'choice',
              label: 'Wizard',
              spellGrantedAtLevel: 1,
              spellAttributionMode: 'exact',
            },
          ],
          // Shield provenance lingers due to stale closure overwrite
          shield: [
            {
              sourceType: 'class',
              sourceName: 'Wizard',
              sourceRef: 'PHB',
              grantType: 'choice',
              label: 'Wizard',
              spellGrantedAtLevel: 1,
              spellAttributionMode: 'exact',
            },
          ],
          'absorb elements': [
            {
              sourceType: 'class',
              sourceName: 'Wizard',
              sourceRef: 'PHB',
              grantType: 'choice',
              label: 'Wizard',
              spellGrantedAtLevel: 3,
              spellAttributionMode: 'exact',
            },
          ],
        },
      },
    })

    // Step 1: Schema must preserve spellSwaps
    const parsed = characterPersistenceSchema.safeParse(rawCharacter)
    expect(parsed.success).toBe(true)
    const character = parsed.data!
    const classProfile = character.spells.spellProfiles.find((p) => p.id === 'class:Wizard|PHB')
    expect(classProfile?.spellSwaps).toBeDefined()
    expect(classProfile?.spellSwaps).toEqual({
      3: { removed: 'Shield', added: 'Absorb Elements' },
    })

    // Step 2: ensureSpellProfiles must preserve spellSwaps
    const profiles = ensureSpellProfiles(character)
    const ensuredProfile = profiles.find((p) => p.id === 'class:Wizard|PHB')
    expect(ensuredProfile?.spellSwaps).toBeDefined()
    expect(ensuredProfile?.spellSwaps).toEqual({
      3: { removed: 'Shield', added: 'Absorb Elements' },
    })

    // Step 3: buildClassSpellSelectionsByLevel must exclude swap at level 3
    const byLevel = buildClassSpellSelectionsByLevel({
      character,
      className: 'Wizard',
      classSource: 'PHB',
    })
    expect(byLevel.get(1)).toEqual(['Fire Bolt', 'Magic Missile'])
    expect(byLevel.has(3)).toBe(false)
  })

  test('buildClassSpellSelectionsByLevel excludes class-profile spells without provenance level attribution', () => {
    const baseProvenance = makeBaseProvenance()
    const character = makeCharacterFixture({
      class: 'Wizard',
      classSource: 'PHB',
      level: 3,
      classProgression: [{ name: 'Wizard', source: 'PHB', levels: 3 }],
      spells: {
        spellProfiles: [
          {
            id: 'class:Wizard|PHB',
            type: 'class',
            label: 'Wizard (Lv 3)',
            className: 'Wizard',
            classSource: 'PHB',
            cantrips: ['Mage Hand'],
            spellsKnown: ['Shield'],
            preparedSpells: [],
            alwaysPrepared: false,
          },
          {
            id: SPECIAL_SPELL_PROFILE_ID,
            type: 'special',
            label: SPECIAL_SPELL_PROFILE_LABEL,
            cantrips: [],
            spellsKnown: [],
            preparedSpells: [],
            alwaysPrepared: true,
          },
        ],
        spellSlots: makeCharacterFixture().spells.spellSlots,
      },
      provenance: {
        ...baseProvenance,
        spells: {
          'mage hand': [
            {
              sourceType: 'class',
              sourceName: 'Wizard',
              sourceRef: 'PHB',
              grantType: 'choice',
              label: 'Wizard',
            },
          ],
          shield: [
            {
              sourceType: 'class',
              sourceName: 'Wizard',
              sourceRef: 'PHB',
              grantType: 'choice',
              label: 'Wizard',
            },
          ],
        },
      },
    })

    const byLevel = buildClassSpellSelectionsByLevel({
      character,
      className: 'Wizard',
      classSource: 'PHB',
    })

    expect(Array.from(byLevel.entries())).toEqual([])
  })

  test('evaluatePreparedSpellsFormula evaluates wizard formula with level + INT modifier', () => {
    const result = evaluatePreparedSpellsFormula('<$level$> + <$int_mod$>', 5, {
      strength: 0,
      dexterity: 0,
      constitution: 0,
      intelligence: 1,
      wisdom: 0,
      charisma: 0,
    })

    expect(result).toBe(6)
  })

  test('evaluatePreparedSpellsFormula handles negative modifiers', () => {
    const result = evaluatePreparedSpellsFormula('<$level$> + <$int_mod$>', 3, {
      strength: -1,
      dexterity: -1,
      constitution: -1,
      intelligence: -2,
      wisdom: -1,
      charisma: -1,
    })

    expect(result).toBe(1)
  })

  test('evaluatePreparedSpellsFormula returns null for invalid formula', () => {
    const result = evaluatePreparedSpellsFormula('invalid formula', 5, {
      strength: 0,
      dexterity: 0,
      constitution: 0,
      intelligence: 1,
      wisdom: 0,
      charisma: 0,
    })

    expect(result).toBeNull()
  })

  test('getPreparedSpellLimit calculates wizard prepared spells from formula', () => {
    const wizard = makeClassFixture({
      name: 'Wizard',
      source: 'PHB',
      casterProgression: 'full',
      spellcastingAbility: 'int',
      preparedSpells: '<$level$> + <$int_mod$>',
    })

    const result = getPreparedSpellLimit(wizard, 5, 1)

    expect(result).toBe(6)
  })

  test('getPreparedSpellLimit returns null when class has no spellcasting', () => {
    const fighter = makeClassFixture({
      name: 'Fighter',
      source: 'PHB',
    })

    const result = getPreparedSpellLimit(fighter, 5, 1)

    expect(result).toBeNull()
  })

  test('buildSpellcastingClassDetails uses prepared spell formula for prepared casters', () => {
    const character = makeCharacterFixture({
      class: 'Wizard',
      classSource: 'PHB',
      level: 5,
      classProgression: [{ name: 'Wizard', source: 'PHB', levels: 5 }],
      abilityScores: {
        strength: 8,
        dexterity: 14,
        constitution: 12,
        intelligence: 18,
        wisdom: 13,
        charisma: 10,
      },
      spells: {
        spellProfiles: [
          {
            id: 'class:Wizard|PHB',
            type: 'class',
            label: 'Wizard (Lv 5)',
            className: 'Wizard',
            classSource: 'PHB',
            cantrips: [],
            spellsKnown: [],
            preparedSpells: [],
            alwaysPrepared: false,
          },
          {
            id: SPECIAL_SPELL_PROFILE_ID,
            type: 'special',
            label: 'Special (Unrestricted)',
            cantrips: [],
            spellsKnown: [],
            preparedSpells: [],
            alwaysPrepared: true,
          },
        ],
        spellSlots: makeCharacterFixture().spells.spellSlots,
      },
    })

    const classesById = new Map([
      [
        'class:Wizard|PHB',
        makeClassFixture({
          name: 'Wizard',
          source: 'PHB',
          casterProgression: 'full',
          spellcastingAbility: 'int',
          preparedSpells: '<$level$> + <$int_mod$>',
          spellsKnownProgression: [6, 8, 10, 12, 14],
        }),
      ],
    ])

    const details = buildSpellcastingClassDetails(character, classesById)
    expect(details).toHaveLength(1)
    expect(details[0].isPreparedCaster).toBe(true)
    expect(details[0].knownSpellLimit).toBe(9)
  })
})
