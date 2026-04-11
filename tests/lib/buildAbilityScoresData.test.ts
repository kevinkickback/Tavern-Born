import { describe, expect, test } from 'vitest'
import {
  buildRacialBonuses,
  buildSkillDetailsMap,
  buildSkillSourceTags,
  formatTitleCase,
  selectSkillDetails,
  updateRaceAsiChoices,
} from '@/pages/build/ability-scores/model/data'

describe('buildAbilityScoresData', () => {
  test('buildRacialBonuses combines fixed and choice bonuses', () => {
    const bonuses = buildRacialBonuses(
      {
        fixed: [{ ability: 'dexterity', value: 2 }],
        choices: [{ count: 1, amount: 1, from: ['wisdom', 'intelligence'] }],
      },
      [['wisdom']],
    )

    expect(bonuses).toEqual({ dexterity: 2, wisdom: 1 })
  })

  test('buildSkillDetailsMap supports object and array data shapes', () => {
    expect(
      buildSkillDetailsMap({
        arcana: {
          name: 'Arcana',
          entries: ['Recall lore'],
          source: 'PHB',
          page: 177,
        },
      }),
    ).toEqual({
      arcana: {
        name: 'Arcana',
        entries: ['Recall lore'],
        source: 'PHB',
        page: 177,
      },
    })

    expect(
      buildSkillDetailsMap([
        {
          name: 'Stealth',
          entries: ['Hide quietly'],
          source: 'PHB',
          page: 177,
        },
      ]),
    ).toEqual({
      stealth: {
        name: 'Stealth',
        entries: ['Hide quietly'],
        source: 'PHB',
        page: 177,
      },
    })
  })

  test('selectSkillDetails keeps only mapped skills in requested order', () => {
    const details = selectSkillDetails(['Athletics', 'Arcana', 'Missing'], {
      athletics: { name: 'Athletics', entries: ['Strength checks'] },
      arcana: { name: 'Arcana', entries: ['Int checks'] },
    })

    expect(details.map((detail) => detail.name)).toEqual(['Athletics', 'Arcana'])
  })

  test('buildSkillSourceTags deduplicates and formats page tags', () => {
    const tags = buildSkillSourceTags([
      { name: 'Arcana', entries: [], source: 'PHB', page: 177 },
      { name: 'History', entries: [], source: 'PHB', page: 177 },
      { name: 'Nature', entries: [], source: 'XGE' },
      { name: 'NoSource', entries: [] },
    ])

    expect(tags).toEqual(['PHB, p. 177', 'XGE'])
  })

  test('formatTitleCase capitalizes words', () => {
    expect(formatTitleCase('sleight of hand')).toBe('Sleight Of Hand')
  })

  test('updateRaceAsiChoices swaps duplicate picks in the same block', () => {
    const next = updateRaceAsiChoices([['strength', 'dexterity']], 0, 1, 'strength')

    expect(next).toEqual([['dexterity', 'strength']])
  })
})
