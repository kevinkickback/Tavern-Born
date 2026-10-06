import { describe, expect, test } from 'vitest'
import {
  buildPrerequisiteSnapshot,
  checkAllPrerequisites,
  checkPrerequisite,
  prereqPactToFull,
  prereqSpellToFull,
} from '@/lib/calculations/prerequisites'
import type { Raw5ePrereq } from '@/types/5etools'
import {
  makeCharacterFixture,
  makePrereqCharacterSnapshotFixture,
} from '../fixtures/characterFixtures'
import {
  actorPrerequisite,
  athletePrerequisite,
  defensiveDuelistPrerequisite,
} from '../fixtures/prerequisiteFixtures'

describe('prerequisites', () => {
  test('builds a progression-aware snapshot from canonical spell profiles', () => {
    const character = makeCharacterFixture({
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

    const snapshot = buildPrerequisiteSnapshot({
      character,
      effectiveAbilityScores: character.abilityScores,
    })

    expect(snapshot.progression).toEqual(character.classProgression)
    expect(snapshot.spells).toEqual({
      cantrips: ['Fire Bolt'],
      spellsKnown: ['Shield'],
      preparedSpells: [],
    })
  })

  test('checks class-specific level when className option is provided', () => {
    const character = makePrereqCharacterSnapshotFixture({
      progression: [
        { name: 'Fighter', source: 'PHB', levels: 5 },
        { name: 'Wizard', source: 'PHB', levels: 3 },
      ],
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
          ability: [{ dex: 13 }],
        },
        character,
      ),
    ).toEqual({ met: true })

    expect(
      checkPrerequisite(
        {
          ability: [{ str: 13 }],
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

  test('checks class prerequisites across the full progression', () => {
    const character = makePrereqCharacterSnapshotFixture({
      progression: [
        { name: 'Cleric', source: 'PHB', levels: 1 },
        { name: 'Rogue', source: 'PHB', levels: 2 },
      ],
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
      progression: [
        { name: 'Fighter', source: 'PHB', levels: 1 },
        { name: 'Wizard', source: 'PHB', levels: 1 },
      ],
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
      progression: [{ name: 'Fighter', source: 'PHB', levels: 2 }],
      race: 'Human',
      abilityScores: { strength: 10 },
    })

    const result = checkAllPrerequisites(
      {
        prerequisite: [{ level: 3 }, { race: ['Elf'] }, { ability: [{ str: 13 }] }],
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

  test('accepts the real Defensive Duelist raw ability map', () => {
    const result = checkAllPrerequisites(
      defensiveDuelistPrerequisite,
      makePrereqCharacterSnapshotFixture({ abilityScores: { dexterity: 20 } }),
    )
    expect(result.met).toBe(true)
    expect(result.failures).toEqual([])
  })

  test('accepts either real Athlete alternative while retaining the shared level requirement', () => {
    const character = makePrereqCharacterSnapshotFixture({
      progression: [{ name: 'Fighter', source: 'XPHB', levels: 4 }],
      abilityScores: { strength: 8, dexterity: 13 },
    })
    expect(checkAllPrerequisites(athletePrerequisite, character).met).toBe(true)
    expect(
      checkAllPrerequisites(athletePrerequisite, {
        ...character,
        progression: [{ name: 'Fighter', source: 'XPHB', levels: 3 }],
      }).met,
    ).toBe(false)
  })

  test('requires every ability in one map and accepts another complete alternative', () => {
    const character = makePrereqCharacterSnapshotFixture({
      abilityScores: { strength: 13, dexterity: 8, wisdom: 14 },
    })
    expect(checkPrerequisite({ ability: [{ str: 13, dex: 13 }] }, character).met).toBe(false)
    expect(checkPrerequisite({ ability: [{ str: 13, dex: 13 }, { wis: 14 }] }, character).met).toBe(
      true,
    )
  })

  test('does not turn an unsupported requirement into a met prerequisite', () => {
    expect(
      checkAllPrerequisites(
        { prerequisite: [{ feat: ['Missing Feat|PHB'] }] },
        makePrereqCharacterSnapshotFixture(),
      ),
    ).toMatchObject({ met: false, status: 'unsupported' })
  })

  test('reports malformed ability maps for review instead of guessing a score', () => {
    for (const ability of [
      [],
      ['strength'],
      [{ str: '13' }],
      [{ str: Number.NaN }],
      [{ unknown: 13 }],
      [{ constructor: 13 }],
      [{ str: 13.5 }],
    ]) {
      expect(
        checkAllPrerequisites(
          { prerequisite: [{ ability }] } as unknown as { prerequisite: Raw5ePrereq[] },
          makePrereqCharacterSnapshotFixture(),
        ),
      ).toMatchObject({ met: false, status: 'unsupported' })
    }
  })

  test('a known satisfied alternative is sufficient even when another is unsupported', () => {
    expect(
      checkAllPrerequisites(
        { prerequisite: [{ campaign: ['Unknown'] }, { race: ['Human'] }] },
        makePrereqCharacterSnapshotFixture({ race: 'Human' }),
      ),
    ).toMatchObject({ met: true, status: 'met', failures: [] })
  })

  test('requires class-qualified levels rather than total multiclass level', () => {
    const character = makePrereqCharacterSnapshotFixture({
      progression: [
        { name: 'Fighter', source: 'PHB', levels: 8 },
        { name: 'Wizard', source: 'PHB', levels: 2 },
      ],
    })
    expect(
      checkPrerequisite(
        { level: { level: 3, class: { name: 'Wizard', source: 'PHB' } } },
        character,
      ).met,
    ).toBe(false)
    expect(
      checkPrerequisite(
        { level: { level: 2, class: { name: 'Wizard', source: 'PHB' } } },
        character,
      ).met,
    ).toBe(true)
    expect(checkPrerequisite({ class: [{ name: 'Wizard', source: 'PHB' }] }, character).met).toBe(
      true,
    )
    expect(checkPrerequisite({ class: [{ name: 'Wizard', source: 'XPHB' }] }, character).met).toBe(
      false,
    )
  })

  test('checks real Actor level and ability requirements together', () => {
    const character = makePrereqCharacterSnapshotFixture({
      progression: [{ name: 'Fighter', source: 'XPHB', levels: 4 }],
      abilityScores: { charisma: 13 },
    })
    expect(checkAllPrerequisites(actorPrerequisite, character).met).toBe(true)
    expect(
      checkAllPrerequisites(actorPrerequisite, { ...character, abilityScores: { charisma: 12 } })
        .met,
    ).toBe(false)
  })

  test('preserves three-valued AND/OR semantics for unsupported conditions', () => {
    const character = makePrereqCharacterSnapshotFixture({ abilityScores: { dexterity: 10 } })
    expect(
      checkAllPrerequisites(
        { prerequisite: [{ feat: ['Unknown|PHB'], ability: [{ dex: 13 }] }] },
        character,
      ),
    ).toMatchObject({ met: false, status: 'unmet' })
    expect(
      checkAllPrerequisites(
        { prerequisite: [{ feat: ['Unknown|PHB'] }, { ability: [{ dex: 13 }] }] },
        character,
      ),
    ).toMatchObject({ met: false, status: 'unsupported' })
    expect(checkAllPrerequisites({ prerequisite: [] }, character)).toEqual({
      met: true,
      status: 'met',
      failures: [],
    })
    expect(checkAllPrerequisites({}, character)).toEqual({ met: true, status: 'met', failures: [] })
  })

  test.each([
    null,
    {},
    [null],
    [{}],
    [{ note: 'Requires manual approval' }],
    [{ level: 0 }],
    [{ level: { level: 3, class: { name: '' } } }],
    [{ level: { level: 3, other: true } }],
    [{ spell: [] }],
    [{ spell: '' }],
    [{ spell: ['eldritch blast#unknown'] }],
    [{ pact: '' }],
    [{ patron: '' }],
    [{ spellcasting: false }],
  ])('requires review for malformed or unsupported prerequisite data: %j', (prerequisite) => {
    expect(
      checkAllPrerequisites(
        { prerequisite } as unknown as { prerequisite: Raw5ePrereq[] },
        makePrereqCharacterSnapshotFixture(),
      ),
    ).toMatchObject({ met: false, status: 'unsupported' })
  })

  test('does not ignore nested race restrictions or missing effective ability scores', () => {
    const character = makePrereqCharacterSnapshotFixture({
      race: 'Elf',
      abilityScores: { dexterity: Number.NaN },
    })
    expect(
      checkPrerequisite({ race: [{ name: 'Elf', subrace: 'high' }] }, character),
    ).toMatchObject({ met: false, status: 'unsupported' })
    expect(checkPrerequisite({ ability: [{ dex: 13 }] }, character)).toMatchObject({
      met: false,
      status: 'unsupported',
    })
    expect(checkPrerequisite({ ability: [{ str: 13 }] }, character)).toMatchObject({
      met: false,
      status: 'unsupported',
    })
    expect(
      checkPrerequisite({ race: [{ name: 'Elf', subrace: 'high' }, 'Elf'] }, character),
    ).toEqual({ met: true })
  })

  test('checks subclass-qualified levels and printing against the owning class', () => {
    const character = makePrereqCharacterSnapshotFixture({
      progression: [
        { name: 'Wizard', source: 'PHB', levels: 8 },
        {
          name: 'Fighter',
          source: 'PHB',
          levels: 6,
          subclass: 'Rune Knight',
          subclassSource: 'TCE',
        },
      ],
    })
    const prerequisite: Raw5ePrereq = {
      level: {
        level: 7,
        class: { name: 'Fighter' },
        subclass: { name: 'Rune Knight', source: 'TCE' },
      },
    }
    expect(checkPrerequisite(prerequisite, character).met).toBe(false)
    expect(
      checkPrerequisite(prerequisite, {
        ...character,
        progression: [{ ...character.progression[1], levels: 7 }],
      }).met,
    ).toBe(true)
    expect(
      checkPrerequisite(prerequisite, {
        ...character,
        progression: [{ ...character.progression[1], levels: 7, subclassSource: 'OTHER' }],
      }).met,
    ).toBe(false)
  })

  test('accepts any listed spell and decodes source-qualified saved selections', () => {
    const character = makePrereqCharacterSnapshotFixture({
      spells: { cantrips: ['Eldritch Blast|PHB'], spellsKnown: ['Hex|PHB'] },
    })
    expect(checkPrerequisite({ spell: ['Misty Step|PHB', 'Hex|PHB'] }, character)).toEqual({
      met: true,
    })
    expect(checkPrerequisite({ spell: ['eldritch blast|PHB#c'] }, character)).toEqual({ met: true })
    expect(checkPrerequisite({ spell: ['eldritch blast#c'] }, character)).toEqual({ met: true })
    expect(
      checkPrerequisite({ spell: [{ choose: 'level=0', entry: 'a cantrip' }] }, character),
    ).toMatchObject({ met: false, status: 'unsupported' })
    expect(
      checkPrerequisite(
        { spell: [{ choose: 'level=0', entry: 'a cantrip' }, 'Hex|PHB'] },
        character,
      ),
    ).toEqual({ met: true })
    expect(checkPrerequisite({ spell: ['Hex|PHB#c'] }, character).met).toBe(false)
  })

  test('uses the authoritative subclass short name without guessing another printing', () => {
    const character = makeCharacterFixture({
      classProgression: [
        {
          name: 'Monk',
          source: 'PHB',
          levels: 17,
          subclass: 'Way of the Four Elements',
          subclassSource: 'PHB',
        },
      ],
    })
    const prerequisite: Raw5ePrereq = {
      level: { level: 17, class: { name: 'Monk' }, subclass: { name: 'Four Elements' } },
    }
    const classLookup = {
      'Monk|PHB': {
        name: 'Monk',
        source: 'PHB',
        subclasses: [
          {
            name: 'Way of the Four Elements',
            shortName: 'Four Elements',
            className: 'Monk',
            classSource: 'PHB',
            source: 'PHB',
          },
        ],
      },
    }
    const snapshot = buildPrerequisiteSnapshot({ character, classLookup })
    expect(checkPrerequisite(prerequisite, snapshot)).toEqual({ met: true })
    expect(checkPrerequisite(prerequisite, buildPrerequisiteSnapshot({ character }))).toMatchObject(
      { met: false, status: 'unsupported' },
    )
    expect(
      checkPrerequisite(
        prerequisite,
        buildPrerequisiteSnapshot({
          character,
          classLookup: { 'Monk|XPHB': { ...classLookup['Monk|PHB'], source: 'XPHB' } },
        }),
      ),
    ).toMatchObject({ met: false, status: 'unsupported' })
    expect(
      checkPrerequisite(prerequisite, {
        ...snapshot,
        progression: [
          { ...snapshot.progression[0], subclass: 'Way of Shadow', subclassShortName: 'Shadow' },
        ],
      }).met,
    ).toBe(false)
  })

  test('does not combine separate class identities to satisfy one class level requirement', () => {
    const character = makePrereqCharacterSnapshotFixture({
      progression: [
        { name: 'Wizard', source: 'PHB', levels: 2 },
        { name: 'Wizard', source: 'OTHER', levels: 2 },
      ],
    })
    expect(
      checkPrerequisite({ level: { level: 3, class: { name: 'Wizard' } } }, character).met,
    ).toBe(false)
  })

  test('checks numeric levels against the contextual class printing', () => {
    const character = makePrereqCharacterSnapshotFixture({
      progression: [
        { name: 'Wizard', source: 'PHB', levels: 5 },
        { name: 'Wizard', source: 'XPHB', levels: 2 },
      ],
    })
    expect(
      checkPrerequisite({ level: 3 }, character, { className: 'Wizard', classSource: 'XPHB' }).met,
    ).toBe(false)
    expect(
      checkPrerequisite({ level: 2 }, character, { className: 'Wizard', classSource: 'XPHB' }).met,
    ).toBe(true)
    expect(
      checkPrerequisite({ level: 3 }, character, { className: 'Wizard', classSource: 'PHB' }).met,
    ).toBe(true)
    expect(
      checkPrerequisite({ level: { level: 3, class: { name: 'Wizard' } } }, character, {
        className: 'Wizard',
        classSource: 'XPHB',
      }).met,
    ).toBe(false)
    expect(
      checkPrerequisite(
        { level: { level: 3, class: { name: 'Wizard', source: 'PHB' } } },
        character,
        { className: 'Fighter', classSource: 'XPHB' },
      ).met,
    ).toBe(true)
  })

  test('requires review when a saved subclass lacks the source needed by a qualified condition', () => {
    const character = makePrereqCharacterSnapshotFixture({
      progression: [{ name: 'Fighter', source: 'PHB', levels: 7, subclass: 'Rune Knight' }],
    })
    expect(
      checkPrerequisite(
        {
          level: {
            level: 7,
            class: { name: 'Fighter' },
            subclass: { name: 'Rune Knight', source: 'TCE' },
          },
        },
        character,
      ),
    ).toMatchObject({ met: false, status: 'unsupported' })
  })
})
