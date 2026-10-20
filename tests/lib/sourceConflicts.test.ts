import { describe, expect, test } from 'vitest'
import { buildInitialCharacter } from '@/lib/character/commands/originSelectionCommand'
import { setRacialSpellChoice } from '@/lib/character/commands/spellCommands'
import {
  countRemovedSpells,
  detectSourceConflicts,
  pruneSpellsForDisabledSources,
} from '@/lib/sourceConflicts'
import type { Race5e } from '@/types/5etools'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { selectBonusSpellFixture } from '../fixtures/bonusSpellSelection'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import {
  authorManagedClassSpellFixture,
  makeManagedClassSpellFixtures,
} from '../fixtures/managedClassSpellFixtures'
import { nativeChoiceSpellLookup, nativeRaceResolution } from '../fixtures/nativeRacialCharacter'
import { makeRacialSourceCharacter } from '../fixtures/racialSourceCharacter'

// ── helpers ─────────────────────────────────────────────────────────────────

function makeBonusCharacter(cantrips: string[], known: string[], additional: string[] = []) {
  let character = makeCharacterFixture()
  for (const [kind, references] of [
    ['cantrip', cantrips],
    ['spell', [...known, ...additional]],
  ] as const) {
    for (const reference of references) {
      const result = selectBonusSpellFixture(character, reference, kind)
      character = { ...character, ...result.characterPatch, provenance: result.provenanceUpdate }
    }
  }
  return characterPersistenceSchema.parse(character)
}

// ── detectSourceConflicts ────────────────────────────────────────────────────

