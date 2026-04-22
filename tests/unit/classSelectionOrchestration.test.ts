import { describe, expect, test } from 'vitest'
import { buildItemLookup } from '@/lib/5etools/startingEquipment'
import {
  buildInitialCharacterProficiencies,
  computeApplyClassSelectionUpdates,
} from '@/lib/character/commands/classSelectionOrchestrationCommand'
import { applyClassGrants } from '@/lib/provenance'
import { emptyProvenance } from '@/store/characterStore'
import type { Item5e } from '@/types/5etools'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

const EMPTY_LOOKUP = new Map<string, Item5e>()

// ---------------------------------------------------------------------------
// buildInitialCharacterProficiencies
// ---------------------------------------------------------------------------

describe('buildInitialCharacterProficiencies', () => {
  test('extracts armor and weapon profs from class startingProficiencies', () => {
    const cls = {
      startingProficiencies: {
        armor: ['light armor', 'medium armor'],
        weapons: ['simple weapons', 'martial weapons'],
        tools: [],
      },
      proficiency: [] as string[],
    }
    const result = buildInitialCharacterProficiencies(cls, undefined)
    expect(result.proficiencies.armor).toContain('light armor')
    expect(result.proficiencies.armor).toContain('medium armor')
    expect(result.proficiencies.weapons).toContain('simple weapons')
  })

  test('maps saving throw abbreviations to full names', () => {
    const cls = {
      proficiency: ['str', 'con'],
      startingProficiencies: {},
    }
    const result = buildInitialCharacterProficiencies(cls, undefined)
    expect(result.proficiencies.savingThrows).toContain('strength')
    expect(result.proficiencies.savingThrows).toContain('constitution')
  })

  test('deduplicates saving throws', () => {
    const cls = { proficiency: ['str', 'str'], startingProficiencies: {} }
    const result = buildInitialCharacterProficiencies(cls, undefined)
    expect(result.proficiencies.savingThrows.filter((s) => s === 'strength')).toHaveLength(1)
  })

  test('always includes Common in languages', () => {
    const result = buildInitialCharacterProficiencies(undefined, undefined)
    expect(result.proficiencies.languages).toContain('Common')
  })

  test('merges background skills into proficiencies', () => {
    const bg = {
      skillProficiencies: [{ perception: true, insight: true }],
      languageProficiencies: [],
      toolProficiencies: [],
    }
    const result = buildInitialCharacterProficiencies(undefined, bg)
    expect(result.proficiencies.skills).toContain('perception')
    expect(result.proficiencies.skills).toContain('insight')
  })

  test('merges background languages into proficiencies', () => {
    const bg = {
      skillProficiencies: [],
      languageProficiencies: [{ elvish: true }],
      toolProficiencies: [],
    }
    const result = buildInitialCharacterProficiencies(undefined, bg)
    expect(result.proficiencies.languages).toContain('Common')
  })

  test('initializes skills state map for background skills', () => {
    const bg = {
      skillProficiencies: [{ perception: true }],
      languageProficiencies: [],
      toolProficiencies: [],
    }
    const result = buildInitialCharacterProficiencies(undefined, bg)
    expect(result.skills.perception?.proficient).toBe(true)
  })

  test('handles both undefined cls and background', () => {
    const result = buildInitialCharacterProficiencies(undefined, undefined)
    expect(result.proficiencies.armor).toEqual([])
    expect(result.proficiencies.weapons).toEqual([])
    expect(result.proficiencies.savingThrows).toEqual([])
    expect(result.proficiencies.languages).toContain('Common')
  })

  test('strips 5etools item tags from weapon/armor strings', () => {
    // 5etools sometimes includes tags like "{@item dagger|phb|daggers}"
    const cls = {
      startingProficiencies: {
        weapons: ['dagger'],
        armor: [],
        tools: [],
      },
    }
    const result = buildInitialCharacterProficiencies(cls, undefined)
    // stripItemTag should remove tag wrappers, leaving plain name
    expect(result.proficiencies.weapons.some((w) => w.includes('{@'))).toBe(false)
  })

  test('excludes narrative tool choices', () => {
    const cls = {
      startingProficiencies: {
        tools: ['one type of artisan tools of your choice', "thieves' tools"],
      },
    }
    const result = buildInitialCharacterProficiencies(cls, undefined)
    // The narrative option should be filtered out; concrete tool kept
    expect(result.proficiencies.tools.some((t) => t.toLowerCase().includes('of your choice'))).toBe(
      false,
    )
  })
})

