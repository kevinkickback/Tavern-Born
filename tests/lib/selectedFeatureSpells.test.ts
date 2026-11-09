import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { parseSpells } from '@/lib/5etools/parsers/spells'
import {
  decodeSelectedFeatureSpellAddress,
  selectedFeatureSpellAddress,
} from '@/lib/5etools/selectedFeatureSpellIdentity'
import { getClassChoiceOptionKey } from '@/lib/character/classChoiceIdentity'
import {
  applyClassChoiceSelectionWithGrantsCommand,
  retainSavedFeatureOptionsCommand,
} from '@/lib/character/commands/classChoiceCommands'
import { setManagedClassSpellChoicesCommand } from '@/lib/character/commands/managedClassSpellCommands'
import { managedClassSpellId } from '@/lib/character/managedClassSpellIdentity'
import { getManagedClassSpellSlots } from '@/lib/character/managedClassSpellSlots'
import type { ManagedClassSpellContext } from '@/lib/character/managedClassSpells'
import {
  getManagedClassSpellPool,
  projectManagedClassSpellState,
} from '@/lib/character/managedClassSpells'
import { getOptionalPoolSelectionHandle } from '@/lib/character/optionalClassPoolSelections'
import {
  getSelectedFeatureCantripSetups,
  getSelectedFeatureCantripSlots,
} from '@/lib/character/selectedFeatureSpells'
import type { Spell5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { selectBonusSpellFixture } from '../fixtures/bonusSpellSelection'
import {
  applyWarriorResult,
  makeWarriorSpellFixtures,
  selectWarriorFixture,
} from '../fixtures/warriorSpellFixtures'

const fixture = makeWarriorSpellFixtures()
const finish = (character: Character, source = 'PHB', context = fixture.context) => {
  const slots = getSelectedFeatureCantripSlots(character, context.catalogs)
  return applyWarriorResult(
    character,
    setManagedClassSpellChoicesCommand(
      character,
      character.provenance,
      slots.slice(0, 2).map((slot, index) => ({
        slot,
        expected: null,
        expectedEmptyRevision: character.managedClassSpellRevision ?? 0,
        target: { name: index ? 'Resistance' : 'Guidance', source },
        policy: 'default',
      })),
      context,
    ),
  )
}
const changeFeature = (
  change: (feature: Record<string, any>) => void,
): ManagedClassSpellContext => ({
  ...fixture.context,
  catalogs: {
    ...fixture.context.catalogs,
    optionalFeatures: fixture.context.catalogs.optionalFeatures!.map((row) => {
      if (row.name !== 'Druidic Warrior') return row
      const copy = structuredClone(row)
      change(copy)
      return copy
    }),
  },
})

describe('selected feature cantrip setup', () => {
  test('joined source filters reject undefined/nonstandard variant routes and retain standard variants', () => {
    const { character } = selectWarriorFixture(fixture, 'Paladin', 'PHB')
    character.allowedSources = []
    const slot = getSelectedFeatureCantripSlots(character, fixture.context.catalogs)[0]
    const raw = JSON.parse(
      readFileSync('resources/srd/data/spells/spells-phb.json', 'utf8'),
    ).spell.find((row: { name: string }) => row.name === 'Mage Hand')
    for (const [definedInSource, source, expected] of [
      [undefined, 'PHB', false],
      ['AATM', 'PHB', false],
      ['XGE', 'UAExample', false],
      ['XGE', 'PHB', true],
    ] as const) {
      const [spell] = parseSpells(
        [
          {
            ...raw,
            classes: {
              fromClassListVariant: [
                { name: 'Cleric', source, ...(definedInSource ? { definedInSource } : {}) },
              ],
            },
          },
        ],
        { sourceLookup: {} },
      )
      expect(
        getManagedClassSpellPool(character, slot, {
          ...fixture.context,
          spellsByKey: { 'mage hand|phb': spell as Spell5e },
        }).spells.length,
      ).toBe(expected ? 1 : 0)
    }
  })

  test('decorated requested class filters remain visible as unsupported setup', () => {
    const { character } = selectWarriorFixture(fixture, 'Ranger', 'PHB')
    const context = changeFeature((row) => {
      row.additionalSpells[0].known._[0].choose = 'level=0|class=druid (UA)'
    })
    expect(getSelectedFeatureCantripSetups(character, context.catalogs)[0].reason).toContain(
      'Decorated class spell filters',
    )
  })
  test.each([
    ['Paladin', 'PHB'],
    ['Ranger', 'PHB'],
    ['Paladin', 'XPHB'],
    ['Ranger', 'XPHB'],
  ] as const)('%s %s uses its actual Class producer and separate source-derived choices', (name, source) => {
    let { character, entry } = selectWarriorFixture(fixture, name, source)
    const setups = getSelectedFeatureCantripSetups(character, fixture.context.catalogs)
    expect(setups).toHaveLength(1)
    expect(setups[0]).toMatchObject({ count: 2, offered: true })
    expect(setups[0].reason).toBeUndefined()
    const slots = getSelectedFeatureCantripSlots(character, fixture.context.catalogs)
    expect(slots).toHaveLength(2)
    expect(slots[0][0]).toEqual(['class', name.toLowerCase(), source.toLowerCase()])
    expect(
      getManagedClassSpellSlots(entry).filter((slot) => slot[1] === 'class-cantrip'),
    ).toHaveLength(0)
    expect(
      getManagedClassSpellPool(character, slots[0], fixture.context).spells.some(
        (spell) => spell.name === 'Guidance' && spell.source === source,
      ),
    ).toBe(true)
    const result = setManagedClassSpellChoicesCommand(
      character,
      character.provenance,
      slots.map((slot, index) => ({
        slot,
        expected: null,
        expectedEmptyRevision: 0,
        target: { name: index ? 'Resistance' : 'Guidance', source },
        policy: 'default',
      })),
      fixture.context,
    )
    character = applyWarriorResult(character, result)
    expect(characterPersistenceSchema.safeParse(character).success).toBe(true)
    const projected = projectManagedClassSpellState(character, fixture.context)
    expect(projected.statuses.map((row) => row.active)).toEqual([true, true])
    const profile = projected.character.spells.spellProfiles.find(
      (profile) => profile.id === `class:${name}|${source}`,
    )!
    expect(profile.cantrips).toEqual([`Guidance|${source}`, `Resistance|${source}`])
    expect(
      projected.character.spells.spellProfiles.find((profile) => profile.type === 'special')
        ?.cantrips,
    ).toEqual([])
    expect(character.managedClassSpellRevision).toBe(2)
  })

  test('current count changes add slots, suspend excess intent, and restore exact intent without recertification', () => {
    const { character: initial } = selectWarriorFixture(fixture, 'Ranger', 'PHB')
    const character = finish(initial)
    const increased = changeFeature((row) => {
      row.additionalSpells[0].known._[0].count = 3
    })
    expect(getSelectedFeatureCantripSlots(character, increased.catalogs)).toHaveLength(3)
    expect(
      projectManagedClassSpellState(character, increased).statuses.every((row) => row.active),
    ).toBe(true)
    const reduced = changeFeature((row) => {
      row.additionalSpells[0].known._[0].count = 1
    })
    const result = projectManagedClassSpellState(character, reduced)
    expect(result.statuses.map((row) => row.active)).toEqual([true, false])
    expect(result.character.managedClassSpellChoices).toEqual(character.managedClassSpellChoices)
    expect(result.character.managedClassSpellRevision).toBe(character.managedClassSpellRevision)
    expect(
      projectManagedClassSpellState(result.character, fixture.context).statuses.every(
        (row) => row.active,
      ),
    ).toBe(true)
  })

  test('current filter and ability are interpreted rather than replaced with Warrior constants', () => {
    const { character } = selectWarriorFixture(fixture, 'Ranger', 'PHB')
    const slot = getSelectedFeatureCantripSlots(character, fixture.context.catalogs)[0]
    const changed = changeFeature((row) => {
      row.additionalSpells[0].known._[0].choose = 'level=0|class=wizard'
    })
    const pool = getManagedClassSpellPool(character, slot, changed)
    expect(pool.spells.some((spell) => spell.name === 'Mage Hand')).toBe(true)
    expect(pool.spells.some((spell) => spell.name === 'Guidance')).toBe(false)
    const mismatch = changeFeature((row) => {
      row.additionalSpells[0].ability = 'int'
    })
    expect(getManagedClassSpellPool(character, slot, mismatch).reason).toMatch(/casting ability/)
  })

  test.each([
    (row: Record<string, any>) => {
      row.additionalSpells[0].known._[0].choose += '|school=V'
    },
    (row: Record<string, any>) => {
      row.entries.push('Only while holding the special book.')
    },
    (row: Record<string, any>) => {
      row.newMechanicalCondition = true
    },
    (row: Record<string, any>) => {
      row.additionalSpells[0].innate = { _: ['light#c'] }
    },
  ])('unknown syntax or adjacent restrictions never partially grant', (change) => {
    const { character: initial } = selectWarriorFixture(fixture, 'Ranger', 'PHB')
    const character = finish(initial)
    const result = projectManagedClassSpellState(character, changeFeature(change))
    expect(result.statuses.every((row) => !row.active)).toBe(true)
    expect(
      result.character.spells.spellProfiles.find((row) => row.className === 'Ranger')?.cantrips,
    ).toEqual([])
    expect(result.character.managedClassSpellChoices).toEqual(character.managedClassSpellChoices)
  })

  test('permission and source loss suspend benefits without allocating or losing exact saved intent', () => {
    const { character: initial } = selectWarriorFixture(fixture, 'Ranger', 'PHB')
    const character = finish(initial)
    for (const changed of [
      { ...character, allowedSources: ['PHB'] },
      { ...character, variantRules: { ...character.variantRules, optionalClassFeatures: false } },
    ]) {
      const result = projectManagedClassSpellState(changed, fixture.context)
      expect(result.statuses.every((row) => !row.active)).toBe(true)
      expect(result.character.managedClassSpellChoices).toEqual(character.managedClassSpellChoices)
      expect(result.character.managedClassSpellRevision).toBe(2)
    }
    const missing = { ...fixture.context, spellsByKey: {} }
    const suspended = projectManagedClassSpellState(character, missing).character
    expect(
      suspended.spells.spellProfiles.find((row) => row.className === 'Ranger')?.cantrips,
    ).toEqual([])
    expect(characterPersistenceSchema.safeParse(suspended).success).toBe(true)
    expect(
      projectManagedClassSpellState(suspended, fixture.context).statuses.every((row) => row.active),
    ).toBe(true)
  })

  test('TCE structured prerequisites evolve through the existing guarded pool without an absence pin', () => {
    const { character: initial, choice } = selectWarriorFixture(fixture, 'Ranger', 'PHB')
    const character = finish(initial)
    const met = changeFeature((row) => {
      row.prerequisite = [{ level: { level: 2, class: { name: 'Ranger', source: 'PHB' } } }]
    })
    const unmet = changeFeature((row) => {
      row.prerequisite = [{ level: { level: 3, class: { name: 'Ranger', source: 'PHB' } } }]
    })
    const unknown = changeFeature((row) => {
      row.prerequisite = [{ unknownCondition: true }]
    })
    expect(projectManagedClassSpellState(character, met).statuses.every((row) => row.active)).toBe(
      true,
    )
    for (const context of [unmet, unknown]) {
      expect(
        projectManagedClassSpellState(character, context).statuses.every((row) => !row.active),
      ).toBe(true)
      const unselected = { ...initial, classChoiceSelections: [] }
      expect(() =>
        applyClassChoiceSelectionWithGrantsCommand(
          unselected,
          unselected.provenance,
          choice,
          initial.classChoiceSelections![0].selected,
          { classes: fixture.data.classes, catalogs: context.catalogs, spellContext: context },
        ),
      ).toThrow(/prerequisites/)
    }
  })

  test('an independent Bonus cantrip survives removing the feature owner', () => {
    const { character: initial } = selectWarriorFixture(fixture, 'Ranger', 'PHB')
    let character = finish(initial)
    character = applyWarriorResult(
      character,
      selectBonusSpellFixture(character, 'Guidance|PHB', 'cantrip', fixture.context.spellsByKey),
    )
    const choice = character.managedClassSpellChoices![0]
    const cleared = applyWarriorResult(
      character,
      setManagedClassSpellChoicesCommand(character, character.provenance, [
        { slot: choice.slot, expected: choice },
      ]),
    )
    expect(cleared.spells.spellProfiles.find((row) => row.type === 'special')?.cantrips).toContain(
      'Guidance|PHB',
    )
    expect(
      cleared.spells.spellProfiles.find((row) => row.className === 'Ranger')?.cantrips,
    ).not.toContain('Guidance|PHB')
  })

  test('source-free Clear removes one exact owner; stale captured occupied intent cannot overwrite it', () => {
    const { character: initial } = selectWarriorFixture(fixture, 'Ranger', 'PHB')
    const character = finish(initial)
    const old = character.managedClassSpellChoices![0]
    const cleared = applyWarriorResult(
      character,
      setManagedClassSpellChoicesCommand(character, character.provenance, [
        { slot: old.slot, expected: old },
      ]),
    )
    expect(cleared.managedClassSpellRevision).toBe(2)
    expect(
      cleared.spells.spellProfiles.find((row) => row.className === 'Ranger')?.cantrips,
    ).toEqual(['Resistance|PHB'])
    expect(() =>
      setManagedClassSpellChoicesCommand(
        cleared,
        cleared.provenance,
        [{ slot: old.slot, expected: old, target: old.target, policy: 'default' }],
        fixture.context,
      ),
    ).toThrow(/changed/)
  })

  test('intentional producer removal/reselection retires even an empty editor lifetime', () => {
    const { character, choice } = selectWarriorFixture(fixture, 'Ranger', 'PHB')
    const slot = getSelectedFeatureCantripSlots(character, fixture.context.catalogs)[0]
    const selected = character.classChoiceSelections![0]
    const removed = applyWarriorResult(
      character,
      retainSavedFeatureOptionsCommand(
        character,
        character.provenance,
        choice.id,
        [],
        undefined,
        getOptionalPoolSelectionHandle(selected),
      ),
    )
    expect(removed.managedClassSpellRevision).toBe(1)
    const reselected = applyWarriorResult(
      removed,
      applyClassChoiceSelectionWithGrantsCommand(
        removed,
        removed.provenance,
        choice,
        selected.selected,
        {
          classes: fixture.data.classes,
          catalogs: fixture.context.catalogs,
          spellContext: fixture.context,
        },
      ),
    )
    expect(getClassChoiceOptionKey(reselected.classChoiceSelections![0].selected[0])).toBe(
      getClassChoiceOptionKey(selected.selected[0]),
    )
    expect(() =>
      setManagedClassSpellChoicesCommand(
        reselected,
        reselected.provenance,
        [
          {
            slot,
            expected: null,
            expectedEmptyRevision: 0,
            target: { name: 'Guidance', source: 'PHB' },
            policy: 'default',
          },
        ],
        fixture.context,
      ),
    ).toThrow(/empty spell choice changed/)
  })

  test('exact selected producer/address fields are required by strict source-free admission', () => {
    const { character: initial } = selectWarriorFixture(fixture, 'Ranger', 'PHB')
    const character = finish(initial)
    for (const index of [0, 2, 3, 4]) {
      const changed = structuredClone(character)
      const choice = changed.managedClassSpellChoices![0]
      const address = decodeSelectedFeatureSpellAddress(choice.slot[2])!
      address[index] = 'conflicting' as never
      choice.slot[2] = selectedFeatureSpellAddress(address)
      expect(characterPersistenceSchema.safeParse(changed).success).toBe(false)
    }
    expect(managedClassSpellId(character.managedClassSpellChoices![0].slot)).toContain(
      'optionalFeature',
    )
    expect(
      characterPersistenceSchema.parse(character).managedClassSpellChoices![0].slot[2],
    ).toContain('optionalFeature')
    expect(characterPersistenceSchema.safeParse({ ...character, schemaVersion: 12 }).success).toBe(
      false,
    )
  })
})