describe('detectSourceConflicts', () => {
  test('returns empty array when no conflicts', () => {
    const char = makeCharacterFixture({ raceSource: 'PHB' })
    expect(detectSourceConflicts(char, ['PHB'])).toEqual([])
  })

  test('matches source identifiers without regard to casing', () => {
    const char = makeCharacterFixture({ race: 'Moon Elf', raceSource: 'FRHoF' })
    expect(detectSourceConflicts(char, ['PHB', 'FRHOF'])).toEqual([])
  })

  test('flags race from disabled source', () => {
    const char = makeCharacterFixture({ race: 'Aasimar', raceSource: 'VGM' })
    const conflicts = detectSourceConflicts(char, ['PHB'])
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]).toMatchObject({ source: 'VGM', items: ['Aasimar'] })
  })

  test('flags subrace from disabled source', () => {
    const char = makeCharacterFixture({
      race: 'Gnome',
      raceSource: 'PHB',
      subrace: 'Deep Gnome',
      subraceSource: 'SCAG',
    })
    const conflicts = detectSourceConflicts(char, ['PHB'])
    expect(conflicts[0]).toMatchObject({ source: 'SCAG', items: ['Gnome (Deep Gnome)'] })
  })

  test('flags class from disabled source using classProgression', () => {
    const char = makeCharacterFixture({
      classProgression: [{ name: 'Blood Hunter', levels: 3, source: 'HB' }],
    })
    const conflicts = detectSourceConflicts(char, ['PHB'])
    expect(conflicts[0]).toMatchObject({ source: 'HB', items: ['Blood Hunter'] })
  })

  test('flags background from disabled source', () => {
    const char = makeCharacterFixture({ background: 'Haunted One', backgroundSource: 'CoS' })
    const conflicts = detectSourceConflicts(char, ['PHB'])
    expect(conflicts[0]).toMatchObject({ source: 'CoS', items: ['Haunted One'] })
  })

  test('groups multiple items under the same source', () => {
    const char = makeCharacterFixture({
      race: 'Firbolg',
      raceSource: 'VGM',
      feats: [{ id: 'f1', name: 'Squat Nimbleness', source: 'XGE', description: '' }],
    })
    const char2 = {
      ...char,
      feats: [...char.feats, { id: 'f2', name: 'Wood Elf Magic', source: 'XGE', description: '' }],
    }
    const vgmConflict = detectSourceConflicts(char2, ['PHB'])
    const xgeConflict = vgmConflict.find((c) => c.source === 'XGE')
    expect(xgeConflict?.items).toEqual(['Squat Nimbleness', 'Wood Elf Magic'])
  })

  test('includes class-owned feat and feature-option selections', () => {
    const char = makeCharacterFixture({
      classFeatChoices: [
        {
          id: 'fighter-feat',
          className: 'Fighter',
          classSource: 'PHB',
          progressionName: 'Ability Score Improvement',
          categories: [],
          feats: [{ id: 'f1', name: 'Skill Expert', source: 'TCE', description: '' }],
        },
      ],
      classChoiceSelections: [
        {
          choiceId: 'artificer-plan',
          label: 'Replicate Magic Item',
          kind: 'item',
          className: 'Artificer',
          classSource: 'EFA',
          classLevel: 2,
          selected: [{ entityType: 'item', name: 'Manifold Tool', source: 'EFA', slotLevel: 2 }],
        },
        {
          choiceId: 'dormant-plan',
          label: 'Dormant Choice',
          kind: 'item',
          inactive: true,
          className: 'Artificer',
          classSource: 'EFA',
          classLevel: 2,
          selected: [{ entityType: 'item', name: 'Dormant Tool', source: 'HB', slotLevel: 2 }],
        },
      ],
    })

    expect(detectSourceConflicts(char, ['PHB'])).toEqual(
      expect.arrayContaining([
        { source: 'TCE', items: ['Skill Expert'] },
        { source: 'EFA', items: ['Manifold Tool'] },
      ]),
    )
    expect(detectSourceConflicts(char, ['PHB']).some((conflict) => conflict.source === 'HB')).toBe(
      false,
    )
  })

  test('does not flag permitted 2014 PHB options on a 2024 character', () => {
    const char = makeCharacterFixture({
      originSystem: '2024',
      race: 'Half-Elf',
      raceSource: 'PHB',
      background: 'Acolyte',
      backgroundSource: 'XPHB',
      classProgression: [
        {
          name: 'Cleric',
          levels: 3,
          source: 'XPHB',
          subclass: 'Knowledge Domain',
          subclassSource: 'PHB',
        },
      ],
      feats: [{ id: 'f1', name: 'Dungeon Delver', source: 'PHB', description: '' }],
      specialFeats: [{ id: 'f2', name: 'Linguist', source: 'PHB', description: '' }],
      classFeatChoices: [
        {
          id: 'fighter-feat',
          className: 'Fighter',
          classSource: 'XPHB',
          progressionName: 'Ability Score Improvement',
          categories: [],
          feats: [{ id: 'f3', name: 'Martial Adept', source: 'PHB', description: '' }],
        },
      ],
    })

    expect(detectSourceConflicts(char, ['XPHB'])).toEqual([])
  })

  test('still flags replaced 2014 PHB options on a 2024 character', () => {
    const char = makeCharacterFixture({
      originSystem: '2024',
      race: 'Elf',
      raceSource: 'PHB',
      background: 'Acolyte',
      backgroundSource: 'XPHB',
      classProgression: [
        {
          name: 'Cleric',
          levels: 3,
          source: 'XPHB',
          subclass: 'Life Domain',
          subclassSource: 'PHB',
        },
      ],
      feats: [{ id: 'f1', name: 'Alert', source: 'PHB', description: '' }],
    })

    expect(detectSourceConflicts(char, ['XPHB'])).toEqual([
      { source: 'PHB', items: ['Elf', 'Life Domain (subclass)', 'Alert'] },
    ])
  })
})

// ── pruneSpellsForDisabledSources ────────────────────────────────────────────

