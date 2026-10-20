import { expect, test } from 'vitest'
import { getClassChoiceOptionKey } from '@/lib/character/classChoiceIdentity'
import {
  type ClassFeatureDetailOrigin,
  resolveActiveClassChoiceDetail,
} from '@/lib/character/classFeatureActivityView'
import { makeConditionalCharacterFixture } from '../fixtures/conditionalProficiencyFixtures'

test('chosen details follow exact current owner, choice, option and gain through Edit and source restoration', () => {
  const f = makeConditionalCharacterFixture('Fighter', 'PHB', 3)
  const saved = f.select(['Fire Rune'])
  const selection = saved.classChoiceSelections![0]
  const origin: Extract<ClassFeatureDetailOrigin, { kind: 'choice' }> = {
    kind: 'choice',
    owner: ['subclass', 'fighter', 'phb', 'rune knight', 'tce'],
    choiceId: selection.choiceId,
    earnedLevel: 3,
    optionKey: getClassChoiceOptionKey(selection.selected[0]),
  }
  const before = JSON.stringify(saved)
  const fire = resolveActiveClassChoiceDetail(saved, f.catalogs, origin)
  expect(fire?.name).toBe('Fire Rune')
  expect(fire?.entries).toEqual(
    f.options.find((row) => row.reference.name === 'Fire Rune')!.entries,
  )
  for (const invalid of [
    { ...origin, earnedLevel: 4 },
    { ...origin, choiceId: origin.choiceId + ':stale' },
    { ...origin, owner: ['subclass', 'fighter', 'phb', 'other', 'tce'] as const },
    { ...origin, optionKey: origin.optionKey + ':other' },
  ])
    expect(
      resolveActiveClassChoiceDetail(saved, f.catalogs, invalid as typeof origin),
    ).toBeUndefined()
  const edited = f.select(['Cloud Rune'], saved)
  expect(resolveActiveClassChoiceDetail(edited, f.catalogs, origin)).toBeUndefined()
  expect(
    resolveActiveClassChoiceDetail(edited, f.catalogs, {
      ...origin,
      optionKey: getClassChoiceOptionKey(edited.classChoiceSelections![0].selected[0]),
    })?.name,
  ).toBe('Cloud Rune')
  const missing = { ...f.catalogs, optionalFeatures: [] }
  expect(resolveActiveClassChoiceDetail(saved, missing, origin)).toBeUndefined()
  expect(resolveActiveClassChoiceDetail(saved, f.catalogs, origin)).toEqual(fire)
  expect(
    resolveActiveClassChoiceDetail({ ...saved, classChoiceSelections: [] }, f.catalogs, origin),
  ).toBeUndefined()
  expect(JSON.stringify(saved)).toBe(before)
})
