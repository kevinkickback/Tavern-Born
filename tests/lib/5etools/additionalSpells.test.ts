import { describe, expect, test } from 'vitest'
import { parseAdditionalSpellBlocks } from '@/lib/5etools/additionalSpells'
import type { AdditionalSpellBlock } from '@/types/additionalSpells'

describe('shared additional-spell syntax', () => {
  test('reads count, filter and ability without a producer name or class owner', () => {
    const input: AdditionalSpellBlock[] = [
      { ability: 'cha', known: { _: [{ choose: 'level=0|class=cleric', count: 2 }] } },
    ]
    const parse = () => parseAdditionalSpellBlocks(input)[0]
    expect(parse()).toMatchObject({
      ability: 'cha',
      choices: [{ count: 2, level: 0, source: 'known', filter: { level: 0, classes: ['cleric'] } }],
    })
    input[0].ability = 'int'
    input[0].known = { _: [{ choose: 'level=0|class=wizard', count: 3 }] }
    expect(parse()).toMatchObject({
      ability: 'int',
      choices: [{ count: 3, filter: { level: 0, classes: ['wizard'] } }],
    })
  })

  test('preserves independent blocks and schedules without deciding actor alternatives', () => {
    const blocks = parseAdditionalSpellBlocks([
      {
        name: 'First',
        ability: 'wis',
        known: { _: [{ choose: { from: ['guidance#c', 'resistance#c'] }, count: 1 }] },
      },
      {
        name: 'Second',
        ability: { choose: ['int', 'cha'] },
        innate: { '3': { daily: { '1': ['detect magic'] } } },
      },
    ])
    expect(blocks).toHaveLength(2)
    expect(blocks[0].choices[0]).toMatchObject({
      count: 1,
      pool: ['guidance|PHB', 'resistance|PHB'],
    })
    expect(blocks[1]).toMatchObject({
      abilityOptions: ['int', 'cha'],
      grants: [{ spellName: 'detect magic|PHB', level: 3, dailyUses: 1 }],
    })
  })

  test.each([
    { known: { _: [{ choose: 'class=cleric', count: 2 }] } },
    { known: { _: [{ choose: 'level=0|class=cleric|school=V', count: 2 }] } },
    { known: { _: [{ choose: 'level=0|class=cleric', count: 0 }] } },
    { known: { _: ['guidance#c', { all: 'level=0|class=cleric' }] } },
    { resourceName: 'Ki', innate: { _: { resource: { '1': ['light#c'] } } } },
  ])('rejects unknown or incomplete syntax rather than partially interpreting it: %j', (block) => {
    expect(() => parseAdditionalSpellBlocks([block as AdditionalSpellBlock])).toThrow()
  })
})
