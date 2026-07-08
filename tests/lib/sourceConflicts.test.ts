import { describe, expect, test } from 'vitest'
import {
  countRemovedSpells,
  detectSourceConflicts,
  pruneSpellsForDisabledSources,
} from '@/lib/sourceConflicts'
import type { Spell5e } from '@/types/5etools'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

// ── helpers ─────────────────────────────────────────────────────────────────

function makeSpell(name: string, source: string): Spell5e {
  return {
    name,
    source,
    level: 1,
    school: 'V',
    time: [],
    range: { type: 'point', distance: { type: 'feet', amount: 30 } },
    duration: [],
  }
}

// ── detectSourceConflicts ────────────────────────────────────────────────────

describe('detectSourceConflicts', () => {
  test('returns empty array when no conflicts', () => {
    const char = makeCharacterFixture({ raceSource: 'PHB', classSource: 'PHB' })
    expect(detectSourceConflicts(char, ['PHB'])).toEqual([])
  })

  test('flags race from disabled source', () => {
    const char = makeCharacterFixture({ race: 'Aasimar', raceSource: 'VGM' })
    const conflicts = detectSourceConflicts(char, ['PHB'])
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]).toMatchObject({ source: 'VGM', items: ['Aasimar'] })
  })

  test('flags subrace from disabled source', () => {
    const char = makeCharacterFixture({
      raceSource: 'PHB',
      subrace: 'Deep Gnome',
      subraceSource: 'SCAG',
    })
    const conflicts = detectSourceConflicts(char, ['PHB'])
    expect(conflicts[0]).toMatchObject({ source: 'SCAG', items: ['Deep Gnome'] })
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
})

// ── pruneSpellsForDisabledSources ────────────────────────────────────────────