describe('pruneSpellsForDisabledSources', () => {
  test('retracts only the removed racial descriptor printing while independent ownership remains', () => {
    const character = makeRacialSourceCharacter()
    character.classProgression.push({ name: 'Wizard', source: 'XPHB', levels: 1 })
    const owned = authorManagedClassSpellFixture(character, makeManagedClassSpellFixtures(), [
      {
        owner: character.classProgression[character.classProgression.length - 1],
        domain: 'class-spellbook',
        gain: 1,
        targets: [{ name: 'Shield', source: 'XPHB', prepare: true }],
      },
    ])
    Object.assign(character, owned)
    const before = structuredClone(character)
    expect(characterPersistenceSchema.safeParse(character).success).toBe(true)

    // Qualified references remain removable even when the rules catalog is absent.
    const result = pruneSpellsForDisabledSources(character, ['xphb'])!
    const racial = result.spells.spellProfiles.find((profile) => profile.type === 'racial')!

    expect(racial.choices![0].selected).toEqual([])
    expect(racial.cantrips).toEqual([])
    expect(result.provenance.spells['toll the dead']).toEqual([
      expect.objectContaining({ sourceType: 'manual', grantSource: 'XPHB' }),
    ])
    expect(result.spells.spellProfiles.filter((profile) => profile.type !== 'racial')).toEqual(
      before.spells.spellProfiles.filter((profile) => profile.type !== 'racial'),
    )
    expect(characterPersistenceSchema.safeParse({ ...character, ...result }).success).toBe(true)
    expect(character).toEqual(before)
    expect(pruneSpellsForDisabledSources(character, ['XPHB', 'XGE'])).toBeNull()
  })

  test.each([
    'XGE',
    'XPHB',
  ])('preserves mandatory %s grants and an independent descriptor of the same spell', (fixedSource) => {
    const race = {
      name: 'Choosing Caster',
      source: 'OWNER',
      additionalSpells: [
        {
          known: {
            _: [
              `toll the dead|${fixedSource}#c`,
              { choose: 'level=0|class=Wizard' },
              { choose: 'level=0|class=Cleric' },
            ],
          },
        },
      ],
    } as Race5e
    let character = buildInitialCharacter(
      { initial: { name: 'Independent grants', originSystem: '2014' }, race },
      new Map(),
      () => [],
    )
    const profileId = character.spells.spellProfiles.find(
      (profile) => profile.type === 'racial',
    )!.id
    const choices = character.spells.spellProfiles.find((profile) => profile.id === profileId)!
      .choices!
    for (const [id, selected] of [
      [choices[0].id, 'Toll the Dead|XGE'],
      [choices[1].id, 'Toll the Dead|XPHB'],
    ]) {
      const result = setRacialSpellChoice(
        character,
        character.provenance,
        profileId,
        id,
        [selected],
        nativeRaceResolution(race),
        nativeChoiceSpellLookup,
      )
      character = { ...character, ...result.characterPatch, provenance: result.provenanceUpdate }
    }
    character.spells.spellSlots[1] = { max: 3, used: 2 }
    character.spells.pactSpellSlots = { ...character.spells.pactSpellSlots, 1: { max: 2, used: 1 } }
    const before = structuredClone(character)
    expect(characterPersistenceSchema.safeParse(character).success).toBe(true)

    const result = pruneSpellsForDisabledSources(character, ['XPHB'])!
    const racial = result.spells.spellProfiles.find((profile) => profile.id === profileId)!
    expect(racial.choices!.map((choice) => choice.selected)).toEqual([[], ['Toll the Dead|XPHB']])
    expect(racial.cantrips.map((reference) => reference.toLowerCase()).sort()).toEqual(
      fixedSource === 'XGE' ? ['toll the dead|xge', 'toll the dead|xphb'] : ['toll the dead|xphb'],
    )
    expect(racial.fixedSpells).toEqual([`toll the dead|${fixedSource}`])
    expect(result.provenance.spells['toll the dead']).toEqual([
      expect.objectContaining({ sourceType: 'race', grantType: 'fixed', grantSource: fixedSource }),
      expect.objectContaining({
        sourceType: 'race',
        grantType: 'choice',
        grantVariant: choices[1].id,
        grantSource: 'XPHB',
      }),
    ])
    expect(result.spells.spellSlots).toEqual(before.spells.spellSlots)
    expect(result.spells.pactSpellSlots).toEqual(before.spells.pactSpellSlots)
    expect(characterPersistenceSchema.safeParse({ ...character, ...result }).success).toBe(true)
    expect(character).toEqual(before)
  })

  test('returns null when no spells are affected', () => {
    const char = makeCharacterFixture()
    expect(pruneSpellsForDisabledSources(char, ['PHB'])).toBeNull()
  })

  test('returns null when all selected spells are still in allowed sources', () => {
    const char = makeBonusCharacter([], ['Fireball'])
    // A manual name has no source restriction.
    expect(pruneSpellsForDisabledSources(char, ['PHB'])).toBeNull()
  })

  test('removes a spell when its only source is disabled', () => {
    const char = makeBonusCharacter([], ['Silvery Barbs|SCAG'])
    // Silvery Barbs is only in SCAG; removing SCAG → remove spell
    const result = pruneSpellsForDisabledSources(char, ['PHB'])
    expect(result).not.toBeNull()
    expect(
      result!.spells.spellProfiles.find((profile) => profile.type === 'special')!.spellsKnown,
    ).toEqual([])
  })

  test('keeps a literal manual name through source changes without borrowing a printing', () => {
    const char = makeBonusCharacter([], ['Fireball'])
    // No printing owns this manual fact, even if a same-name catalog spell exists.
    expect(pruneSpellsForDisabledSources(char, ['XPHB'])).toBeNull()
    expect(pruneSpellsForDisabledSources(char, [])).toBeNull()
    expect(characterPersistenceSchema.parse(char)).toEqual(char)
  })

  test('removes a source-qualified spell when its exact printing is disabled', () => {
    const char = makeBonusCharacter([], ['Fireball|PHB'])

    const result = pruneSpellsForDisabledSources(char, ['XPHB'])

    expect(
      result!.spells.spellProfiles.find((profile) => profile.type === 'special')!.spellsKnown,
    ).toEqual([])
  })

  test('keeps a source-qualified spell when its exact printing remains enabled', () => {
    const char = makeBonusCharacter([], ['Fireball|PHB'])

    expect(pruneSpellsForDisabledSources(char, ['PHB'])).toBeNull()
  })

  test('removes Bonus cantrips and known spells together', () => {
    const char = makeBonusCharacter(['Control Flames|XGE'], [], ['Frostbite|XGE'])
    const result = pruneSpellsForDisabledSources(char, ['PHB'])
    expect(result).not.toBeNull()
    expect(
      result!.spells.spellProfiles.find((profile) => profile.type === 'special')!.cantrips,
    ).toEqual([])
    expect(
      result!.spells.spellProfiles.find((profile) => profile.type === 'special')!.spellsKnown,
    ).toEqual([])
  })

  test('prunes only disabled members of a supported count-two racial descriptor', () => {
    const race = {
      name: 'Choosing Caster',
      source: 'OWNER',
      additionalSpells: [{ known: { _: [{ choose: 'level=0|class=Wizard', count: 2 }] } }],
    } as Race5e
    const initial = buildInitialCharacter(
      { initial: { name: 'Partial quota', originSystem: '2014' }, race },
      new Map(),
      () => [],
    )
    const profileId = initial.spells.spellProfiles.find((profile) => profile.type === 'racial')!.id
    const selection = setRacialSpellChoice(
      initial,
      initial.provenance,
      profileId,
      initial.spells.spellProfiles.find((profile) => profile.id === profileId)!.choices![0].id,
      ['Frostbite|XGE', 'Mage Hand|PHB'],
      nativeRaceResolution(race),
      nativeChoiceSpellLookup,
    )
    const character = {
      ...initial,
      ...selection.characterPatch,
      provenance: selection.provenanceUpdate,
    }
    expect(characterPersistenceSchema.safeParse(character).success).toBe(true)

    const result = pruneSpellsForDisabledSources(character, ['PHB'])!
    const profile = result.spells.spellProfiles.find((entry) => entry.id === profileId)!
    expect(profile.choices![0].selected).toEqual(['Mage Hand|PHB'])
    expect(profile.cantrips).toEqual(['Mage Hand|PHB'])
    expect(result.provenance.spells).not.toHaveProperty('frostbite')
    expect(result.provenance.spells['mage hand']).toEqual([
      expect.objectContaining({ grantVariant: profile.choices![0].id, grantSource: 'PHB' }),
    ])
    expect(characterPersistenceSchema.safeParse({ ...character, ...result }).success).toBe(true)
  })

  test('preserves actual mandatory racial grants when the target source is disabled', () => {
    const character = buildInitialCharacter(
      {
        initial: { name: 'Mandatory grants', originSystem: '2014' },
        race: {
          name: 'Mandatory Caster',
          source: 'OWNER',
          additionalSpells: [{ known: { _: ['control flames|XGE#c', 'frostbite|XGE#c'] } }],
        } as Race5e,
      },
      new Map(),
      () => [],
    )
    expect(characterPersistenceSchema.safeParse(character).success).toBe(true)
    expect(pruneSpellsForDisabledSources(character, ['PHB'])).toBeNull()
  })

  test('keeps unknown spells (not in any game-data source)', () => {
    const char = makeBonusCharacter([], ['Homebrew Bolt'])
    // Custom manual facts remain independent of catalog availability.
    expect(pruneSpellsForDisabledSources(char, ['PHB'])).toBeNull()
  })

  test('cleans matching provenance entries', () => {
    const char = makeBonusCharacter([], ['Silvery Barbs|SCAG'])
    const result = pruneSpellsForDisabledSources(char, ['PHB'])
    expect(result).not.toBeNull()
    expect(result!.provenance?.spells).not.toHaveProperty('silvery barbs')
  })

  test('leaves provenance entries for spells that remain', () => {
    const char = makeBonusCharacter([], ['Fireball|PHB', 'Silvery Barbs|SCAG'])
    const result = pruneSpellsForDisabledSources(char, ['PHB'])
    expect(result!.provenance?.spells).toHaveProperty('fireball')
    expect(result!.provenance?.spells).not.toHaveProperty('silvery barbs')
  })
})

