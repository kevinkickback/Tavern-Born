/**
 * Unit tests for spell domain commands (Phase 1.5).
 *
 * These tests validate that spell mutation commands correctly coordinate
 * profile state updates and provenance ledger changes for atomic spell operations.
 */

import { describe, expect, test } from 'vitest'
import {
  addSpellToCharacter,
  removeRacialSpell,
  removeSpellFromCharacter,
  selectRacialSpell,
  setClassSpellSelectionsAtLevel,
  setProfileSpells,
  setRacialSpellChoice,
  swapClassSpellAtLevel,
  swapSpellOnCharacter,
} from '@/lib/character/commands/spellCommands'
import { reconcileRaceChange } from '@/lib/provenance'
import { emptyProvenance } from '@/store/characterStore'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

describe('Spell Commands', () => {
  test('attributes a racial spell choice to the selected race for reconciliation', () => {
    const character = makeCharacterFixture({
      race: 'High Elf',
      raceSource: 'PHB',
      spells: {
        ...makeCharacterFixture().spells,
        spellProfiles: [
          {
            id: 'racial:High Elf|PHB',
            type: 'racial',
            label: 'Racial Spells',
            raceName: 'High Elf',
            raceSource: 'PHB',
            choices: [{ id: 'choose-0', count: 1, isCantrip: true, selected: [] }],
            cantrips: [],
            spellsKnown: [],
            preparedSpells: [],
            alwaysPrepared: true,
          },
        ],
      },
    })

    const selected = selectRacialSpell(
      character,
      emptyProvenance(),
      'racial:High Elf|PHB',
      'choose-0',
      'Mage Hand',
    )

    expect(selected.provenanceUpdate.spells['mage hand']).toEqual([
      expect.objectContaining({ sourceType: 'race', sourceName: 'High Elf', sourceRef: 'PHB' }),
    ])
    expect(reconcileRaceChange(selected.provenanceUpdate, 'High Elf', undefined).spells).toEqual({})

    const configured = {
      ...character,
      ...selected.characterPatch,
      provenance: selected.provenanceUpdate,
    }
    const removed = removeRacialSpell(
      configured,
      selected.provenanceUpdate,
      'racial:High Elf|PHB',
      'choose-0',
      'Mage Hand',
    )
    expect(removed.provenanceUpdate.spells).toEqual({})
  })

  test('replaces and batches racial spell choices atomically', () => {
    const character = makeCharacterFixture({
      race: 'Astral Elf',
      raceSource: 'AAG',
      spells: {
        ...makeCharacterFixture().spells,
        spellProfiles: [
          {
            id: 'racial:Astral Elf|AAG',
            type: 'racial',
            label: 'Racial Spellcasting',
            raceName: 'Astral Elf',
            raceSource: 'AAG',
            choices: [
              {
                id: 'block-choice',
                count: 2,
                isCantrip: true,
                pool: ['light', 'sacred flame', 'dancing lights'],
                selected: ['Light|PHB'],
              },
            ],
            cantrips: ['Light|PHB'],
            spellsKnown: [],
            preparedSpells: [],
            alwaysPrepared: true,
          },
        ],
      },
    })
    const initial = selectRacialSpell(
      {
        ...character,
        spells: {
          ...character.spells,
          spellProfiles: character.spells.spellProfiles.map((profile) => ({
            ...profile,
            cantrips: [],
            choices: profile.choices?.map((choice) => ({ ...choice, selected: [] })),
          })),
        },
      },
      emptyProvenance(),
      'racial:Astral Elf|AAG',
      'block-choice',
      'Light|PHB',
    )
    const configured = {
      ...character,
      provenance: initial.provenanceUpdate,
    }

    const result = setRacialSpellChoice(
      configured,
      initial.provenanceUpdate,
      'racial:Astral Elf|AAG',
      'block-choice',
      ['Sacred Flame|PHB', 'Dancing Lights|PHB'],
    )
    const profile = result.characterPatch.spells?.spellProfiles[0]

    expect(profile?.choices?.[0].selected).toEqual(['Sacred Flame|PHB', 'Dancing Lights|PHB'])
    expect(profile?.cantrips).toEqual(['Sacred Flame|PHB', 'Dancing Lights|PHB'])
    expect(result.provenanceUpdate.spells).not.toHaveProperty('light')
    expect(result.provenanceUpdate.spells['sacred flame']).toEqual([
      expect.objectContaining({ grantVariant: 'block-choice', sourceType: 'race' }),
    ])
    expect(result.provenanceUpdate.spells['dancing lights']).toEqual([
      expect.objectContaining({ grantVariant: 'block-choice', sourceType: 'race' }),
    ])
  })

  test('retains a legacy racial spell grant still owned by another choice', () => {
    const character = makeCharacterFixture({
      race: 'High Elf',
      raceSource: 'PHB',
      spells: {
        ...makeCharacterFixture().spells,
        spellProfiles: [
          {
            id: 'racial:High Elf|PHB',
            type: 'racial',
            label: 'Racial Spellcasting',
            raceName: 'High Elf',
            raceSource: 'PHB',
            choices: [
              { id: 'first-choice', count: 1, isCantrip: true, selected: ['Light|PHB'] },
              { id: 'second-choice', count: 1, isCantrip: true, selected: ['Light|PHB'] },
            ],
            cantrips: ['Light|PHB'],
            spellsKnown: [],
            preparedSpells: [],
            alwaysPrepared: true,
          },
        ],
      },
    })
    const legacyTag = {
      sourceType: 'race' as const,
      sourceName: 'High Elf',
      sourceRef: 'PHB',
      grantType: 'choice' as const,
      label: 'High Elf',
    }
    const ledger = {
      ...emptyProvenance(),
      spells: { light: [legacyTag] },
    }

    const result = setRacialSpellChoice(character, ledger, 'racial:High Elf|PHB', 'first-choice', [
      'Sacred Flame|PHB',
    ])

    expect(result.characterPatch.spells?.spellProfiles[0].cantrips).toEqual([
      'Light|PHB',
      'Sacred Flame|PHB',
    ])
    expect(result.provenanceUpdate.spells.light).toEqual([legacyTag])
    expect(result.provenanceUpdate.spells['sacred flame']).toEqual([
      expect.objectContaining({ grantVariant: 'first-choice' }),
    ])
  })

  describe('setClassSpellSelectionsAtLevel', () => {
    test('preserves earlier unattributed Wizard choices while adding later level selections', () => {
      let character = makeCharacterFixture({
        classProgression: [{ name: 'Wizard', source: 'PHB', levels: 4 }],
        spells: {
          spellProfiles: [
            {
              id: 'class:Wizard|PHB',
              type: 'class',
              label: 'Wizard (Lv 4)',
              className: 'Wizard',
              classSource: 'PHB',
              cantrips: ['Fire Bolt', 'Mage Hand', 'Prestidigitation'],
              spellsKnown: [
                'Detect Magic',
                'Feather Fall',
                'Mage Armor',
                'Magic Missile',
                'Shield',
                'Sleep',
              ],
              preparedSpells: ['Mage Armor', 'Magic Missile', 'Shield', 'Sleep'],
              alwaysPrepared: false,
            },
          ],
          spellSlots: makeCharacterFixture().spells.spellSlots,
        },
      })
      let ledger = character.provenance ?? emptyProvenance()

      const applyLevel = (classLevel: number, selections: Array<[string, number]>) => {
        const result = setClassSpellSelectionsAtLevel(character, ledger, {
          className: 'Wizard',
          classSource: 'PHB',
          classLevel,
          selections: selections.map(([name, spellLevel]) => ({ name, spellLevel })),
        })
        character = {
          ...character,
          ...result.characterPatch,
          provenance: result.provenanceUpdate,
        }
        ledger = result.provenanceUpdate
      }

      applyLevel(2, [
        ['Arcane Lock', 2],
        ['Misty Step', 2],
      ])
      applyLevel(3, [
        ['Counterspell', 3],
        ['Fireball', 3],
      ])
      applyLevel(4, [
        ['Light', 0],
        ['Dimension Door', 4],
        ['Polymorph', 4],
      ])

      const profile = character.spells.spellProfiles.find(
        (candidate) => candidate.id === 'class:Wizard|PHB',
      )
      expect(profile?.cantrips).toEqual(['Fire Bolt', 'Mage Hand', 'Prestidigitation', 'Light'])
      expect(profile?.spellsKnown).toEqual([
        'Detect Magic',
        'Feather Fall',
        'Mage Armor',
        'Magic Missile',
        'Shield',
        'Sleep',
        'Arcane Lock',
        'Misty Step',
        'Counterspell',
        'Fireball',
        'Dimension Door',
        'Polymorph',
      ])
      expect(profile?.preparedSpells).toEqual(['Mage Armor', 'Magic Missile', 'Shield', 'Sleep'])
      expect(ledger.spells.fireball?.[0]).toMatchObject({
        sourceName: 'Wizard',
        sourceRef: 'PHB',
        spellGrantedAtLevel: 3,
        spellAttributionMode: 'exact',
      })
      expect(ledger.spells.light?.[0]).toMatchObject({ spellGrantedAtLevel: 4 })
    })

    test.each([
      { rules: '2014', className: 'Artificer', classSource: 'TCE' },
      { rules: '2014', className: 'Bard', classSource: 'PHB' },
      { rules: '2014', className: 'Cleric', classSource: 'PHB' },
      { rules: '2014', className: 'Druid', classSource: 'PHB' },
      { rules: '2014', className: 'Paladin', classSource: 'PHB' },
      { rules: '2014', className: 'Ranger', classSource: 'PHB' },
      { rules: '2014', className: 'Sorcerer', classSource: 'PHB' },
      { rules: '2014', className: 'Warlock', classSource: 'PHB' },
      { rules: '2014', className: 'Wizard', classSource: 'PHB' },
      { rules: '2024', className: 'Bard', classSource: 'XPHB' },
      { rules: '2024', className: 'Cleric', classSource: 'XPHB' },
      { rules: '2024', className: 'Druid', classSource: 'XPHB' },
      { rules: '2024', className: 'Paladin', classSource: 'XPHB' },
      { rules: '2024', className: 'Ranger', classSource: 'XPHB' },
      { rules: '2024', className: 'Sorcerer', classSource: 'XPHB' },
      { rules: '2024', className: 'Warlock', classSource: 'XPHB' },
      { rules: '2024', className: 'Wizard', classSource: 'XPHB' },
    ])('$rules $className keeps prior level choices and unrelated profiles', ({
      rules,
      className,
      classSource,
    }) => {
      const profileId = `class:${className}|${classSource}`
      const earlierSpell = `${rules} ${className} Earlier Spell`
      const laterSpell = `${rules} ${className} Later Spell`
      const unrelatedProfile = {
        id: 'class:Other Caster|TEST',
        type: 'class' as const,
        label: 'Other Caster (Lv 1)',
        className: 'Other Caster',
        classSource: 'TEST',
        cantrips: ['Guidance'],
        spellsKnown: ['Bless'],
        preparedSpells: ['Bless'],
        alwaysPrepared: false,
      }
      const defaultSpells = makeCharacterFixture().spells
      let character = makeCharacterFixture({
        originSystem: rules === '2014' ? '2014' : '2024',
        classProgression: [
          { name: className, source: classSource, levels: 4 },
          { name: 'Other Caster', source: 'TEST', levels: 1 },
        ],
        spells: {
          ...defaultSpells,
          spellProfiles: [
            {
              id: profileId,
              type: 'class',
              label: `${className} (Lv 4)`,
              className,
              classSource,
              cantrips: [],
              spellsKnown: [],
              preparedSpells: [],
              alwaysPrepared: false,
            },
            unrelatedProfile,
          ],
        },
      })
      let ledger = character.provenance ?? emptyProvenance()

      for (const [classLevel, name, spellLevel] of [
        [1, earlierSpell, 1],
        [4, laterSpell, 2],
      ] as const) {
        const result = setClassSpellSelectionsAtLevel(character, ledger, {
          className,
          classSource,
          classLevel,
          selections: [{ name, spellLevel }],
        })
        character = {
          ...character,
          ...result.characterPatch,
          provenance: result.provenanceUpdate,
        }
        ledger = result.provenanceUpdate
      }

      const profile = character.spells.spellProfiles.find((candidate) => candidate.id === profileId)
      expect(profile?.spellsKnown).toEqual([earlierSpell, laterSpell])
      expect(
        character.spells.spellProfiles.find((profile) => profile.id === unrelatedProfile.id),
      ).toEqual(unrelatedProfile)
      expect(ledger.spells[earlierSpell.toLowerCase()]?.[0]).toMatchObject({
        sourceName: className,
        sourceRef: classSource,
        spellGrantedAtLevel: 1,
      })
      expect(ledger.spells[laterSpell.toLowerCase()]?.[0]).toMatchObject({
        sourceName: className,
        sourceRef: classSource,
        spellGrantedAtLevel: 4,
      })
    })

    test('replaces only the edited level and retains unrelated provenance', () => {
      const character = makeCharacterFixture({
        classProgression: [{ name: 'Wizard', source: 'PHB', levels: 2 }],
        spells: {
          spellProfiles: [
            {
              id: 'class:Wizard|PHB',
              type: 'class',
              label: 'Wizard (Lv 2)',
              className: 'Wizard',
              classSource: 'PHB',
              cantrips: ['Fire Bolt'],
              spellsKnown: ['Shield', 'Misty Step'],
              preparedSpells: ['Shield', 'Misty Step'],
              alwaysPrepared: false,
            },
          ],
          spellSlots: makeCharacterFixture().spells.spellSlots,
        },
      })
      const classTag = {
        sourceType: 'class' as const,
        sourceName: 'Wizard',
        sourceRef: 'PHB',
        grantType: 'choice' as const,
        label: 'Wizard',
        spellGrantedAtLevel: 2,
        spellAttributionMode: 'exact' as const,
      }
      const featTag = {
        sourceType: 'feat' as const,
        sourceName: 'Fey Touched',
        sourceRef: 'TCE',
        grantType: 'fixed' as const,
        label: 'Fey Touched',
      }
      const ledger = {
        ...(character.provenance ?? emptyProvenance()),
        spells: {
          'misty step': [classTag, featTag],
        },
      }

      const result = setClassSpellSelectionsAtLevel(character, ledger, {
        className: 'Wizard',
        classSource: 'PHB',
        classLevel: 2,
        selections: [{ name: 'Arcane Lock', spellLevel: 2 }],
      })
      const profile = result.characterPatch.spells?.spellProfiles.find(
        (candidate) => candidate.id === 'class:Wizard|PHB',
      )

      expect(profile?.spellsKnown).toEqual(['Shield', 'Arcane Lock'])
      expect(profile?.preparedSpells).toEqual(['Shield'])
      expect(result.provenanceUpdate.spells['misty step']).toEqual([featTag])
      expect(result.provenanceUpdate.spells['arcane lock']?.[0]).toMatchObject({
        sourceName: 'Wizard',
        sourceRef: 'PHB',
        spellGrantedAtLevel: 2,
      })
    })

    test('swaps a class spell and its provenance atomically', () => {
      const character = makeCharacterFixture({
        classProgression: [{ name: 'Wizard', source: 'PHB', levels: 3 }],
        spells: {
          spellProfiles: [
            {
              id: 'class:Wizard|PHB',
              type: 'class',
              label: 'Wizard (Lv 3)',
              className: 'Wizard',
              classSource: 'PHB',
              cantrips: [],
              spellsKnown: ['Shield', 'Magic Missile'],
              preparedSpells: ['Shield'],
              alwaysPrepared: false,
            },
          ],
          spellSlots: makeCharacterFixture().spells.spellSlots,
        },
      })
      const wizardTag = {
        sourceType: 'class' as const,
        sourceName: 'Wizard',
        sourceRef: 'PHB',
        grantType: 'choice' as const,
        label: 'Wizard',
        spellGrantedAtLevel: 1,
        spellAttributionMode: 'exact' as const,
      }
      const itemTag = {
        sourceType: 'manual' as const,
        sourceName: 'Wand of Shielding',
        grantType: 'fixed' as const,
        label: 'Wand of Shielding',
      }
      const ledger = {
        ...(character.provenance ?? emptyProvenance()),
        spells: { shield: [wizardTag, itemTag] },
      }

      const result = swapClassSpellAtLevel(character, ledger, {
        className: 'Wizard',
        classSource: 'PHB',
        swapAtLevel: 3,
        removedName: 'Shield',
        addedName: 'Absorb Elements',
      })
      const profile = result.characterPatch.spells?.spellProfiles.find(
        (candidate) => candidate.id === 'class:Wizard|PHB',
      )

      expect(profile?.spellsKnown).toEqual(['Magic Missile', 'Absorb Elements'])
      expect(profile?.preparedSpells).toEqual([])
      expect(profile?.spellSwaps).toEqual({
        3: { removed: 'Shield', added: 'Absorb Elements' },
      })
      expect(result.provenanceUpdate.spells.shield).toEqual([itemTag])
      expect(result.provenanceUpdate.spells['absorb elements']?.[0]).toMatchObject({
        sourceName: 'Wizard',
        sourceRef: 'PHB',
        spellGrantedAtLevel: 1,
        spellAttributionMode: 'exact',
      })
    })

    test('repairs missing choice provenance while replacing a non-fixed class spell', () => {
      const character = makeCharacterFixture({
        classProgression: [{ name: 'Sorcerer', source: 'PHB', levels: 3 }],
        spells: {
          ...makeCharacterFixture().spells,
          spellProfiles: [
            {
              id: 'class:Sorcerer|PHB',
              type: 'class',
              label: 'Sorcerer (Lv 3)',
              className: 'Sorcerer',
              classSource: 'PHB',
              cantrips: [],
              spellsKnown: ['Witch Bolt'],
              preparedSpells: [],
              alwaysPrepared: false,
            },
          ],
        },
      })

      const result = swapClassSpellAtLevel(character, emptyProvenance(), {
        className: 'Sorcerer',
        classSource: 'PHB',
        swapAtLevel: 3,
        removedName: 'Witch Bolt',
        addedName: 'Misty Step',
      })

      expect(result.characterPatch.spells?.spellProfiles[0].spellsKnown).toEqual(['Misty Step'])
      expect(result.provenanceUpdate.spells['misty step']?.[0]).toMatchObject({
        sourceType: 'class',
        sourceName: 'Sorcerer',
        sourceRef: 'PHB',
        grantType: 'choice',
        spellGrantedAtLevel: 3,
      })
    })

    test('rejects replacing a fixed subclass spell without class-choice ownership', () => {
      const character = makeCharacterFixture({
        classProgression: [
          {
            name: 'Sorcerer',
            source: 'PHB',
            levels: 3,
            subclass: 'Clockwork Soul',
            subclassSource: 'TCE',
          },
        ],
        spells: {
          ...makeCharacterFixture().spells,
          spellProfiles: [
            {
              id: 'class:Sorcerer|PHB',
              type: 'class',
              label: 'Sorcerer (Lv 3)',
              className: 'Sorcerer',
              classSource: 'PHB',
              cantrips: [],
              spellsKnown: ['Alarm'],
              preparedSpells: [],
              fixedSpells: ['Alarm'],
              alwaysPrepared: false,
            },
          ],
        },
      })
      const subclassTag = {
        sourceType: 'subclass' as const,
        sourceName: 'Clockwork Soul',
        sourceRef: 'TCE',
        grantType: 'fixed' as const,
        label: 'Clockwork Soul',
      }
      const ledger = {
        ...(character.provenance ?? emptyProvenance()),
        spells: { alarm: [subclassTag] },
      }

      expect(() =>
        swapClassSpellAtLevel(character, ledger, {
          className: 'Sorcerer',
          classSource: 'PHB',
          swapAtLevel: 3,
          removedName: 'Alarm',
          addedName: 'Shield',
        }),
      ).toThrow('is not an owned Sorcerer spell choice')
    })

    test.each([
      {
        className: 'Fighter',
        subclass: 'Eldritch Knight',
        restrictedSchools: ['A', 'V'],
      },
      {
        className: 'Rogue',
        subclass: 'Arcane Trickster',
        restrictedSchools: ['E', 'I'],
      },
    ])('enforces 2014 $subclass school quotas while preserving one unrestricted level-3 choice', ({
      className,
      subclass,
      restrictedSchools,
    }) => {
      const profileId = `class:${className}|PHB`
      const character = makeCharacterFixture({
        originSystem: '2014',
        classProgression: [
          {
            name: className,
            source: 'PHB',
            levels: 3,
            subclass,
            subclassSource: 'PHB',
          },
        ],
        spells: {
          ...makeCharacterFixture().spells,
          spellProfiles: [
            {
              id: profileId,
              type: 'class',
              label: `${className} (Lv 3)`,
              className,
              classSource: 'PHB',
              cantrips: [],
              spellsKnown: [],
              preparedSpells: [],
              alwaysPrepared: false,
            },
          ],
        },
      })
      const ledger = character.provenance ?? emptyProvenance()
      const accepted = setClassSpellSelectionsAtLevel(character, ledger, {
        className,
        classSource: 'PHB',
        classLevel: 3,
        selections: [
          { name: 'Restricted One', spellLevel: 1, school: restrictedSchools[0] },
          { name: 'Restricted Two', spellLevel: 1, school: restrictedSchools[1] },
          { name: 'Unrestricted Choice', spellLevel: 1, school: 'C' },
        ],
      })

      expect(accepted.provenanceUpdate.spells['unrestricted choice']?.[0]?.grantVariant).toBe(
        'unrestricted-school',
      )
      expect(() =>
        setClassSpellSelectionsAtLevel(character, ledger, {
          className,
          classSource: 'PHB',
          classLevel: 3,
          selections: [
            { name: 'Restricted', spellLevel: 1, school: restrictedSchools[0] },
            { name: 'Off School One', spellLevel: 1, school: 'C' },
            { name: 'Off School Two', spellLevel: 1, school: 'N' },
          ],
        }),
      ).toThrow('allows 1 unrestricted-school spell choice')
      expect(() =>
        setClassSpellSelectionsAtLevel(character, ledger, {
          className,
          classSource: 'PHB',
          classLevel: 4,
          selections: [{ name: 'Off School', spellLevel: 1, school: 'C' }],
        }),
      ).toThrow('allows 0 unrestricted-school spell choices')
    })

    test('preserves the Arcane Trickster unrestricted-school slot across replacements', () => {
      const character = makeCharacterFixture({
        originSystem: '2014',
        classProgression: [
          {
            name: 'Rogue',
            source: 'PHB',
            levels: 3,
            subclass: 'Arcane Trickster',
            subclassSource: 'PHB',
          },
        ],
        spells: {
          ...makeCharacterFixture().spells,
          spellProfiles: [
            {
              id: 'class:Rogue|PHB',
              type: 'class',
              label: 'Rogue (Lv 3)',
              className: 'Rogue',
              classSource: 'PHB',
              cantrips: [],
              spellsKnown: [],
              preparedSpells: [],
              alwaysPrepared: false,
            },
          ],
        },
      })
      const selected = setClassSpellSelectionsAtLevel(
        character,
        character.provenance ?? emptyProvenance(),
        {
          className: 'Rogue',
          classSource: 'PHB',
          classLevel: 3,
          selections: [
            { name: 'Charm Person', spellLevel: 1, school: 'E' },
            { name: 'Silent Image', spellLevel: 1, school: 'I' },
            { name: 'Find Familiar', spellLevel: 1, school: 'C' },
          ],
        },
      )
      const selectedCharacter = {
        ...character,
        ...selected.characterPatch,
        provenance: selected.provenanceUpdate,
      }

      expect(() =>
        swapClassSpellAtLevel(selectedCharacter, selected.provenanceUpdate, {
          className: 'Rogue',
          classSource: 'PHB',
          swapAtLevel: 4,
          removedName: 'Charm Person',
          addedName: 'Fog Cloud',
          addedSpellSchool: 'C',
        }),
      ).toThrow('replacement violates its school restriction')

      const swapped = swapClassSpellAtLevel(selectedCharacter, selected.provenanceUpdate, {
        className: 'Rogue',
        classSource: 'PHB',
        swapAtLevel: 4,
        removedName: 'Find Familiar',
        addedName: 'Fog Cloud',
        addedSpellSchool: 'C',
      })
      expect(swapped.provenanceUpdate.spells['fog cloud']?.[0]?.grantVariant).toBe(
        'unrestricted-school',
      )
    })
  })

  describe('addSpellToCharacter', () => {
    test('adds cantrip to profile and records provenance', () => {
      const character = makeCharacterFixture({
        classProgression: [{ name: 'Wizard', source: 'PHB', levels: 1 }],
        spells: {
          spellProfiles: [
            {
              id: 'class:Wizard|PHB',
              type: 'class' as const,
              label: 'Wizard (Lv 1)',
              className: 'Wizard',
              classSource: 'PHB',
              cantrips: [],
              spellsKnown: [],
              preparedSpells: [],
              alwaysPrepared: false,
            },
          ],
          spellSlots: makeCharacterFixture().spells.spellSlots,
        },
      })

      const ledger = character.provenance ?? emptyProvenance()

      const result = addSpellToCharacter(
        character,
        ledger,
        'Fire Bolt',
        'cantrip',
        'class:Wizard|PHB',
        {
          sourceType: 'class',
          sourceName: 'Wizard',
          sourceRef: 'PHB',
          attributionMode: 'exact',
        },
      )

      // Profile should be updated with new cantrip
      const updatedProfile = result.characterPatch.spells?.spellProfiles[0]
      expect(updatedProfile?.cantrips).toContain('Fire Bolt')

      // Provenance should record the grant
      expect(result.provenanceUpdate.spells['fire bolt']).toBeDefined()
    })

    test('adds spell known to profile with correct level assigment', () => {
      const character = makeCharacterFixture({
        classProgression: [{ name: 'Bard', source: 'PHB', levels: 3 }],
        spells: {
          spellProfiles: [
            {
              id: 'class:Bard|PHB',
              type: 'class' as const,
              label: 'Bard (Lv 3)',
              className: 'Bard',
              classSource: 'PHB',
              cantrips: ['Vicious Mockery'],
              spellsKnown: [],
              preparedSpells: [],
              alwaysPrepared: false,
            },
          ],
          spellSlots: makeCharacterFixture().spells.spellSlots,
        },
      })

      const ledger = character.provenance ?? emptyProvenance()

      const result = addSpellToCharacter(
        character,
        ledger,
        'Faerie Fire',
        'spell',
        'class:Bard|PHB',
        {
          sourceType: 'class',
          sourceName: 'Bard',
          sourceRef: 'PHB',
          grantedAtLevel: 1,
          attributionMode: 'exact',
        },
      )

      // Profile should include new spell known
      const updatedProfile = result.characterPatch.spells?.spellProfiles[0]
      expect(updatedProfile?.spellsKnown).toContain('Faerie Fire')
    })

    test('does not duplicate a stored spell with different casing', () => {
      const character = makeCharacterFixture({
        spells: {
          spellProfiles: [
            {
              id: 'class:Wizard|PHB',
              type: 'class' as const,
              label: 'Wizard',
              className: 'Wizard',
              classSource: 'PHB',
              cantrips: ['mage hand'],
              spellsKnown: [],
              preparedSpells: [],
              alwaysPrepared: false,
            },
          ],
          spellSlots: makeCharacterFixture().spells.spellSlots,
        },
      })

      const result = addSpellToCharacter(
        character,
        character.provenance ?? emptyProvenance(),
        'Mage Hand',
        'cantrip',
        'class:Wizard|PHB',
      )

      expect(result.characterPatch.spells?.spellProfiles[0]?.cantrips).toEqual(['mage hand'])
    })
  })

  describe('setProfileSpells', () => {
    test('deduplicates mixed-case names and retains prepared state by canonical name', () => {
      const character = makeCharacterFixture({
        spells: {
          spellProfiles: [
            {
              id: 'class:Wizard|PHB',
              type: 'class' as const,
              label: 'Wizard',
              className: 'Wizard',
              classSource: 'PHB',
              cantrips: [],
              spellsKnown: ['magic missile'],
              preparedSpells: ['magic missile'],
              alwaysPrepared: false,
            },
          ],
          spellSlots: makeCharacterFixture().spells.spellSlots,
        },
      })

      const result = setProfileSpells(
        character,
        character.provenance ?? emptyProvenance(),
        'class:Wizard|PHB',
        [],
        ['Magic Missile', 'magic missile'],
      )
      const profile = result.characterPatch.spells?.spellProfiles[0]

      expect(profile?.spellsKnown).toEqual(['Magic Missile'])
      expect(profile?.preparedSpells).toEqual(['magic missile'])
    })
  })

  describe('removeSpellFromCharacter', () => {
    test('removes spell from profile and cleans up provenance', () => {
      const character = makeCharacterFixture({
        classProgression: [{ name: 'Wizard', source: 'PHB', levels: 1 }],
        spells: {
          spellProfiles: [
            {
              id: 'class:Wizard|PHB',
              type: 'class' as const,
              label: 'Wizard',
              className: 'Wizard',
              classSource: 'PHB',
              cantrips: ['Fire Bolt', 'Mage Hand', 'Prestidigitation'],
              spellsKnown: [],
              preparedSpells: [],
              alwaysPrepared: false,
            },
          ],
          spellSlots: makeCharacterFixture().spells.spellSlots,
        },
      })

      const ledger = character.provenance ?? emptyProvenance()

      const result = removeSpellFromCharacter(character, ledger, 'Fire Bolt', {
        spellKind: 'cantrip',
        profileId: 'class:Wizard|PHB',
      })

      // Profile should no longer have removed cantrip
      const updatedProfile = result.characterPatch.spells?.spellProfiles[0]
      expect(updatedProfile?.cantrips).not.toContain('Fire Bolt')
      expect(updatedProfile?.cantrips).toContain('Mage Hand')

      // Provenance grant should be removed
      expect(result.provenanceUpdate.spells['fire bolt']).toBeUndefined()
    })

    test('matches a normalized ledger key against the stored display name', () => {
      const character = makeCharacterFixture({
        spells: {
          spellProfiles: [
            {
              id: 'class:Wizard|PHB',
              type: 'class' as const,
              label: 'Wizard',
              className: 'Wizard',
              classSource: 'PHB',
              cantrips: [],
              spellsKnown: ['Magic Missile'],
              preparedSpells: ['Magic Missile'],
              alwaysPrepared: false,
            },
          ],
          spellSlots: makeCharacterFixture().spells.spellSlots,
        },
      })

      const result = removeSpellFromCharacter(
        character,
        character.provenance ?? emptyProvenance(),
        'magic missile',
      )

      expect(result.characterPatch.spells?.spellProfiles[0]?.spellsKnown).toEqual([])
      expect(result.characterPatch.spells?.spellProfiles[0]?.preparedSpells).toEqual([])
    })
  })

  describe('swapSpellOnCharacter', () => {
    test('removed spell is absent and added spell is present after a swap', () => {
      const profileId = 'class:Bard|PHB'
      const character = makeCharacterFixture({
        classProgression: [{ name: 'Bard', source: 'PHB', levels: 1 }],
        spells: {
          spellProfiles: [
            {
              id: profileId,
              type: 'class' as const,
              label: 'Bard',
              className: 'Bard',
              classSource: 'PHB',
              cantrips: [],
              spellsKnown: ['Faerie Fire', 'Healing Word'],
              preparedSpells: [],
              alwaysPrepared: false,
            },
          ],
          spellSlots: makeCharacterFixture().spells.spellSlots,
        },
      })

      // Seed the ledger with a grant for the spell being swapped out.
      const ledgerWithGrant = addSpellToCharacter(
        character,
        character.provenance ?? emptyProvenance(),
        'Faerie Fire',
        'spell',
        profileId,
        { sourceType: 'class', sourceName: 'Bard', sourceRef: 'PHB', grantedAtLevel: 1 },
      ).provenanceUpdate

      const result = swapSpellOnCharacter(
        character,
        ledgerWithGrant,
        'Faerie Fire',
        'Thunderwave',
        profileId,
      )

      const updatedProfile = result.characterPatch.spells?.spellProfiles.find(
        (profile) => profile.id === profileId,
      )

      // Removed spell must be gone from the profile
      expect(updatedProfile?.spellsKnown).not.toContain('Faerie Fire')
      // Added spell must be present in the profile
      expect(updatedProfile?.spellsKnown).toContain('Thunderwave')
      // Untouched spell must still be present
      expect(updatedProfile?.spellsKnown).toContain('Healing Word')

      // Provenance: removed spell's grant should be absent
      expect(result.provenanceUpdate.spells['faerie fire']).toBeUndefined()
      // Provenance: added spell must have a grant
      expect(result.provenanceUpdate.spells.thunderwave).toBeDefined()
    })
  })
})
