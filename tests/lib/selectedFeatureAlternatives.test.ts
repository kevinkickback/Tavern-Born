import { describe, expect, test } from 'vitest'
import { decodeClassFeatureReference } from '@/lib/5etools/classFeatureIdentity'
import { getFilteredFeatAlternative } from '@/lib/5etools/filteredFeatAlternative'
import { getCharacterClassChoices } from '@/lib/character/classChoiceOptions'
import { applyClassChoiceSelectionWithGrantsCommand } from '@/lib/character/commands/classChoiceCommands'
import { commitFeatOptionsCommand } from '@/lib/character/commands/featCommands'
import { setManagedClassSpellChoicesCommand } from '@/lib/character/commands/managedClassSpellCommands'
import { createOptionalClassFeatureActivity } from '@/lib/character/optionalClassFeatureActivity'
import { getSelectedFeatureCantripSlots } from '@/lib/character/selectedFeatureSpells'
import { characterPersistenceSchema } from '@/types/characterSchema'
import {
  applyWarriorResult,
  makeWarriorSpellFixtures,
  selectWarriorFixture,
} from '../fixtures/warriorSpellFixtures'

const fixture = makeWarriorSpellFixtures()
const authority = {
  classes: fixture.data.classes,
  catalogs: fixture.context.catalogs,
  feats: fixture.data.feats,
  spellContext: fixture.context,
}