// ── countRemovedSpells ───────────────────────────────────────────────────────

describe('countRemovedSpells', () => {
  test('returns 0 when nothing changed', () => {
    const char = makeCharacterFixture()
    expect(countRemovedSpells(char, char.spells.spellProfiles)).toBe(0)
  })

  test('counts removed spells across cantrips, known, prepared, and choices', () => {
    const char = makeCharacterFixture({
      spells: {
        ...makeCharacterFixture().spells,
        spellProfiles: [
          {
            id: 'class:Druid|PHB',
            type: 'class',
            label: 'Druid',
            className: 'Druid',
            classSource: 'PHB',
            cantrips: ['Control Flames', 'Frostbite'],
            spellsKnown: ['Silvery Barbs'],
            preparedSpells: ['Frostbite'],
            choices: [{ id: 'c1', count: 1, isCantrip: false, selected: ['Control Flames'] }],
            alwaysPrepared: false,
          },
        ],
      },
    })
    const newProfiles = char.spells.spellProfiles.map((p) => ({
      ...p,
      cantrips: ['Control Flames'], // removed Frostbite
      spellsKnown: [], // removed Silvery Barbs
      preparedSpells: [], // removed Frostbite
      choices: [{ id: 'c1', count: 1, isCantrip: false, selected: [] }], // removed Control Flames
    }))
    expect(countRemovedSpells(char, newProfiles)).toBe(2)
  })
})
