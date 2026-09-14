import { describe, expect, test } from 'vitest'
import {
  buildSpellProfileDisplayModels,
  type SpellListItem,
} from '@/lib/calculations/spellProfileDisplayModel'

function item(overrides: Partial<SpellListItem> = {}): SpellListItem {
  return {
    profileId: 'class:Wizard|PHB',
    profileLabel: 'Wizard',
    name: 'Magic Missile',
    level: 1,
    kind: 'spell',
    prepared: false,
    ...overrides,
  }
}

describe('spell profile display model', () => {
  test('filters empty racial and non-spellcasting class profiles', () => {
    const models = buildSpellProfileDisplayModels({
      spellProfiles: [
        { id: 'racial:Elf|PHB', type: 'racial', label: 'Elf' },
        { id: 'class:Fighter|PHB', type: 'class', label: 'Fighter' },
        { id: 'special', type: 'special', label: 'Bonus' },
      ],
      detailsByProfileId: new Map(),
      groupedItems: new Map(),
    })
    expect(models.map((model) => model.profile.label)).toEqual(['Bonus'])
  })

  test('derives missing known choices without counting fixed grants', () => {
    const profile = { id: 'class:Wizard|PHB', type: 'class', label: 'Wizard' }
    const models = buildSpellProfileDisplayModels({
      spellProfiles: [profile],
      detailsByProfileId: new Map([
        [profile.id, { profileId: profile.id, cantripLimit: 2, knownSpellLimit: 2 }],
      ]),
      groupedItems: new Map([
        [
          profile.id,
          [
            item({ name: 'Fire Bolt', level: 0, kind: 'cantrip' }),
            item({ name: 'Shield', isFixed: true }),
          ],
        ],
      ]),
    })
    expect(models[0]).toMatchObject({
      missingCantrips: 1,
      missingSpells: 2,
      missingSummary: '1 cantrip, 2 spells',
      hasMissingSpells: true,
    })
  })

  test('builds swap and preparation summaries for a true prepared caster', () => {
    const profile = {
      id: 'class:Cleric|PHB',
      type: 'class',
      label: 'Cleric',
      preparedSpells: ['Bless'],
      alwaysPreparedSpells: ['Cure Wounds'],
      spellSwaps: { 4: { removed: 'Bane', added: 'Aid' } },
    }
    const bless = item({ profileId: profile.id, name: 'Bless' })
    const models = buildSpellProfileDisplayModels({
      spellProfiles: [profile],
      detailsByProfileId: new Map([
        [
          profile.id,
          {
            profileId: profile.id,
            isPreparedCaster: true,
            isTruePreparedCaster: true,
            preparedSpellLimit: 3,
          },
        ],
      ]),
      groupedItems: new Map(),
      preparedCasterItemsByProfile: new Map([
        [
          profile.id,
          [
            { spell: { name: 'Bless', source: 'PHB', level: 1 } as never, item: bless },
            {
              spell: { name: 'Cure Wounds', source: 'PHB', level: 1 } as never,
              item: item({ profileId: profile.id, name: 'Cure Wounds', alwaysPrepared: true }),
            },
          ],
        ],
      ]),
    })
    expect(models[0].preparedCount).toBe(1)
    expect(models[0].preparedTotal).toBe(3)
    expect(models[0].displayedTotal).toBe(2)
    expect(models[0].swappedByAddedName.get('Aid')).toEqual({ removed: 'Bane', level: 4 })
  })
})
