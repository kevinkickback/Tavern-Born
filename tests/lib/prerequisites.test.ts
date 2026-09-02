import { describe, expect, test } from 'vitest'
import {
  buildPrerequisiteSnapshot,
  checkAllPrerequisites,
  checkPrerequisite,
  prereqPactToFull,
  prereqSpellToFull,
} from '@/lib/calculations/prerequisites'
import {
  makeCharacterFixture,
  makePrereqCharacterSnapshotFixture,
} from '../fixtures/characterFixtures'

describe('prerequisites', () => {
  test('builds a progression-aware snapshot from canonical spell profiles', () => {
    const character = makeCharacterFixture({
      class: 'Wizard',
      classProgression: [
        { name: 'Wizard', source: 'PHB', levels: 3 },
        { name: 'Fighter', source: 'PHB', levels: 2 },
      ],
      spells: {
        spellProfiles: [
          {
            id: 'class:Wizard|PHB',
            type: 'class',
            label: 'Wizard',
            className: 'Wizard',
            classSource: 'PHB',
            cantrips: ['Fire Bolt'],
            spellsKnown: ['Shield'],
            preparedSpells: ['Magic Missile'],
          },
        ],
        spellSlots: {},
      },
    })

    const snapshot = buildPrerequisiteSnapshot({ character, viewingClass: 'Fighter' })

    expect(snapshot.level).toBe(5)
    expect(snapshot.class).toBe('Fighter')
    expect(snapshot.progression?.classes).toEqual(character.classProgression)
    expect(snapshot.spells).toEqual({
      cantrips: ['Fire Bolt'],
      spellsKnown: ['Shield'],
      preparedSpells: [],
    })
  })

  test('checks class-specific level when className option is provided', () => {
    const character = makePrereqCharacterSnapshotFixture({
      level: 8,
      progression: {
        classes: [
          { name: 'Fighter', levels: 5 },
          { name: 'Wizard', levels: 3 },
        ],
      },
    })

    expect(checkPrerequisite({ level: 3 }, character, { className: 'Wizard' })).toEqual({
      met: true,
    })

    expect(checkPrerequisite({ level: 4 }, character, { className: 'Wizard' })).toEqual({
      met: false,
      reason: 'Requires Wizard level 4',
    })
  })

  test('checks ability score requirements from object entries', () => {
    const character = makePrereqCharacterSnapshotFixture({
      abilityScores: {
        strength: 12,
        dexterity: 14,
      },
    })

    expect(
      checkPrerequisite(
        {
          ability: [{ ability: 'dexterity', score: 13 }],
        },
        character,
      ),
    ).toEqual({ met: true })

    expect(
      checkPrerequisite(
        {
          ability: [{ ability: 'strength', score: 13 }],
        },
        character,
      ),
    ).toEqual({
      met: false,
      reason: 'Does not meet ability score requirement',
    })
  })

  test('can ignore race prerequisite checks', () => {
    const character = makePrereqCharacterSnapshotFixture({ race: 'Human' })

    expect(
      checkPrerequisite(
        {
          race: ['Elf'],
        },
        character,
      ).met,
    ).toBe(false)

    expect(
      checkPrerequisite(
        {
          race: ['Elf'],
        },
        character,
        { ignoreRacePrereq: true },
      ),
    ).toEqual({ met: true })
  })

  test('checks class prerequisite from primary class', () => {
    const character = makePrereqCharacterSnapshotFixture({
      progression: {
        classes: [
          { name: 'Cleric', levels: 1 },
          { name: 'Rogue', levels: 2 },
        ],
      },
    })

    expect(
      checkPrerequisite(
        {
          class: ['Cleric'],
        },
        character,
      ),
    ).toEqual({ met: true })

    expect(
      checkPrerequisite(
        {
          class: ['Wizard'],
        },
        character,
      ),
    ).toEqual({ met: false, reason: 'Class requirement not met' })
  })

  test('checks spellcasting with spellcasting class set', () => {
    const character = makePrereqCharacterSnapshotFixture({
      progression: {
        classes: [
          { name: 'Fighter', levels: 1 },
          { name: 'Wizard', levels: 1 },
        ],
      },
      class: 'Fighter',
    })

    expect(
      checkPrerequisite({ spellcasting: true }, character, {
        spellcastingClasses: new Set(['Wizard', 'Cleric']),
      }),
    ).toEqual({ met: true })
  })

  test('checks required spell references with source and anchor decorations', () => {
    const character = makePrereqCharacterSnapshotFixture({
      spells: {
        cantrips: ['ray of frost'],
        spellsKnown: ['misty step', 'hex'],
        preparedSpells: ['detect magic'],
      },
    })

    expect(
      checkPrerequisite(
        {
          spell: ['Misty Step|PHB', 'Hex#x|PHB'],
        },
        character,
      ),
    ).toEqual({ met: true })

    expect(
      checkPrerequisite(
        {
          spell: 'Ray of Frost#c|PHB',
        },
        character,
      ),
    ).toEqual({ met: true })

    expect(
      checkPrerequisite(
        {
          spell: 'Fireball#c|PHB',
        },
        character,
      ),
    ).toEqual({ met: false, reason: 'Requires spell: Fireball cantrip' })
  })

  test('checks pact and patron requirements against features', () => {
    const character = makePrereqCharacterSnapshotFixture({
      features: [{ name: 'Pact of the Chain' }, { name: 'The Fiend Patron' }],
    })

    expect(checkPrerequisite({ pact: 'Pact of the Chain' }, character)).toEqual({
      met: true,
    })

    expect(checkPrerequisite({ patron: 'Fiend' }, character)).toEqual({
      met: true,
    })
  })

  test('normalizes short pact names to full pact names', () => {
    const character = makePrereqCharacterSnapshotFixture({
      features: [{ name: 'Pact of the Chain' }],
    })

    expect(checkPrerequisite({ pact: 'Chain' }, character)).toEqual({
      met: true,
    })
  })

  test('reports canonical #x spell prerequisite text when unmet', () => {
    const character = makePrereqCharacterSnapshotFixture({
      spells: {
        cantrips: ['ray of frost'],
        spellsKnown: ['misty step'],
      },
      features: [{ name: 'Arcane Recovery' }],
    })

    expect(
      checkPrerequisite(
        {
          spell: 'Hex#x|PHB',
        },
        character,
      ),
    ).toEqual({
      met: false,
      reason: 'Requires spell: Hex spell or a warlock feature that curses',
    })
  })

  test('exports canonical prerequisite text helpers', () => {
    expect(prereqPactToFull('Chain')).toBe('Pact of the Chain')
    expect(prereqPactToFull('Blade')).toBe('Pact of the Blade')
    expect(prereqPactToFull('Custom Pact')).toBe('Custom Pact')

    expect(prereqSpellToFull('Fireball|PHB')).toBe('Fireball')
    expect(prereqSpellToFull('Ray of Frost#c|PHB')).toBe('Ray of Frost cantrip')
    expect(prereqSpellToFull('Hex#x|PHB')).toBe('Hex spell or a warlock feature that curses')
  })

  test('checkAllPrerequisites aggregates all failing reasons', () => {
    const character = makePrereqCharacterSnapshotFixture({
      level: 2,
      race: 'Human',
      abilityScores: { strength: 10 },
    })

    const result = checkAllPrerequisites(
      {
        prerequisite: [{ level: 3 }, { race: ['Elf'] }, { ability: ['strength'] }],
      },
      character,
    )

    expect(result.met).toBe(false)
    expect(result.failures).toEqual([
      'Requires character level 3',
      'Race requirement not met',
      'Does not meet ability score requirement',
    ])
  })
})
