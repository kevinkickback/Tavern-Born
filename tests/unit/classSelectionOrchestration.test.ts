import { describe, expect, test } from 'vitest'
import { buildItemLookup } from '@/lib/5etools/startingEquipment'
import { applyClassSelectionCommand } from '@/lib/character/commands/classCommands'
import { addGrant, applyClassGrants, makeSourceTag } from '@/lib/provenance'
import { emptyProvenance } from '@/store/characterStore'
import type { Item5e } from '@/types/5etools'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

const EMPTY_LOOKUP = new Map<string, Item5e>()

describe('applyClassSelectionCommand', () => {
  test('selecting a subclass preserves base-class grants and provenance', () => {
    const character = makeCharacterFixture({
      classProgression: [{ name: 'Fighter', source: 'PHB', levels: 3 }],
      proficiencies: {
        armor: ['light armor'],
        weapons: ['martial weapons'],
        tools: [],
        skills: [],
        expertise: [],
        languages: [],
        savingThrows: ['strength', 'constitution'],
      },
    })
    const ledger = addGrant(
      emptyProvenance(),
      'armor',
      'light armor',
      makeSourceTag('class', 'Fighter', 'fixed', 'PHB'),
    )

    const result = applyClassSelectionCommand(
      character,
      ledger,
      { name: 'Fighter', source: 'PHB' },
      { name: 'Battle Master', source: 'PHB' },
      EMPTY_LOOKUP,
      {
        classProgression: character.classProgression,
        viewingEntry: character.classProgression[0],
      },
    )

    expect(result.characterPatch).toMatchObject({
      classProgression: [
        {
          name: 'Fighter',
          source: 'PHB',
          levels: 3,
          subclass: 'Battle Master',
          subclassSource: 'PHB',
        },
      ],
      proficiencies: character.proficiencies,
    })
    expect(result.provenanceUpdate).toEqual(ledger)
  })

  test('adds armor proficiencies for a new class', () => {
    const character = makeCharacterFixture({
      classProgression: [],
      proficiencies: {
        armor: [],
        weapons: [],
        tools: [],
        skills: [],
        expertise: [],
        languages: [],
        savingThrows: [],
      },
    })
    const ledger = emptyProvenance()

    const cls = {
      name: 'Fighter',
      source: 'PHB',
      proficiency: ['str', 'con'],
      startingProficiencies: {
        armor: ['light armor', 'medium armor', 'heavy armor', 'shields'],
        weapons: ['simple weapons', 'martial weapons'],
        tools: [],
      },
    }

    const result = applyClassSelectionCommand(character, ledger, cls, undefined, EMPTY_LOOKUP)
    expect(result.characterPatch.proficiencies?.armor).toContain('light armor')
    expect(result.characterPatch.proficiencies?.weapons).toContain('simple weapons')
    expect(result.characterPatch.proficiencies?.savingThrows).toContain('strength')
    expect(result.characterPatch.proficiencies?.savingThrows).toContain('constitution')
  })

  test('ignores non-string armor/weapons entries (e.g. Artificer firearms variant object)', () => {
    const character = makeCharacterFixture({
      classProgression: [],
    })
    const ledger = emptyProvenance()

    const cls = {
      name: 'Artificer',
      source: 'UAArtificer',
      proficiency: [] as string[],
      startingProficiencies: {
        armor: ['light', 'medium', 'shield'],
        weapons: ['simple', { proficiency: 'firearms', optional: true }],
        tools: [],
      },
    }

    const result = applyClassSelectionCommand(
      character,
      ledger,
      cls as never,
      undefined,
      EMPTY_LOOKUP,
    )
    expect(result.characterPatch.proficiencies?.weapons).toContain('simple')
    expect(result.characterPatch.proficiencies?.weapons).toHaveLength(1)
  })

  test('removes old class proficiencies when switching class', () => {
    const character = makeCharacterFixture({
      classProgression: [{ name: 'Fighter', source: 'PHB', levels: 1 }],
      proficiencies: {
        armor: ['light armor', 'medium armor'],
        weapons: ['simple weapons'],
        tools: [],
        skills: [],
        expertise: [],
        languages: ['Common'],
        savingThrows: ['strength', 'constitution'],
      },
    })

    // Build a ledger that records Fighter's armor/weapon grants
    const fighterCls = {
      name: 'Fighter',
      source: 'PHB',
      proficiency: ['str', 'con'],
      startingProficiencies: {
        armor: ['light armor', 'medium armor'],
        weapons: ['simple weapons'],
        tools: [],
        skills: [],
      },
    }
    const ledgerWithFighter = applyClassGrants(fighterCls, undefined, emptyProvenance(), {
      itemLookup: EMPTY_LOOKUP,
    })

    const wizardCls = {
      name: 'Wizard',
      source: 'PHB',
      proficiency: ['int', 'wis'],
      startingProficiencies: {
        armor: [],
        weapons: ['dagger', 'dart', 'sling', 'quarterstaff', 'light crossbow'],
        tools: [],
      },
    }

    const result = applyClassSelectionCommand(
      character,
      ledgerWithFighter,
      wizardCls,
      undefined,
      EMPTY_LOOKUP,
    )

    // Fighter's armor should be removed
    expect(result.characterPatch.proficiencies?.armor ?? []).not.toContain('light armor')
    expect(result.characterPatch.proficiencies?.armor ?? []).not.toContain('medium armor')
    // Wizard weapons should be present
    expect(result.characterPatch.proficiencies?.weapons).toContain('dagger')
    // Wizard's saving throws are added
    expect(result.characterPatch.proficiencies?.savingThrows).toContain('intelligence')
    expect(result.characterPatch.proficiencies?.savingThrows).toContain('wisdom')
    expect(result.characterPatch.classProgression).toEqual([
      { name: 'Wizard', source: 'PHB', levels: 1 },
    ])
  })

  test('removes an old class skill and synchronizes skill state when switching class', () => {
    const character = makeCharacterFixture({
      classProgression: [{ name: 'Rogue', source: 'PHB', levels: 1 }],
      hitDiceUsed: { 'rogue|phb': 1 },
      proficiencies: {
        armor: [],
        weapons: [],
        tools: [],
        skills: ['stealth'],
        expertise: ['stealth'],
        languages: [],
        savingThrows: [],
      },
    })
    const ledger = addGrant(
      emptyProvenance(),
      'skills',
      'Stealth',
      makeSourceTag('class', 'Rogue', 'choice', 'PHB'),
    )

    const result = applyClassSelectionCommand(
      character,
      ledger,
      { name: 'Wizard', source: 'PHB', startingProficiencies: {} },
      undefined,
      EMPTY_LOOKUP,
    )

    expect(result.characterPatch.proficiencies?.skills).toEqual([])
    expect(result.characterPatch.proficiencies?.expertise).toEqual([])
    expect(result.characterPatch.hitDiceUsed).toEqual({})
  })

  test('adds starting equipment from class blocks', () => {
    const dagger: Item5e = { name: 'Dagger', source: 'PHB', type: 'W' } as Item5e
    const lookup = buildItemLookup([dagger])

    const character = makeCharacterFixture({
      classProgression: [],
      equipment: [],
      proficiencies: {
        armor: [],
        weapons: [],
        tools: [],
        skills: [],
        expertise: [],
        languages: [],
        savingThrows: [],
      },
    })
    const ledger = emptyProvenance()

    const cls = {
      name: 'Rogue',
      source: 'PHB',
      startingEquipment: { defaultData: [{ A: ['dagger|PHB'] }] },
      startingProficiencies: {},
    }

    const result = applyClassSelectionCommand(character, ledger, cls, undefined, lookup)
    expect(result.characterPatch.equipment?.some((e) => e.name === 'Dagger')).toBe(true)
  })

  test('removes old class equipment when switching class', () => {
    const dagger: Item5e = { name: 'Dagger', source: 'PHB', type: 'W' } as Item5e
    const lookup = buildItemLookup([dagger])

    const character = makeCharacterFixture({
      classProgression: [{ name: 'Rogue', source: 'PHB', levels: 1 }],
      equipment: [
        {
          id: 'eq-1',
          name: 'Dagger',
          source: 'PHB',
          type: 'W',
          quantity: 1,
          equipped: false,
          attuned: false,
        },
      ],
    })

    // Build ledger with Rogue's equipment grant
    const rogueCls = {
      name: 'Rogue',
      source: 'PHB',
      startingEquipment: { defaultData: [{ A: ['dagger|PHB'] }] },
      startingProficiencies: {},
    }
    const ledgerWithRogue = applyClassGrants(rogueCls, undefined, emptyProvenance(), {
      itemLookup: lookup,
    })

    const wizardCls = {
      name: 'Wizard',
      source: 'PHB',
      startingEquipment: { defaultData: [] },
      startingProficiencies: { weapons: ['dagger'] },
    }

    const result = applyClassSelectionCommand(
      character,
      ledgerWithRogue,
      wizardCls,
      undefined,
      lookup,
    )
    // Rogue's class-granted dagger should be removed from equipment
    expect(result.characterPatch.equipment?.some((e) => e.name === 'Dagger')).toBe(false)
  })

  test('merges with existing non-class equipment', () => {
    const dagger: Item5e = { name: 'Dagger', source: 'PHB', type: 'W' } as Item5e
    const lookup = buildItemLookup([dagger])

    const character = makeCharacterFixture({
      classProgression: [],
      // User already has a manually-added torch
      equipment: [
        {
          id: 'eq-manual',
          name: 'Torch',
          source: 'PHB',
          type: 'G',
          quantity: 5,
          equipped: false,
          attuned: false,
        },
      ],
      proficiencies: {
        armor: [],
        weapons: [],
        tools: [],
        skills: [],
        expertise: [],
        languages: [],
        savingThrows: [],
      },
    })
    const ledger = emptyProvenance()

    const cls = {
      name: 'Fighter',
      source: 'PHB',
      startingEquipment: { defaultData: [{ A: ['dagger|PHB'] }] },
      startingProficiencies: {},
    }

    const result = applyClassSelectionCommand(character, ledger, cls, undefined, lookup)
    expect(result.characterPatch.equipment?.some((e) => e.name === 'Torch')).toBe(true)
    expect(result.characterPatch.equipment?.some((e) => e.name === 'Dagger')).toBe(true)
  })

  test('returns a provenance update', () => {
    const character = makeCharacterFixture({
      classProgression: [],
      proficiencies: {
        armor: [],
        weapons: [],
        tools: [],
        skills: [],
        expertise: [],
        languages: [],
        savingThrows: [],
      },
    })
    const ledger = emptyProvenance()
    const cls = { name: 'Wizard', source: 'PHB', startingProficiencies: {} }

    const result = applyClassSelectionCommand(character, ledger, cls, undefined, EMPTY_LOOKUP)
    expect(result.provenanceUpdate).toBeDefined()
  })
})