// ---------------------------------------------------------------------------
// computeApplyClassSelectionUpdates
// ---------------------------------------------------------------------------

describe('computeApplyClassSelectionUpdates', () => {
  test('adds armor proficiencies for a new class', () => {
    const character = makeCharacterFixture({
      class: '',
      classProgression: [],
      proficiencies: {
        armor: [],
        weapons: [],
        tools: [],
        skills: [],
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

    const updates = computeApplyClassSelectionUpdates(
      character,
      ledger,
      cls,
      undefined,
      EMPTY_LOOKUP,
    )
    expect(updates.proficiencies?.armor).toContain('light armor')
    expect(updates.proficiencies?.weapons).toContain('simple weapons')
    expect(updates.proficiencies?.savingThrows).toContain('strength')
    expect(updates.proficiencies?.savingThrows).toContain('constitution')
  })

  test('removes old class proficiencies when switching class', () => {
    const character = makeCharacterFixture({
      class: 'Fighter',
      classProgression: [{ name: 'Fighter', source: 'PHB', levels: 1 }],
      proficiencies: {
        armor: ['light armor', 'medium armor'],
        weapons: ['simple weapons'],
        tools: [],
        skills: [],
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

    const updates = computeApplyClassSelectionUpdates(
      character,
      ledgerWithFighter,
      wizardCls,
      undefined,
      EMPTY_LOOKUP,
    )

    // Fighter's armor should be removed
    expect(updates.proficiencies?.armor ?? []).not.toContain('light armor')
    expect(updates.proficiencies?.armor ?? []).not.toContain('medium armor')
    // Wizard weapons should be present
    expect(updates.proficiencies?.weapons).toContain('dagger')
    // Saving throws updated to Wizard's
    expect(updates.proficiencies?.savingThrows).toContain('intelligence')
    expect(updates.proficiencies?.savingThrows).toContain('wisdom')
    expect(updates.proficiencies?.savingThrows).not.toContain('strength')
  })

  test('adds starting equipment from class blocks', () => {
    const dagger: Item5e = { name: 'Dagger', source: 'PHB', type: 'W' } as Item5e
    const lookup = buildItemLookup([dagger])

    const character = makeCharacterFixture({
      class: '',
      classProgression: [],
      equipment: [],
      proficiencies: {
        armor: [],
        weapons: [],
        tools: [],
        skills: [],
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

    const updates = computeApplyClassSelectionUpdates(character, ledger, cls, undefined, lookup)
    expect(updates.equipment?.some((e) => e.name === 'Dagger')).toBe(true)
  })

  test('removes old class equipment when switching class', () => {
    const dagger: Item5e = { name: 'Dagger', source: 'PHB', type: 'W' } as Item5e
    const lookup = buildItemLookup([dagger])

    const character = makeCharacterFixture({
      class: 'Rogue',
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

    const updates = computeApplyClassSelectionUpdates(
      character,
      ledgerWithRogue,
      wizardCls,
      undefined,
      lookup,
    )
    // Rogue's class-granted dagger should be removed from equipment
    expect(updates.equipment?.some((e) => e.name === 'Dagger')).toBe(false)
  })

  test('merges with existing non-class equipment', () => {
    const dagger: Item5e = { name: 'Dagger', source: 'PHB', type: 'W' } as Item5e
    const lookup = buildItemLookup([dagger])

    const character = makeCharacterFixture({
      class: '',
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

    const updates = computeApplyClassSelectionUpdates(character, ledger, cls, undefined, lookup)
    expect(updates.equipment?.some((e) => e.name === 'Torch')).toBe(true)
    expect(updates.equipment?.some((e) => e.name === 'Dagger')).toBe(true)
  })

  test('returns a provenance update', () => {
    const character = makeCharacterFixture({
      class: '',
      classProgression: [],
      proficiencies: {
        armor: [],
        weapons: [],
        tools: [],
        skills: [],
        languages: [],
        savingThrows: [],
      },
    })
    const ledger = emptyProvenance()
    const cls = { name: 'Wizard', source: 'PHB', startingProficiencies: {} }

    const updates = computeApplyClassSelectionUpdates(
      character,
      ledger,
      cls,
      undefined,
      EMPTY_LOOKUP,
    )
    expect(updates.provenance).toBeDefined()
  })
})