describe('XPHB explicit filtered alternatives', () => {
  test('one current Class choice offers its explicit feat plus ordinary FS, without another quota', () => {
    const { character, choice } = selectWarriorFixture(fixture, 'Paladin', 'XPHB')
    expect(choice.options).toEqual([
      { entityType: 'feat', name: 'Blessed Warrior', source: 'XPHB' },
    ])
    expect(choice.maximumSelections).toBe(1)
    expect(() =>
      applyClassChoiceSelectionWithGrantsCommand(
        character,
        character.provenance,
        choice,
        [
          { entityType: 'feat', name: 'Blessed Warrior', source: 'XPHB' },
          { entityType: 'feat', name: 'Defense', source: 'XPHB' },
        ],
        authority,
      ),
    ).toThrow(/1 selections/)
    expect(() =>
      applyClassChoiceSelectionWithGrantsCommand(
        character,
        character.provenance,
        choice,
        [{ entityType: 'feat', name: 'Druidic Warrior', source: 'XPHB' }],
        authority,
      ),
    ).toThrow(/changed/)
  })

  test('a changed explicit UID derives a new alternative and rejects an old captured new selection', () => {
    const selected = selectWarriorFixture(fixture, 'Paladin', 'XPHB')
    const character = { ...selected.character, classChoiceSelections: [], classFeatChoices: [] }
    const changed = makeWarriorSpellFixtures((source) => {
      source.classFeature.find(
        (row: { className: string; source: string }) =>
          row.className === 'Paladin' && row.source === 'XPHB',
      ).entries[1].entries[0].feat = 'Defense|XPHB'
    })
    const cls = changed.data.classes.find((row) => row.name === 'Paladin' && row.source === 'XPHB')!
    const current = getCharacterClassChoices(
      cls,
      undefined,
      createOptionalClassFeatureActivity(character, changed.context.catalogs),
      changed.context.catalogs,
    ).find((row) => row.id === selected.choice.id)!
    expect(current.options).toEqual([{ entityType: 'feat', name: 'Defense', source: 'XPHB' }])
    expect(current.maximumSelections).toBe(1)
    const fresh = {
      classes: changed.data.classes,
      catalogs: changed.context.catalogs,
      feats: changed.data.feats,
      spellContext: changed.context,
    }
    expect(() =>
      applyClassChoiceSelectionWithGrantsCommand(
        character,
        character.provenance,
        selected.choice,
        [{ entityType: 'feat', name: 'Blessed Warrior', source: 'XPHB' }],
        fresh,
      ),
    ).toThrow(/changed/)
  })

  test.each([
    (row: Record<string, any>) => {
      row.entries[0] += ' Only under an additional condition.'
    },
    (row: Record<string, any>) => {
      row.entries[1].entries.push({ type: 'refFeat', feat: 'Defense|XPHB' })
    },
    (row: Record<string, any>) => {
      row.entries[1].condition = true
    },
    (row: Record<string, any>) => {
      row.entries[1].entries[0].feat += '|extra'
    },
    (row: Record<string, any>) => {
      row.level = 3
    },
  ])('unfamiliar or conflicting source structure cannot extend the pool', (change) => {
    const feature = structuredClone(
      fixture.source.classFeature.find(
        (row: { className: string; source: string }) =>
          row.className === 'Paladin' && row.source === 'XPHB',
      ),
    )
    change(feature)
    const ref = { ...decodeClassFeatureReference('Fighting Style|Paladin|XPHB|2|XPHB'), feature }
    expect(
      getFilteredFeatAlternative(
        ref,
        { type: 'class', name: 'Paladin', source: 'XPHB' },
        'feat',
        ['FS'],
        1,
      ),
    ).toEqual({ present: true })
  })

  test('replacing the Class producer retires its cantrips and editor lifetime', () => {
    let { character, choice } = selectWarriorFixture(fixture, 'Paladin', 'XPHB')
    const slots = getSelectedFeatureCantripSlots(character, fixture.context.catalogs)
    character = applyWarriorResult(
      character,
      setManagedClassSpellChoicesCommand(
        character,
        character.provenance,
        slots.map((slot, index) => ({
          slot,
          expected: null,
          expectedEmptyRevision: 0,
          target: { name: index ? 'Resistance' : 'Guidance', source: 'XPHB' },
          policy: 'default',
        })),
        fixture.context,
      ),
    )
    character = applyWarriorResult(
      character,
      applyClassChoiceSelectionWithGrantsCommand(
        character,
        character.provenance,
        choice,
        [{ entityType: 'feat', name: 'Defense', source: 'XPHB' }],
        authority,
      ),
    )
    expect(character.managedClassSpellChoices).toEqual([])
    expect(character.managedClassSpellRevision).toBe(3)
    expect(
      character.spells.spellProfiles.find((row) => row.className === 'Paladin')?.cantrips,
    ).toEqual([])
    expect(characterPersistenceSchema.safeParse(character).success).toBe(true)
  })

  test('Class-owned Warrior setup cannot bypass to Special feat spells', () => {
    const { character, choice } = selectWarriorFixture(fixture, 'Paladin', 'XPHB')
    const target = { name: 'Blessed Warrior', source: 'XPHB', classFeatChoiceId: choice.id }
    expect(() =>
      commitFeatOptionsCommand(
        character,
        character.provenance,
        target,
        { spells: ['Guidance|XPHB'] },
        fixture.data.spells,
      ),
    ).toThrow(/Class spell choices/)
    const changed = structuredClone(character)
    changed.classFeatChoices![0].feats[0].options = { spells: ['Guidance|XPHB'] }
    expect(characterPersistenceSchema.safeParse(changed).success).toBe(false)
  })

  test('changed prose-only XPHB prerequisites suspend existing intent and reject stale new activation', () => {
    const selected = selectWarriorFixture(fixture, 'Paladin', 'XPHB')
    const changed = makeWarriorSpellFixtures((source) => {
      source.feat
        .find((row: { name: string }) => row.name === 'Blessed Warrior')
        .prerequisite.push({ ability: [{ cha: 20 }] })
    })
    const fresh = {
      classes: changed.data.classes,
      catalogs: changed.context.catalogs,
      feats: changed.data.feats,
      spellContext: changed.context,
    }
    const character = { ...selected.character, classChoiceSelections: [], classFeatChoices: [] }
    expect(() =>
      applyClassChoiceSelectionWithGrantsCommand(
        character,
        character.provenance,
        selected.choice,
        [{ entityType: 'feat', name: 'Blessed Warrior', source: 'XPHB' }],
        fresh,
      ),
    ).toThrow(/changed/)
    expect(
      getSelectedFeatureCantripSlots(selected.character, changed.context.catalogs),
    ).toHaveLength(2)
  })
})
