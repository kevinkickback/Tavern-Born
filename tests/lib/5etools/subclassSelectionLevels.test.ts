import { describe, expect, test } from 'vitest'
import { getSubclassSelectionInfo } from '@/lib/5etools/classData'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { validateClassChoices } from '@/lib/readiness/classReadiness'
import { buildLevelsToShow } from '@/pages/build/class/model/pageUtils'
import type { Class5e, ClassFeatureReference } from '@/types/5etools'
import { makeCharacterFixture } from '../../fixtures/characterFixtures'

function subclassClass(ref?: ClassFeatureReference): Class5e {
  return {
    name: 'Wizard',
    source: 'PHB',
    classFeatureRefs: ref ? [ref] : [],
    subclasses: [{ name: 'School', shortName: 'School', source: 'PHB', className: 'Wizard' }],
    normalizedRules: {
      resources: [],
      asiLevels: [],
      ritualCasting: false,
      choices: [],
      choiceDiagnostics: [],
    },
  }
}

function selectionRef(uid: string, level?: number): ClassFeatureReference {
  return {
    ref: uid,
    name: 'School Selection',
    className: 'Wizard',
    source: 'PHB',
    level,
    gainSubclassFeature: true,
    feature: { name: 'School Selection', source: 'PHB', level: 4, entries: [] },
  }
}

function readiness(classData: Class5e, levels: number, subclass?: string) {
  const character = makeCharacterFixture({
    classProgression: [{ name: 'Wizard', source: 'PHB', levels, subclass, subclassSource: 'PHB' }],
  })
  return validateClassChoices(
    character,
    createCharacterCalculationContext(character, { classesByKey: { 'Wizard|PHB': classData } }),
  )
}

describe('subclass selection gain levels', () => {
  test('uses the encoded class-feature level despite stale reference and target metadata', () => {
    const classData = subclassClass(selectionRef('School Selection|Wizard||8', 4))
    const before = structuredClone(classData)
    expect(getSubclassSelectionInfo(classData)).toEqual({
      subclassLevel: 8,
      subclassFeatureName: 'School Selection',
    })
    expect(readiness(classData, 4)).toEqual([])
    expect(readiness(classData, 7)).toEqual([])
    const issue = readiness(classData, 8)[0]
    expect(issue?.title).toBe('Choose a subclass')
    const params = new URL(issue!.navigationTarget!, 'https://tavern-born.test').searchParams
    expect(params.get('class')).toBe('Wizard|PHB')
    expect(params.get('level')).toBe('8')
    expect(readiness(classData, 8, 'School')).toEqual([])
    expect(classData).toEqual(before)
  })

  test.each([
    'School Selection|Wizard',
    'School Selection|Wizard||8junk',
    '|Wizard||8',
  ])('does not guess a selection level for a malformed marked reference: %s', (uid) => {
    const classData = subclassClass(selectionRef(uid, 4))
    const info = getSubclassSelectionInfo(classData)
    expect(info.subclassLevel).toBeUndefined()
    expect(readiness(classData, 20)).toEqual([])
    expect(
      buildLevelsToShow({
        allClassFeatures: [],
        asiLevels: [],
        subclassLevel: info.subclassLevel,
        viewingClassLevel: 20,
        spellChoicesByLevel: new Map(),
      }),
    ).toEqual([])
    const issue = readiness(classData, 20, 'Missing School')[0]
    expect(issue?.title).toBe('Restore Missing School')
    const params = new URL(issue!.navigationTarget!, 'https://tavern-born.test').searchParams
    expect(params.get('class')).toBe('Wizard|PHB')
    expect(params.has('level')).toBe(false)
  })

  test('retains the legacy level-three default only when no subclass-gain reference exists', () => {
    const classData = subclassClass({
      ...selectionRef('Other|Wizard||8', 8),
      gainSubclassFeature: false,
    })
    expect(getSubclassSelectionInfo(undefined)).toEqual({
      subclassLevel: 3,
      subclassFeatureName: null,
    })
    expect(getSubclassSelectionInfo(classData)).toEqual({
      subclassLevel: 3,
      subclassFeatureName: null,
    })
    expect(readiness(classData, 2)).toEqual([])
    expect(readiness(classData, 3)[0]?.title).toBe('Choose a subclass')
  })

  test('keeps an unknown marked level distinct from an absent marked reference', () => {
    const ref = selectionRef('')
    delete ref.feature
    expect(getSubclassSelectionInfo(subclassClass(ref))).toEqual({
      subclassLevel: undefined,
      subclassFeatureName: 'School Selection',
    })
    expect(readiness(subclassClass(ref), 20)).toEqual([])
  })

  test.each([
    { uid: '', level: 8, expected: 8 },
    { uid: '  ', level: undefined, expected: 4 },
  ])('supports valid numeric materialized references without a UID: %j', ({
    uid,
    level,
    expected,
  }) => {
    expect(getSubclassSelectionInfo(subclassClass(selectionRef(uid, level))).subclassLevel).toBe(
      expected,
    )
  })

  test.each([
    0,
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    null,
    '8',
  ])('does not repair an invalid explicit numeric level using the target level: %s', (level) => {
    const ref = { ...selectionRef(''), level } as ClassFeatureReference
    expect(getSubclassSelectionInfo(subclassClass(ref)).subclassLevel).toBeUndefined()
    expect(readiness(subclassClass(ref), 20)).toEqual([])
  })
})
