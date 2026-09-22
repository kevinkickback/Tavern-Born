import { describe, expect, test } from 'vitest'
import { buildCreatureChoiceSummary, buildCreatureStatBlock } from '@/lib/5etools/creatureStatBlock'
import type { Creature5e } from '@/types/5etools'

describe('buildCreatureStatBlock', () => {
  test('adapts classic 5etools creature fields into stat-block sections', () => {
    const model = buildCreatureStatBlock({
      name: 'Test Wolf',
      source: 'TEST',
      size: ['M'],
      type: { type: 'beast', tags: ['shapechanger'] },
      alignment: ['N'],
      ac: [{ ac: 13, from: ['natural armor'] }],
      hp: { average: 11, formula: '2d8 + 2' },
      speed: { walk: 40, fly: { number: 20, condition: 'while transformed' } },
      str: 12,
      dex: 15,
      con: 12,
      int: 3,
      wis: 12,
      cha: 6,
      save: { dex: '+4' },
      skill: { perception: '+3', stealth: '+4' },
      resist: [{ resist: ['bludgeoning', 'piercing'], note: 'from nonmagical attacks' }],
      senses: ['darkvision 60 ft.'],
      passive: 13,
      languages: [],
      cr: '1/4',
      trait: [{ name: 'Keen Hearing and Smell', entries: ['The wolf has advantage.'] }],
      action: [{ name: 'Bite', entries: ['{@atk mw} {@hit 4} to hit.'] }],
      environment: ['forest', 'grassland'],
    } as Creature5e)

    expect(model.subtitle).toBe('Medium beast (shapechanger), neutral')
    expect(model.core).toEqual([
      { label: 'Armor Class', value: '13 (natural armor)' },
      { label: 'Hit Points', value: '11 (2d8 + 2)' },
      { label: 'Speed', value: '40 ft., fly 20 ft. while transformed' },
    ])
    expect(model.abilities.find((ability) => ability.key === 'dex')).toMatchObject({
      score: 15,
      modifier: '+2',
    })
    expect(model.details).toContainEqual({ label: 'Saving Throws', value: 'Dex +4' })
    expect(model.details).toContainEqual({
      label: 'Damage Resistances',
      value: 'bludgeoning, piercing from nonmagical attacks',
    })
    expect(model.details).toContainEqual({
      label: 'Senses',
      value: 'darkvision 60 ft., passive Perception 13',
    })
    expect(model.details).toContainEqual({ label: 'Languages', value: '—' })
    expect(model.challenge).toBe('1/4')
    expect(model.sections.map((section) => section.title)).toEqual(['Traits', 'Actions'])
    expect(model.footer).toContainEqual({ label: 'Habitat', value: 'forest, grassland' })
  })

  test('normalizes 5etools spellcasting fields into renderable trait entries', () => {
    const model = buildCreatureStatBlock({
      name: 'Mage Beast',
      source: 'TEST',
      spellcasting: [
        {
          name: 'Innate Spellcasting',
          headerEntries: ['The beast uses Wisdom.'],
          will: ['{@spell detect magic}'],
          daily: { '1e': ['{@spell plane shift}'] },
          spells: {
            '0': { spells: ['{@spell light}'] },
            '1': { slots: 2, spells: ['{@spell cure wounds}'] },
          },
        },
      ],
    } as Creature5e)

    const traits = model.sections.find((section) => section.id === 'traits')
    expect(traits?.entries).toEqual([
      {
        type: 'item',
        name: 'Innate Spellcasting',
        entries: [
          'The beast uses Wisdom.',
          '{@b At will:} {@spell detect magic}',
          '{@b 1/day each:} {@spell plane shift}',
          '{@b Cantrips (at will):} {@spell light}',
          '{@b Level 1 (2 slots):} {@spell cure wounds}',
        ],
      },
    ])
  })

  test('builds compact companion facts without losing dynamic defenses or movement', () => {
    const summary = buildCreatureChoiceSummary({
      name: 'Beast of the Sky',
      source: 'TCE',
      size: ['S'],
      type: 'beast',
      ac: [{ special: '13 + PB (natural armor)' }],
      hp: { special: '4 + four times your ranger level' },
      speed: { walk: 10, fly: 60 },
      trait: [{ name: 'Flyby', entries: ["The beast doesn't provoke opportunity attacks."] }],
      action: [{ name: 'Shred', entries: ['Melee Weapon Attack.'] }],
    } as Creature5e)

    expect(summary).toMatchObject({
      subtitle: 'Small beast',
      armorClass: '13 + PB (natural armor)',
      hitPoints: '4 + four times your ranger level',
      speed: '10 ft., fly 60 ft.',
      speedModes: ['walk', 'fly'],
      traits: [{ name: 'Flyby' }],
      actions: [{ name: 'Shred' }],
    })
  })
})
