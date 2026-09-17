import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { getClassResourceDefs } from '@/lib/5etools/classData'
import {
  formatClassResourceRecovery,
  getClassResourceRecoveryAtLevel,
  normalizeClassRules,
} from '@/lib/5etools/classRuleNormalization'
import type { Class5e, ClassFeatureReference } from '@/types/5etools'

const hasConfiguredCorpus = existsSync(join(process.cwd(), 'data', 'class', 'index.json'))

function normalize(
  classData: Pick<Class5e, 'name' | 'source' | 'classTableGroups'>,
  refs: readonly ClassFeatureReference[] = [],
) {
  return normalizeClassRules(classData, refs)
}

function loadClassData(fileName: string, name: string, source: string): Class5e {
  const payload = JSON.parse(
    readFileSync(join(process.cwd(), 'data', 'class', fileName), 'utf8'),
  ) as { class: Class5e[] }
  const classData = payload.class.find((entry) => entry.name === name && entry.source === source)
  if (!classData) throw new Error(`Missing ${name}|${source} in ${fileName}`)
  return classData
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

    expect(rules.resources.find((resource) => resource.id === 'fighter-second-wind')).toMatchObject(
      {
        id: 'fighter-second-wind',
        recovery: { shortRest: 1, longRest: 'all' },
      },
    )
    expect(rules.resources).not.toContainEqual(expect.objectContaining({ label: 'Weapon Mastery' }))
    expect(rules.resources).not.toContainEqual(expect.objectContaining({ label: 'Damage Bonus' }))
  })

  test.runIf(hasConfiguredCorpus)(
    'keeps finite resource levels when the final level becomes unlimited',
    () => {
      const classData = loadClassData('class-barbarian.json', 'Barbarian', 'PHB')
      const rules = normalize(classData)
      const rage = rules.resources.find((resource) => resource.id === 'barbarian-rages')

      expect(rage?.maxPerLevel[0]).toBe(2)
      expect(rage?.maxPerLevel[18]).toBe(6)
      expect(rage?.maxPerLevel[19]).toBe(0)
      expect(getClassResourceDefs(classData, 1)).toContainEqual(rage)
      expect(getClassResourceDefs(classData, 19)).toContainEqual(rage)
      expect(getClassResourceDefs(classData, 20)).not.toContainEqual(rage)
    },
  )

  test.runIf(hasConfiguredCorpus)(
    'adds prose-backed Action Surge and Indomitable resources for 2024 fighters',
    () => {
      const classData = loadClassData('class-fighter.json', 'Fighter', 'XPHB')
      const rules = normalize(classData)
      const actionSurge = rules.resources.find((resource) => resource.id === 'fighter-action-surge')
      const indomitable = rules.resources.find((resource) => resource.id === 'fighter-indomitable')

      expect(actionSurge?.maxPerLevel[1]).toBe(1)
      expect(actionSurge?.maxPerLevel[16]).toBe(2)
      expect(actionSurge?.recovery).toEqual({ shortRest: 'all', longRest: 'all' })
      expect(indomitable?.maxPerLevel[8]).toBe(1)
      expect(indomitable?.maxPerLevel[12]).toBe(2)
      expect(indomitable?.maxPerLevel[16]).toBe(3)
      expect(indomitable?.recovery).toEqual({ longRest: 'all' })
      expect(getClassResourceDefs(classData, 2)).toContainEqual(actionSurge)
      expect(getClassResourceDefs(classData, 9)).toContainEqual(indomitable)
      expect(getClassResourceDefs(classData, 13)).toContainEqual(indomitable)
      expect(getClassResourceDefs(classData, 17)).toEqual(
        expect.arrayContaining([actionSurge, indomitable]),
      )
    },
  )

  test.runIf(hasConfiguredCorpus)(
    'keeps 2014 Paladin Channel Divinity at one use at every eligible level',
    () => {
      const classData = loadClassData('class-paladin.json', 'Paladin', 'PHB')
      const channelDivinity = normalize(classData).resources.find(
        (resource) => resource.id === 'paladin-channel-divinity',
      )

      expect(channelDivinity?.maxPerLevel[2]).toBe(1)
      expect(channelDivinity?.maxPerLevel[5]).toBe(1)
      expect(channelDivinity?.maxPerLevel[17]).toBe(1)
      expect(channelDivinity?.recovery).toEqual({ shortRest: 'all', longRest: 'all' })
    },
  )

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
