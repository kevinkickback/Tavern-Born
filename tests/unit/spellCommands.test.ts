import { selectBonusSpellFixture } from '../fixtures/bonusSpellSelection'
/**
 * Unit tests for spell domain commands (Phase 1.5).
 *
 * These tests validate that spell mutation commands correctly coordinate
 * profile state updates and provenance ledger changes for atomic spell operations.
 */

import { describe, expect, test } from 'vitest'
import {
  commitFeatOptionsCommand,
  replaceBonusFeatSelectionsCommand,
} from '@/lib/character/commands/featCommands'
import { buildInitialCharacter } from '@/lib/character/commands/originSelectionCommand'
import {
  removeRacialSpell,
  removeSpellFromCharacter,
  selectRacialSpell,
  setProfileSpells,
  setRacialSpellChoice,
} from '@/lib/character/commands/spellCommands'
import { makeSourceTag, reconcileRaceChange } from '@/lib/provenance'
import type { Race5e } from '@/types/5etools'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { makeSpellFixture } from '../fixtures/gameDataFixtures'
import { nativeChoiceSpellLookup, nativeRaceResolution } from '../fixtures/nativeRacialCharacter'

describe('Spell Commands', () => {
  test('bare manual withdrawal preserves qualified printings and an independent feat', () => {
    let character = makeCharacterFixture()
    const apply = (result: ReturnType<typeof setProfileSpells>) => {
      character = { ...character, ...result.characterPatch, provenance: result.provenanceUpdate }
    }
    const feat = { name: 'Magic Initiate', source: 'PHB', selectionKind: 'bonus' as const }
    apply(replaceBonusFeatSelectionsCommand(character, character.provenance, [feat]))
    apply(
      commitFeatOptionsCommand(character, character.provenance, feat, { spells: ['Light|PHB'] }, [
        makeSpellFixture({ name: 'Light', source: 'PHB', level: 0 }),
      ]),
    )
    apply(
      setProfileSpells(
        character,
        character.provenance,
        'special:unrestricted',
        ['Light', 'Light|PHB', 'Light|XPHB'],
        [],
      ),
    )
    character = characterPersistenceSchema.parse(character)
    const before = structuredClone(character)
    expect(
      removeSpellFromCharacter(character, character.provenance, 'Light|PHB|junk').characterPatch,
    ).toEqual({})
    apply(
      removeSpellFromCharacter(character, character.provenance, ' Light ', {
        profileId: 'special:unrestricted',
      }),
    )
    character = characterPersistenceSchema.parse(character)
    const bonus = character.spells.spellProfiles.find((row) => row.type === 'special')!
    expect(bonus.cantrips).toEqual(['Light|PHB', 'Light|XPHB'])
    expect(character.provenance.spells.light).toEqual(
      before.provenance.spells.light.filter((tag) => !!tag.grantSource),
    )
    expect(character.provenance.spells.light.some((tag) => tag.sourceType === 'feat')).toBe(true)
  })
  test('attributes a native racial choice to its actual owner and clears it atomically', () => {
    const race = {
      name: 'High Elf',
      source: 'PHB',
      additionalSpells: [{ known: { _: [{ choose: 'level=0|class=Wizard' }] } }],
    } as Race5e
    const character = buildInitialCharacter(
      { initial: { name: 'Caster', originSystem: '2014' }, race },
      new Map(),
      () => [],
    )
    const profile = character.spells.spellProfiles.find((profile) => profile.type === 'racial')!
    const selected = selectRacialSpell(
      character,
      character.provenance,
      profile.id,
      profile.choices![0].id,
      'Mage Hand|PHB',
      nativeRaceResolution(race),
      nativeChoiceSpellLookup,
    )
    expect(selected.provenanceUpdate.spells['mage hand']).toEqual([
      expect.objectContaining({
        sourceType: 'race',
        sourceName: 'High Elf',
        sourceRef: 'PHB',
        grantVariant: profile.choices![0].id,
      }),
    ])
    expect(
      reconcileRaceChange(selected.provenanceUpdate, { name: 'High Elf', source: 'PHB' }, undefined)
        .spells,
    ).toEqual({})
    const configured = {
      ...character,
      ...selected.characterPatch,
      provenance: selected.provenanceUpdate,
    }
    const removed = removeRacialSpell(
      configured,
      configured.provenance,
      profile.id,
      profile.choices![0].id,
      'Mage Hand|PHB',
    )
    expect(removed.provenanceUpdate.spells).toEqual({})
    expect(
      removed.characterPatch.spells!.spellProfiles.find((candidate) => candidate.id === profile.id)!
        .cantrips,
    ).toEqual([])
  })

  test('replaces and batches a native count-two pool choice atomically', () => {
    const race = {
      name: 'Pool Caster',
      source: 'AAG',
      additionalSpells: [
        {
          known: {
            _: [{ choose: { from: ['light#c', 'sacred flame#c', 'dancing lights#c'], count: 2 } }],
          },
        },
      ],
    } as Race5e
    let character = buildInitialCharacter(
      { initial: { name: 'Caster', originSystem: '2014' }, race },
      new Map(),
      () => [],
    )
    const profile = character.spells.spellProfiles.find((profile) => profile.type === 'racial')!
    const initial = selectRacialSpell(
      character,
      character.provenance,
      profile.id,
      profile.choices![0].id,
      'Light|PHB',
      nativeRaceResolution(race),
      nativeChoiceSpellLookup,
    )
    character = { ...character, ...initial.characterPatch, provenance: initial.provenanceUpdate }
    const result = setRacialSpellChoice(
      character,
      character.provenance,
      profile.id,
      profile.choices![0].id,
      ['Sacred Flame|PHB', 'Dancing Lights|PHB'],
      nativeRaceResolution(race),
      nativeChoiceSpellLookup,
    )
    expect(
      result.characterPatch.spells!.spellProfiles.find((candidate) => candidate.id === profile.id)!
        .cantrips,
    ).toEqual(['Sacred Flame|PHB', 'Dancing Lights|PHB'])
    expect(result.provenanceUpdate.spells).not.toHaveProperty('light')
    for (const name of ['sacred flame', 'dancing lights'])
      expect(result.provenanceUpdate.spells[name]).toEqual([
        expect.objectContaining({ grantVariant: profile.choices![0].id, sourceType: 'race' }),
      ])
  })

  test('replacing one native descriptor retains another descriptor of the same target', () => {
    const race = {
      name: 'High Elf',
      source: 'PHB',
      additionalSpells: [
        { known: { _: [{ choose: 'level=0|class=Wizard' }, { choose: 'level=0|class=Cleric' }] } },
      ],
    } as Race5e
    let character = buildInitialCharacter(
      { initial: { name: 'Caster', originSystem: '2014' }, race },
      new Map(),
      () => [],
    )
    const profile = character.spells.spellProfiles.find((profile) => profile.type === 'racial')!
    for (const choice of profile.choices!) {
      const result = selectRacialSpell(
        character,
        character.provenance,
        profile.id,
        choice.id,
        'Light|PHB',
        nativeRaceResolution(race),
        nativeChoiceSpellLookup,
      )
      character = { ...character, ...result.characterPatch, provenance: result.provenanceUpdate }
    }
    const retainedTag = character.provenance.spells.light.find(
      (tag) => tag.grantVariant === profile.choices![1].id,
    )!
    const result = setRacialSpellChoice(
      character,
      character.provenance,
      profile.id,
      profile.choices![0].id,
      ['Mage Hand|PHB'],
      nativeRaceResolution(race),
      nativeChoiceSpellLookup,
    )
    expect(
      result.characterPatch.spells!.spellProfiles.find((candidate) => candidate.id === profile.id)!
        .cantrips,
    ).toEqual(['Mage Hand|PHB', 'Light|PHB'])
    expect(result.provenanceUpdate.spells.light).toEqual([retainedTag])
    expect(result.provenanceUpdate.spells['mage hand']).toEqual([
      expect.objectContaining({ grantVariant: profile.choices![0].id }),
    ])
  })

  test('Bonus Add/Set/Remove coordinates exact ownership without granting a class choice', () => {
    let character = makeCharacterFixture()
    const id = 'special:unrestricted'
    const add = selectBonusSpellFixture(character, 'Light|PHB', 'cantrip')
    character = { ...character, ...add.characterPatch, provenance: add.provenanceUpdate }
    expect(character.spells.spellProfiles.find((profile) => profile.id === id)?.cantrips).toEqual([
      'Light|PHB',
    ])
    expect(character.provenance.spells.light).toEqual([
      expect.objectContaining({ sourceType: 'manual', grantSource: 'PHB' }),
    ])
    const replace = setProfileSpells(
      character,
      character.provenance,
      id,
      ['Mage Hand|PHB'],
      ['Shield|PHB'],
    )
    character = { ...character, ...replace.characterPatch, provenance: replace.provenanceUpdate }
    expect(character.provenance.spells).not.toHaveProperty('light')
    expect(character.provenance.spells).toHaveProperty('mage hand')
    const remove = removeSpellFromCharacter(character, character.provenance, 'Shield|PHB', {
      profileId: id,
    })
    expect(
      remove.characterPatch.spells?.spellProfiles.find((profile) => profile.id === id)?.spellsKnown,
    ).toEqual([])
    expect(remove.provenanceUpdate.spells).not.toHaveProperty('shield')
  })

  test('generic Add/Set/Remove cannot bypass the managed class actor', () => {
    const character = makeCharacterFixture()
    const id = character.spells.spellProfiles[0].id
    expect(
      setProfileSpells(character, character.provenance, id, ['Light|PHB'], []).characterPatch,
    ).toEqual({})
    const removed = removeSpellFromCharacter(character, character.provenance, 'Light|PHB', {
      profileId: id,
    })
    expect(removed.provenanceUpdate).toEqual(character.provenance)
    expect(removed.characterPatch.spells?.spellProfiles ?? character.spells.spellProfiles).toEqual(
      character.spells.spellProfiles,
    )
  })

  test('qualified Bonus removal retains another printing and an unattributed-source grant', () => {
    const character = makeCharacterFixture()
    const bonus = character.spells.spellProfiles.find((profile) => profile.type === 'special')!
    bonus.cantrips = ['Light|PHB']
    const selected = makeSourceTag('manual', 'User Choice', 'choice')
    const anotherPrinting = { ...selected, grantSource: 'XPHB' }
    character.provenance.spells.light = [
      { ...selected, grantSource: 'PHB' },
      anotherPrinting,
      selected,
    ]
    const result = removeSpellFromCharacter(character, character.provenance, 'Light|PHB', {
      profileId: bonus.id,
      spellKind: 'cantrip',
    })
    expect(
      result.characterPatch.spells?.spellProfiles.find((profile) => profile.id === bonus.id)
        ?.cantrips,
    ).toEqual([])
    expect(result.provenanceUpdate.spells.light).toEqual([anotherPrinting, selected])
  })
})