describe('pruneSpellsForDisabledSources', () => {
  const allSpells = [
    makeSpell('Fireball', 'PHB'),
    makeSpell('Fireball', 'XPHB'), // same name, different source (reprint)
    makeSpell("Tasha's Hideous Laughter", 'PHB'),
    makeSpell('Silvery Barbs', 'SCAG'),
    makeSpell('Frostbite', 'XGE'),
    makeSpell('Control Flames', 'XGE'),
  ]

  test('returns null when no spells are affected', () => {
    const char = makeCharacterFixture()
    expect(pruneSpellsForDisabledSources(char, ['PHB'], allSpells)).toBeNull()
  })

  test('returns null when all selected spells are still in allowed sources', () => {
    const char = makeCharacterFixture({
      spells: {
        ...makeCharacterFixture().spells,
        spellProfiles: [
          {
            id: 'class:Wizard|PHB',
            type: 'class',
            label: 'Wizard',
            className: 'Wizard',
            classSource: 'PHB',
            cantrips: [],
            spellsKnown: ['Fireball'],
            preparedSpells: [],
            alwaysPrepared: false,
          },
        ],
      },
    })
    // Fireball is in PHB, which is still allowed
    expect(pruneSpellsForDisabledSources(char, ['PHB'], allSpells)).toBeNull()
  })

  test('removes a spell when its only source is disabled', () => {
    const char = makeCharacterFixture({
      spells: {
        ...makeCharacterFixture().spells,
        spellProfiles: [
          {
            id: 'class:Wizard|PHB',
            type: 'class',
            label: 'Wizard',
            className: 'Wizard',
            classSource: 'PHB',
            cantrips: [],
            spellsKnown: ['Silvery Barbs'],
            preparedSpells: [],
            alwaysPrepared: false,
          },
        ],
      },
    })
    // Silvery Barbs is only in SCAG; removing SCAG → remove spell
    const result = pruneSpellsForDisabledSources(char, ['PHB'], allSpells)
    expect(result).not.toBeNull()
    expect(result!.spells.spellProfiles[0].spellsKnown).toEqual([])
  })

  test('keeps a spell that exists in another still-allowed source (reprint)', () => {
    const char = makeCharacterFixture({
      spells: {
        ...makeCharacterFixture().spells,
        spellProfiles: [
          {
            id: 'class:Wizard|PHB',
            type: 'class',
            label: 'Wizard',
            className: 'Wizard',
            classSource: 'PHB',
            cantrips: [],
            spellsKnown: ['Fireball'],
            preparedSpells: [],
            alwaysPrepared: false,
          },
        ],
      },
    })
    // PHB is removed but XPHB is now the implicit source — Fireball stays
    expect(pruneSpellsForDisabledSources(char, ['XPHB'], allSpells)).toBeNull()
  })

  test('removes from cantrips and preparedSpells as well', () => {
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
            cantrips: ['Control Flames'],
            spellsKnown: [],
            preparedSpells: ['Frostbite'],
            alwaysPrepared: false,
          },
        ],
      },
    })
    const result = pruneSpellsForDisabledSources(char, ['PHB'], allSpells)
    expect(result).not.toBeNull()
    expect(result!.spells.spellProfiles[0].cantrips).toEqual([])
    expect(result!.spells.spellProfiles[0].preparedSpells).toEqual([])
  })

  test('removes from racial spell choices', () => {
    const char = makeCharacterFixture({
      spells: {
        ...makeCharacterFixture().spells,
        spellProfiles: [
          {
            id: 'racial:Elf|PHB',
            type: 'racial',
            label: 'Elf',
            raceName: 'Elf',
            raceSource: 'PHB',
            cantrips: [],
            spellsKnown: [],
            preparedSpells: [],
            choices: [
              {
                id: 'elf-cantrip',
                count: 1,
                isCantrip: true,
                selected: ['Frostbite'],
              },
            ],
          },
        ],
      },
    })
    const result = pruneSpellsForDisabledSources(char, ['PHB'], allSpells)
    expect(result).not.toBeNull()
    expect(result!.spells.spellProfiles[0].choices![0].selected).toEqual([])
  })

  test('preserves fixedSpells even if source is disabled', () => {
    const char = makeCharacterFixture({
      spells: {
        ...makeCharacterFixture().spells,
        spellProfiles: [
          {
            id: 'class:Cleric|PHB',
            type: 'class',
            label: 'Cleric',
            className: 'Cleric',
            classSource: 'PHB',
            cantrips: [],
            spellsKnown: [],
            preparedSpells: ['Frostbite'],
            fixedSpells: ['Control Flames'], // auto-granted; must survive
            alwaysPrepared: false,
          },
        ],
      },
    })
    const result = pruneSpellsForDisabledSources(char, ['PHB'], allSpells)
    expect(result).not.toBeNull()
    // preparedSpells removed, fixedSpells untouched
    expect(result!.spells.spellProfiles[0].preparedSpells).toEqual([])
    expect(result!.spells.spellProfiles[0].fixedSpells).toEqual(['Control Flames'])
  })

  test('keeps unknown spells (not in any game-data source)', () => {
    const char = makeCharacterFixture({
      spells: {
        ...makeCharacterFixture().spells,
        spellProfiles: [
          {
            id: 'special:unrestricted',
            type: 'special',
            label: 'Special',
            cantrips: [],
            spellsKnown: ['Homebrew Bolt'],
            preparedSpells: [],
            alwaysPrepared: true,
          },
        ],
      },
    })
    // 'Homebrew Bolt' is not in allSpells → treated as unknown → kept
    expect(pruneSpellsForDisabledSources(char, ['PHB'], allSpells)).toBeNull()
  })

  test('cleans matching provenance entries', () => {
    const char = makeCharacterFixture({
      spells: {
        ...makeCharacterFixture().spells,
        spellProfiles: [
          {
            id: 'class:Wizard|PHB',
            type: 'class',
            label: 'Wizard',
            className: 'Wizard',
            classSource: 'PHB',
            cantrips: [],
            spellsKnown: ['Silvery Barbs'],
            preparedSpells: [],
            alwaysPrepared: false,
          },
        ],
      },
      provenance: {
        ...makeCharacterFixture().provenance!,
        spells: {
          'silvery barbs': [
            { sourceType: 'class', sourceName: 'Wizard', grantType: 'choice', label: 'Wizard' },
          ],
        },
      },
    })
    const result = pruneSpellsForDisabledSources(char, ['PHB'], allSpells)
    expect(result).not.toBeNull()
    expect(result!.provenance?.spells).not.toHaveProperty('silvery barbs')
  })

  test('leaves provenance entries for spells that remain', () => {
    const char = makeCharacterFixture({
      spells: {
        ...makeCharacterFixture().spells,
        spellProfiles: [
          {
            id: 'class:Wizard|PHB',
            type: 'class',
            label: 'Wizard',
            className: 'Wizard',
            classSource: 'PHB',
            cantrips: [],
            spellsKnown: ['Fireball', 'Silvery Barbs'],
            preparedSpells: [],
            alwaysPrepared: false,
          },
        ],
      },
      provenance: {
        ...makeCharacterFixture().provenance!,
        spells: {
          fireball: [
            { sourceType: 'class', sourceName: 'Wizard', grantType: 'choice', label: 'Wizard' },
          ],
          'silvery barbs': [
            { sourceType: 'class', sourceName: 'Wizard', grantType: 'choice', label: 'Wizard' },
          ],
        },
      },
    })
    const result = pruneSpellsForDisabledSources(char, ['PHB'], allSpells)
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
    expect(countRemovedSpells(char, newProfiles)).toBe(4)
  })
})
