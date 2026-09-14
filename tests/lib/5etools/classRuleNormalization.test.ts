import { describe, expect, test } from 'vitest'
import {
  formatClassResourceRecovery,
  getClassResourceRecoveryAtLevel,
  normalizeClassRules,
} from '@/lib/5etools/classRuleNormalization'
import type { Class5e, ClassFeatureReference } from '@/types/5etools'

function normalize(
  classData: Pick<Class5e, 'name' | 'source' | 'classTableGroups'>,
  refs: readonly ClassFeatureReference[] = [],
) {
  return normalizeClassRules(classData, refs)
}

describe('class rule normalization', () => {
  test('tracks spendable table resources but excludes numeric capacity columns', () => {
    const rules = normalize(
      {
        name: 'Fighter',
        source: 'XPHB',
        classTableGroups: [
          {
            colLabels: ['Second Wind', 'Weapon Mastery', 'Damage Bonus'],
            rows: [
              [2, 3, 1],
              [2, 3, 1],
            ],
          },
        ],
      },
      [
        {
          ref: 'Second Wind|Fighter|XPHB|1',
          name: 'Second Wind',
          className: 'Fighter',
          level: 1,
          feature: {
            entries: [
              'You regain one expended use when you finish a Short Rest, and you regain all expended uses when you finish a Long Rest.',
            ],
          },
        } as ClassFeatureReference,
      ],
    )

    expect(rules.resources).toHaveLength(1)
    expect(rules.resources[0]).toMatchObject({
      id: 'fighter-second-wind',
      recovery: { shortRest: 1, longRest: 'all' },
    })
  })

  test.each([
    ['Artificer', 'TCE', 'Infused Items'],
    ['Mystic', 'UAMystic', 'Psi Limit'],
  ])('does not turn %s %s capacity columns into counters', (name, source, label) => {
    const rules = normalize({
      name,
      source,
      classTableGroups: [{ colLabels: [label], rows: [[2], [3]] }],
    })
    expect(rules.resources).toEqual([])
  })

  test('recognizes full short-or-long recovery when the rest phrase precedes the recovery phrase', () => {
    const rules = normalize(
      {
        name: 'Monk',
        source: 'XPHB',
        classTableGroups: [{ colLabels: ['Focus Points'], rows: [[2], [3]] }],
      },
      [
        {
          ref: "Monk's Focus|Monk|XPHB|2",
          name: "Monk's Focus",
          className: 'Monk',
          level: 2,
          feature: {
            entries: [
              'Focus Points are unavailable until you finish a Short Rest or Long Rest, at the end of which you regain all your expended points.',
            ],
          },
        } as ClassFeatureReference,
      ],
    )

    expect(rules.resources[0]?.recovery).toEqual({ shortRest: 'all', longRest: 'all' })
  })

  test('does not apply a core resource descriptor to an unrelated source', () => {
    const rules = normalize({
      name: 'Fighter',
      source: 'HB',
      classTableGroups: [{ colLabels: ['Second Wind'], rows: [[2], [3]] }],
    })
    expect(rules.resources).toEqual([])
  })

  test('uses Charisma and the Font of Inspiration threshold for 2024 bards', () => {
    const rules = normalize({ name: 'Bard', source: 'XPHB', classTableGroups: [] })
    const inspiration = rules.resources.find(
      (resource) => resource.id === 'bard-bardic-inspiration',
    )

    expect(inspiration?.maxFormula).toBe('cha-mod')
    expect(getClassResourceRecoveryAtLevel(inspiration!, 3)).toEqual({ longRest: 'all' })
    expect(getClassResourceRecoveryAtLevel(inspiration!, 4)).toEqual({
      shortRest: 'all',
      longRest: 'all',
    })
  })

  test('treats 2024 Arcane Recovery as a long-rest resource', () => {
    const rules = normalize({ name: 'Wizard', source: 'XPHB', classTableGroups: [] })
    expect(rules.resources[0]).toMatchObject({
      id: 'wizard-arcane-recovery',
      restType: 'long',
      recovery: { longRest: 'all' },
    })
  })

  test('describes partial and full recovery without implying a full short-rest reset', () => {
    expect(formatClassResourceRecovery({ shortRest: 1, longRest: 'all' })).toBe(
      'Restores 1 use on a short rest; all uses on a long rest',
    )
  })
})
